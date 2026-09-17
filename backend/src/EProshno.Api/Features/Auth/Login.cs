using System.Text.Json.Serialization;
using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Identity;
using FluentValidation;
using Microsoft.AspNetCore.Identity;

namespace EProshno.Api.Features.Auth;

public static class Login
{
    /// <param name="LoginId">Mobile number or email.</param>
    public sealed record Command(string LoginId, string Password) : ICommand<AuthStepResult>
    {
        [JsonIgnore]
        public string? UserAgent { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.LoginId).NotEmpty().WithMessage(Messages.PhoneOrEmailRequired).MaximumLength(200);
            RuleFor(x => x.Password).NotEmpty().WithMessage(Messages.Required).MaximumLength(100);
        }
    }

    internal sealed class Handler(UserManager<AppUser> users, TokenService tokens, MeReader me, OtpSender otp)
        : ICommandHandler<Command, AuthStepResult>
    {
        public async Task<AuthStepResult> Handle(Command command, CancellationToken ct)
        {
            var login = command.LoginId.Trim();
            var user = login.Contains('@', StringComparison.Ordinal)
                ? await users.FindByEmailAsync(login)
                : await users.FindByPhoneAsync(login, ct);
            if (user is null)
            {
                throw InvalidCredentials();
            }

            if (await users.IsLockedOutAsync(user))
            {
                throw new AppException("auth.locked", Messages.AccountLocked, 403);
            }

            if (!await users.CheckPasswordAsync(user, command.Password))
            {
                await users.AccessFailedAsync(user);
                throw InvalidCredentials();
            }

            await users.ResetAccessFailedCountAsync(user);

            // Accounts registered by phone must prove the number once before the first session.
            if (user.PhoneNumber is not null && !user.PhoneNumberConfirmed && !user.EmailConfirmed)
            {
                await otp.SendAsync(user, OtpPurposes.Login, ct);
                return new AuthStepResult(true, user.PhoneNumber, null);
            }

            var session = await tokens.IssueAsync(user, null, command.UserAgent, ct);
            return new AuthStepResult(false, null, await me.SessionAsync(session, ct));
        }

        private static AppException InvalidCredentials() => new("auth.invalid_credentials", Messages.InvalidCredentials, 400);
    }
}
