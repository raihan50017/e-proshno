using EProshno.Core.Billing;
using EProshno.Core.Imports;
using EProshno.Core.Institutions;
using EProshno.Core.Platform;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Core.Students;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EProshno.Infrastructure.Persistence.Configurations;

internal sealed class QuestionSetConfiguration : IEntityTypeConfiguration<QuestionSet>
{
    public void Configure(EntityTypeBuilder<QuestionSet> e)
    {
        e.Property(x => x.Title).HasMaxLength(120);
        e.Property(x => x.FullMarks).HasPrecision(7, 2);
        e.Property(x => x.Settings).HasJsonConversion();
        e.HasIndex(x => new { x.InstitutionId, x.CreatedAt });
        e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.SetId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne<Institution>().WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class QuestionSetItemConfiguration : IEntityTypeConfiguration<QuestionSetItem>
{
    public void Configure(EntityTypeBuilder<QuestionSetItem> e)
    {
        e.HasKey(x => new { x.SetId, x.QuestionId });
        e.Property(x => x.Marks).HasPrecision(5, 2);
        e.HasIndex(x => x.QuestionId);
        e.HasOne(x => x.Question).WithMany().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class QuestionUsageConfiguration : IEntityTypeConfiguration<QuestionUsage>
{
    public void Configure(EntityTypeBuilder<QuestionUsage> e)
    {
        e.HasKey(x => new { x.InstitutionId, x.QuestionId, x.SetId });
        e.HasIndex(x => new { x.InstitutionId, x.QuestionId });
        e.HasOne<QuestionSet>().WithMany().HasForeignKey(x => x.SetId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class ImportJobConfiguration : IEntityTypeConfiguration<ImportJob>
{
    public void Configure(EntityTypeBuilder<ImportJob> e)
    {
        e.Property(x => x.FileKey).HasMaxLength(300);
        e.Property(x => x.FileName).HasMaxLength(255);
        e.Property(x => x.Error).HasMaxLength(1000);
        e.Property(x => x.Defaults).HasJsonConversion();
        e.Property(x => x.ColumnMap).HasJsonConversion();
        e.Property(x => x.DetectedHeaders).HasJsonConversion();
        e.Property(x => x.MissingColumns).HasJsonConversion();
        e.Ignore(x => x.IsPlatform);
        e.HasIndex(x => new { x.InstitutionId, x.CreatedAt });
        e.HasIndex(x => new { x.BankId, x.CreatedAt });
        e.HasOne(x => x.Bank).WithMany().HasForeignKey(x => x.BankId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class ImportRowConfiguration : IEntityTypeConfiguration<ImportRow>
{
    public void Configure(EntityTypeBuilder<ImportRow> e)
    {
        e.Property(x => x.Draft).HasJsonConversion();
        e.Property(x => x.Messages).HasJsonConversion();
        e.HasIndex(x => new { x.ImportJobId, x.RowNo }).IsUnique();
        e.HasIndex(x => new { x.ImportJobId, x.Status });
        e.HasOne<ImportJob>().WithMany().HasForeignKey(x => x.ImportJobId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PlanConfiguration : IEntityTypeConfiguration<Plan>
{
    public void Configure(EntityTypeBuilder<Plan> e)
    {
        e.Property(x => x.Code).HasMaxLength(40);
        e.Property(x => x.NameBn).HasMaxLength(120);
        e.Property(x => x.DescriptionBn).HasMaxLength(500);
        e.Property(x => x.Limits).HasJsonConversion();
        e.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> e)
    {
        e.HasIndex(x => new { x.InstitutionId, x.EndsAt });
        e.HasOne(x => x.Plan).WithMany().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
        e.HasMany(x => x.Subjects).WithOne().HasForeignKey(x => x.SubscriptionId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne<Institution>().WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class SubscriptionSubjectConfiguration : IEntityTypeConfiguration<SubscriptionSubject>
{
    public void Configure(EntityTypeBuilder<SubscriptionSubject> e) => e.HasKey(x => new { x.SubscriptionId, x.SubjectId });
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> e)
    {
        e.Property(x => x.TranId).HasMaxLength(40);
        e.Property(x => x.Currency).HasMaxLength(3);
        e.Property(x => x.GatewayRef).HasMaxLength(100);
        e.Property(x => x.Raw).HasColumnType("jsonb");
        e.HasIndex(x => x.TranId).IsUnique();
        e.HasIndex(x => new { x.InstitutionId, x.CreatedAt });
        e.HasIndex(x => new { x.Status, x.CreatedAt });
        e.HasOne(x => x.Plan).WithMany().HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> e)
    {
        e.Property(x => x.Number).HasMaxLength(30);
        e.Property(x => x.BilledToName).HasMaxLength(150);
        e.Property(x => x.Lines).HasJsonConversion();
        e.HasIndex(x => x.Number).IsUnique();
        e.HasIndex(x => x.PaymentId).IsUnique();
        e.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class InvoiceCounterConfiguration : IEntityTypeConfiguration<InvoiceCounter>
{
    public void Configure(EntityTypeBuilder<InvoiceCounter> e)
    {
        e.HasKey(x => x.FiscalYear);
        e.Property(x => x.FiscalYear).HasMaxLength(10);
    }
}

internal sealed class BatchConfiguration : IEntityTypeConfiguration<Batch>
{
    public void Configure(EntityTypeBuilder<Batch> e)
    {
        e.Property(x => x.Name).HasMaxLength(100);
        e.HasIndex(x => new { x.InstitutionId, x.Name });
    }
}

internal sealed class StudentConfiguration : IEntityTypeConfiguration<Student>
{
    public void Configure(EntityTypeBuilder<Student> e)
    {
        e.Property(x => x.Roll).HasMaxLength(20);
        e.Property(x => x.Name).HasMaxLength(120);
        e.Property(x => x.Phone).HasMaxLength(20);
        e.Property(x => x.GuardianPhone).HasMaxLength(20);
        e.Property(x => x.Email).HasMaxLength(200);
        e.HasIndex(x => new { x.BatchId, x.Roll }).IsUnique();
        e.HasIndex(x => new { x.InstitutionId, x.Name });
        e.HasOne(x => x.Batch).WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AnnouncementConfiguration : IEntityTypeConfiguration<Announcement>
{
    public void Configure(EntityTypeBuilder<Announcement> e)
    {
        e.Property(x => x.TitleBn).HasMaxLength(150);
        e.Property(x => x.BodyBn).HasMaxLength(1000);
        e.Property(x => x.LinkUrl).HasMaxLength(500);
    }
}

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> e)
    {
        e.Property(x => x.Action).HasMaxLength(40);
        e.Property(x => x.EntityType).HasMaxLength(60);
        e.Property(x => x.EntityId).HasMaxLength(80);
        e.Property(x => x.Meta).HasColumnType("jsonb");
        e.HasIndex(x => new { x.InstitutionId, x.CreatedAt });
        e.HasIndex(x => new { x.ActorId, x.CreatedAt });
    }
}

internal sealed class JobRecordConfiguration : IEntityTypeConfiguration<JobRecord>
{
    public void Configure(EntityTypeBuilder<JobRecord> e)
    {
        e.Property(x => x.ObjectKey).HasMaxLength(300);
        e.Property(x => x.DownloadName).HasMaxLength(200);
        e.Property(x => x.ResultKey).HasMaxLength(300);
        e.Property(x => x.Error).HasMaxLength(1000);
        e.HasIndex(x => new { x.InstitutionId, x.CreatedAt });
    }
}
