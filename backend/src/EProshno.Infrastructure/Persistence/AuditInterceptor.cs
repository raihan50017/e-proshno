using System.Text.Json;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Institutions;
using EProshno.Core.Platform;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace EProshno.Infrastructure.Persistence;

/// <summary>Writes AuditLog rows for tenant data changes (who changed what; never the values).</summary>
public sealed class AuditInterceptor(ITenantContext tenant, TimeProvider clock) : SaveChangesInterceptor
{
    // High-volume or derived rows that would only add noise.
    private static readonly HashSet<Type> Ignored =
    [
        typeof(QuestionUsage), typeof(ImportRow), typeof(JobRecord), typeof(QuestionSetItem), typeof(AuditLog),
    ];

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        if (eventData.Context is AppDbContext db)
        {
            AddAuditRows(db);
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        if (eventData.Context is AppDbContext db)
        {
            AddAuditRows(db);
        }

        return base.SavingChanges(eventData, result);
    }

    private void AddAuditRows(AppDbContext db)
    {
        var now = clock.GetUtcNow();
        var rows = new List<AuditLog>();
        foreach (var entry in db.ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted)
                || Ignored.Contains(entry.Entity.GetType())
                || !IsAudited(entry.Entity))
            {
                continue;
            }

            var institutionId = entry.Entity switch
            {
                ITenantOwned owned => owned.InstitutionId,
                Membership m => m.InstitutionId,
                Institution i => i.Id,
                _ => tenant.CurrentInstitutionId,
            };

            rows.Add(new AuditLog
            {
                Id = IdGen.New(),
                ActorId = tenant.CurrentUserId,
                InstitutionId = institutionId,
                Action = entry.State switch
                {
                    EntityState.Added => "created",
                    EntityState.Deleted => "deleted",
                    _ => "updated",
                },
                EntityType = entry.Entity.GetType().Name,
                EntityId = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "Id")?.CurrentValue?.ToString(),
                Meta = entry.State == EntityState.Modified ? ChangedProperties(entry) : null,
                CreatedAt = now,
            });
        }

        if (rows.Count > 0)
        {
            db.AuditLogs.AddRange(rows);
        }
    }

    // Questions created by an import are covered by the ImportJob's own audit row.
    private static bool IsAudited(object entity) =>
        entity is ITenantOwned or Membership or Institution or Question { ImportJobId: null };

    private static string ChangedProperties(EntityEntry entry) =>
        JsonSerializer.Serialize(entry.Properties.Where(p => p.IsModified).Select(p => p.Metadata.Name).ToArray());
}
