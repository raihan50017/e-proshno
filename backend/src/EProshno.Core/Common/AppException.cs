namespace EProshno.Core.Common;

/// <summary>A business error with a stable code and a Bangla message, returned as ProblemDetails.</summary>
public sealed class AppException(string code, string messageBn, int status = 400) : Exception(messageBn)
{
    public string Code { get; } = code;
    public int Status { get; } = status;

    public static AppException NotFound(string messageBn = Messages.NotFound) => new("not_found", messageBn, 404);

    public static AppException Forbidden(string messageBn = Messages.Forbidden) => new("forbidden", messageBn, 403);

    public static AppException Conflict(string code, string messageBn) => new(code, messageBn, 409);
}
