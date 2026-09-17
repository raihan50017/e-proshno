using System.Globalization;
using System.Text.Json.Serialization;
using EProshno.Api.Common;
using EProshno.Api.Features.QuestionBanks;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Jobs;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Imports;

public sealed record ImportTotals(int Total, int Ok, int Warning, int Error, int Duplicate, int Excluded, int Imported);

public sealed record ImportColumnDto(string Key, string Header, bool Required);

public sealed record ImportJobDto(
    Guid Id,
    bool IsPlatform,
    Guid? BankId,
    string? BankName,
    ImportSourceType SourceType,
    string? FileName,
    ImportDefaults Defaults,
    ImportStatus Status,
    ImportTotals Totals,
    IReadOnlyList<string> DetectedHeaders,
    IReadOnlyList<string> MissingColumns,
    IReadOnlyDictionary<string, string> ColumnMap,
    IReadOnlyList<ImportColumnDto> Columns,
    string? Error,
    string? CreatedByName,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? CompletedAt,
    DateTimeOffset? RollbackUntil,
    bool CanRollback);

/// <summary>A preview row: the parsed draft, its messages and the editor content it would become.</summary>
public sealed record ImportRowDto(
    Guid Id,
    int RowNo,
    ImportRowStatus Status,
    ImportRowStatus ValidatedStatus,
    QuestionDraft Draft,
    IReadOnlyList<ImportMessage> Messages,
    Guid? DuplicateOfQuestionId,
    Guid? CreatedQuestionId,
    QuestionContent Content);

/// <summary>Import commands and queries are shared by teachers and the content team (platform bank).</summary>
public interface IImportScoped
{
    bool Platform { get; }
}

/// <summary>Projects import jobs; the caller has already applied access rules.</summary>
public sealed class ImportReader(AppDbContext db, ITenantContext tenant, TimeProvider clock)
{
    public async Task<ImportJobDto> GetAsync(Guid id, CancellationToken ct) =>
        (await ListAsync(db.ImportJobs.Where(j => j.Id == id), ct)).FirstOrDefault() ?? throw AppException.NotFound();

    /// <summary>Runs an already ordered and limited query.</summary>
    public async Task<List<ImportJobDto>> ListAsync(IQueryable<ImportJob> jobs, CancellationToken ct)
    {
        var rows = await jobs.AsNoTracking()
            .Select(j => new { Job = j, BankName = j.Bank != null ? j.Bank.Name : null })
            .ToListAsync(ct);
        var userIds = rows.Select(r => r.Job.CreatedById).Distinct().ToList();
        var names = await db.Set<AppUser>().AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        return rows.Select(r => ToDto(r.Job, r.BankName, names.GetValueOrDefault(r.Job.CreatedById))).ToList();
    }

    private ImportJobDto ToDto(ImportJob j, string? bankName, string? createdByName)
    {
        var now = clock.GetUtcNow();
        var mayRollback = j.CreatedById == tenant.CurrentUserId || (j.IsPlatform ? tenant.IsContentTeam : tenant.IsInstitutionAdmin);
        return new ImportJobDto(
            j.Id,
            j.IsPlatform,
            j.BankId,
            bankName,
            j.SourceType,
            j.FileName,
            j.Defaults,
            j.Status,
            new ImportTotals(j.TotalRows, j.OkRows, j.WarningRows, j.ErrorRows, j.DuplicateRows, j.ExcludedRows, j.ImportedRows),
            j.DetectedHeaders,
            j.MissingColumns,
            j.ColumnMap,
            ImportColumns.For(j.Defaults.Type).Select(c => new ImportColumnDto(c.Key, c.Header, c.Required)).ToList(),
            j.Error,
            createdByName,
            j.CreatedAt,
            j.UpdatedAt,
            j.CompletedAt,
            j.RollbackUntil,
            mayRollback && j.Status == ImportStatus.Completed && j.RollbackUntil > now);
    }

    public static ImportRowDto ToRowDto(ImportRow r, ImportDefaults defaults) => new(
        r.Id,
        r.RowNo,
        r.Status,
        r.ValidatedStatus,
        r.Draft,
        r.Messages,
        r.DuplicateOfQuestionId,
        r.CreatedQuestionId,
        DraftMapper.ToContent(r.Draft, defaults));

    internal static ValidationException Invalid(string field, string message) => new([new ValidationFailure(field, message)]);
}

public static class UploadImportFile
{
    public sealed record Command(Stream Content, string? FileName) : ICommand<Response>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    /// <param name="FileKey">Pass to <c>createImport</c>.</param>
    public sealed record Response(string FileKey, string FileName, long Size, ImportSourceType SourceType);

    /// <summary>Stores an import file after checking its real type (never the name) and size.</summary>
    internal sealed class Handler(ImportAccess access, ITenantContext tenant, IObjectStorage storage) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            access.Enter(command.Platform);
            var (type, bytes) = await FileSignature.ReadAndSniffAsync(command.Content, ImportLimits.MaxFileBytes, ct);
            var (source, extension) = type switch
            {
                SniffedType.Xlsx => (ImportSourceType.Excel, ".xlsx"),
                SniffedType.Text => (ImportSourceType.Csv, ".csv"),
                SniffedType.MacroEnabledOffice or SniffedType.LegacyOffice =>
                    throw new AppException("import.legacy_office", Messages.LegacyOfficeFile, 415),
                SniffedType.Docx => throw new AppException("import.word_unsupported", Messages.WordNotSupportedYet, 415),
                SniffedType.Pdf => throw new AppException("import.pdf_unsupported", Messages.PdfNotSupportedYet, 415),
                _ when bytes.AsSpan().StartsWith("PK\x03\x04"u8) => (ImportSourceType.Json, ".zip"),
                _ => throw new AppException("file.type", Messages.ImportUnsupportedSource, 415),
            };

            var key = StorageKeys.Import(tenant.InstitutionId, extension);
            using (var stream = new MemoryStream(bytes, writable: false))
            {
                await storage.PutAsync(key, stream, StorageKeys.ContentTypeFor(key), ct);
            }

            var name = Path.GetFileName(command.FileName ?? "");
            if (string.IsNullOrWhiteSpace(name))
            {
                name = "import" + extension;
            }

            return new Response(key, name.Length > 200 ? name[..200] : name, bytes.Length, source);
        }
    }
}

public static class CreateImport
{
    public const int MaxPerDay = 20;

    public sealed record Command(
        Guid? BankId,
        ImportSourceType SourceType,
        ImportDefaults Defaults,
        string? FileKey,
        string? FileName,
        string? Text) : ICommand<ImportJobDto>, IImportScoped
    {
        [JsonIgnore]
        public bool Platform { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.SourceType).IsInEnum().WithMessage(Messages.InvalidValue)
                .NotEqual(ImportSourceType.Word).WithMessage(Messages.WordNotSupportedYet)
                .NotEqual(ImportSourceType.Pdf).WithMessage(Messages.PdfNotSupportedYet);
            RuleFor(x => x.Defaults).NotNull().WithMessage(Messages.Required);
            When(x => x.Defaults is not null, () =>
            {
                RuleFor(x => x.Defaults.LevelId).NotEmpty().WithMessage(Messages.Required);
                RuleFor(x => x.Defaults.SubjectId).NotEmpty().WithMessage(Messages.Required);
                RuleFor(x => x.Defaults.Type).IsInEnum().WithMessage(Messages.InvalidValue)
                    .NotEqual(QuestionType.Short).WithMessage(Messages.InvalidValue);
                RuleFor(x => x.Defaults.Difficulty).InclusiveBetween((byte)1, (byte)3).WithMessage(Messages.DifficultyRange);
            });
            RuleFor(x => x.Text).NotEmpty().WithMessage(Messages.ImportTextRequired)
                .MaximumLength(ImportLimits.MaxPasteChars).WithMessage(Messages.TooLong)
                .When(x => x.SourceType == ImportSourceType.Paste);
            RuleFor(x => x.FileKey).NotEmpty().WithMessage(Messages.ImportFileRequired)
                .When(x => x.SourceType != ImportSourceType.Paste);
            RuleFor(x => x.FileName).MaximumLength(255).WithMessage(Messages.TooLong);
            RuleFor(x => x.BankId).NotEmpty().WithMessage(Messages.BanksRequired).When(x => !x.Platform);
            RuleFor(x => x.BankId).Null().WithMessage(Messages.InvalidValue).When(x => x.Platform);
        }
    }

    internal sealed class Handler(
        AppDbContext db,
        ImportAccess access,
        ITenantContext tenant,
        BankAccess banks,
        IEntitlements entitlements,
        IObjectStorage storage,
        IJobScheduler jobs,
        ImportReader reader,
        TimeProvider clock) : ICommandHandler<Command, ImportJobDto>
    {
        public async Task<ImportJobDto> Handle(Command command, CancellationToken ct)
        {
            access.Enter(command.Platform);
            var institutionId = tenant.InstitutionId;
            var now = clock.GetUtcNow();

            Guid? bankId = null;
            if (!command.Platform)
            {
                bankId = (await banks.GetWritableAsync(command.BankId!.Value, ct)).Id;
                await entitlements.AssertWithinLimitAsync(institutionId, LimitKey.ImportsPerMonth, ct);

                var since = now.AddDays(-1);
                if (await db.ImportJobs.CountAsync(j => j.CreatedAt >= since, ct) >= MaxPerDay)
                {
                    throw new AppException("import.daily_limit", Messages.ImportDailyLimit, 429);
                }
            }

            var defaults = command.Defaults;
            Guid? owner = command.Platform ? null : institutionId;
            var levelId = await db.Subjects.AsNoTracking()
                .Where(s => s.Id == defaults.SubjectId && (s.InstitutionId == null || s.InstitutionId == owner))
                .Select(s => (Guid?)s.LevelId)
                .FirstOrDefaultAsync(ct)
                ?? throw ImportReader.Invalid("defaults.subjectId", Messages.SubjectNotFound);
            if (levelId != defaults.LevelId)
            {
                throw ImportReader.Invalid("defaults.levelId", Messages.InvalidValue);
            }

            if (defaults.ChapterId is { } chapterId)
            {
                var chapterOk = await db.Chapters.AnyAsync(
                    c => c.Id == chapterId && c.SubjectId == defaults.SubjectId && (c.InstitutionId == null || c.InstitutionId == owner), ct);
                if (!chapterOk)
                {
                    throw ImportReader.Invalid("defaults.chapterId", Messages.ChapterNotInSubject);
                }
            }

            var paste = command.SourceType == ImportSourceType.Paste;
            if (!paste)
            {
                var key = command.FileKey!;
                var expectedExtension = command.SourceType switch
                {
                    ImportSourceType.Excel => ".xlsx",
                    ImportSourceType.Csv => ".csv",
                    _ => ".zip",
                };
                var valid = StorageKeys.IsSafe(key)
                            && key.StartsWith($"imports/{institutionId:N}/", StringComparison.Ordinal)
                            && key.EndsWith(expectedExtension, StringComparison.Ordinal)
                            && await storage.ExistsAsync(key, ct);
                if (!valid)
                {
                    throw ImportReader.Invalid("fileKey", Messages.ImportFileExpired);
                }
            }

            var job = new ImportJob
            {
                Id = IdGen.New(),
                InstitutionId = institutionId,
                BankId = bankId,
                CreatedById = tenant.UserId,
                SourceType = command.SourceType,
                FileKey = paste ? null : command.FileKey,
                FileName = paste ? null : Path.GetFileName(command.FileName),
                PastedText = paste ? command.Text : null,
                Defaults = defaults,
                Status = ImportStatus.Uploaded,
                CreatedAt = now,
                UpdatedAt = now,
            };
            db.ImportJobs.Add(job);
            await db.SaveChangesAsync(ct);

            var jobId = job.Id;
            await jobs.EnqueueAsync<ImportProcessor>(JobQueues.Import, p => p.ParseAsync(institutionId, jobId, CancellationToken.None));
            return await reader.GetAsync(jobId, ct);
        }
    }
}

public static class GetImport
{
    public sealed record Query(Guid Id) : IQuery<ImportJobDto>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    internal sealed class Handler(ImportAccess access, ImportReader reader) : IQueryHandler<Query, ImportJobDto>
    {
        public async Task<ImportJobDto> Handle(Query query, CancellationToken ct)
        {
            access.Enter(query.Platform);
            var job = await access.GetJobAsync(query.Id, ct);
            return await reader.GetAsync(job.Id, ct);
        }
    }
}

public static class ListImports
{
    public sealed record Query(Guid? BankId, string? Cursor, int? Limit) : IQuery<CursorPage<ImportJobDto>>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    /// <summary>Import history, newest first: own imports, or all of them for admins.</summary>
    internal sealed class Handler(ImportAccess access, ImportReader reader) : IQueryHandler<Query, CursorPage<ImportJobDto>>
    {
        public async Task<CursorPage<ImportJobDto>> Handle(Query query, CancellationToken ct)
        {
            access.Enter(query.Platform);
            var jobs = access.Jobs();
            if (query.BankId is { } bankId)
            {
                jobs = jobs.Where(j => j.BankId == bankId);
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                jobs = jobs.Where(j => j.Id.CompareTo(cursor) < 0);
            }

            var take = Paging.Limit(query.Limit);
            var items = await reader.ListAsync(jobs.OrderByDescending(j => j.Id).Take(take + 1), ct);
            items = items.OrderByDescending(i => i.Id).ToList();
            return items.Count > take
                ? new CursorPage<ImportJobDto>(items.Take(take).ToList(), Paging.Cursor(items[take - 1].Id))
                : new CursorPage<ImportJobDto>(items, null);
        }
    }
}

public static class SetImportColumnMap
{
    public sealed record Request(Dictionary<string, string> ColumnMap);

    public sealed record Command(Guid Id, Request Body) : ICommand<ImportJobDto>, IImportScoped
    {
        [JsonIgnore]
        public bool Platform { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() =>
            RuleFor(x => x.Body.ColumnMap).NotNull().WithMessage(Messages.Required)
                .Must(m => m.Count <= 60).WithMessage(Messages.InvalidValue);
    }

    /// <summary>Saves the teacher's column mapping for a spreadsheet and parses it again.</summary>
    internal sealed class Handler(
        AppDbContext db,
        ImportAccess access,
        IJobScheduler jobs,
        ImportReader reader,
        TimeProvider clock) : ICommandHandler<Command, ImportJobDto>
    {
        public async Task<ImportJobDto> Handle(Command command, CancellationToken ct)
        {
            access.Enter(command.Platform);
            var job = await access.GetJobAsync(command.Id, ct);
            ImportAccess.EnsureStatus(job, ImportStatus.NeedsMapping, ImportStatus.Preview);
            if (job.SourceType is not (ImportSourceType.Excel or ImportSourceType.Csv))
            {
                throw AppException.Conflict("import.status", Messages.ImportNotReady);
            }

            var keys = ImportColumns.For(job.Defaults.Type).Select(c => c.Key).ToHashSet(StringComparer.Ordinal);
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var (key, header) in command.Body.ColumnMap)
            {
                if (string.IsNullOrWhiteSpace(header))
                {
                    continue;
                }

                if (!keys.Contains(key) || (job.DetectedHeaders.Count > 0 && !job.DetectedHeaders.Contains(header)))
                {
                    throw ImportReader.Invalid($"columnMap.{key}", Messages.InvalidValue);
                }

                map[key] = header;
            }

            job.ColumnMap = map;
            job.Status = ImportStatus.Uploaded;
            job.Error = null;
            job.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);

            var (institutionId, jobId) = (job.InstitutionId, job.Id);
            await jobs.EnqueueAsync<ImportProcessor>(JobQueues.Import, p => p.ParseAsync(institutionId, jobId, CancellationToken.None));
            return await reader.GetAsync(jobId, ct);
        }
    }
}

public static class ListImportRows
{
    public sealed record Query(Guid Id, ImportRowStatus? Status, string? Cursor, int? Limit) : IQuery<CursorPage<ImportRowDto>>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    /// <summary>Preview rows in file order. Cursor: the last row number.</summary>
    internal sealed class Handler(AppDbContext db, ImportAccess access) : IQueryHandler<Query, CursorPage<ImportRowDto>>
    {
        public async Task<CursorPage<ImportRowDto>> Handle(Query query, CancellationToken ct)
        {
            access.Enter(query.Platform);
            var job = await access.GetJobAsync(query.Id, ct);
            var rows = db.ImportRows.AsNoTracking().Where(r => r.ImportJobId == job.Id);
            if (query.Status is { } status)
            {
                rows = rows.Where(r => r.Status == status);
            }

            if (int.TryParse(query.Cursor, NumberStyles.None, CultureInfo.InvariantCulture, out var after))
            {
                rows = rows.Where(r => r.RowNo > after);
            }

            var page = await rows.OrderBy(r => r.RowNo)
                .ToPageAsync(r => r.RowNo.ToString(CultureInfo.InvariantCulture), query.Limit, ct);
            return new CursorPage<ImportRowDto>(
                page.Items.Select(r => ImportReader.ToRowDto(r, job.Defaults)).ToList(),
                page.NextCursor);
        }
    }
}

public static class UpdateImportRow
{
    public sealed record Request(QuestionDraft? Draft, bool? Excluded);

    public sealed record Command(Guid Id, Guid RowId, Request Body) : ICommand<Response>, IImportScoped
    {
        [JsonIgnore]
        public bool Platform { get; init; }
    }

    /// <param name="AffectedRowIds">Excluding or including one question of a common-information group changes the whole group.</param>
    public sealed record Response(ImportRowDto Row, ImportTotals Totals, IReadOnlyList<Guid> AffectedRowIds);

    private const int MaxText = 20_000;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body).NotNull().WithMessage(Messages.Required);
            When(x => x.Body?.Draft is not null, () =>
            {
                RuleFor(x => x.Body.Draft!.Type).IsInEnum().WithMessage(Messages.InvalidValue);
                RuleFor(x => x.Body.Draft!.Stem).MaximumLength(MaxText).WithMessage(Messages.TooLong);
                RuleFor(x => x.Body.Draft!.StemTail).MaximumLength(MaxText).WithMessage(Messages.TooLong);
                RuleFor(x => x.Body.Draft!.Stimulus).MaximumLength(MaxText).WithMessage(Messages.TooLong);
                RuleFor(x => x.Body.Draft!.Explanation).MaximumLength(MaxText).WithMessage(Messages.TooLong);
                RuleFor(x => x.Body.Draft!.Options).Must(o => o.Count <= 8 && o.All(v => v.Length <= MaxText))
                    .WithMessage(Messages.InvalidValue);
                RuleFor(x => x.Body.Draft!.Statements).Must(s => s.Count <= 10 && s.All(v => v.Length <= MaxText))
                    .WithMessage(Messages.InvalidValue);
                RuleFor(x => x.Body.Draft!.CqParts).Must(p => p.Count <= 8 && p.All(v => v.Prompt.Length <= MaxText && (v.Answer?.Length ?? 0) <= MaxText))
                    .WithMessage(Messages.InvalidValue);
                RuleFor(x => x.Body.Draft!.BoardTags).Must(t => t.Count <= 20).WithMessage(Messages.InvalidValue);
                RuleFor(x => x.Body.Draft!.CorrectRaw).MaximumLength(MaxText).WithMessage(Messages.TooLong);
                RuleFor(x => x.Body.Draft!.ChapterRef).MaximumLength(300).WithMessage(Messages.TooLong);
                RuleFor(x => x.Body.Draft!.TopicRef).MaximumLength(300).WithMessage(Messages.TooLong);
            });
        }
    }

    /// <summary>Fixes a preview row (re-validated at once, exactly like the parse job) or excludes/includes it.</summary>
    internal sealed class Handler(AppDbContext db, ImportAccess access, DraftResolver resolver) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            access.Enter(command.Platform);
            var job = await access.GetJobAsync(command.Id, ct);
            ImportAccess.EnsureStatus(job, ImportStatus.Preview);

            var row = await db.ImportRows.Where(r => r.ImportJobId == job.Id && r.Id == command.RowId).FirstOr404Async(ct);
            if (row.Status == ImportRowStatus.Imported)
            {
                throw AppException.Conflict("import.row_imported", Messages.ImportNotReady);
            }

            if (command.Body.Draft is { } edited)
            {
                // Group membership and the source position come from the file, not from the editor.
                var draft = edited with { GroupKey = row.Draft.GroupKey, SourceLocation = row.Draft.SourceLocation };
                var checkedDraft = DraftValidator.Check(draft);
                checkedDraft.Messages.AddRange(row.Messages.Where(m => m.Code == "group.size"));

                var context = await resolver.LoadAsync(job.Defaults.SubjectId, job.IsPlatform ? null : job.InstitutionId, ct);
                var resolved = (await resolver.ResolveAsync([checkedDraft], job.Defaults, context, job.IsPlatform, ct)).Single();
                row.Draft = resolved.Draft;
                row.Messages = resolved.Messages;
                row.ValidatedStatus = resolved.Status;
                row.DuplicateOfQuestionId = resolved.DuplicateOfQuestionId;
                if (row.Status != ImportRowStatus.Excluded)
                {
                    row.Status = resolved.Status;
                }
            }

            var affected = new List<ImportRow> { row };
            if (command.Body.Excluded is { } excluded)
            {
                if (row.Draft.GroupKey is { } groupKey)
                {
                    var groupKeyValue = groupKey;
                    var siblings = await db.ImportRows
                        .FromSql($"SELECT * FROM import_rows WHERE import_job_id = {job.Id} AND draft ->> 'groupKey' = {groupKeyValue}")
                        .Where(r => r.Id != row.Id && r.Status != ImportRowStatus.Imported)
                        .ToListAsync(ct);
                    affected.AddRange(siblings);
                }

                foreach (var target in affected)
                {
                    target.Status = excluded
                        ? ImportRowStatus.Excluded
                        : target.ValidatedStatus == ImportRowStatus.Duplicate ? ImportRowStatus.Warning : target.ValidatedStatus;
                }
            }

            await db.SaveChangesAsync(ct);

            var statuses = await db.ImportRows.Where(r => r.ImportJobId == job.Id).Select(r => r.Status).ToListAsync(ct);
            job.RecountFrom(statuses);
            await db.SaveChangesAsync(ct);

            return new Response(
                ImportReader.ToRowDto(row, job.Defaults),
                new ImportTotals(job.TotalRows, job.OkRows, job.WarningRows, job.ErrorRows, job.DuplicateRows, job.ExcludedRows, job.ImportedRows),
                affected.Select(r => r.Id).ToList());
        }
    }
}

public static class CommitImport
{
    public sealed record Command(Guid Id) : ICommand<ImportJobDto>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    /// <summary>Starts the commit job for ready and warning rows once no unexcluded errors remain.</summary>
    internal sealed class Handler(
        AppDbContext db,
        ImportAccess access,
        BankAccess banks,
        IEntitlements entitlements,
        IJobScheduler jobs,
        ImportReader reader,
        TimeProvider clock) : ICommandHandler<Command, ImportJobDto>
    {
        public async Task<ImportJobDto> Handle(Command command, CancellationToken ct)
        {
            access.Enter(command.Platform);
            var job = await access.GetJobAsync(command.Id, ct);
            ImportAccess.EnsureStatus(job, ImportStatus.Preview);

            var rows = await db.ImportRows.AsNoTracking()
                .Where(r => r.ImportJobId == job.Id)
                .Select(r => new { r.Status, r.Draft })
                .ToListAsync(ct);

            static bool Committable(ImportRowStatus s) => s is ImportRowStatus.Ok or ImportRowStatus.Warning;

            if (rows.Any(r => r.Status == ImportRowStatus.Error))
            {
                throw AppException.Conflict("import.has_errors", Messages.ImportHasErrors);
            }

            var count = rows.Count(r => Committable(r.Status));
            if (count == 0)
            {
                throw AppException.Conflict("import.nothing", Messages.ImportNothingToCommit);
            }

            var brokenGroup = rows
                .Where(r => r.Draft.GroupKey is not null)
                .GroupBy(r => r.Draft.GroupKey)
                .Any(g => g.Any(r => Committable(r.Status)) && g.Any(r => !Committable(r.Status) && r.Status != ImportRowStatus.Imported));
            if (brokenGroup)
            {
                throw AppException.Conflict("import.group_incomplete", Messages.ImportGroupIncomplete);
            }

            if (job.BankId is { } bankId)
            {
                await banks.GetWritableAsync(bankId, ct);
                await entitlements.AssertWithinLimitAsync(job.InstitutionId, LimitKey.CustomQuestions, ct, count);
            }

            job.Status = ImportStatus.Committing;
            job.Error = null;
            job.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);

            var (institutionId, jobId) = (job.InstitutionId, job.Id);
            await jobs.EnqueueAsync<ImportCommitter>(JobQueues.Import, c => c.CommitAsync(institutionId, jobId, CancellationToken.None));
            return await reader.GetAsync(jobId, ct);
        }
    }
}

public static class RollbackImport
{
    public sealed record Command(Guid Id) : ICommand<ImportJobDto>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    internal sealed class Handler(
        ImportAccess access,
        ITenantContext tenant,
        ImportRollback rollback,
        ImportReader reader,
        TimeProvider clock) : ICommandHandler<Command, ImportJobDto>
    {
        public async Task<ImportJobDto> Handle(Command command, CancellationToken ct)
        {
            access.Enter(command.Platform);
            var job = await access.GetJobAsync(command.Id, ct);
            ImportRollback.EnsureAllowed(job, tenant, clock.GetUtcNow());
            await rollback.RollbackAsync(job, ct);
            return await reader.GetAsync(job.Id, ct);
        }
    }
}

public static class GetImportErrorReport
{
    public sealed record Query(Guid Id) : IQuery<FileDownload>, IImportScoped
    {
        public bool Platform { get; init; }
    }

    internal sealed class Handler(AppDbContext db, ImportAccess access) : IQueryHandler<Query, FileDownload>
    {
        public async Task<FileDownload> Handle(Query query, CancellationToken ct)
        {
            access.Enter(query.Platform);
            var job = await access.GetJobAsync(query.Id, ct);
            var rows = await db.ImportRows.AsNoTracking()
                .Where(r => r.ImportJobId == job.Id && r.Status != ImportRowStatus.Ok)
                .OrderBy(r => r.RowNo)
                .ToListAsync(ct);

            var report = rows
                .Where(r => r.Messages.Count > 0)
                .Select(r => (
                    r.RowNo,
                    r.Draft.SourceLocation,
                    StatusLabel(r.Status),
                    string.Join("\n", r.Messages.Select(m => m.MessageBn).Distinct()),
                    Excerpt(r.Draft)));
            return new FileDownload(
                ImportWorkbooks.BuildErrorReport(report),
                StorageKeys.ContentTypeFor(".xlsx"),
                $"import-errors-{job.Id:N}.xlsx");
        }

        private static string StatusLabel(ImportRowStatus status) => status switch
        {
            ImportRowStatus.Ok => Messages.ImportRowOk,
            ImportRowStatus.Warning => Messages.ImportRowWarning,
            ImportRowStatus.Error => Messages.ImportRowError,
            ImportRowStatus.Duplicate => Messages.ImportRowDuplicate,
            ImportRowStatus.Excluded => Messages.ImportRowExcluded,
            _ => Messages.ImportRowImported,
        };

        private static string Excerpt(QuestionDraft d)
        {
            var text = string.IsNullOrWhiteSpace(d.Stem) ? d.Stimulus ?? "" : d.Stem;
            text = text.Replace('\n', ' ').Trim();
            return text.Length > 120 ? text[..120] + "…" : text;
        }
    }
}

public static class GetImportTemplate
{
    public sealed record Query(QuestionType Type, Guid SubjectId) : IQuery<FileDownload>;

    public sealed class Validator : AbstractValidator<Query>
    {
        public Validator()
        {
            RuleFor(x => x.Type).Must(t => t is QuestionType.Mcq or QuestionType.Cq).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.SubjectId).NotEmpty().WithMessage(Messages.Required);
        }
    }

    /// <summary>The Excel template with chapter/topic dropdowns for the subject (official + the institution's own).</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : IQueryHandler<Query, FileDownload>
    {
        public async Task<FileDownload> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.CurrentInstitutionId;
            var subject = await db.Subjects.AsNoTracking()
                .Where(s => s.Id == query.SubjectId && (s.InstitutionId == null || s.InstitutionId == institutionId))
                .Select(s => new { s.NameBn, s.Paper })
                .FirstOrDefaultAsync(ct)
                ?? throw AppException.NotFound(Messages.SubjectNotFound);

            var chapters = await db.Chapters.AsNoTracking()
                .Where(c => c.SubjectId == query.SubjectId && (c.InstitutionId == null || c.InstitutionId == institutionId))
                .OrderBy(c => c.Number)
                .Select(c => new
                {
                    c.Number,
                    c.NameBn,
                    Topics = c.Topics
                        .Where(t => t.InstitutionId == null || t.InstitutionId == institutionId)
                        .OrderBy(t => t.Sort)
                        .Select(t => t.NameBn)
                        .ToList(),
                })
                .ToListAsync(ct);

            var bytes = ImportWorkbooks.BuildTemplate(
                query.Type,
                PaperLoader.SubjectLabel(subject.NameBn, subject.Paper),
                chapters.Select(c => new TemplateChapter(c.Number, c.NameBn, c.Topics)).ToList());
            var kind = query.Type == QuestionType.Cq ? "cq" : "mcq";
            return new FileDownload(bytes, StorageKeys.ContentTypeFor(".xlsx"), $"eproshno-{kind}-template.xlsx");
        }
    }
}
