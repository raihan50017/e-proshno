namespace EProshno.Core.Text;

/// <summary>Bangla keywords that contain nukta letters, built from code points (never typed literally).</summary>
public static class BanglaWords
{
    /// <summary>অধ্যায় (chapter) — ends with YYA U+09DF.</summary>
    public static readonly string Chapter = BanglaText.S(0x0985, 0x09A7, 0x09CD, 0x09AF, 0x09BE, 0x09DF);
}
