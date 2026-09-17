using System.Reflection;
using EProshno.Core.Auth;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Institutions;
using EProshno.Core.Platform;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Core.Students;
using EProshno.Core.Taxonomy;
using EProshno.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace EProshno.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenant)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    private static readonly MethodInfo ApplyTenantFilterMethod =
        typeof(AppDbContext).GetMethod(nameof(ApplyTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;

    // Must be a DbContext member so EF evaluates it per context instance instead of caching a constant.
    private Guid? CurrentInstitutionId => tenant.CurrentInstitutionId;

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Institution> Institutions => Set<Institution>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<Invitation> Invitations => Set<Invitation>();

    public DbSet<Level> Levels => Set<Level>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<Topic> Topics => Set<Topic>();
    public DbSet<Board> Boards => Set<Board>();

    public DbSet<Question> Questions => Set<Question>();
    public DbSet<Stimulus> Stimuli => Set<Stimulus>();
    public DbSet<McqOption> McqOptions => Set<McqOption>();
    public DbSet<CqPart> CqParts => Set<CqPart>();
    public DbSet<QuestionAppearance> QuestionAppearances => Set<QuestionAppearance>();
    public DbSet<QuestionBank> QuestionBanks => Set<QuestionBank>();
    public DbSet<QuestionTag> QuestionTags => Set<QuestionTag>();
    public DbSet<QuestionTagLink> QuestionTagLinks => Set<QuestionTagLink>();
    public DbSet<QuestionReport> QuestionReports => Set<QuestionReport>();
    public DbSet<QuestionRevision> QuestionRevisions => Set<QuestionRevision>();

    public DbSet<QuestionSet> QuestionSets => Set<QuestionSet>();
    public DbSet<QuestionSetItem> QuestionSetItems => Set<QuestionSetItem>();
    public DbSet<QuestionUsage> QuestionUsages => Set<QuestionUsage>();

    public DbSet<ImportJob> ImportJobs => Set<ImportJob>();
    public DbSet<ImportRow> ImportRows => Set<ImportRow>();

    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<SubscriptionSubject> SubscriptionSubjects => Set<SubscriptionSubject>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceCounter> InvoiceCounters => Set<InvoiceCounter>();

    public DbSet<Batch> Batches => Set<Batch>();
    public DbSet<Student> Students => Set<Student>();

    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<JobRecord> JobRecords => Set<JobRecord>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.HasPostgresExtension("pg_trgm");
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                var type = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
                if (type.IsEnum && property.GetValueConverter() is null)
                {
                    var converterType = typeof(EnumToStringConverter<>).MakeGenericType(type);
                    property.SetValueConverter((ValueConverter)Activator.CreateInstance(converterType, [null])!);
                    property.SetMaxLength(32);
                }
            }

            if (typeof(ITenantOwned).IsAssignableFrom(entityType.ClrType) && entityType.BaseType is null)
            {
                ApplyTenantFilterMethod.MakeGenericMethod(entityType.ClrType).Invoke(this, [builder]);
            }
        }
    }

    private void ApplyTenantFilter<T>(ModelBuilder builder)
        where T : class, ITenantOwned =>
        builder.Entity<T>().HasQueryFilter(e => e.InstitutionId == CurrentInstitutionId);
}
