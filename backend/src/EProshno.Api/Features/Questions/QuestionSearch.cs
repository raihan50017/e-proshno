using System.Globalization;
using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Core.Sets;
using EProshno.Core.Text;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Questions;

public enum SearchMode
{
    /// <summary>Every matching question.</summary>
    All,

    /// <summary>Only questions this institution has not used in another set.</summary>
    Unique,

    /// <summary>Only curated high-probability questions.</summary>
    Common,
}

/// <summary>Picker and bank-browse filters (see the question-bank skill).</summary>
public sealed record SearchFilters
{
    public string? Keyword { get; init; }
    public SearchMode Mode { get; init; }
    public IReadOnlyList<Guid> TopicIds { get; init; } = [];
    public IReadOnlyList<Guid> TagIds { get; init; } = [];
    public bool? IsMath { get; init; }
    public bool WithImage { get; init; }
    public McqKind? McqKind { get; init; }
    public bool RepeatedBoard { get; init; }
}

public sealed record SearchScope(
    Guid SubjectId,
    IReadOnlyList<Guid> ChapterIds,
    QuestionType? Type,
    QuestionSource Source,
    IReadOnlyList<Guid> BankIds,
    Guid? CurrentSetId = null);

public sealed record SearchPage(IReadOnlyList<QuestionCard> Items, string? NextCursor, int TotalCount);

/// <summary>
/// The one query behind the question-bank browser, the picker and auto-selection. Enforces visibility
/// (<c>VisibleTo</c>), bank access and — when the platform bank is a source — the subject subscription.
/// </summary>
public sealed class QuestionSearch(AppDbContext db, ITenantContext tenant, IEntitlements entitlements, QuestionReader reader)
{
    public const int MaxKeywordLength = 200;

    public async Task<IQueryable<Question>> QueryAsync(SearchScope scope, SearchFilters filters, CancellationToken ct)
    {
        var institutionId = tenant.InstitutionId;
        var userId = tenant.UserId;

        var usesPlatform = scope.Source is QuestionSource.Platform or QuestionSource.Both;
        if (usesPlatform)
        {
            await entitlements.EnsureSubjectAccessAsync(institutionId, scope.SubjectId, ct);   // 402 → UI offers "my banks only"
        }

        var bankIds = await AccessibleBankIdsAsync(scope.BankIds, ct);

        var q = db.Questions.AsNoTracking()
            .VisibleTo(institutionId, userId)
            .Where(x => x.SubjectId == scope.SubjectId);

        if (scope.ChapterIds.Count > 0)
        {
            q = q.Where(x => scope.ChapterIds.Contains(x.ChapterId));
        }

        if (scope.Type is { } type)
        {
            q = q.Where(x => x.Type == type);
        }

        q = scope.Source switch
        {
            QuestionSource.Platform => q.Where(x => x.BankId == null),
            QuestionSource.MyBanks => q.Where(x => x.BankId != null && bankIds.Contains(x.BankId.Value)),
            _ => q.Where(x => x.BankId == null || bankIds.Contains(x.BankId.Value)),
        };

        if (filters.TopicIds.Count > 0)
        {
            q = q.Where(x => x.TopicId != null && filters.TopicIds.Contains(x.TopicId.Value));
        }

        if (filters.TagIds.Count > 0)
        {
            q = q.Where(x => x.Tags.Any(t => filters.TagIds.Contains(t.TagId)));
        }

        if (filters.IsMath is { } isMath)
        {
            q = q.Where(x => x.IsMath == isMath);
        }

        if (filters.WithImage)
        {
            q = q.Where(x => x.HasImage);
        }

        if (filters.McqKind is { } kind)
        {
            q = q.Where(x => x.McqKind == kind);
        }

        if (filters.RepeatedBoard)
        {
            q = q.Where(x => x.Appearances.Count(a => a.Source == ExamSource.Board) >= 2);
        }

        if (filters.Mode == SearchMode.Unique)
        {
            // QuestionUsage is tenant-filtered; the set being edited does not count as a previous use.
            var setId = scope.CurrentSetId;
            q = q.Where(x => !db.QuestionUsages.Any(u => u.QuestionId == x.Id && u.SetId != setId));
        }
        else if (filters.Mode == SearchMode.Common)
        {
            q = q.Where(x => x.IsCommon);
        }

        if (!string.IsNullOrWhiteSpace(filters.Keyword))
        {
            var pattern = $"%{LikePattern.Escape(BanglaText.Normalize(filters.Keyword))}%";
            q = q.Where(x => EF.Functions.ILike(x.StemText, pattern, @"\"));
        }

        return q;
    }

    /// <summary>Ordered by chapter number, then id. Cursor: <c>{chapterNumber}:{id}</c>.</summary>
    public async Task<SearchPage> SearchAsync(SearchScope scope, SearchFilters filters, string? cursor, int? limit, CancellationToken ct)
    {
        var q = await QueryAsync(scope, filters, ct);
        var total = await q.CountAsync(ct);

        if (ParseCursor(cursor) is var (number, id))
        {
            q = q.Where(x => x.Chapter!.Number > number || (x.Chapter!.Number == number && x.Id.CompareTo(id) > 0));
        }

        var take = Paging.Limit(limit);
        var cards = await reader.CardsAsync(q.OrderBy(x => x.Chapter!.Number).ThenBy(x => x.Id).Take(take + 1), ct);
        string? next = null;
        if (cards.Count > take)
        {
            cards.RemoveAt(take);
            var last = cards[^1];
            next = string.Create(CultureInfo.InvariantCulture, $"{last.ChapterNumber}:{last.Id:N}");
        }

        return new SearchPage(cards, next, total);
    }

    /// <summary>Requested bank ids the user may read; an empty request means every accessible bank.</summary>
    public async Task<List<Guid>> AccessibleBankIdsAsync(IReadOnlyList<Guid> requested, CancellationToken ct)
    {
        var banks = db.QuestionBanks.AsNoTracking().AccessibleTo(tenant.UserId);
        if (requested.Count > 0)
        {
            banks = banks.Where(b => requested.Contains(b.Id));
        }

        return await banks.Select(b => b.Id).ToListAsync(ct);
    }

    private static (int Number, Guid Id)? ParseCursor(string? cursor)
    {
        var parts = cursor?.Split(':');
        return parts is { Length: 2 }
               && int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var number)
               && Guid.TryParseExact(parts[1], "N", out var id)
            ? (number, id)
            : null;
    }
}
