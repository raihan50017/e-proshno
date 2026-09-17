using EProshno.Core.Common;
using EProshno.Core.Content;
using EProshno.Core.Questions;
using FluentValidation;

namespace EProshno.Infrastructure.Questions;

/// <summary>
/// The one set of structural rules for question content: platform editor, custom-bank editor and every import row.
/// References (subject, chapter, topic, boards, tags) are checked against the database by <see cref="QuestionWriter"/>.
/// </summary>
public sealed class QuestionContentValidator : AbstractValidator<QuestionContent>
{
    public const int MaxAppearances = 20;
    public const int MaxTags = 20;
    public const int MinYear = 1980;

    public QuestionContentValidator(TimeProvider clock)
    {
        RuleFor(x => x.Type).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.SubjectId).NotEmpty().WithMessage(Messages.Required);
        RuleFor(x => x.ChapterId).NotEmpty().WithMessage(Messages.Required);
        RuleFor(x => x.Difficulty).InclusiveBetween((byte)1, (byte)3).WithMessage(Messages.DifficultyRange);
        RuleFor(x => x.Importance).InclusiveBetween((byte)0, (byte)3).WithMessage(Messages.ImportanceRange);

        RuleFor(x => x.Stem).Must(RichContent.IsValid).WithMessage(Messages.InvalidContent);
        RuleFor(x => x.Stem).Must(s => !RichContent.IsBlank(s)).WithMessage(Messages.StemRequired)
            .When(x => x.Type != QuestionType.Cq && RichContent.IsValid(x.Stem));
        RuleFor(x => x.Explanation!).Must(RichContent.IsValid).WithMessage(Messages.InvalidContent)
            .When(x => x.Explanation is not null);
        RuleFor(x => x.Stimulus!).Must(RichContent.IsValid).WithMessage(Messages.InvalidContent)
            .When(x => x.Stimulus is not null);

        When(x => x.Type == QuestionType.Mcq, () =>
        {
            RuleFor(x => x.McqKind).NotNull().IsInEnum().WithMessage(Messages.McqKindRequired);
            RuleFor(x => x.Options).Must(o => o.Count == QuestionRules.OptionCount).WithMessage(Messages.McqNeedsFourOptions);
            RuleFor(x => x.Options).Must(o => o.Count(opt => opt.IsCorrect) == 1).WithMessage(Messages.McqNeedsOneCorrect);
            RuleForEach(x => x.Options).ChildRules(option =>
            {
                option.RuleFor(o => o.Content).Must(RichContent.IsValid).WithMessage(Messages.InvalidContent);
                option.RuleFor(o => o.Content).Must(c => !RichContent.IsBlank(c)).WithMessage(Messages.OptionRequired)
                    .When(o => RichContent.IsValid(o.Content));
            });
            RuleFor(x => x.CqParts).Empty().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Stimulus).Must((x, s) => x.StimulusId is not null || !RichContent.IsBlank(s))
                .WithMessage(Messages.StimulusRequired)
                .When(x => x.McqKind == McqKind.CommonInfo);
            RuleFor(x => x.StimulusId).Null().WithMessage(Messages.InvalidValue)
                .When(x => x.McqKind != McqKind.CommonInfo);
        });

        When(x => x.Type == QuestionType.Cq, () =>
        {
            RuleFor(x => x.McqKind).Null().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Stimulus).Must(s => !RichContent.IsBlank(s)).WithMessage(Messages.StimulusRequired);
            RuleFor(x => x.StimulusId).Null().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Options).Empty().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.CqParts).Must(p => p.Count == QuestionRules.CqPartCount).WithMessage(Messages.CqNeedsFourParts);
            RuleForEach(x => x.CqParts).ChildRules(part =>
            {
                part.RuleFor(p => p.Prompt).Must(RichContent.IsValid).WithMessage(Messages.InvalidContent);
                part.RuleFor(p => p.Prompt).Must(p => !RichContent.IsBlank(p)).WithMessage(Messages.Required)
                    .When(p => RichContent.IsValid(p.Prompt));
                part.RuleFor(p => p.Marks).InclusiveBetween(0.5m, 10m).WithMessage(Messages.CqPartMarks);
                part.RuleFor(p => p.Answer!).Must(RichContent.IsValid).WithMessage(Messages.InvalidContent)
                    .When(p => p.Answer is not null);
            });
        });

        When(x => x.Type == QuestionType.Short, () =>
        {
            RuleFor(x => x.McqKind).Null().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Options).Empty().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.CqParts).Empty().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.StimulusId).Null().WithMessage(Messages.InvalidValue);
        });

        RuleFor(x => x.Appearances).Must(a => a.Count <= MaxAppearances).WithMessage(Messages.TooLong);
        RuleForEach(x => x.Appearances).ChildRules(a =>
        {
            a.RuleFor(x => x.Source).IsInEnum().WithMessage(Messages.InvalidValue);
            a.RuleFor(x => x.Year)
                .Must(y => y >= MinYear && y <= clock.GetUtcNow().Year + 1)
                .WithMessage(Messages.AppearanceYear);
            a.RuleFor(x => x.BoardId).NotEmpty().WithMessage(Messages.BoardRequired)
                .When(x => x.Source == ExamSource.Board);
            a.RuleFor(x => x.SchoolName).MaximumLength(150).WithMessage(Messages.TooLong);
        });

        RuleFor(x => x.TagIds).Must(t => t.Count <= MaxTags && t.Distinct().Count() == t.Count)
            .WithMessage(Messages.InvalidValue);
    }
}
