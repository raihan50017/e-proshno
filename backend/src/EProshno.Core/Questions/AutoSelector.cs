using EProshno.Core.Common;
using EProshno.Core.Papers;

namespace EProshno.Core.Questions;

/// <summary>A question available for auto-selection.</summary>
public sealed record SelectionCandidate(Guid Id, Guid ChapterId, Guid? GroupId);

public sealed record SelectionResult(IReadOnlyList<Guid> QuestionIds, string? ShortfallMessage);

/// <summary>
/// One-click selection: spreads picks across chapters proportionally to their available counts, keeps
/// CommonInfo groups whole (every sibling counts toward the target), and tops up when a chapter runs out.
/// Deterministic for a given seed and candidate set.
/// </summary>
public static class AutoSelector
{
    public static SelectionResult Select(IReadOnlyCollection<SelectionCandidate> candidates, int target, uint seed)
    {
        if (target <= 0 || candidates.Count == 0)
        {
            return new SelectionResult([], target > 0 ? Shortfall(target, 0) : null);
        }

        var rng = new Mulberry32(seed);

        // Units: a CommonInfo group is one unit; any other question is a unit of one.
        var chapters = candidates
            .GroupBy(c => c.ChapterId)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var units = g
                    .GroupBy(c => c.GroupId ?? c.Id)
                    .OrderBy(u => u.Key)
                    .Select(u => u.Select(c => c.Id).OrderBy(id => id).ToList())
                    .ToList();
                rng.Shuffle(units);
                return new ChapterPool(g.Key, units);
            })
            .ToList();

        var total = chapters.Sum(c => c.Available);
        var goal = Math.Min(target, total);

        // Largest-remainder quotas.
        var quotas = chapters
            .Select((c, i) => (Index: i, Exact: (double)goal * c.Available / total))
            .Select(x => (x.Index, Floor: (int)Math.Floor(x.Exact), Fraction: x.Exact - Math.Floor(x.Exact)))
            .ToList();
        foreach (var q in quotas)
        {
            chapters[q.Index].Quota = q.Floor;
        }

        var remainder = goal - quotas.Sum(q => q.Floor);
        foreach (var q in quotas.OrderByDescending(q => q.Fraction).ThenBy(q => q.Index).Take(remainder))
        {
            chapters[q.Index].Quota++;
        }

        var selected = new List<Guid>(goal);

        // Pass 1: fill each chapter's quota with units that fit.
        foreach (var chapter in chapters)
        {
            chapter.Take(selected, unitFits: size => size <= chapter.Quota - chapter.Taken && selected.Count + size <= goal);
        }

        // Pass 2: top up round-robin with anything that still fits.
        var progress = true;
        while (selected.Count < goal && progress)
        {
            progress = false;
            foreach (var chapter in chapters)
            {
                if (selected.Count >= goal)
                {
                    break;
                }

                progress |= chapter.TakeOne(selected, size => selected.Count + size <= goal);
            }
        }

        return new SelectionResult(selected, selected.Count < target ? Shortfall(target, selected.Count) : null);
    }

    private static string Shortfall(int target, int found) =>
        string.Format(
            System.Globalization.CultureInfo.InvariantCulture,
            Messages.AutoSelectShortfall,
            Text.BanglaText.ToBanglaDigits(target),
            Text.BanglaText.ToBanglaDigits(found));

    private sealed class ChapterPool(Guid chapterId, List<List<Guid>> units)
    {
        public Guid ChapterId { get; } = chapterId;
        public int Available { get; } = units.Sum(u => u.Count);
        public int Quota { get; set; }
        public int Taken { get; private set; }

        public void Take(List<Guid> selected, Func<int, bool> unitFits)
        {
            for (var i = 0; i < units.Count;)
            {
                if (unitFits(units[i].Count))
                {
                    Consume(selected, i);
                }
                else
                {
                    i++;
                }
            }
        }

        public bool TakeOne(List<Guid> selected, Func<int, bool> unitFits)
        {
            for (var i = 0; i < units.Count; i++)
            {
                if (unitFits(units[i].Count))
                {
                    Consume(selected, i);
                    return true;
                }
            }

            return false;
        }

        private void Consume(List<Guid> selected, int index)
        {
            selected.AddRange(units[index]);
            Taken += units[index].Count;
            units.RemoveAt(index);
        }
    }
}
