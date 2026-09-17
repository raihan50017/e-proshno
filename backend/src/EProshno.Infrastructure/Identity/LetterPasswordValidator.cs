using EProshno.Core.Common;
using Microsoft.AspNetCore.Identity;

namespace EProshno.Infrastructure.Identity;

/// <summary>Passwords need at least one letter (Identity already requires a digit and 8 characters).</summary>
public sealed class LetterPasswordValidator : IPasswordValidator<AppUser>
{
    public Task<IdentityResult> ValidateAsync(UserManager<AppUser> manager, AppUser user, string? password) =>
        Task.FromResult(password is not null && password.Any(char.IsLetter)
            ? IdentityResult.Success
            : IdentityResult.Failed(new IdentityError { Code = "PasswordRequiresLetter", Description = Messages.WeakPassword }));
}
