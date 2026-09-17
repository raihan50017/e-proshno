using System.Net;
using System.Threading.RateLimiting;
using EProshno.Core.Auth;
using EProshno.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace EProshno.Api.Common;

/// <summary>Role-based authorization policies.</summary>
public static class Policies
{
    /// <summary>Any active member (Owner, Admin, Teacher) of the institution in the token.</summary>
    public const string Member = "member";

    /// <summary>Owner or Admin of the active institution.</summary>
    public const string InstitutionAdmin = "institution-admin";

    public const string InstitutionOwner = "institution-owner";
    public const string ContentTeam = "content-team";
    public const string ContentEditor = "content-editor";
    public const string ContentReviewer = "content-reviewer";
    public const string SuperAdmin = "super-admin";

    /// <summary>SuperAdmin or Support (platform back office).</summary>
    public const string Staff = "staff";
}

public static class RateLimits
{
    public const string Otp = "otp";
    public const string Login = "login";
    public const string Ipn = "ipn";
    public const string Uploads = "uploads";
    public const string Copy = "copy";
}

public static class AuthSetup
{
    public const string RefreshCookie = "ep.rt";
    public const string RefreshCookiePath = "/api/v1/auth";

    /// <summary>Required on cookie-authenticated auth calls; a cross-site form cannot set it.</summary>
    public const string RefreshHeader = "X-EP-Session";

    public static IServiceCollection AddAppAuth(this IServiceCollection services, IConfiguration config)
    {
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtOptions>>((o, jwt) =>
            {
                o.MapInboundClaims = false;
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = jwt.Value.Issuer,
                    ValidAudience = jwt.Value.Audience,
                    IssuerSigningKey = jwt.Value.GetSigningKey(),
                    ValidateIssuerSigningKey = true,
                    NameClaimType = AppClaims.Name,
                    RoleClaimType = AppClaims.Role,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(Policies.Member, p => p
                .RequireAuthenticatedUser()
                .RequireClaim(AppClaims.Institution)
                .RequireRole(Roles.Owner, Roles.Admin, Roles.Teacher))
            .AddPolicy(Policies.InstitutionAdmin, p => p
                .RequireAuthenticatedUser()
                .RequireClaim(AppClaims.Institution)
                .RequireRole(Roles.Owner, Roles.Admin))
            .AddPolicy(Policies.InstitutionOwner, p => p
                .RequireAuthenticatedUser()
                .RequireClaim(AppClaims.Institution)
                .RequireRole(Roles.Owner))
            .AddPolicy(Policies.ContentTeam, p => p.RequireRole(Roles.SuperAdmin, Roles.ContentEditor, Roles.ContentReviewer))
            .AddPolicy(Policies.ContentEditor, p => p.RequireRole(Roles.SuperAdmin, Roles.ContentEditor))
            .AddPolicy(Policies.ContentReviewer, p => p.RequireRole(Roles.SuperAdmin, Roles.ContentReviewer))
            .AddPolicy(Policies.SuperAdmin, p => p.RequireRole(Roles.SuperAdmin))
            .AddPolicy(Policies.Staff, p => p.RequireRole(Roles.SuperAdmin, Roles.Support));

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.AddPolicy(RateLimits.Otp, http => Fixed(http, 5, TimeSpan.FromMinutes(10)));
            o.AddPolicy(RateLimits.Login, http => Fixed(http, 10, TimeSpan.FromMinutes(1)));
            o.AddPolicy(RateLimits.Ipn, http => Fixed(http, 60, TimeSpan.FromMinutes(1)));
            o.AddPolicy(RateLimits.Uploads, http => Fixed(http, 30, TimeSpan.FromMinutes(10), byUser: true));
            o.AddPolicy(RateLimits.Copy, http => Fixed(http, 60, TimeSpan.FromMinutes(10), byUser: true));
        });

        return services;
    }

    private static RateLimitPartition<string> Fixed(HttpContext http, int permits, TimeSpan window, bool byUser = false)
    {
        var key = byUser && http.User.FindFirst(AppClaims.Subject)?.Value is { } sub
            ? "u:" + sub
            : "ip:" + (http.Connection.RemoteIpAddress ?? IPAddress.Loopback);
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permits,
            Window = window,
            QueueLimit = 0,
        });
    }

    public static void WriteRefreshCookie(this HttpContext http, AuthSession session) =>
        http.Response.Cookies.Append(RefreshCookie, session.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = http.Request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = RefreshCookiePath,
            Expires = session.RefreshTokenExpiresAt,
            IsEssential = true,
        });

    public static void DeleteRefreshCookie(this HttpContext http) =>
        http.Response.Cookies.Delete(RefreshCookie, new CookieOptions
        {
            HttpOnly = true,
            Secure = http.Request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = RefreshCookiePath,
        });

    public static string? ReadRefreshCookie(this HttpContext http) =>
        http.Request.Headers.ContainsKey(RefreshHeader) && http.Request.Cookies.TryGetValue(RefreshCookie, out var token)
            ? token
            : null;
}
