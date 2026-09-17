using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace EProshno.Core.Content;

/// <summary>
/// Helpers for question content stored as TipTap/ProseMirror JSON (jsonb).
/// Supported nodes: doc, paragraph, text (marks), hardBreak, inlineMath/blockMath (attrs.latex), image (attrs.src),
/// bulletList/orderedList/listItem.
/// </summary>
public static partial class RichContent
{
    public const string EmptyDoc = """{"type":"doc","content":[]}""";
    public const int MaxJsonLength = 100_000;

    private static readonly HashSet<string> KnownNodes =
    [
        "doc", "paragraph", "text", "hardBreak", "inlineMath", "blockMath", "image",
        "bulletList", "orderedList", "listItem", "heading",
    ];

    public static bool IsValid(string? json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Length > MaxJsonLength)
        {
            return false;
        }

        try
        {
            var node = JsonNode.Parse(json);
            return node is JsonObject obj && (string?)obj["type"] == "doc" && AllNodesKnown(obj);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static bool IsBlank(string? json) => string.IsNullOrWhiteSpace(ToPlainText(json)) && !HasImage(json);

    /// <summary>Plain text with paragraphs on separate lines; math is kept as its LaTeX source.</summary>
    public static string ToPlainText(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return "";
        }

        JsonNode? root;
        try
        {
            root = JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            return "";
        }

        var sb = new StringBuilder();
        AppendText(root, sb);
        return sb.ToString().Trim();
    }

    public static bool HasImage(string? json) => Any(json, n => (string?)n["type"] == "image");

    public static bool HasMath(string? json) =>
        Any(json, n => (string?)n["type"] is "inlineMath" or "blockMath");

    /// <summary>
    /// Builds a document from plain text: each line becomes a paragraph, <c>$…$</c> becomes inline math,
    /// a line wrapped in <c>$$…$$</c> becomes block math, and <c>[ছবি: name]</c> becomes an image placeholder.
    /// </summary>
    public static string FromText(string? text, Func<string, string?>? resolveImage = null)
    {
        var content = new JsonArray();
        if (!string.IsNullOrWhiteSpace(text))
        {
            foreach (var rawLine in text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
            {
                var line = rawLine.Trim();
                if (line.Length == 0)
                {
                    continue;
                }

                var block = BlockMath().Match(line);
                if (block.Success)
                {
                    content.Add(new JsonObject
                    {
                        ["type"] = "blockMath",
                        ["attrs"] = new JsonObject { ["latex"] = block.Groups[1].Value.Trim() },
                    });
                    continue;
                }

                content.Add(new JsonObject { ["type"] = "paragraph", ["content"] = InlineNodes(line, resolveImage) });
            }
        }

        return new JsonObject { ["type"] = "doc", ["content"] = content }.ToJsonString();
    }

    /// <summary>
    /// A বহুপদী সমাপ্তিসূচক stem: lead paragraphs, the statements as a lower-roman ordered list, then the tail
    /// ("নিচের কোনটি সঠিক?").
    /// </summary>
    public static string FromStatements(string? lead, IReadOnlyList<string> statements, string? tail, Func<string, string?>? resolveImage = null)
    {
        var content = new JsonArray();
        AppendBlocks(content, FromText(lead, resolveImage));
        if (statements.Count > 0)
        {
            var items = new JsonArray();
            foreach (var statement in statements)
            {
                items.Add(new JsonObject
                {
                    ["type"] = "listItem",
                    ["content"] = new JsonArray
                    {
                        new JsonObject { ["type"] = "paragraph", ["content"] = InlineNodes(statement.Trim(), resolveImage) },
                    },
                });
            }

            content.Add(new JsonObject
            {
                ["type"] = "orderedList",
                ["attrs"] = new JsonObject { ["start"] = 1, ["type"] = "i" },
                ["content"] = items,
            });
        }

        AppendBlocks(content, FromText(tail, resolveImage));
        return new JsonObject { ["type"] = "doc", ["content"] = content }.ToJsonString();
    }

    /// <summary>
    /// Text in the teacher import format, so exported questions can be imported again: <c>$…$</c> inline math,
    /// <c>$$…$$</c> block math lines, <c>[ছবি: src]</c> images and <c>i.</c>/<c>1.</c> list items.
    /// </summary>
    public static string ToMarkupText(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return "";
        }

        JsonNode? root;
        try
        {
            root = JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            return "";
        }

        var lines = new List<string>();
        AppendMarkupBlocks(root, lines);
        return string.Join('\n', lines).Trim();
    }

    private static void AppendBlocks(JsonArray target, string docJson)
    {
        if (JsonNode.Parse(docJson)?["content"] is JsonArray blocks)
        {
            foreach (var block in blocks.ToList())
            {
                blocks.Remove(block);
                target.Add(block);
            }
        }
    }

    private static void AppendMarkupBlocks(JsonNode? node, List<string> lines)
    {
        if (node is not JsonObject obj || obj["content"] is not JsonArray children)
        {
            return;
        }

        foreach (var child in children.OfType<JsonObject>())
        {
            switch ((string?)child["type"])
            {
                case "paragraph" or "heading":
                    lines.Add(InlineMarkup(child));
                    break;
                case "blockMath":
                    lines.Add($"$${(string?)child["attrs"]?["latex"]}$$");
                    break;
                case "image":
                    lines.Add($"[ছবি: {(string?)child["attrs"]?["src"]}]");
                    break;
                case "orderedList" or "bulletList":
                    var roman = (string?)child["attrs"]?["type"] == "i";
                    var n = 0;
                    foreach (var item in (child["content"] as JsonArray ?? []).OfType<JsonObject>())
                    {
                        n++;
                        var marker = (string?)child["type"] == "bulletList" ? "-" : roman ? $"{Roman(n)}." : $"{n}.";
                        var itemLines = new List<string>();
                        AppendMarkupBlocks(item, itemLines);
                        lines.Add($"{marker} {string.Join(' ', itemLines)}");
                    }

                    break;
                default:
                    AppendMarkupBlocks(child, lines);
                    break;
            }
        }
    }

    private static string InlineMarkup(JsonObject paragraph)
    {
        var sb = new StringBuilder();
        foreach (var child in (paragraph["content"] as JsonArray ?? []).OfType<JsonObject>())
        {
            switch ((string?)child["type"])
            {
                case "text":
                    sb.Append((string?)child["text"]);
                    break;
                case "inlineMath":
                    sb.Append('$').Append((string?)child["attrs"]?["latex"]).Append('$');
                    break;
                case "hardBreak":
                    sb.Append(' ');
                    break;
                case "image":
                    sb.Append("[ছবি: ").Append((string?)child["attrs"]?["src"]).Append(']');
                    break;
            }
        }

        return sb.ToString();
    }

    private static string Roman(int n) => n switch
    {
        1 => "i",
        2 => "ii",
        3 => "iii",
        4 => "iv",
        5 => "v",
        6 => "vi",
        _ => n.ToString(System.Globalization.CultureInfo.InvariantCulture),
    };

    private static JsonArray InlineNodes(string line, Func<string, string?>? resolveImage)
    {
        var nodes = new JsonArray();
        var pos = 0;
        foreach (Match m in InlineToken().Matches(line))
        {
            if (m.Index > pos)
            {
                nodes.Add(TextNode(line[pos..m.Index]));
            }

            if (m.Groups["math"].Success)
            {
                nodes.Add(new JsonObject
                {
                    ["type"] = "inlineMath",
                    ["attrs"] = new JsonObject { ["latex"] = m.Groups["math"].Value.Trim() },
                });
            }
            else
            {
                var name = m.Groups["img"].Value.Trim();

                // Already one of our media URLs (exported questions) → keep; otherwise ask the caller (uploaded zip).
                var src = IsSafeImageSrc(name) ? name : resolveImage?.Invoke(name);
                nodes.Add(src is null
                    ? TextNode(m.Value)
                    : new JsonObject { ["type"] = "image", ["attrs"] = new JsonObject { ["src"] = src, ["alt"] = name } });
            }

            pos = m.Index + m.Length;
        }

        if (pos < line.Length)
        {
            nodes.Add(TextNode(line[pos..]));
        }

        return nodes;
    }

    private static JsonObject TextNode(string text) => new() { ["type"] = "text", ["text"] = text };

    private static void AppendText(JsonNode? node, StringBuilder sb)
    {
        if (node is not JsonObject obj)
        {
            return;
        }

        var type = (string?)obj["type"];
        switch (type)
        {
            case "text":
                sb.Append((string?)obj["text"]);
                return;
            case "inlineMath":
                sb.Append(' ').Append((string?)obj["attrs"]?["latex"]).Append(' ');
                return;
            case "blockMath":
                sb.Append('\n').Append((string?)obj["attrs"]?["latex"]).Append('\n');
                return;
            case "hardBreak":
                sb.Append('\n');
                return;
        }

        if (obj["content"] is JsonArray children)
        {
            foreach (var child in children)
            {
                AppendText(child, sb);
            }
        }

        if (type is "paragraph" or "heading" or "listItem")
        {
            sb.Append('\n');
        }
    }

    private static bool Any(string? json, Func<JsonObject, bool> predicate)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            return Walk(JsonNode.Parse(json), predicate);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool Walk(JsonNode? node, Func<JsonObject, bool> predicate)
    {
        if (node is not JsonObject obj)
        {
            return false;
        }

        if (predicate(obj))
        {
            return true;
        }

        return obj["content"] is JsonArray children && children.Any(c => Walk(c, predicate));
    }

    private static bool AllNodesKnown(JsonObject obj)
    {
        var type = (string?)obj["type"];
        if (type is null || !KnownNodes.Contains(type))
        {
            return false;
        }

        if (type == "image")
        {
            var src = (string?)obj["attrs"]?["src"];
            if (src is null || !IsSafeImageSrc(src))
            {
                return false;
            }
        }

        return obj["content"] is not JsonArray children
            || children.All(c => c is JsonObject child && AllNodesKnown(child));
    }

    /// <summary>Images must point at our own media endpoint; no external or script URLs.</summary>
    public static bool IsSafeImageSrc(string src) =>
        src.StartsWith(MediaUrlPrefix, StringComparison.Ordinal)
        && src.Length is > 14 and <= 400
        && !src.Contains("..", StringComparison.Ordinal)
        && src[MediaUrlPrefix.Length..].All(c => char.IsAsciiLetterOrDigit(c) || c is '/' or '-' or '_' or '.');

    public const string MediaUrlPrefix = "/api/v1/media/";

    [GeneratedRegex(@"\$(?<math>[^$]+)\$|\[ছবি:\s*(?<img>[^\]]+)\]", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex InlineToken();

    [GeneratedRegex(@"^\$\$(.+)\$\$$", RegexOptions.None, matchTimeoutMilliseconds: 200)]
    private static partial Regex BlockMath();
}
