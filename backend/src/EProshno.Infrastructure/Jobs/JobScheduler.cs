using System.Linq.Expressions;
using Hangfire;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EProshno.Infrastructure.Jobs;

public static class JobQueues
{
    public const string Default = "default";
    public const string Import = "import";
    public const string Pdf = "pdf";

    public static readonly string[] All = [Pdf, Import, Default];
}

/// <summary>Enqueues background work. Call only after SaveChangesAsync has committed the rows the job reads.</summary>
public interface IJobScheduler
{
    Task EnqueueAsync<T>(string queue, Expression<Func<T, Task>> job)
        where T : notnull;
}

public sealed class HangfireJobScheduler(IBackgroundJobClient client) : IJobScheduler
{
    public Task EnqueueAsync<T>(string queue, Expression<Func<T, Task>> job)
        where T : notnull
    {
        client.Enqueue(queue, job);
        return Task.CompletedTask;
    }
}

/// <summary>
/// Runs jobs immediately in their own DI scope (integration tests, or local development without the Worker).
/// Failures are logged, as Hangfire would record them, and never surface to the caller.
/// </summary>
public sealed class InlineJobScheduler(IServiceScopeFactory scopes, ILogger<InlineJobScheduler> logger) : IJobScheduler
{
    public async Task EnqueueAsync<T>(string queue, Expression<Func<T, Task>> job)
        where T : notnull
    {
        var run = job.Compile();
        await using var scope = scopes.CreateAsyncScope();
        try
        {
            await run(scope.ServiceProvider.GetRequiredService<T>());
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Inline job {Job} failed", typeof(T).Name);
        }
    }
}

/// <summary>
/// Renders a PDF for a <see cref="Core.Platform.JobRecord"/>. Implemented in the Worker (Chromium). Like every job,
/// it receives the institution id and runs under the normal tenant filter.
/// </summary>
public interface IRenderPdfJob
{
    Task RunAsync(Guid institutionId, Guid jobRecordId, CancellationToken ct);
}

public sealed class JobOptions
{
    public const string Section = "Jobs";

    /// <summary>"Hangfire" (default) or "Inline".</summary>
    public string Mode { get; set; } = "Hangfire";

    public bool IsInline => string.Equals(Mode, "Inline", StringComparison.OrdinalIgnoreCase);
}
