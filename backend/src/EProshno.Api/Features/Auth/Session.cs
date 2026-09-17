using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Identity;
using FluentValidation;
using Microsoft.AspNetCore.Identity;

namespace EProshno.Api.Features.Auth;

public static class RefreshSession
{
    public sealed record Request(Guid? InstitutionId);

    /// <summary>Null result = no valid session (the endpoint answers 401 and clears the cookie).</summary>
    public sealed record Command(string? RefreshToken, Guid? InstitutionId, string? UserAgent) : ICommand<SessionResult?>;

    internal sealed class Handler(TokenService tokens, MeReader me) : ICommandHandler<Command, SessionResult?>
    {
        public async Task<SessionResult?> Handle(Command command, CancellationToken ct)
        {
            if (string.IsNullOrEmpty(command.RefreshToken))
            {
                return null;
            }

            var session = await tokens.RefreshAsync(command.RefreshToken, command.InstitutionId, command.UserAgent, ct);
            return session is null ? null : await me.SessionAsync(session, ct);
        }
    }
}

public static class Logout
{
    public sealed record Command(string? RefreshToken) : ICommand<Unit>;

    internal sealed class Handler(TokenService tokens) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            if (!string.IsNullOrEmpty(command.RefreshToken))
            {
                await tokens.RevokeAsync(command.RefreshToken, ct);
            }

            return Unit.Value;
        }
    }
}

public static class ChangePassword
{
    public sealed record Command(string CurrentPassword, string NewPassword) : ICommand<SessionResult>
    {
        [System.Text.Json.Serialization.JsonIgnore]
        public string? UserAgent { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.NewPassword).ValidPassword();
        }
    }

    /// <summary>Ends every other session and starts a fresh one on this device.</summary>
    internal sealed class Handler(UserManager<AppUser> users, TokenService tokens, MeReader me, ITenantContext tenant)
        : ICommandHandler<Command, SessionResult>
    {
        public async Task<SessionResult> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByIdAsync(tenant.UserId.ToString()) ?? throw AppException.NotFound();
            var result = await users.ChangePasswordAsync(user, command.CurrentPassword, command.NewPassword);
            if (!result.Succeeded)
            {
                throw result.ToValidation("newPassword");
            }

            await tokens.RevokeAllAsync(user.Id, ct);
            var session = await tokens.IssueAsync(user, tenant.CurrentInstitutionId, command.UserAgent, ct);
            return await me.SessionAsync(session, ct);
        }
    }
}

public static class GetMe
{
    public sealed record Query : IQuery<MeResponse>;

    internal sealed class Handler(MeReader me, ITenantContext tenant) : IQueryHandler<Query, MeResponse>
    {
        public Task<MeResponse> Handle(Query query, CancellationToken ct) =>
            me.ReadAsync(tenant.UserId, tenant.CurrentInstitutionId, ct);
    }
}

public static class UpdateProfile
{
    public sealed record Command(string FullName, string? Email) : ICommand<MeResponse>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.FullName).NotEmpty().WithMessage(Messages.NameRequired).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x.Email).EmailAddress().WithMessage(Messages.InvalidEmail).MaximumLength(200)
                .When(x => !string.IsNullOrWhiteSpace(x.Email));
        }
    }

    internal sealed class Handler(UserManager<AppUser> users, MeReader me, ITenantContext tenant) : ICommandHandler<Command, MeResponse>
    {
        public async Task<MeResponse> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByIdAsync(tenant.UserId.ToString()) ?? throw AppException.NotFound();
            user.FullName = command.FullName.Trim();

            var email = string.IsNullOrWhiteSpace(command.Email) ? null : command.Email.Trim();
            if (!string.Equals(email, user.Email, StringComparison.OrdinalIgnoreCase))
            {
                if (email is not null && await users.FindByEmailAsync(email) is { } other && other.Id != user.Id)
                {
                    throw new ValidationException([new FluentValidation.Results.ValidationFailure("email", Messages.EmailTaken)]);
                }

                await users.SetEmailAsync(user, email);
            }

            var result = await users.UpdateAsync(user);
            if (!result.Succeeded)
            {
                throw result.ToValidation("fullName");
            }

            return await me.ReadAsync(user.Id, tenant.CurrentInstitutionId, ct);
        }
    }
}
