namespace EProshno.Core.Auth;

/// <summary>A rotating refresh token. Only the SHA-256 hash is stored.</summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";

    /// <summary>All tokens rotated from one login share a family; reuse of a spent token revokes the family.</summary>
    public Guid FamilyId { get; set; }

    public Guid? InstitutionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid? ReplacedById { get; set; }
    public string? UserAgent { get; set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;
}
