using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Taxonomy;

public sealed record LevelDto(Guid Id, string Slug, string NameBn);

public sealed record SubjectDto(Guid Id, Guid LevelId, string NameBn, int? Paper, string Label, string? Code, bool IsCustom);

public sealed record TopicDto(Guid Id, string NameBn, bool IsCustom);

public sealed record ChapterDto(Guid Id, Guid SubjectId, int Number, string NameBn, string Label, bool IsCustom, IReadOnlyList<TopicDto> Topics);

public sealed record BoardDto(Guid Id, string Code, string NameBn, string ShortBn);

public sealed record FreshnessDto(DateTimeOffset? LastUpdatedAt, string AppVersion);

public static class ListLevels
{
    public sealed record Query : IQuery<IReadOnlyList<LevelDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<LevelDto>>
    {
        public async Task<IReadOnlyList<LevelDto>> Handle(Query query, CancellationToken ct) =>
            await db.Levels.AsNoTracking().OrderBy(l => l.Sort).Select(l => new LevelDto(l.Id, l.Slug, l.NameBn)).ToListAsync(ct);
    }
}

public static class ListSubjects
{
    public sealed record Query(Guid? LevelId) : IQuery<IReadOnlyList<SubjectDto>>;

    /// <summary>Official subjects plus the current institution's custom ones.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : IQueryHandler<Query, IReadOnlyList<SubjectDto>>
    {
        public async Task<IReadOnlyList<SubjectDto>> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.CurrentInstitutionId;
            var subjects = db.Subjects.AsNoTracking().Where(s => s.InstitutionId == null || s.InstitutionId == institutionId);
            if (query.LevelId is { } levelId)
            {
                subjects = subjects.Where(s => s.LevelId == levelId);
            }

            var rows = await subjects
                .OrderBy(s => s.Level!.Sort).ThenBy(s => s.InstitutionId != null).ThenBy(s => s.Sort).ThenBy(s => s.NameBn)
                .Select(s => new { s.Id, s.LevelId, s.NameBn, s.Paper, s.Code, IsCustom = s.InstitutionId != null })
                .ToListAsync(ct);
            return rows.Select(s => new SubjectDto(s.Id, s.LevelId, s.NameBn, s.Paper, PaperLoader.SubjectLabel(s.NameBn, s.Paper), s.Code, s.IsCustom))
                .ToList();
        }
    }
}

public static class ListChapters
{
    public sealed record Query(Guid SubjectId) : IQuery<IReadOnlyList<ChapterDto>>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : IQueryHandler<Query, IReadOnlyList<ChapterDto>>
    {
        public async Task<IReadOnlyList<ChapterDto>> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.CurrentInstitutionId;
            var subjectVisible = await db.Subjects.AnyAsync(
                s => s.Id == query.SubjectId && (s.InstitutionId == null || s.InstitutionId == institutionId), ct);
            if (!subjectVisible)
            {
                throw AppException.NotFound(Messages.SubjectNotFound);
            }

            var rows = await db.Chapters.AsNoTracking()
                .Where(c => c.SubjectId == query.SubjectId && (c.InstitutionId == null || c.InstitutionId == institutionId))
                .OrderBy(c => c.Number).ThenBy(c => c.NameBn)
                .Select(c => new
                {
                    c.Id,
                    c.SubjectId,
                    c.Number,
                    c.NameBn,
                    IsCustom = c.InstitutionId != null,
                    Topics = c.Topics
                        .Where(t => t.InstitutionId == null || t.InstitutionId == institutionId)
                        .OrderBy(t => t.Sort).ThenBy(t => t.NameBn)
                        .Select(t => new TopicDto(t.Id, t.NameBn, t.InstitutionId != null))
                        .ToList(),
                })
                .ToListAsync(ct);

            return rows.Select(c => new ChapterDto(
                c.Id, c.SubjectId, c.Number, c.NameBn, PaperLoader.ChapterLabel(c.Number, c.NameBn), c.IsCustom, c.Topics)).ToList();
        }
    }
}

public static class ListBoards
{
    public sealed record Query : IQuery<IReadOnlyList<BoardDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<BoardDto>>
    {
        public async Task<IReadOnlyList<BoardDto>> Handle(Query query, CancellationToken ct) =>
            await db.Boards.AsNoTracking().OrderBy(b => b.Sort)
                .Select(b => new BoardDto(b.Id, b.Code, b.NameBn, b.ShortBn))
                .ToListAsync(ct);
    }
}

public static class GetFreshness
{
    public sealed record Query : IQuery<FreshnessDto>;

    /// <summary>"Updated N hours ago" on the generator card: the newest published platform question.</summary>
    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, FreshnessDto>
    {
        public async Task<FreshnessDto> Handle(Query query, CancellationToken ct)
        {
            var last = await db.Questions.AsNoTracking()
                .Where(q => q.BankId == null && q.Status == ContentStatus.Published)
                .MaxAsync(q => (DateTimeOffset?)q.UpdatedAt, ct);
            return new FreshnessDto(last, Endpoints.Version);
        }
    }
}
