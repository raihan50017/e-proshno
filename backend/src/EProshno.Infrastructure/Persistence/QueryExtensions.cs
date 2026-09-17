using EProshno.Core.Common;
using EProshno.Core.Questions;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Infrastructure.Persistence;

public static class QueryExtensions
{
    /// <summary>
    /// Published questions a teacher may see: the platform bank, plus their institution's banks that are shared or
    /// owned by them. Platform-bank subject entitlement is checked separately.
    /// </summary>
    public static IQueryable<Question> VisibleTo(this IQueryable<Question> q, Guid institutionId, Guid userId) =>
        q.Where(x => x.Status == ContentStatus.Published &&
            (x.BankId == null
             || (x.Bank!.InstitutionId == institutionId && x.Bank.ArchivedAt == null &&
                 (x.Bank.Sharing == BankSharing.Institution || x.Bank.OwnerId == userId))));

    /// <summary>Banks of the current institution (tenant filter) that the user can see and add to.</summary>
    public static IQueryable<QuestionBank> AccessibleTo(this IQueryable<QuestionBank> q, Guid userId) =>
        q.Where(b => b.ArchivedAt == null && (b.OwnerId == userId || b.Sharing == BankSharing.Institution));

    public static async Task<T> FirstOr404Async<T>(this IQueryable<T> q, CancellationToken ct)
    {
        var item = await q.FirstOrDefaultAsync(ct);
        return item ?? throw AppException.NotFound();
    }
}

/// <summary>Keyset page: fetch <c>limit + 1</c> rows ordered by a time-ordered Guid, then build with <see cref="From"/>.</summary>
public sealed record Page<T>(IReadOnlyList<T> Items, Guid? NextCursor)
{
    public static Page<T> From(List<T> rows, int limit, Func<T, Guid> id) =>
        rows.Count > limit
            ? new Page<T>(rows.Take(limit).ToList(), id(rows[limit - 1]))
            : new Page<T>(rows, null);
}
