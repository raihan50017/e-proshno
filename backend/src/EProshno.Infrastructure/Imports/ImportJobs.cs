using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using EProshno.Infrastructure.Storage;
using EProshno.Infrastructure.Tenancy;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EProshno.Infrastructure.Imports;

public static class BankCounter
{
    /// <summary>Recomputes the cached question count of a custom bank (archived questions excluded).</summary>
    public static async Task RecountAsync(AppDbContext db, Guid bankId, CancellationToken ct)
    {
        var count = await db.Questions.CountAsync(q => q.BankId == bankId && q.Status != ContentStatus.Archived, ct);
        await db.QuestionBanks
            .Where(b => b.Id == bankId)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.QuestionCount, count), ct);
    }
}

internal sealed record ParseOutcome(List<CheckedDraft> Drafts, List<string> DetectedHeaders, List<string> MissingColumns);

/// <summary>
/// Hangfire job (import queue): reads the uploaded file or pasted text, builds one <see cref="ImportRow"/> per
/// question and moves the job to Preview (or NeedsMapping). Jobs receive the institution id so every query runs
/// under the normal tenant filter.
/// </summary>
public sealed class ImportProcessor(
    AppDbContext db,
    TenantContext tenant,
    IObjectStorage storage,
    DraftResolver resolver,
    TimeProvider clock,
    ILogger<ImportProcessor> logger)
{
    [AutomaticRetry(Attempts = 0)]
    public async Task ParseAsync(Guid institutionId, Guid importJobId, CancellationToken ct)
    {
        tenant.Set(null, institutionId);
        var job = await db.ImportJobs.FirstOrDefaultAsync(j => j.Id == importJobId, ct);
        if (job is null || job.Status is not (ImportStatus.Uploaded or ImportStatus.Parsing))
        {
            return;
        }

        tenant.Set(job.CreatedById, institutionId);
        job.Status = ImportStatus.Parsing;
        job.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);

        try
        {
            var outcome = await ReadAsync(job, ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.ImportRows.Where(r => r.ImportJobId == job.Id).ExecuteDeleteAsync(ct);

            if (outcome.MissingColumns.Count > 0)
            {
                job.Status = ImportStatus.NeedsMapping;
                job.DetectedHeaders = outcome.DetectedHeaders;
                job.MissingColumns = outcome.MissingColumns;
                job.RecountFrom([]);
            }
            else
            {
                if (outcome.Drafts.Count == 0)
                {
                    throw new AppException("import.empty", Messages.ImportNoQuestionsFound);
                }

                if (outcome.Drafts.Count > ImportLimits.MaxQuestions)
                {
                    throw new AppException("import.too_many", Messages.ImportTooManyQuestions);
                }

                var context = await resolver.LoadAsync(job.Defaults.SubjectId, job.IsPlatform ? null : institutionId, ct);
                var resolved = await resolver.ResolveAsync(outcome.Drafts, job.Defaults, context, job.IsPlatform, ct);
                var rows = resolved.Select((r, i) => new ImportRow
                {
                    Id = IdGen.New(),
                    ImportJobId = job.Id,
                    InstitutionId = job.InstitutionId,
                    RowNo = i + 1,
                    Draft = r.Draft,
                    Messages = r.Messages,
                    Status = r.Status,
                    ValidatedStatus = r.Status,
                    DuplicateOfQuestionId = r.DuplicateOfQuestionId,
                }).ToList();

                db.ImportRows.AddRange(rows);
                job.MissingColumns = [];
                job.RecountFrom(rows.Select(r => r.Status));
                job.Status = ImportStatus.Preview;
            }

            job.Error = null;
            job.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (AppException ex)
        {
            await FailAsync(job.Id, ex.Message, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Parsing import {ImportJobId} failed", job.Id);
            await FailAsync(job.Id, Messages.UnexpectedError, ct);
        }
    }

    private async Task<ParseOutcome> ReadAsync(ImportJob job, CancellationToken ct)
    {
        switch (job.SourceType)
        {
            case ImportSourceType.Paste:
                return new ParseOutcome(QuestionTextParser.Parse(job.PastedText ?? ""), [], []);

            case ImportSourceType.Excel:
            {
                var (type, bytes) = await LoadFileAsync(job, ct);
                EnsureType(type, SniffedType.Xlsx);
                var result = TabularQuestionReader.Read(ExcelTableReader.Read(bytes), job.Defaults.Type, job.ColumnMap);
                return new ParseOutcome(result.Drafts, result.DetectedHeaders, result.MissingColumns);
            }

            case ImportSourceType.Csv:
            {
                var (type, bytes) = await LoadFileAsync(job, ct);
                EnsureType(type, SniffedType.Text);
                var result = TabularQuestionReader.Read([CsvTableReader.Read(bytes)], job.Defaults.Type, job.ColumnMap);
                return new ParseOutcome(result.Drafts, result.DetectedHeaders, result.MissingColumns);
            }

            case ImportSourceType.Json:
            {
                var (_, bytes) = await LoadFileAsync(job, ct);
                if (!bytes.AsSpan().StartsWith("PK\x03\x04"u8))
                {
                    throw new AppException("import.invalid_package", Messages.ImportInvalidPackage);
                }

                var package = await BankPackage.ReadAsync(bytes, job.IsPlatform ? null : job.InstitutionId, storage, ct);
                var drafts = package.Questions
                    .Select(d => DraftValidator.Check(d with
                    {
                        // Ids from another account never apply here; match by name/number again.
                        ChapterId = null,
                        TopicId = null,
                        BoardTags = d.BoardTags.SelectMany(t => QuestionTextParser.ParseBoardTags(t.Raw)).ToList(),
                    }))
                    .ToList();
                DraftValidator.CheckGroups(drafts);
                return new ParseOutcome(drafts, [], []);
            }

            case ImportSourceType.Word:
                throw new AppException("import.word_unsupported", Messages.WordNotSupportedYet);

            default:
                throw new AppException("import.pdf_unsupported", Messages.PdfNotSupportedYet);
        }
    }

    private async Task<(SniffedType Type, byte[] Bytes)> LoadFileAsync(ImportJob job, CancellationToken ct)
    {
        var stored = job.FileKey is null ? null : await storage.GetAsync(job.FileKey, ct);
        if (stored is null)
        {
            throw new AppException("import.file_missing", Messages.ImportFileRequired);
        }

        await using (stored.Content)
        {
            return await FileSignature.ReadAndSniffAsync(stored.Content, ImportLimits.MaxFileBytes, ct);
        }
    }

    private static void EnsureType(SniffedType actual, SniffedType expected)
    {
        if (actual is SniffedType.MacroEnabledOffice or SniffedType.LegacyOffice)
        {
            throw new AppException("import.legacy_office", Messages.LegacyOfficeFile);
        }

        if (actual != expected)
        {
            throw new AppException("import.file_type", Messages.InvalidFileType);
        }
    }

    private async Task FailAsync(Guid jobId, string message, CancellationToken ct)
    {
        db.ChangeTracker.Clear();
        var now = clock.GetUtcNow();
        await db.ImportJobs
            .Where(j => j.Id == jobId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(j => j.Status, ImportStatus.Failed)
                .SetProperty(j => j.Error, message)
                .SetProperty(j => j.UpdatedAt, now), ct);
    }
}

/// <summary>
/// Hangfire job (import queue): creates questions from Ok and Warning rows, 200 per transaction. Idempotent: rows
/// that already have a CreatedQuestionId are skipped, so a failed commit can simply be started again.
/// </summary>
public sealed class ImportCommitter(
    AppDbContext db,
    TenantContext tenant,
    QuestionWriter writer,
    TimeProvider clock,
    ILogger<ImportCommitter> logger)
{
    [AutomaticRetry(Attempts = 0)]
    public async Task CommitAsync(Guid institutionId, Guid importJobId, CancellationToken ct)
    {
        tenant.Set(null, institutionId);
        var job = await db.ImportJobs.AsNoTracking().FirstOrDefaultAsync(j => j.Id == importJobId, ct);
        if (job is null || job.Status != ImportStatus.Committing)
        {
            return;
        }

        tenant.Set(job.CreatedById, institutionId);
        try
        {
            var status = await StatusForAsync(job, ct);
            var groups = await ExistingGroupsAsync(job.Id, ct);

            while (true)
            {
                var batch = await db.ImportRows
                    .Where(r => r.ImportJobId == job.Id
                                && (r.Status == ImportRowStatus.Ok || r.Status == ImportRowStatus.Warning)
                                && r.CreatedQuestionId == null)
                    .OrderBy(r => r.RowNo)
                    .Take(ImportLimits.CommitBatchSize)
                    .ToListAsync(ct);
                if (batch.Count == 0)
                {
                    break;
                }

                await using var tx = await db.Database.BeginTransactionAsync(ct);
                foreach (var row in batch)
                {
                    var content = DraftMapper.ToContent(row.Draft, job.Defaults);
                    var groupKey = row.Draft.GroupKey;
                    if (groupKey is not null && groups.TryGetValue(groupKey, out var stimulusId))
                    {
                        content = content with { StimulusId = stimulusId };
                    }

                    var question = writer.Create(content, job.BankId, status, job.CreatedById, job.Id);
                    if (groupKey is not null && question.StimulusId is { } created)
                    {
                        groups.TryAdd(groupKey, created);
                    }

                    row.CreatedQuestionId = question.Id;
                    row.Status = ImportRowStatus.Imported;
                }

                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                db.ChangeTracker.Clear();
            }

            var statuses = await db.ImportRows.Where(r => r.ImportJobId == job.Id).Select(r => r.Status).ToListAsync(ct);
            var tracked = await db.ImportJobs.FirstAsync(j => j.Id == job.Id, ct);
            var now = clock.GetUtcNow();
            tracked.RecountFrom(statuses);
            tracked.Status = ImportStatus.Completed;
            tracked.Error = null;
            tracked.CompletedAt = now;
            tracked.RollbackUntil = now + ImportLimits.RollbackWindow;
            tracked.UpdatedAt = now;
            await db.SaveChangesAsync(ct);

            if (job.BankId is { } bankId)
            {
                await BankCounter.RecountAsync(db, bankId, ct);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Committing import {ImportJobId} failed", job.Id);
            db.ChangeTracker.Clear();
            var now = clock.GetUtcNow();

            // Back to preview: already imported rows are kept and skipped when the teacher retries.
            await db.ImportJobs
                .Where(j => j.Id == job.Id)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(j => j.Status, ImportStatus.Preview)
                    .SetProperty(j => j.Error, Messages.ImportCommitFailed)
                    .SetProperty(j => j.UpdatedAt, now), ct);
        }
    }

    private async Task<ContentStatus> StatusForAsync(ImportJob job, CancellationToken ct)
    {
        if (job.BankId is not { } bankId)
        {
            return ContentStatus.Draft;   // platform bank: content team review workflow
        }

        var requireApproval = await db.QuestionBanks.Where(b => b.Id == bankId).Select(b => b.RequireApproval).FirstAsync(ct);
        if (!requireApproval)
        {
            return ContentStatus.Published;
        }

        var role = await db.Memberships
            .Where(m => m.InstitutionId == job.InstitutionId && m.UserId == job.CreatedById && m.Status == MembershipStatus.Active)
            .Select(m => (InstitutionRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        return role is InstitutionRole.Owner or InstitutionRole.Admin ? ContentStatus.Published : ContentStatus.PendingApproval;
    }

    /// <summary>Stimuli already created for CommonInfo groups by an earlier, interrupted run.</summary>
    private async Task<Dictionary<string, Guid>> ExistingGroupsAsync(Guid jobId, CancellationToken ct)
    {
        var done = await db.ImportRows.AsNoTracking()
            .Where(r => r.ImportJobId == jobId && r.CreatedQuestionId != null)
            .Select(r => new { r.Draft, r.CreatedQuestionId })
            .ToListAsync(ct);
        var ids = done.Where(d => d.Draft.GroupKey is not null).Select(d => d.CreatedQuestionId!.Value).ToList();
        var stimuli = await db.Questions.AsNoTracking()
            .Where(q => ids.Contains(q.Id) && q.StimulusId != null)
            .Select(q => new { q.Id, q.StimulusId })
            .ToDictionaryAsync(q => q.Id, q => q.StimulusId!.Value, ct);

        var groups = new Dictionary<string, Guid>(StringComparer.Ordinal);
        foreach (var d in done.Where(d => d.Draft.GroupKey is not null))
        {
            if (stimuli.TryGetValue(d.CreatedQuestionId!.Value, out var sid))
            {
                groups.TryAdd(d.Draft.GroupKey!, sid);
            }
        }

        return groups;
    }
}

/// <summary>
/// Undoes an import inside its rollback window: questions not used in any set are deleted, used ones archived
/// (they stay printable in existing sets). Idempotent.
/// </summary>
public sealed class ImportRollback(AppDbContext db, TimeProvider clock)
{
    public async Task RollbackAsync(ImportJob job, CancellationToken ct)
    {
        if (job.Status == ImportStatus.RolledBack)
        {
            return;
        }

        var now = clock.GetUtcNow();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var created = db.Questions.Where(q => q.ImportJobId == job.Id);
        var stimulusIds = await created
            .Where(q => q.StimulusId != null)
            .Select(q => q.StimulusId!.Value)
            .Distinct()
            .ToListAsync(ct);

        await created
            .Where(q => db.QuestionSetItems.Any(i => i.QuestionId == q.Id))
            .ExecuteUpdateAsync(s => s
                .SetProperty(q => q.Status, ContentStatus.Archived)
                .SetProperty(q => q.UpdatedAt, now), ct);

        await created
            .Where(q => !db.QuestionSetItems.Any(i => i.QuestionId == q.Id))
            .ExecuteDeleteAsync(ct);

        if (stimulusIds.Count > 0)
        {
            await db.Stimuli
                .Where(s => stimulusIds.Contains(s.Id) && !db.Questions.Any(q => q.StimulusId == s.Id))
                .ExecuteDeleteAsync(ct);
        }

        job.Status = ImportStatus.RolledBack;
        job.RolledBackAt = now;
        job.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        if (job.BankId is { } bankId)
        {
            await BankCounter.RecountAsync(db, bankId, ct);
        }
    }

    /// <summary>The importer or an institution admin, within seven days of completion.</summary>
    public static void EnsureAllowed(ImportJob job, ITenantContext tenant, DateTimeOffset now)
    {
        var isOwner = job.CreatedById == tenant.CurrentUserId;
        var isAdmin = job.IsPlatform ? tenant.IsContentTeam : tenant.IsInstitutionAdmin;
        if (!isOwner && !isAdmin)
        {
            throw AppException.Forbidden(Messages.ImportRollbackNotAllowed);
        }

        if (job.Status != ImportStatus.Completed && job.Status != ImportStatus.RolledBack)
        {
            throw AppException.Conflict("import.not_completed", Messages.ImportNotReady);
        }

        if (job.RollbackUntil is null || job.RollbackUntil < now)
        {
            throw AppException.Conflict("import.rollback_window", Messages.RollbackWindowOver);
        }
    }
}
