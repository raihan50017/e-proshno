using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Infrastructure.Institutions;

/// <summary>Creates an institution with its owner membership, the owner's default bank and the configured trial.</summary>
public sealed class InstitutionSetup(AppDbContext db, TrialService trials, TimeProvider clock)
{
    public async Task<Institution> CreateAsync(Guid ownerId, string name, InstitutionType type, string? address, string? phone, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var institution = new Institution
        {
            Id = IdGen.New(),
            Name = name.Trim(),
            Type = type,
            Address = address?.Trim(),
            Phone = phone,
            CreatedById = ownerId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Institutions.Add(institution);
        db.Memberships.Add(new Membership
        {
            Id = IdGen.New(),
            InstitutionId = institution.Id,
            UserId = ownerId,
            Role = InstitutionRole.Owner,
            Status = MembershipStatus.Active,
            JoinedAt = now,
        });
        db.QuestionBanks.Add(DefaultBank(institution.Id, ownerId, now));
        await trials.GrantAsync(institution.Id, ct);
        return institution;
    }

    /// <summary>Every teacher gets a private "আমার প্রশ্ন" bank on first use.</summary>
    public async Task<QuestionBank> EnsureDefaultBankAsync(Guid institutionId, Guid userId, CancellationToken ct)
    {
        var bank = await db.QuestionBanks.FirstOrDefaultAsync(
            b => b.InstitutionId == institutionId && b.OwnerId == userId && b.IsDefault, ct);
        if (bank is not null)
        {
            return bank;
        }

        bank = DefaultBank(institutionId, userId, clock.GetUtcNow());
        db.QuestionBanks.Add(bank);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // A parallel request created it first (unique partial index on the default bank).
            db.Entry(bank).State = EntityState.Detached;
            bank = await db.QuestionBanks.FirstAsync(
                b => b.InstitutionId == institutionId && b.OwnerId == userId && b.IsDefault, ct);
        }

        return bank;
    }

    public static QuestionBank DefaultBank(Guid institutionId, Guid ownerId, DateTimeOffset now) => new()
    {
        Id = IdGen.New(),
        InstitutionId = institutionId,
        OwnerId = ownerId,
        Name = Messages.DefaultBankName,
        Sharing = BankSharing.Private,
        IsDefault = true,
        CreatedAt = now,
        UpdatedAt = now,
    };
}
