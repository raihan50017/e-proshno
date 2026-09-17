using System.Text.Json.Serialization;
using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Identity;
using FluentValidation;
using Microsoft.AspNetCore.Identity;

namespace EProshno.Api.Features.Auth;

public enum OtpPurpose
{
    Login,
    ResetPassword,
}

public static class SendOtp
{
    public sealed record Command(string Phone, OtpPurpose Purpose) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Phone).ValidPhone();
            RuleFor(x => x.Purpose).IsInEnum().WithMessage(Messages.InvalidValue);
        }
    }

    /// <summary>Always succeeds for unknown numbers, so the endpoint does not reveal who has an account.</summary>
    internal sealed class Handler(UserManager<AppUser> users, OtpSender otp) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByPhoneAsync(command.Phone, ct);
            if (user is not null)
            {
                await otp.SendAsync(user, command.Purpose == OtpPurpose.Login ? OtpPurposes.Login : OtpPurposes.Reset, ct);
            }

            return Unit.Value;
        }
    }
}

public static class VerifyOtp
{
    public sealed record Command(string Phone, string Code) : ICommand<SessionResult>
    {
        [JsonIgnore]
        public string? UserAgent { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Phone).ValidPhone();
            RuleFor(x => x.Code).NotEmpty().WithMessage(Messages.InvalidOtp).MaximumLength(10);
        }
    }

    internal sealed class Handler(UserManager<AppUser> users, OtpSender otp, TokenService tokens, MeReader me)
        : ICommandHandler<Command, SessionResult>
    {
        public async Task<SessionResult> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByPhoneAsync(command.Phone, ct) ?? throw InvalidOtp();
            if (!await otp.VerifyAsync(user, OtpPurposes.Login, command.Code))
            {
                throw InvalidOtp();
            }

            if (!user.PhoneNumberConfirmed)
            {
                user.PhoneNumberConfirmed = true;
                await users.UpdateAsync(user);
            }

            var session = await tokens.IssueAsync(user, null, command.UserAgent, ct);
            return await me.SessionAsync(session, ct);
        }

        private static AppException InvalidOtp() => new("auth.invalid_otp", Messages.InvalidOtp, 400);
    }
}

public static class ResetPassword
{
    public sealed record Command(string Phone, string Code, string NewPassword) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Phone).ValidPhone();
            RuleFor(x => x.Code).NotEmpty().WithMessage(Messages.InvalidOtp).MaximumLength(10);
            RuleFor(x => x.NewPassword).ValidPassword();
        }
    }

    internal sealed class Handler(UserManager<AppUser> users, OtpSender otp, TokenService tokens) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByPhoneAsync(command.Phone, ct);
            if (user is null || !await otp.VerifyAsync(user, OtpPurposes.Reset, command.Code))
            {
                throw new AppException("auth.invalid_otp", Messages.InvalidOtp, 400);
            }

            var resetToken = await users.GeneratePasswordResetTokenAsync(user);
            var result = await users.ResetPasswordAsync(user, resetToken, command.NewPassword);
            if (!result.Succeeded)
            {
                throw result.ToValidation("newPassword");
            }

            if (!user.PhoneNumberConfirmed)
            {
                user.PhoneNumberConfirmed = true;
                await users.UpdateAsync(user);
            }

            await users.SetLockoutEndDateAsync(user, null);
            await tokens.RevokeAllAsync(user.Id, ct);
            return Unit.Value;
        }
    }
}
