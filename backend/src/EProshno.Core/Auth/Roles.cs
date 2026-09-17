namespace EProshno.Core.Auth;

/// <summary>Role names carried in the access token's <c>role</c> claim.</summary>
public static class Roles
{
    // Platform roles (ASP.NET Core Identity roles)
    public const string SuperAdmin = "SuperAdmin";
    public const string ContentEditor = "ContentEditor";
    public const string ContentReviewer = "ContentReviewer";
    public const string Support = "Support";

    // Institution roles (from the active Membership)
    public const string Owner = "Owner";
    public const string Admin = "Admin";
    public const string Teacher = "Teacher";

    public static readonly string[] Platform = [SuperAdmin, ContentEditor, ContentReviewer, Support];
}

/// <summary>Custom claim types in the access token.</summary>
public static class AppClaims
{
    public const string Subject = "sub";
    public const string Name = "name";
    public const string Role = "role";
    public const string Institution = "inst";
    public const string SessionId = "sid";
}

public enum InstitutionRole
{
    Owner,
    Admin,
    Teacher,
}
