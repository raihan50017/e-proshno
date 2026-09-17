using System.Security.Claims;
using EProshno.Core.Auth;
using EProshno.Core.Common;
using Microsoft.AspNetCore.Http;

namespace EProshno.Infrastructure.Tenancy;

/// <summary>
/// Scoped tenant context. In a request it reads the access-token claims; background jobs call <see cref="Set"/>
/// with the owner of the work they process, which takes precedence.
/// </summary>
public sealed class TenantContext(IHttpContextAccessor accessor) : ITenantContext
{
    private bool _overridden;
    private Guid? _userId;
    private Guid? _institutionId;
    private IReadOnlyCollection<string> _roles = [];

    public Guid? CurrentUserId => _overridden ? _userId : ParseGuid(Principal?.FindFirstValue(AppClaims.Subject));

    public Guid? CurrentInstitutionId => _overridden ? _institutionId : ParseGuid(Principal?.FindFirstValue(AppClaims.Institution));

    public IReadOnlyCollection<string> Roles =>
        _overridden ? _roles : Principal?.FindAll(AppClaims.Role).Select(c => c.Value).ToArray() ?? [];

    private ClaimsPrincipal? Principal =>
        accessor.HttpContext?.User is { Identity.IsAuthenticated: true } user ? user : null;

    public void Set(Guid? userId, Guid? institutionId, params string[] roles)
    {
        _overridden = true;
        _userId = userId;
        _institutionId = institutionId;
        _roles = roles;
    }

    private static Guid? ParseGuid(string? value) => Guid.TryParse(value, out var id) ? id : null;
}
