using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Imports;

/// <summary>
/// Import scope. Teachers work inside their institution. The content team's platform-bank imports live under
/// <see cref="ImportJob.PlatformScope"/>: entering that scope switches the tenant context, so every query keeps
/// using the normal tenant filter.
/// </summary>
public sealed class ImportAccess(AppDbContext db, TenantContext context, ITenantContext tenant)
{
    public void Enter(bool platform)
    {
        if (!platform)
        {
            _ = tenant.InstitutionId;   // 403 without an active institution
            return;
        }

        if (!tenant.IsContentTeam)
        {
            throw AppException.Forbidden();
        }

        var userId = tenant.UserId;
        var roles = tenant.Roles.ToArray();
        context.Set(userId, ImportJob.PlatformScope, roles);
    }

    /// <summary>The import in the current scope; importers see their own jobs, admins see all.</summary>
    public async Task<ImportJob> GetJobAsync(Guid id, CancellationToken ct)
    {
        var job = await db.ImportJobs.Include(j => j.Bank).Where(j => j.Id == id).FirstOr404Async(ct);
        var mayRead = job.CreatedById == tenant.CurrentUserId
                      || (job.IsPlatform ? tenant.IsContentTeam : tenant.IsInstitutionAdmin);
        return mayRead ? job : throw AppException.NotFound();
    }

    public IQueryable<ImportJob> Jobs()
    {
        var userId = tenant.UserId;
        var all = tenant.IsInstitutionAdmin || (tenant.CurrentInstitutionId == ImportJob.PlatformScope && tenant.IsContentTeam);
        return all ? db.ImportJobs : db.ImportJobs.Where(j => j.CreatedById == userId);
    }

    public static void EnsureStatus(ImportJob job, params ImportStatus[] allowed)
    {
        if (!allowed.Contains(job.Status))
        {
            throw AppException.Conflict("import.status", Messages.ImportNotReady);
        }
    }
}
