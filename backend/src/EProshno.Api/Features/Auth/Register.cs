using System.Text.Json.Serialization;
using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Core.Text;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Identity;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Auth;

public static class Register
{
    public sealed record Command(string FullName, string? Phone, string? Email, string Password) : ICommand<AuthStepResult>
    {
        [JsonIgnore]
        public string? UserAgent { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.FullName).NotEmpty().WithMessage(Messages.NameRequired).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x).Must(x => !string.IsNullOrWhiteSpace(x.Phone) || !string.IsNullOrWhiteSpace(x.Email))
                .WithName("phone").WithMessage(Messages.PhoneOrEmailRequired);
            RuleFor(x => x.Phone).ValidPhone().When(x => !string.IsNullOrWhiteSpace(x.Phone));
            RuleFor(x => x.Email).EmailAddress().WithMessage(Messages.InvalidEmail).MaximumLength(200)
                .When(x => !string.IsNullOrWhiteSpace(x.Email));
            RuleFor(x => x.Password).ValidPassword();
        }
    }

    internal sealed class Handler(
        UserManager<AppUser> users,
        TokenService tokens,
        MeReader me,
        OtpSender otp,
        TimeProvider clock) : ICommandHandler<Command, AuthStepResult>
    {
        public async Task<AuthStepResult> Handle(Command command, CancellationToken ct)
        {
            var phone = PhoneNumbers.Normalize(command.Phone);
            var email = string.IsNullOrWhiteSpace(command.Email) ? null : command.Email.Trim();

            if (phone is not null)
            {
                var existing = await users.FindByPhoneAsync(phone, ct);
                if (existing is not null)
                {
                    // A registration that never verified its phone does not block the number forever.
                    if (existing.PhoneNumberConfirmed || existing.EmailConfirmed)
                    {
                        throw Invalid("phone", Messages.PhoneTaken);
                    }

                    await users.DeleteAsync(existing);
                }
            }

            if (email is not null && await users.FindByEmailAsync(email) is not null)
            {
                throw Invalid("email", Messages.EmailTaken);
            }

            var id = IdGen.New();
            var user = new AppUser
            {
                Id = id,
                UserName = id.ToString("N"),
                FullName = command.FullName.Trim(),
                PhoneNumber = phone,
                Email = email,
                CreatedAt = clock.GetUtcNow(),
            };
            var result = await users.CreateAsync(user, command.Password);
            if (!result.Succeeded)
            {
                throw result.ToValidation("password");
            }

            if (phone is not null)
            {
                await otp.SendAsync(user, OtpPurposes.Login, ct);
                return new AuthStepResult(true, phone, null);
            }

            var session = await tokens.IssueAsync(user, null, command.UserAgent, ct);
            return new AuthStepResult(false, null, await me.SessionAsync(session, ct));
        }

        private static ValidationException Invalid(string field, string message) =>
            new([new FluentValidation.Results.ValidationFailure(field, message)]);
    }
}
