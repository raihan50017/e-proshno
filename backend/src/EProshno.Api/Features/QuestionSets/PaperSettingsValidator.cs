using EProshno.Core.Common;
using EProshno.Core.Papers;
using FluentValidation;

namespace EProshno.Api.Features.QuestionSets;

public sealed class PaperSettingsValidator : AbstractValidator<PaperSettings>
{
    public PaperSettingsValidator()
    {
        RuleFor(x => x.PaperSize).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.TextAlign).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.FontFamily).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.OptionLayout).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.OptionLabel).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.AnswerKey).IsInEnum().WithMessage(Messages.InvalidValue);
        RuleFor(x => x.Columns).InclusiveBetween(1, 3).WithMessage(Messages.InvalidValue);
        RuleFor(x => x.FontSizePt).InclusiveBetween(8m, 18m).WithMessage(Messages.InvalidValue);
        RuleFor(x => x.LineHeight).InclusiveBetween(1m, 2m).WithMessage(Messages.InvalidValue);
        RuleFor(x => x.Variants).InclusiveBetween(1, PaperComposer.MaxVariants).WithMessage(Messages.InvalidValue);
        RuleFor(x => x.Watermark).MaximumLength(40).WithMessage(Messages.TooLong);
        RuleFor(x => x.MarginsMm).NotNull().WithMessage(Messages.Required);
        RuleFor(x => x.MarginsMm).Must(m => new[] { m.Top, m.Right, m.Bottom, m.Left }.All(v => v is >= 5m and <= 40m))
            .WithMessage(Messages.InvalidValue)
            .When(x => x.MarginsMm is not null);
        RuleFor(x => x.Header).NotNull().WithMessage(Messages.Required);
        RuleFor(x => x.Header.Instructions).MaximumLength(300).WithMessage(Messages.TooLong).When(x => x.Header is not null);
    }
}
