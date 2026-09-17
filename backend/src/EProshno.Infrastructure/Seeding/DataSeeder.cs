using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Text;
using EProshno.Core.Taxonomy;
using EProshno.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EProshno.Infrastructure.Seeding;

/// <summary>
/// Idempotent seed of reference data: platform roles, levels, official subjects/chapters/topics, boards and plans.
/// Existing rows are updated by natural key (slug, code, chapter number); plans are only inserted, because
/// admins edit them afterwards.
/// </summary>
public sealed class DataSeeder(
    AppDbContext db,
    RoleManager<IdentityRole<Guid>> roles,
    TimeProvider clock,
    ILogger<DataSeeder> logger)
{
    public async Task SeedAsync(CancellationToken ct)
    {
        foreach (var role in Roles.Platform)
        {
            if (!await roles.RoleExistsAsync(role))
            {
                await roles.CreateAsync(new IdentityRole<Guid>(role) { Id = IdGen.New() });
            }
        }

        await SeedBoardsAsync(ct);
        await SeedSyllabusAsync(ct);
        await SeedPlansAsync(ct);
        logger.LogInformation("Reference data seeded");
    }

    private async Task SeedBoardsAsync(CancellationToken ct)
    {
        var existing = await db.Boards.ToDictionaryAsync(b => b.Code, ct);
        var sort = 0;
        foreach (var seed in SeedData.Boards)
        {
            sort++;
            if (!existing.TryGetValue(seed.Code, out var board))
            {
                board = new Board { Id = IdGen.New(), Code = seed.Code };
                db.Boards.Add(board);
            }

            board.NameBn = Fold(seed.NameBn);
            board.NameEn = seed.NameEn;
            board.ShortBn = Fold(seed.ShortBn);
            board.Sort = sort;
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedSyllabusAsync(CancellationToken ct)
    {
        var levels = await db.Levels.ToDictionaryAsync(l => l.Slug, ct);
        var subjects = await db.Subjects.Where(s => s.InstitutionId == null && s.Code != null).ToDictionaryAsync(s => s.Code!, ct);
        var chapters = await db.Chapters.Where(c => c.InstitutionId == null).ToListAsync(ct);
        var topics = await db.Topics.Where(t => t.InstitutionId == null).ToListAsync(ct);

        foreach (var seedLevel in SeedData.Levels)
        {
            if (!levels.TryGetValue(seedLevel.Slug, out var level))
            {
                level = new Level { Id = IdGen.New(), Slug = seedLevel.Slug };
                db.Levels.Add(level);
            }

            level.NameBn = Fold(seedLevel.NameBn);
            level.Sort = seedLevel.Sort;

            var subjectSort = 0;
            foreach (var seedSubject in seedLevel.Subjects)
            {
                subjectSort++;
                if (!subjects.TryGetValue(seedSubject.Code, out var subject))
                {
                    subject = new Subject { Id = IdGen.New(), Code = seedSubject.Code };
                    db.Subjects.Add(subject);
                }

                subject.LevelId = level.Id;
                subject.NameBn = Fold(seedSubject.NameBn);
                subject.Paper = seedSubject.Paper;
                subject.Sort = subjectSort;

                foreach (var seedChapter in seedSubject.Chapters)
                {
                    var chapter = chapters.FirstOrDefault(c => c.SubjectId == subject.Id && c.Number == seedChapter.Number);
                    if (chapter is null)
                    {
                        chapter = new Chapter { Id = IdGen.New(), SubjectId = subject.Id, Number = seedChapter.Number };
                        db.Chapters.Add(chapter);
                        chapters.Add(chapter);
                    }

                    chapter.NameBn = Fold(seedChapter.NameBn);

                    var topicSort = 0;
                    foreach (var topicName in seedChapter.Topics)
                    {
                        topicSort++;
                        var name = Fold(topicName);
                        var normalized = BanglaText.Normalize(name);
                        var topic = topics.FirstOrDefault(t => t.ChapterId == chapter.Id && BanglaText.Normalize(t.NameBn) == normalized);
                        if (topic is null)
                        {
                            topic = new Topic { Id = IdGen.New(), ChapterId = chapter.Id, NameBn = name };
                            db.Topics.Add(topic);
                            topics.Add(topic);
                        }

                        topic.Sort = topicSort;
                    }
                }
            }
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task SeedPlansAsync(CancellationToken ct)
    {
        var codes = await db.Plans.Select(p => p.Code).ToListAsync(ct);
        var now = clock.GetUtcNow();
        foreach (var plan in SeedData.Plans().Where(p => !codes.Contains(p.Code)))
        {
            plan.Id = IdGen.New();
            plan.NameBn = Fold(plan.NameBn);
            plan.CreatedAt = now;
            plan.UpdatedAt = now;
            db.Plans.Add(plan);
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>Canonical code points for seeded names (NFC + nukta fold), however the source was typed.</summary>
    private static string Fold(string value) => BanglaText.FoldForParsing(value);
}

public sealed class SeedOptions
{
    public const string Section = "Seed";

    /// <summary>Seed reference data when the API starts (only if the database is fully migrated).</summary>
    public bool OnStartup { get; set; }

    /// <summary>Also create demo users, an institution and sample questions (Development only).</summary>
    public bool DevData { get; set; }
}
