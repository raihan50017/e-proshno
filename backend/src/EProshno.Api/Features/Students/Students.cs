using System.Globalization;
using EProshno.Api.Common;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Students;
using EProshno.Core.Text;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;
using EProshno.Infrastructure.Students;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Students;

public sealed record BatchDto(Guid Id, string Name, Guid? LevelId, string? LevelName, int? Year, int StudentCount, DateTimeOffset CreatedAt);

public sealed record StudentDto(
    Guid Id,
    Guid BatchId,
    string BatchName,
    string Roll,
    string Name,
    string? Phone,
    string? GuardianPhone,
    string? Email,
    DateTimeOffset CreatedAt);

internal static class StudentProjection
{
    public static IQueryable<StudentDto> ToDto(this IQueryable<Student> students) =>
        students.Select(s => new StudentDto(s.Id, s.BatchId, s.Batch!.Name, s.Roll, s.Name, s.Phone, s.GuardianPhone, s.Email, s.CreatedAt));

    /// <summary>Numeric rolls in numeric order, then the rest in text order.</summary>
    public static IEnumerable<StudentDto> ByRoll(this IEnumerable<StudentDto> students) =>
        students
            .OrderBy(s => long.TryParse(s.Roll, NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : long.MaxValue)
            .ThenBy(s => s.Roll, StringComparer.Ordinal);
}

public static class ListBatches
{
    public sealed record Query : IQuery<IReadOnlyList<BatchDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<BatchDto>>
    {
        public async Task<IReadOnlyList<BatchDto>> Handle(Query query, CancellationToken ct) =>
            await db.Batches.AsNoTracking()
                .OrderByDescending(b => b.Year).ThenBy(b => b.Name)
                .Select(b => new BatchDto(
                    b.Id,
                    b.Name,
                    b.LevelId,
                    db.Levels.Where(l => l.Id == b.LevelId).Select(l => l.NameBn).FirstOrDefault(),
                    b.Year,
                    db.Students.Count(s => s.BatchId == b.Id),
                    b.CreatedAt))
                .ToListAsync(ct);
    }
}

public static class SaveBatch
{
    public sealed record Request(string Name, Guid? LevelId, int? Year);

    public sealed record Command(Guid? Id, Request Body) : ICommand<BatchDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Name).NotEmpty().WithMessage(Messages.BatchNameRequired).MaximumLength(100).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Year).InclusiveBetween(2000, 2100).WithMessage(Messages.InvalidValue).When(x => x.Body.Year is not null);
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, BatchDto>
    {
        public async Task<BatchDto> Handle(Command command, CancellationToken ct)
        {
            var body = command.Body;
            var name = body.Name.Trim();
            if (body.LevelId is { } levelId && !await db.Levels.AnyAsync(l => l.Id == levelId, ct))
            {
                throw Guard.Invalid("levelId", Messages.InvalidValue);
            }

            if (await db.Batches.AnyAsync(b => b.Name == name && b.Id != command.Id, ct))
            {
                throw Guard.Invalid("name", Messages.BatchNameTaken);
            }

            var now = clock.GetUtcNow();
            Batch batch;
            if (command.Id is { } id)
            {
                batch = await db.Batches.Where(b => b.Id == id).FirstOr404Async(ct);
            }
            else
            {
                batch = new Batch { Id = IdGen.New(), InstitutionId = tenant.InstitutionId, CreatedAt = now };
                db.Batches.Add(batch);
            }

            batch.Name = name;
            batch.LevelId = body.LevelId;
            batch.Year = body.Year;
            batch.UpdatedAt = now;
            await db.SaveChangesAsync(ct);

            var levelName = batch.LevelId is null ? null : await db.Levels.Where(l => l.Id == batch.LevelId).Select(l => l.NameBn).FirstOrDefaultAsync(ct);
            var count = await db.Students.CountAsync(s => s.BatchId == batch.Id, ct);
            return new BatchDto(batch.Id, batch.Name, batch.LevelId, levelName, batch.Year, count, batch.CreatedAt);
        }
    }
}

public static class DeleteBatch
{
    public sealed record Command(Guid Id) : ICommand<Unit>;

    internal sealed class Handler(AppDbContext db) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var batch = await db.Batches.Where(b => b.Id == command.Id).FirstOr404Async(ct);
            if (await db.Students.AnyAsync(s => s.BatchId == batch.Id, ct))
            {
                throw AppException.Conflict("batch.not_empty", Messages.BatchNotEmpty);
            }

            db.Batches.Remove(batch);
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public static class ListStudents
{
    public sealed record Query(Guid? BatchId, string? Keyword, string? Cursor, int? Limit) : IQuery<CursorPage<StudentDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, CursorPage<StudentDto>>
    {
        public async Task<CursorPage<StudentDto>> Handle(Query query, CancellationToken ct)
        {
            var students = db.Students.AsNoTracking();
            if (query.BatchId is { } batchId)
            {
                students = students.Where(s => s.BatchId == batchId);
            }

            if (!string.IsNullOrWhiteSpace(query.Keyword))
            {
                var keyword = BanglaText.ToAsciiDigits(query.Keyword.Trim());
                var pattern = $"%{LikePattern.Escape(keyword)}%";
                students = students.Where(s =>
                    EF.Functions.ILike(s.Name, pattern, @"\") || EF.Functions.ILike(s.Roll, pattern, @"\")
                    || (s.Phone != null && EF.Functions.ILike(s.Phone, pattern, @"\")));
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                students = students.Where(s => s.Id.CompareTo(cursor) < 0);
            }

            return await students.OrderByDescending(s => s.Id).ToDto().ToPageAsync(s => Paging.Cursor(s.Id), query.Limit, ct);
        }
    }
}

public static class ListBatchStudents
{
    public sealed record Query(Guid BatchId) : IQuery<IReadOnlyList<StudentDto>>;

    /// <summary>The whole batch in roll order (candidate lists, attendance sheets).</summary>
    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<StudentDto>>
    {
        public async Task<IReadOnlyList<StudentDto>> Handle(Query query, CancellationToken ct)
        {
            if (!await db.Batches.AnyAsync(b => b.Id == query.BatchId, ct))
            {
                throw AppException.NotFound();
            }

            var students = await db.Students.AsNoTracking().Where(s => s.BatchId == query.BatchId).ToDto().ToListAsync(ct);
            return students.ByRoll().ToList();
        }
    }
}

public static class SaveStudent
{
    public sealed record Request(Guid BatchId, string Roll, string Name, string? Phone, string? GuardianPhone, string? Email);

    public sealed record Command(Guid? Id, Request Body) : ICommand<StudentDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.BatchId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.Body.Roll).NotEmpty().WithMessage(Messages.RollRequired).MaximumLength(20).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Name).NotEmpty().WithMessage(Messages.NameRequired).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Phone).Must(p => PhoneNumbers.Normalize(p) is not null).WithMessage(Messages.InvalidPhone)
                .When(x => !string.IsNullOrWhiteSpace(x.Body.Phone));
            RuleFor(x => x.Body.GuardianPhone).Must(p => PhoneNumbers.Normalize(p) is not null).WithMessage(Messages.InvalidPhone)
                .When(x => !string.IsNullOrWhiteSpace(x.Body.GuardianPhone));
            RuleFor(x => x.Body.Email).EmailAddress().WithMessage(Messages.InvalidEmail).MaximumLength(200).WithMessage(Messages.TooLong)
                .When(x => !string.IsNullOrWhiteSpace(x.Body.Email));
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, IEntitlements entitlements, TimeProvider clock)
        : ICommandHandler<Command, StudentDto>
    {
        public async Task<StudentDto> Handle(Command command, CancellationToken ct)
        {
            var body = command.Body;
            if (!await db.Batches.AnyAsync(b => b.Id == body.BatchId, ct))
            {
                throw Guard.Invalid("batchId", Messages.NotFound);
            }

            var roll = StudentSheets.NormalizeRoll(body.Roll);
            if (await db.Students.AnyAsync(s => s.BatchId == body.BatchId && s.Roll == roll && s.Id != command.Id, ct))
            {
                throw Guard.Invalid("roll", Messages.RollTaken);
            }

            var now = clock.GetUtcNow();
            Student student;
            if (command.Id is { } id)
            {
                student = await db.Students.Where(s => s.Id == id).FirstOr404Async(ct);
            }
            else
            {
                await entitlements.AssertWithinLimitAsync(tenant.InstitutionId, LimitKey.Students, ct);
                student = new Student { Id = IdGen.New(), InstitutionId = tenant.InstitutionId, CreatedAt = now };
                db.Students.Add(student);
            }

            student.BatchId = body.BatchId;
            student.Roll = roll;
            student.Name = body.Name.Trim();
            student.Phone = PhoneNumbers.Normalize(body.Phone);
            student.GuardianPhone = PhoneNumbers.Normalize(body.GuardianPhone);
            student.Email = string.IsNullOrWhiteSpace(body.Email) ? null : body.Email.Trim();
            student.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            return await db.Students.AsNoTracking().Where(s => s.Id == student.Id).ToDto().FirstAsync(ct);
        }
    }
}

public static class DeleteStudents
{
    public sealed record Command(IReadOnlyList<Guid> Ids) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() =>
            RuleFor(x => x.Ids).NotEmpty().WithMessage(Messages.Required).Must(i => i is null || i.Count <= 1000).WithMessage(Messages.InvalidValue);
    }

    internal sealed class Handler(AppDbContext db) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            // Tenant filter limits the delete to this institution's students.
            await db.Students.Where(s => command.Ids.Contains(s.Id)).ExecuteDeleteAsync(ct);
            return Unit.Value;
        }
    }
}

public static class ImportStudents
{
    public sealed record Command(Guid BatchId, bool UpdateExisting, Stream Content) : ICommand<Response>;

    public sealed record RowError(int Row, string Message);

    public sealed record Response(int Created, int Updated, int Skipped, IReadOnlyList<RowError> Errors);

    /// <summary>
    /// Adds a class list from Excel or CSV into one batch in a single transaction. Rows with errors are reported and
    /// skipped; existing rolls are updated only when asked.
    /// </summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, IEntitlements entitlements, TimeProvider clock)
        : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            if (!await db.Batches.AnyAsync(b => b.Id == command.BatchId, ct))
            {
                throw Guard.Invalid("batchId", Messages.NotFound);
            }

            var (type, bytes) = await FileSignature.ReadAndSniffAsync(command.Content, 5L * 1024 * 1024, ct);
            var sheet = StudentSheets.Read(bytes, type);
            if (sheet.MissingColumns.Count > 0)
            {
                throw Guard.Invalid("file", string.Format(CultureInfo.InvariantCulture, Messages.StudentFileMissingColumns, string.Join(", ", sheet.MissingColumns)));
            }

            var existing = await db.Students.Where(s => s.BatchId == command.BatchId).ToDictionaryAsync(s => s.Roll, StringComparer.Ordinal, ct);
            var errors = new List<RowError>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var valid = new List<StudentSheetRow>();
            foreach (var row in sheet.Rows)
            {
                var error = Check(row, seen);
                if (error is null)
                {
                    valid.Add(row);
                }
                else
                {
                    errors.Add(new RowError(row.RowNumber, error));
                }
            }

            var toCreate = valid.Where(r => !existing.ContainsKey(r.Roll)).ToList();
            var toUpdate = command.UpdateExisting ? valid.Where(r => existing.ContainsKey(r.Roll)).ToList() : [];
            var skipped = valid.Count - toCreate.Count - toUpdate.Count;
            if (toCreate.Count > 0)
            {
                await entitlements.AssertWithinLimitAsync(institutionId, LimitKey.Students, ct, toCreate.Count);
            }

            var now = clock.GetUtcNow();
            foreach (var row in toCreate)
            {
                db.Students.Add(new Student
                {
                    Id = IdGen.New(),
                    InstitutionId = institutionId,
                    BatchId = command.BatchId,
                    Roll = row.Roll,
                    Name = row.Name,
                    Phone = PhoneNumbers.Normalize(row.Phone),
                    GuardianPhone = PhoneNumbers.Normalize(row.GuardianPhone),
                    Email = row.Email,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }

            foreach (var row in toUpdate)
            {
                var student = existing[row.Roll];
                student.Name = row.Name;
                student.Phone = PhoneNumbers.Normalize(row.Phone) ?? student.Phone;
                student.GuardianPhone = PhoneNumbers.Normalize(row.GuardianPhone) ?? student.GuardianPhone;
                student.Email = row.Email ?? student.Email;
                student.UpdatedAt = now;
            }

            await db.SaveChangesAsync(ct);
            return new Response(toCreate.Count, toUpdate.Count, skipped, errors);
        }

        private static string? Check(StudentSheetRow row, HashSet<string> seen)
        {
            if (row.Roll.Length == 0)
            {
                return Messages.RollRequired;
            }

            if (row.Roll.Length > 20 || row.Name.Length > 120 || (row.Email?.Length ?? 0) > 200)
            {
                return Messages.TooLong;
            }

            if (row.Name.Length == 0)
            {
                return Messages.NameRequired;
            }

            if ((row.Phone is not null && PhoneNumbers.Normalize(row.Phone) is null)
                || (row.GuardianPhone is not null && PhoneNumbers.Normalize(row.GuardianPhone) is null))
            {
                return Messages.InvalidPhone;
            }

            return seen.Add(row.Roll) ? null : Messages.RollDuplicateInFile;
        }
    }
}

public static class StudentEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var batches = app.MapGroup("/api/v1/batches").WithTags("Students").RequireAuthorization(Policies.Member);

        batches.MapGet("/", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListBatches.Query(), ct)))
            .WithName("listBatches");

        batches.MapPost("/", async (SaveBatch.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveBatch.Command(null, body), ct)))
            .WithName("createBatch")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem();

        batches.MapPut("/{id:guid}", async (Guid id, SaveBatch.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveBatch.Command(id, body), ct)))
            .WithName("updateBatch")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        batches.MapDelete("/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new DeleteBatch.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("deleteBatch")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        batches.MapGet("/{id:guid}/students", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListBatchStudents.Query(id), ct)))
            .WithName("listBatchStudents")
            .ProducesProblem(StatusCodes.Status404NotFound);

        var students = app.MapGroup("/api/v1/students").WithTags("Students").RequireAuthorization(Policies.Member);

        students.MapGet("/", async (Guid? batchId, string? keyword, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListStudents.Query(batchId, keyword, cursor, limit), ct)))
            .WithName("listStudents");

        students.MapPost("/", async (SaveStudent.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveStudent.Command(null, body), ct)))
            .WithName("createStudent")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired);

        students.MapPut("/{id:guid}", async (Guid id, SaveStudent.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveStudent.Command(id, body), ct)))
            .WithName("updateStudent")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        students.MapPost("/delete", async (DeleteStudents.Command command, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(command, ct);
                return TypedResults.NoContent();
            })
            .WithName("deleteStudents")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem();

        students.MapPost("/import", async (IFormFile file, Guid batchId, bool? updateExisting, Dispatcher d, CancellationToken ct) =>
            {
                await using var stream = file.OpenReadStream();
                return TypedResults.Ok(await d.Send(new ImportStudents.Command(batchId, updateExisting ?? false, stream), ct));
            })
            .WithName("importStudents")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .RequireRateLimiting(RateLimits.Uploads)
            .DisableAntiforgery()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status402PaymentRequired)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        students.MapGet("/template", () => TypedResults.File(
                StudentSheets.BuildTemplate(), StorageKeys.ContentTypeFor(".xlsx"), "eproshno-students-template.xlsx"))
            .WithName("getStudentTemplate")
            .Produces(StatusCodes.Status200OK, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
}
