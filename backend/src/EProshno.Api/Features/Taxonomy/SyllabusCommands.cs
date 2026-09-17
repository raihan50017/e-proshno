using System.Text.Json.Serialization;
using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Core.Text;
using EProshno.Core.Taxonomy;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Taxonomy;

/// <summary>
/// Syllabus edits. <c>Official</c> = content team editing the NCTB syllabus (InstitutionId null);
/// otherwise the current institution's custom syllabus.
/// </summary>
public static class SaveSubject
{
    public sealed record Request(Guid LevelId, string NameBn, int? Paper);

    public sealed record Command(Guid? Id, Request Body) : ICommand<SubjectDto>
    {
        [JsonIgnore]
        public bool Official { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.LevelId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.Body.NameBn).NotEmpty().WithMessage(Messages.Required).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Paper).InclusiveBetween(1, 2).WithMessage(Messages.InvalidValue).When(x => x.Body.Paper is not null);
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : ICommandHandler<Command, SubjectDto>
    {
        public async Task<SubjectDto> Handle(Command command, CancellationToken ct)
        {
            Guid? owner = command.Official ? null : tenant.InstitutionId;
            if (!await db.Levels.AnyAsync(l => l.Id == command.Body.LevelId, ct))
            {
                throw AppException.NotFound();
            }

            Subject subject;
            if (command.Id is { } id)
            {
                subject = await db.Subjects.Where(s => s.Id == id && s.InstitutionId == owner).FirstOr404Async(ct);
            }
            else
            {
                subject = new Subject
                {
                    Id = IdGen.New(),
                    InstitutionId = owner,
                    Sort = 1 + (await db.Subjects.Where(s => s.LevelId == command.Body.LevelId).Select(s => (int?)s.Sort).MaxAsync(ct) ?? 0),
                };
                db.Subjects.Add(subject);
            }

            subject.LevelId = command.Body.LevelId;
            subject.NameBn = BanglaText.FoldForParsing(command.Body.NameBn.Trim());
            subject.Paper = command.Body.Paper;
            await db.SaveChangesAsync(ct);
            return new SubjectDto(subject.Id, subject.LevelId, subject.NameBn, subject.Paper,
                Infrastructure.Papers.PaperLoader.SubjectLabel(subject.NameBn, subject.Paper), subject.Code, owner is not null);
        }
    }
}

public static class SaveChapter
{
    public sealed record Request(Guid SubjectId, int? Number, string NameBn);

    public sealed record Command(Guid? Id, Request Body) : ICommand<ChapterDto>
    {
        [JsonIgnore]
        public bool Official { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.SubjectId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.Body.NameBn).NotEmpty().WithMessage(Messages.Required).MaximumLength(200).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Number).InclusiveBetween(1, 999).WithMessage(Messages.InvalidValue).When(x => x.Body.Number is not null);
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : ICommandHandler<Command, ChapterDto>
    {
        public async Task<ChapterDto> Handle(Command command, CancellationToken ct)
        {
            Guid? owner = command.Official ? null : tenant.InstitutionId;
            var body = command.Body;

            // Custom chapters may hang under an official subject or the institution's own subject.
            var subjectOk = await db.Subjects.AnyAsync(
                s => s.Id == body.SubjectId && (s.InstitutionId == null || (owner != null && s.InstitutionId == owner)), ct);
            if (!subjectOk)
            {
                throw AppException.NotFound(Messages.SubjectNotFound);
            }

            var visible = db.Chapters.Where(c => c.SubjectId == body.SubjectId && (c.InstitutionId == null || c.InstitutionId == owner));
            var number = body.Number ?? 1 + (await visible.Select(c => (int?)c.Number).MaxAsync(ct) ?? 0);
            if (await visible.AnyAsync(c => c.Number == number && c.Id != command.Id, ct))
            {
                throw new ValidationException([new FluentValidation.Results.ValidationFailure("number", Messages.ChapterNumberTaken)]);
            }

            Chapter chapter;
            if (command.Id is { } id)
            {
                chapter = await db.Chapters.Where(c => c.Id == id && c.InstitutionId == owner).FirstOr404Async(ct);
            }
            else
            {
                chapter = new Chapter { Id = IdGen.New(), InstitutionId = owner };
                db.Chapters.Add(chapter);
            }

            chapter.SubjectId = body.SubjectId;
            chapter.Number = number;
            chapter.NameBn = BanglaText.FoldForParsing(body.NameBn.Trim());
            await db.SaveChangesAsync(ct);
            return new ChapterDto(chapter.Id, chapter.SubjectId, chapter.Number, chapter.NameBn,
                Infrastructure.Papers.PaperLoader.ChapterLabel(chapter.Number, chapter.NameBn), owner is not null, []);
        }
    }
}

public static class SaveTopic
{
    public sealed record Request(Guid ChapterId, string NameBn);

    public sealed record Command(Guid? Id, Request Body) : ICommand<TopicDto>
    {
        [JsonIgnore]
        public bool Official { get; init; }
    }

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.ChapterId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.Body.NameBn).NotEmpty().WithMessage(Messages.Required).MaximumLength(200).WithMessage(Messages.TooLong);
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : ICommandHandler<Command, TopicDto>
    {
        public async Task<TopicDto> Handle(Command command, CancellationToken ct)
        {
            Guid? owner = command.Official ? null : tenant.InstitutionId;
            var chapterOk = await db.Chapters.AnyAsync(
                c => c.Id == command.Body.ChapterId && (c.InstitutionId == null || (owner != null && c.InstitutionId == owner)), ct);
            if (!chapterOk)
            {
                throw AppException.NotFound();
            }

            Topic topic;
            if (command.Id is { } id)
            {
                topic = await db.Topics.Where(t => t.Id == id && t.InstitutionId == owner).FirstOr404Async(ct);
            }
            else
            {
                topic = new Topic
                {
                    Id = IdGen.New(),
                    InstitutionId = owner,
                    Sort = 1 + (await db.Topics.Where(t => t.ChapterId == command.Body.ChapterId).Select(t => (int?)t.Sort).MaxAsync(ct) ?? 0),
                };
                db.Topics.Add(topic);
            }

            topic.ChapterId = command.Body.ChapterId;
            topic.NameBn = BanglaText.FoldForParsing(command.Body.NameBn.Trim());
            await db.SaveChangesAsync(ct);
            return new TopicDto(topic.Id, topic.NameBn, owner is not null);
        }
    }
}

public enum SyllabusItemKind
{
    Subject,
    Chapter,
    Topic,
}

public static class DeleteSyllabusItem
{
    public sealed record Command(SyllabusItemKind Kind, Guid Id) : ICommand<Unit>
    {
        [JsonIgnore]
        public bool Official { get; init; }
    }

    /// <summary>Only unused items can be deleted: no questions and no saved sets refer to them.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            Guid? owner = command.Official ? null : tenant.InstitutionId;
            switch (command.Kind)
            {
                case SyllabusItemKind.Subject:
                {
                    var subject = await db.Subjects.Where(s => s.Id == command.Id && s.InstitutionId == owner).FirstOr404Async(ct);
                    var used = await db.Questions.AnyAsync(q => q.SubjectId == subject.Id, ct)
                               || await db.QuestionSets.IgnoreQueryFilters().AnyAsync(s => s.SubjectId == subject.Id, ct);   // usage check only
                    EnsureUnused(used);
                    db.Subjects.Remove(subject);
                    break;
                }

                case SyllabusItemKind.Chapter:
                {
                    var chapter = await db.Chapters.Where(c => c.Id == command.Id && c.InstitutionId == owner).FirstOr404Async(ct);
                    EnsureUnused(await db.Questions.AnyAsync(q => q.ChapterId == chapter.Id, ct));
                    db.Chapters.Remove(chapter);
                    break;
                }

                default:
                {
                    var topic = await db.Topics.Where(t => t.Id == command.Id && t.InstitutionId == owner).FirstOr404Async(ct);
                    EnsureUnused(await db.Questions.AnyAsync(q => q.TopicId == topic.Id, ct));
                    db.Topics.Remove(topic);
                    break;
                }
            }

            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }

        private static void EnsureUnused(bool used)
        {
            if (used)
            {
                throw AppException.Conflict("syllabus.in_use", Messages.SyllabusInUse);
            }
        }
    }
}
