using System.Collections.Concurrent;
using System.Reflection;
using FluentValidation;
using FluentValidation.Results;

namespace EProshno.Api.Common;

/// <summary>A use case that changes state.</summary>
public interface ICommand<TResult>;

/// <summary>A use case that only reads.</summary>
public interface IQuery<TResult>;

public interface ICommandHandler<in TCommand, TResult>
    where TCommand : ICommand<TResult>
{
    Task<TResult> Handle(TCommand command, CancellationToken ct);
}

public interface IQueryHandler<in TQuery, TResult>
    where TQuery : IQuery<TResult>
{
    Task<TResult> Handle(TQuery query, CancellationToken ct);
}

/// <summary>Result of commands that return nothing.</summary>
public readonly record struct Unit
{
    public static readonly Unit Value = default;
}

/// <summary>
/// In-house CQRS dispatcher (MediatR is not used for licensing reasons). Runs every registered
/// <see cref="IValidator{T}"/> for the request, then the single handler.
/// </summary>
public sealed class Dispatcher(IServiceProvider services)
{
    private static readonly ConcurrentDictionary<Type, object> Pipelines = new();

    public Task<TResult> Send<TResult>(ICommand<TResult> command, CancellationToken ct) =>
        Pipeline<TResult>(command.GetType(), typeof(CommandPipeline<,>)).Run(command, services, ct);

    public Task<TResult> Query<TResult>(IQuery<TResult> query, CancellationToken ct) =>
        Pipeline<TResult>(query.GetType(), typeof(QueryPipeline<,>)).Run(query, services, ct);

    private static PipelineBase<TResult> Pipeline<TResult>(Type requestType, Type openPipeline) =>
        (PipelineBase<TResult>)Pipelines.GetOrAdd(
            requestType,
            t => Activator.CreateInstance(openPipeline.MakeGenericType(t, typeof(TResult)))!);

    internal static async Task ValidateAsync<T>(T request, IServiceProvider services, CancellationToken ct)
    {
        var validators = services.GetServices<IValidator<T>>().ToList();
        if (validators.Count == 0)
        {
            return;
        }

        var failures = new List<ValidationFailure>();
        foreach (var validator in validators)
        {
            var result = await validator.ValidateAsync(request, ct);
            failures.AddRange(result.Errors);
        }

        if (failures.Count > 0)
        {
            throw new ValidationException(failures);
        }
    }

    private abstract class PipelineBase<TResult>
    {
        public abstract Task<TResult> Run(object request, IServiceProvider services, CancellationToken ct);
    }

    private sealed class CommandPipeline<TCommand, TResult> : PipelineBase<TResult>
        where TCommand : ICommand<TResult>
    {
        public override async Task<TResult> Run(object request, IServiceProvider services, CancellationToken ct)
        {
            var command = (TCommand)request;
            await ValidateAsync(command, services, ct);
            return await services.GetRequiredService<ICommandHandler<TCommand, TResult>>().Handle(command, ct);
        }
    }

    private sealed class QueryPipeline<TQuery, TResult> : PipelineBase<TResult>
        where TQuery : IQuery<TResult>
    {
        public override async Task<TResult> Run(object request, IServiceProvider services, CancellationToken ct)
        {
            var query = (TQuery)request;
            await ValidateAsync(query, services, ct);
            return await services.GetRequiredService<IQueryHandler<TQuery, TResult>>().Handle(query, ct);
        }
    }
}

public static class CqrsRegistration
{
    /// <summary>Registers the dispatcher and every command/query handler in the assembly (scoped).</summary>
    public static IServiceCollection AddCqrs(this IServiceCollection services, Assembly assembly)
    {
        services.AddScoped<Dispatcher>();
        var handlerInterfaces = new[] { typeof(ICommandHandler<,>), typeof(IQueryHandler<,>) };
        foreach (var type in assembly.GetTypes().Where(t => t is { IsClass: true, IsAbstract: false }))
        {
            foreach (var contract in type.GetInterfaces()
                         .Where(i => i.IsGenericType && handlerInterfaces.Contains(i.GetGenericTypeDefinition())))
            {
                services.AddScoped(contract, type);
            }
        }

        return services;
    }
}
