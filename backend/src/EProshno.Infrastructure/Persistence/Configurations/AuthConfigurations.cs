using EProshno.Core.Auth;
using EProshno.Core.Institutions;
using EProshno.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EProshno.Infrastructure.Persistence.Configurations;

internal sealed class AppUserConfiguration : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> e)
    {
        e.Property(x => x.FullName).HasMaxLength(120);
        e.Property(x => x.AvatarKey).HasMaxLength(300);
        e.HasIndex(x => x.PhoneNumber).IsUnique().HasFilter("phone_number IS NOT NULL");
        // Emails are optional, but unique when present.
        e.HasIndex(x => x.NormalizedEmail).HasDatabaseName("EmailIndex").IsUnique().HasFilter("normalized_email IS NOT NULL");
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> e)
    {
        e.Property(x => x.TokenHash).HasMaxLength(64);
        e.Property(x => x.UserAgent).HasMaxLength(300);
        e.HasIndex(x => x.TokenHash).IsUnique();
        e.HasIndex(x => new { x.UserId, x.FamilyId });
        e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class InstitutionConfiguration : IEntityTypeConfiguration<Institution>
{
    public void Configure(EntityTypeBuilder<Institution> e)
    {
        e.Property(x => x.Name).HasMaxLength(150);
        e.Property(x => x.NameEn).HasMaxLength(150);
        e.Property(x => x.Address).HasMaxLength(300);
        e.Property(x => x.Phone).HasMaxLength(20);
        e.Property(x => x.Email).HasMaxLength(200);
        e.Property(x => x.LogoKey).HasMaxLength(300);
        e.Property(x => x.PaperDefaults).HasJsonConversion();
    }
}

internal sealed class MembershipConfiguration : IEntityTypeConfiguration<Membership>
{
    public void Configure(EntityTypeBuilder<Membership> e)
    {
        e.HasIndex(x => new { x.InstitutionId, x.UserId }).IsUnique();
        e.HasIndex(x => x.UserId);
        e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class InvitationConfiguration : IEntityTypeConfiguration<Invitation>
{
    public void Configure(EntityTypeBuilder<Invitation> e)
    {
        e.Property(x => x.Name).HasMaxLength(120);
        e.Property(x => x.Phone).HasMaxLength(20);
        e.Property(x => x.Email).HasMaxLength(200);
        e.Property(x => x.TokenHash).HasMaxLength(64);
        e.HasIndex(x => x.TokenHash).IsUnique();
        e.HasIndex(x => new { x.InstitutionId, x.Status });
        e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Cascade);
    }
}
