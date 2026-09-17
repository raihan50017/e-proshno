using EProshno.Api.Common;
using EProshno.Core.Imports;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using EProshno.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionBanks;

public enum ExportFormat
{
    Xlsx,
    Json,
}

public static class ExportBank
{
    public sealed record Query(Guid BankId, ExportFormat Format) : IQuery<FileDownload>;

    /// <summary>
    /// Exports the bank's own questions (never platform questions) in the import formats, so the file can be
    /// imported again: the Excel template layout or a JSON bank package with images.
    /// </summary>
    internal sealed class Handler(AppDbContext db, BankAccess access, IObjectStorage storage) : IQueryHandler<Query, FileDownload>
    {
        public async Task<FileDownload> Handle(Query query, CancellationToken ct)
        {
            var bank = await access.GetReadableAsync(query.BankId, ct);
            var questions = await QuestionWriter.LoadFullAsync(
                db.Questions.AsNoTracking().Where(q => q.BankId == bank.Id && q.Status != ContentStatus.Archived), ct);

            var chapterIds = questions.Select(q => q.ChapterId).Distinct().ToList();
            var chapters = await db.Chapters.AsNoTracking()
                .Where(c => chapterIds.Contains(c.Id))
                .Select(c => new { c.Id, c.Number, c.NameBn, c.InstitutionId, Topics = c.Topics.Select(t => new { t.Id, t.NameBn, t.InstitutionId }).ToList() })
                .ToDictionaryAsync(c => c.Id, ct);
            var boards = await db.Boards.AsNoTracking().ToDictionaryAsync(b => b.Id, b => b.ShortBn, ct);

            var groupKeys = new Dictionary<Guid, string>();
            var drafts = questions
                .OrderBy(q => chapters.TryGetValue(q.ChapterId, out var c) ? c.Number : int.MaxValue)
                .ThenBy(q => q.StimulusId ?? q.Id)
                .ThenBy(q => q.Id)
                .Select(q =>
                {
                    var chapter = chapters.GetValueOrDefault(q.ChapterId);
                    string? groupKey = null;
                    if (q is { McqKind: McqKind.CommonInfo, StimulusId: { } sid })
                    {
                        if (!groupKeys.TryGetValue(sid, out groupKey))
                        {
                            groupKey = $"g{groupKeys.Count + 1}";
                            groupKeys[sid] = groupKey;
                        }
                    }

                    var tags = q.Appearances
                        .Where(a => a is { Source: ExamSource.Board, BoardId: not null } && boards.ContainsKey(a.BoardId!.Value))
                        .OrderByDescending(a => a.Year)
                        .Select(a => QuestionRules.BoardTag(boards[a.BoardId!.Value], a.Year))
                        .ToList();

                    return DraftMapper.ToDraft(
                        QuestionWriter.ToContent(q),
                        chapter is null ? null : $"{BanglaText.ToBanglaDigits(chapter.Number)}. {chapter.NameBn}",
                        chapter?.Topics.FirstOrDefault(t => t.Id == q.TopicId)?.NameBn,
                        tags,
                        groupKey);
                })
                .ToList();

            var safeName = new string(bank.Name.Select(ch => char.IsLetterOrDigit(ch) ? ch : '-').ToArray()).Trim('-');
            if (query.Format == ExportFormat.Xlsx)
            {
                return new FileDownload(
                    ImportWorkbooks.BuildExport(drafts),
                    StorageKeys.ContentTypeFor(".xlsx"),
                    $"{safeName}.xlsx");
            }

            var subject = bank.SubjectId is null
                ? null
                : await db.Subjects.AsNoTracking().Where(s => s.Id == bank.SubjectId).Select(s => new { s.NameBn, s.Paper, Level = s.Level!.NameBn }).FirstOrDefaultAsync(ct);
            var syllabus = chapters.Values
                .Where(c => c.InstitutionId is not null || c.Topics.Any(t => t.InstitutionId is not null))
                .OrderBy(c => c.Number)
                .Select(c => new BankPackageSyllabusItem(c.Number, c.NameBn, c.Topics.Where(t => t.InstitutionId is not null).Select(t => t.NameBn).ToList()))
                .ToList();
            var document = new BankPackageDocument(
                BankPackageDocument.FormatName,
                BankPackageDocument.CurrentVersion,
                new BankPackageInfo(bank.Name, subject?.Level, subject is null ? null : PaperLoader.SubjectLabel(subject.NameBn, subject.Paper)),
                syllabus,
                drafts);
            return new FileDownload(await BankPackage.WriteAsync(document, storage, ct), "application/zip", $"{safeName}.eproshno.zip");
        }
    }
}
