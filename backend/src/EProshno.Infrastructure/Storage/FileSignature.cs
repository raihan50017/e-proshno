using System.IO.Compression;
using System.Text;
using System.Text.Unicode;
using EProshno.Core.Common;

namespace EProshno.Infrastructure.Storage;

public enum SniffedType
{
    Unknown,
    Png,
    Jpeg,
    Webp,
    Xlsx,
    Docx,
    MacroEnabledOffice,
    LegacyOffice,
    Pdf,
    Text,
}

/// <summary>Detects file types from content (magic bytes and OOXML content types), never from the file name.</summary>
public static class FileSignature
{
    private const int MaxZipEntries = 10_000;
    private const long MaxZipUncompressed = 300L * 1024 * 1024;

    public static SniffedType Sniff(ReadOnlySpan<byte> head, Stream? fullContent = null)
    {
        if (head.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
        {
            return SniffedType.Png;
        }

        if (head.StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }))
        {
            return SniffedType.Jpeg;
        }

        if (head.Length >= 12 && head[..4].SequenceEqual("RIFF"u8) && head.Slice(8, 4).SequenceEqual("WEBP"u8))
        {
            return SniffedType.Webp;
        }

        if (head.StartsWith("%PDF-"u8))
        {
            return SniffedType.Pdf;
        }

        // OLE2 compound file: .xls/.doc (and their macro variants).
        if (head.StartsWith(new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 }))
        {
            return SniffedType.LegacyOffice;
        }

        if (head.StartsWith("PK\x03\x04"u8))
        {
            return fullContent is null ? SniffedType.Unknown : SniffOoxml(fullContent);
        }

        return LooksLikeText(head) ? SniffedType.Text : SniffedType.Unknown;
    }

    public static async Task<(SniffedType Type, byte[] Bytes)> ReadAndSniffAsync(Stream input, long maxBytes, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await input.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                throw new AppException("file.too_large", Messages.FileTooLarge, 413);
            }

            buffer.Write(chunk, 0, read);
        }

        var bytes = buffer.ToArray();
        using var content = new MemoryStream(bytes, writable: false);
        return (Sniff(bytes.AsSpan(0, Math.Min(bytes.Length, 512)), content), bytes);
    }

    private static SniffedType SniffOoxml(Stream content)
    {
        try
        {
            content.Position = 0;
            using var zip = new ZipArchive(content, ZipArchiveMode.Read, leaveOpen: true);
            if (zip.Entries.Count > MaxZipEntries || zip.Entries.Sum(e => e.Length) > MaxZipUncompressed)
            {
                return SniffedType.Unknown;
            }

            if (zip.Entries.Any(e => e.FullName.Contains("..", StringComparison.Ordinal)
                                     || e.FullName.StartsWith('/')
                                     || e.FullName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)))
            {
                return SniffedType.Unknown;
            }

            var types = zip.GetEntry("[Content_Types].xml");
            if (types is null || types.Length > 1_000_000)
            {
                return SniffedType.Unknown;
            }

            using var reader = new StreamReader(types.Open(), Encoding.UTF8);
            var xml = reader.ReadToEnd();
            if (xml.Contains("macroEnabled", StringComparison.OrdinalIgnoreCase)
                || zip.Entries.Any(e => e.Name.Equals("vbaProject.bin", StringComparison.OrdinalIgnoreCase)))
            {
                return SniffedType.MacroEnabledOffice;
            }

            if (xml.Contains("spreadsheetml.sheet.main+xml", StringComparison.Ordinal))
            {
                return SniffedType.Xlsx;
            }

            return xml.Contains("wordprocessingml.document.main+xml", StringComparison.Ordinal)
                ? SniffedType.Docx
                : SniffedType.Unknown;
        }
        catch (InvalidDataException)
        {
            return SniffedType.Unknown;
        }
    }

    private static bool LooksLikeText(ReadOnlySpan<byte> head)
    {
        if (head.IsEmpty || head.Contains((byte)0))
        {
            return false;
        }

        // The sample may end inside a multi-byte sequence; allow up to 3 trailing bytes to be cut off.
        for (var trim = 0; trim <= Math.Min(3, head.Length - 1); trim++)
        {
            if (Utf8.IsValid(head[..^trim]))
            {
                return true;
            }
        }

        return false;
    }
}