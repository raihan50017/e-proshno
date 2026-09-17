namespace EProshno.Core.Papers;

/// <summary>
/// Small fixed PRNG so reprints are identical forever. Never replace with System.Random (its algorithm may change
/// between runtimes) and never seed from HashCode or string.GetHashCode (randomised per process).
/// </summary>
public sealed class Mulberry32(uint seed)
{
    private uint _state = seed;

    public uint NextUInt()
    {
        unchecked
        {
            var z = _state += 0x6D2B79F5;
            z = (z ^ (z >> 15)) * (z | 1);
            z ^= z + ((z ^ (z >> 7)) * (z | 61));
            return z ^ (z >> 14);
        }
    }

    public int Next(int maxExclusive) => (int)(NextUInt() % (uint)maxExclusive);

    public void Shuffle<T>(IList<T> items)
    {
        for (var i = items.Count - 1; i > 0; i--)
        {
            var j = Next(i + 1);
            (items[i], items[j]) = (items[j], items[i]);
        }
    }

    public static uint VariantSeed(uint setSeed, int variantIndex) =>
        unchecked(setSeed ^ ((uint)variantIndex * 0x9E3779B9));
}
