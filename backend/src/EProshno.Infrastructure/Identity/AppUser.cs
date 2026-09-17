using Microsoft.AspNetCore.Identity;

namespace EProshno.Infrastructure.Identity;

/// <summary>
/// UserName is the id in "N" format (stable and unique); people sign in with PhoneNumber (E.164) or Email.
/// </summary>
public sealed class AppUser : IdentityUser<Guid>
{
    public string FullName { get; set; } = "";
    public string? AvatarKey { get; set; }
    public Guid? LastInstitutionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
}
