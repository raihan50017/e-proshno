using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Core.Taxonomy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EProshno.Infrastructure.Persistence.Configurations;

internal sealed class LevelConfiguration : IEntityTypeConfiguration<Level>
{
    public void Configure(EntityTypeBuilder<Level> e)
    {
        e.Property(x => x.Slug).HasMaxLength(40);
        e.Property(x => x.NameBn).HasMaxLength(80);
        e.HasIndex(x => x.Slug).IsUnique();
    }
}

internal sealed class SubjectConfiguration : IEntityTypeConfiguration<Subject>
{
    public void Configure(EntityTypeBuilder<Subject> e)
    {
        e.Property(x => x.NameBn).HasMaxLength(120);
        e.Property(x => x.Code).HasMaxLength(40);
        e.HasIndex(x => new { x.LevelId, x.InstitutionId, x.Sort });
        e.HasIndex(x => x.Code).IsUnique().HasFilter("code IS NOT NULL");
        e.HasOne(x => x.Level).WithMany().HasForeignKey(x => x.LevelId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne<Institution>().WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class ChapterConfiguration : IEntityTypeConfiguration<Chapter>
{
    public void Configure(EntityTypeBuilder<Chapter> e)
    {
        e.Property(x => x.NameBn).HasMaxLength(200);
        e.HasIndex(x => new { x.SubjectId, x.InstitutionId, x.Number });
        e.HasOne(x => x.Subject).WithMany(s => s.Chapters).HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne<Institution>().WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class TopicConfiguration : IEntityTypeConfiguration<Topic>
{
    public void Configure(EntityTypeBuilder<Topic> e)
    {
        e.Property(x => x.NameBn).HasMaxLength(200);
        e.HasIndex(x => new { x.ChapterId, x.Sort });
        e.HasOne<Chapter>().WithMany(c => c.Topics).HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne<Institution>().WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class BoardConfiguration : IEntityTypeConfiguration<Board>
{
    public void Configure(EntityTypeBuilder<Board> e)
    {
        e.Property(x => x.Code).HasMaxLength(10);
        e.Property(x => x.NameBn).HasMaxLength(60);
        e.Property(x => x.NameEn).HasMaxLength(60);
        e.Property(x => x.ShortBn).HasMaxLength(10);
        e.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class QuestionConfiguration : IEntityTypeConfiguration<Question>
{
    public void Configure(EntityTypeBuilder<Question> e)
    {
        e.Property(x => x.Stem).HasColumnType("jsonb");
        e.Property(x => x.Explanation).HasColumnType("jsonb");
        e.Property(x => x.ContentHash).HasMaxLength(64);
        e.Property(x => x.ReviewNote).HasMaxLength(500);
        e.HasIndex(x => new { x.SubjectId, x.ChapterId, x.Type, x.Status });
        e.HasIndex(x => x.ContentHash);
        e.HasIndex(x => new { x.BankId, x.ChapterId, x.Status });
        e.HasIndex(x => x.ImportJobId);
        e.HasIndex(x => x.StimulusId);
        e.HasIndex(x => x.StemText).HasMethod("gin").HasOperators("gin_trgm_ops");

        e.HasOne(x => x.Bank).WithMany().HasForeignKey(x => x.BankId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne(x => x.Stimulus).WithMany().HasForeignKey(x => x.StimulusId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne(x => x.Subject).WithMany().HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne(x => x.Chapter).WithMany().HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Restrict);
        e.HasOne(x => x.Topic).WithMany().HasForeignKey(x => x.TopicId).OnDelete(DeleteBehavior.SetNull);
        e.HasMany(x => x.Options).WithOne().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
        e.HasMany(x => x.CqParts).WithOne().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
        e.HasMany(x => x.Appearances).WithOne().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
        e.HasMany(x => x.Tags).WithOne().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class StimulusConfiguration : IEntityTypeConfiguration<Stimulus>
{
    public void Configure(EntityTypeBuilder<Stimulus> e) => e.Property(x => x.Content).HasColumnType("jsonb");
}

internal sealed class McqOptionConfiguration : IEntityTypeConfiguration<McqOption>
{
    public void Configure(EntityTypeBuilder<McqOption> e)
    {
        e.Property(x => x.Content).HasColumnType("jsonb");
        e.HasIndex(x => new { x.QuestionId, x.Index }).IsUnique();
    }
}

internal sealed class CqPartConfiguration : IEntityTypeConfiguration<CqPart>
{
    public void Configure(EntityTypeBuilder<CqPart> e)
    {
        e.Property(x => x.Prompt).HasColumnType("jsonb");
        e.Property(x => x.Answer).HasColumnType("jsonb");
        e.Property(x => x.Marks).HasPrecision(5, 2);
        e.HasIndex(x => new { x.QuestionId, x.Part }).IsUnique();
    }
}

internal sealed class QuestionAppearanceConfiguration : IEntityTypeConfiguration<QuestionAppearance>
{
    public void Configure(EntityTypeBuilder<QuestionAppearance> e)
    {
        e.Property(x => x.SchoolName).HasMaxLength(150);
        e.HasIndex(x => x.QuestionId);
        e.HasOne(x => x.Board).WithMany().HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class QuestionBankConfiguration : IEntityTypeConfiguration<QuestionBank>
{
    public void Configure(EntityTypeBuilder<QuestionBank> e)
    {
        e.Property(x => x.Name).HasMaxLength(120);
        e.Property(x => x.Description).HasMaxLength(500);
        e.HasIndex(x => new { x.InstitutionId, x.OwnerId });
        e.HasIndex(x => new { x.InstitutionId, x.OwnerId }, "ix_question_banks_one_default").IsUnique().HasFilter("is_default");
        e.HasOne<Institution>().WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class QuestionTagConfiguration : IEntityTypeConfiguration<QuestionTag>
{
    public void Configure(EntityTypeBuilder<QuestionTag> e)
    {
        e.Property(x => x.Name).HasMaxLength(60);
        e.HasIndex(x => new { x.InstitutionId, x.Name }).IsUnique();
    }
}

internal sealed class QuestionTagLinkConfiguration : IEntityTypeConfiguration<QuestionTagLink>
{
    public void Configure(EntityTypeBuilder<QuestionTagLink> e)
    {
        e.HasKey(x => new { x.QuestionId, x.TagId });
        e.HasOne(x => x.Tag).WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class QuestionRevisionConfiguration : IEntityTypeConfiguration<QuestionRevision>
{
    public void Configure(EntityTypeBuilder<QuestionRevision> e)
    {
        e.Property(x => x.Snapshot).HasColumnType("jsonb");
        e.HasIndex(x => new { x.QuestionId, x.CreatedAt });
        e.HasOne<Question>().WithMany().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class QuestionReportConfiguration : IEntityTypeConfiguration<QuestionReport>
{
    public void Configure(EntityTypeBuilder<QuestionReport> e)
    {
        e.Property(x => x.Reason).HasMaxLength(500);
        e.Property(x => x.Resolution).HasMaxLength(500);
        e.HasIndex(x => new { x.Status, x.CreatedAt });
        e.HasOne(x => x.Question).WithMany().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade);
    }
}
