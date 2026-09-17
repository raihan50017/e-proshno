using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Papers;

namespace EProshno.Core.Institutions;

public enum InstitutionType
{
    Individual,
    Coaching,
    School,
    College,
    Madrasa,
    Other,
}

/// <summary>The tenant. Not ITenantOwned itself: always loaded by the id from the access token.</summary>
public sealed class Institution
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? NameEn { get; set; }
    public InstitutionType Type { get; set; }
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? LogoKey { get; set; }
    public PaperSettings PaperDefaults { get; set; } = new();
    public Guid CreatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public enum MembershipStatus
{
    Active,
    Removed,
}

/// <summary>
/// User ↔ institution link with the institution role. Deliberately not ITenantOwned: auth reads a user's memberships
/// across institutions. Tenant features must always filter by the current InstitutionId explicitly.
/// </summary>
public sealed class Membership
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid UserId { get; set; }
    public InstitutionRole Role { get; set; }
    public MembershipStatus Status { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
    public DateTimeOffset? RemovedAt { get; set; }

    public Institution? Institution { get; set; }
}

public enum InvitationStatus
{
    Pending,
    Accepted,
    Revoked,
}

public sealed class Invitation : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public InstitutionRole Role { get; set; }
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }

    /// <summary>SHA-256 of the invitation token; the token itself is only shown once.</summary>
    public string TokenHash { get; set; } = "";

    public InvitationStatus Status { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public Guid CreatedById { get; set; }
    public Guid? AcceptedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }

    public Institution? Institution { get; set; }
}
