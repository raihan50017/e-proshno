namespace EProshno.Core.Common;

/// <summary>Marks tenant data. AppDbContext applies a global query filter on <see cref="InstitutionId"/>.</summary>
public interface ITenantOwned
{
    Guid InstitutionId { get; set; }
}

/// <summary>The current user and active institution (from the access token in the API, set explicitly in jobs).</summary>
public interface ITenantContext
{
    Guid? CurrentUserId { get; }

    Guid? CurrentInstitutionId { get; }

    /// <summary>Platform roles plus the role in the active institution.</summary>
    IReadOnlyCollection<string> Roles { get; }

    Guid UserId => CurrentUserId ?? throw new AppException("auth.required", Messages.LoginRequired, 401);

    Guid InstitutionId => CurrentInstitutionId
        ?? throw new AppException("institution.required", Messages.InstitutionRequired, 403);

    bool IsInRole(string role) => Roles.Contains(role);

    /// <summary>Owner or Admin of the active institution.</summary>
    bool IsInstitutionAdmin => IsInRole(Auth.Roles.Owner) || IsInRole(Auth.Roles.Admin);

    bool IsContentTeam => IsInRole(Auth.Roles.SuperAdmin) || IsInRole(Auth.Roles.ContentEditor) || IsInRole(Auth.Roles.ContentReviewer);
}

/// <summary>Tenant context for background jobs, seeders and tests, where there is no HTTP request.</summary>
public sealed class MutableTenantContext : ITenantContext
{
    public Guid? CurrentUserId { get; private set; }

    public Guid? CurrentInstitutionId { get; private set; }

    public IReadOnlyCollection<string> Roles { get; private set; } = [];

    public void Set(Guid? userId, Guid? institutionId, params string[] roles)
    {
        CurrentUserId = userId;
        CurrentInstitutionId = institutionId;
        Roles = roles;
    }
}
