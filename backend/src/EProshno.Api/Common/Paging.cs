using EProshno.Core.Common;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Common;

/// <summary>Keyset page: <c>{ items, nextCursor }</c>. Cursors are opaque strings to the client.</summary>
public sealed record CursorPage<T>(IReadOnlyList<T> Items, string? NextCursor);

public static class Paging
{
    public const int DefaultLimit = 20;
    public const int MaxLimit = 100;

    public static int Limit(int? requested) => Math.Clamp(requested ?? DefaultLimit, 1, MaxLimit);

    public static Guid? GuidCursor(string? cursor) =>
        Guid.TryParseExact(cursor, "N", out var id) ? id : null;

    /// <summary>
    /// Runs a query already ordered and filtered by the cursor (UUIDv7 ids sort by time in PostgreSQL, e.g.
    /// <c>.Where(x => x.Id.CompareTo(cursor) &lt; 0).OrderByDescending(x => x.Id)</c>) and builds the page.
    /// </summary>
    public static async Task<CursorPage<T>> ToPageAsync<T>(
        this IQueryable<T> query, Func<T, string> cursorOf, int? limit, CancellationToken ct)
    {
        var take = Limit(limit);
        var rows = await query.Take(take + 1).ToListAsync(ct);
        return rows.Count > take
            ? new CursorPage<T>(rows.Take(take).ToList(), cursorOf(rows[take - 1]))
            : new CursorPage<T>(rows, null);
    }

    public static string Cursor(Guid id) => id.ToString("N");
}

/// <summary>A generated file returned by a query; the endpoint streams it as an attachment.</summary>
public sealed record FileDownload(byte[] Content, string ContentType, string FileName);

public static class HttpContextExtensions
{
    public static string? UserAgent(this HttpContext http) => http.Request.Headers.UserAgent.ToString() is { Length: > 0 } ua ? ua : null;
}

public static class Guard
{
    public static T Found<T>(T? value)
        where T : class => value ?? throw AppException.NotFound();

    /// <summary>A 400 with one field error, for rules that need the database.</summary>
    public static FluentValidation.ValidationException Invalid(string field, string message) =>
        new([new FluentValidation.Results.ValidationFailure(field, message)]);
}
