using EProshno.Core.Questions;

namespace EProshno.Core.Papers;

public sealed record ComposerOption(int Index, string Content, bool IsCorrect);

public sealed record ComposerCqPart(int Part, string Prompt, decimal Marks, string? Answer);

public sealed record ComposerItem(
    Guid QuestionId,
    int Position,
    decimal Marks,
    QuestionType Type,
    McqKind? McqKind,
    Guid? StimulusId,
    string? StimulusContent,
    string Stem,
    IReadOnlyList<ComposerOption> Options,
    IReadOnlyList<ComposerCqPart> CqParts,
    string? Explanation,
    IReadOnlyList<string> BoardTags,
    byte Importance);

public enum PaperBlockKind
{
    Single,
    CommonInfo,
    Creative,
}

/// <param name="Label">Printed position 0–3 (ক–ঘ).</param>
/// <param name="OriginalIndex">Position in the question as stored.</param>
public sealed record PaperOption(int Label, int OriginalIndex, string Content, bool IsCorrect);

public sealed record PaperCqPart(int Part, string Prompt, decimal Marks, string? Answer);

public sealed record PaperQuestion(
    int Number,
    Guid QuestionId,
    QuestionType Type,
    McqKind? McqKind,
    string Stem,
    IReadOnlyList<PaperOption> Options,
    IReadOnlyList<PaperCqPart> CqParts,
    string? Explanation,
    IReadOnlyList<string> BoardTags,
    byte Importance,
    decimal Marks);

public sealed record PaperBlock(PaperBlockKind Kind, string? Stimulus, IReadOnlyList<PaperQuestion> Questions);

/// <param name="OptionLabel">Printed position 0–3 of the correct option.</param>
public sealed record AnswerKeyEntry(int Number, int OptionLabel);

public sealed record PaperBody(IReadOnlyList<PaperBlock> Blocks, IReadOnlyList<AnswerKeyEntry> AnswerKey);

/// <summary>
/// Turns set items into the printable order for one variant (0 = ক). Deterministic: the same seed, items and
/// variant always give the same paper.
/// Rules: variant ক with shuffling off keeps the teacher's order; other variants always shuffle question blocks;
/// CommonInfo siblings move as one block right after their stimulus; MultiCompletion options are never shuffled.
/// </summary>
public static class PaperComposer
{
    public const int MaxVariants = 4;
    public static readonly string[] VariantLabels = ["ক", "খ", "গ", "ঘ"];

    public static PaperBody Compose(IReadOnlyList<ComposerItem> items, PaperSettings settings, int variantIndex)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(variantIndex);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(variantIndex, MaxVariants);

        var rng = new Mulberry32(Mulberry32.VariantSeed(settings.Seed, variantIndex));
        var blocks = BuildBlocks(items.OrderBy(i => i.Position).ThenBy(i => i.QuestionId).ToList());

        if (settings.ShuffleQuestions || variantIndex > 0)
        {
            rng.Shuffle(blocks);
        }

        var number = 0;
        var answerKey = new List<AnswerKeyEntry>();
        var result = new List<PaperBlock>(blocks.Count);
        foreach (var block in blocks)
        {
            var questions = new List<PaperQuestion>(block.Items.Count);
            foreach (var item in block.Items)
            {
                number++;
                var options = ArrangeOptions(item, settings.ShuffleOptions, rng);
                var correct = options.FirstOrDefault(o => o.IsCorrect);
                if (item.Type == QuestionType.Mcq && correct is not null)
                {
                    answerKey.Add(new AnswerKeyEntry(number, correct.Label));
                }

                questions.Add(new PaperQuestion(
                    number,
                    item.QuestionId,
                    item.Type,
                    item.McqKind,
                    item.Stem,
                    options,
                    item.CqParts.OrderBy(p => p.Part).Select(p => new PaperCqPart(p.Part, p.Prompt, p.Marks, p.Answer)).ToList(),
                    item.Explanation,
                    item.BoardTags,
                    item.Importance,
                    item.Marks));
            }

            result.Add(new PaperBlock(block.Kind, block.Stimulus, questions));
        }

        return new PaperBody(result, answerKey);
    }

    private static List<PaperOption> ArrangeOptions(ComposerItem item, bool shuffle, Mulberry32 rng)
    {
        var ordered = item.Options.OrderBy(o => o.Index).ToList();
        if (shuffle && item.Type == QuestionType.Mcq && item.McqKind != McqKind.MultiCompletion)
        {
            rng.Shuffle(ordered);
        }

        return ordered.Select((o, label) => new PaperOption(label, o.Index, o.Content, o.IsCorrect)).ToList();
    }

    private static List<DraftBlock> BuildBlocks(List<ComposerItem> items)
    {
        var blocks = new List<DraftBlock>();
        var groups = new Dictionary<Guid, DraftBlock>();
        foreach (var item in items)
        {
            if (item is { Type: QuestionType.Mcq, McqKind: McqKind.CommonInfo, StimulusId: { } stimulusId })
            {
                if (!groups.TryGetValue(stimulusId, out var group))
                {
                    group = new DraftBlock(PaperBlockKind.CommonInfo, item.StimulusContent);
                    groups[stimulusId] = group;
                    blocks.Add(group);
                }

                group.Items.Add(item);
            }
            else
            {
                var kind = item.Type == QuestionType.Cq ? PaperBlockKind.Creative : PaperBlockKind.Single;
                var block = new DraftBlock(kind, item.Type == QuestionType.Cq ? item.StimulusContent : null);
                block.Items.Add(item);
                blocks.Add(block);
            }
        }

        return blocks;
    }

    private sealed class DraftBlock(PaperBlockKind kind, string? stimulus)
    {
        public PaperBlockKind Kind { get; } = kind;
        public string? Stimulus { get; } = stimulus;
        public List<ComposerItem> Items { get; } = [];
    }
}
