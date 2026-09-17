using System.Security.Cryptography;
using System.Text;
using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace EProshno.Infrastructure.Auth;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "e-proshno";
    public string Audience { get; set; } = "e-proshno-spa";

    /// <summary>HMAC-SHA256 key, at least 32 bytes. Set through configuration/secrets, never committed for production.</summary>
    public string SigningKey { get; set; } = "";

    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 14;

    public SymmetricSecurityKey GetSigningKey()
    {
        var bytes = Encoding.UTF8.GetBytes(SigningKey);
        if (bytes.Length < 32)
        {
            throw new InvalidOperationException("Jwt:SigningKey must be at least 32 bytes.");
        }

        return new SymmetricSecurityKey(bytes);
    }
}

public sealed record AuthSession(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    Guid UserId,
    Guid? InstitutionId);

/// <summary>
/// Issues short-lived access tokens (role-based claims) and rotating refresh tokens. A refresh token can be used
/// once; presenting a spent token revokes its whole family (theft detection).
/// </summary>
public sealed class TokenService(
    AppDbContext db,
    UserManager<AppUser> users,
    IOptions<JwtOptions> options,
    TimeProvider clock)
{
    private readonly JwtOptions _options = options.Value;
    private readonly JsonWebTokenHandler _handler = new();

    public async Task<AuthSession> IssueAsync(AppUser user, Guid? preferredInstitutionId, string? userAgent, CancellationToken ct)
    {
        var membership = await ResolveMembershipAsync(user, preferredInstitutionId, ct);
        var now = clock.GetUtcNow();
        user.LastLoginAt = now;
        user.LastInstitutionId = membership?.InstitutionId ?? user.LastInstitutionId;
        await users.UpdateAsync(user);

        return await CreateSessionAsync(user, membership, IdGen.New(), userAgent, previous: null, ct);
    }

    public async Task<AuthSession?> RefreshAsync(string refreshToken, Guid? switchToInstitutionId, string? userAgent, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var hash = Hash(refreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null)
        {
            return null;
        }

        if (stored.RevokedAt is not null)
        {
            // Reuse of a rotated token: assume theft and end every session in the family.
            await RevokeFamilyAsync(stored.UserId, stored.FamilyId, now, ct);
            return null;
        }

        if (stored.ExpiresAt <= now)
        {
            return null;
        }

        var user = await users.FindByIdAsync(stored.UserId.ToString());
        if (user is null || await users.IsLockedOutAsync(user))
        {
            return null;
        }

        var membership = await ResolveMembershipAsync(user, switchToInstitutionId ?? stored.InstitutionId, ct);
        if (switchToInstitutionId is { } wanted && membership?.InstitutionId != wanted)
        {
            throw AppException.Forbidden(Messages.NotAMember);
        }

        if (switchToInstitutionId is not null)
        {
            user.LastInstitutionId = switchToInstitutionId;
            await users.UpdateAsync(user);
        }

        return await CreateSessionAsync(user, membership, stored.FamilyId, userAgent, stored, ct);
    }

    public async Task RevokeAsync(string refreshToken, CancellationToken ct)
    {
        var hash = Hash(refreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is not null)
        {
            await RevokeFamilyAsync(stored.UserId, stored.FamilyId, clock.GetUtcNow(), ct);
        }
    }

    public async Task RevokeAllAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
    }

    private async Task<AuthSession> CreateSessionAsync(
        AppUser user, Membership? membership, Guid familyId, string? userAgent, RefreshToken? previous, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var platformRoles = await users.GetRolesAsync(user);
        var roles = platformRoles.ToList();
        if (membership is not null)
        {
            roles.Add(membership.Role.ToString());
        }

        var accessExpires = now.AddMinutes(_options.AccessTokenMinutes);
        var claims = new Dictionary<string, object>
        {
            [AppClaims.Subject] = user.Id.ToString(),
            [AppClaims.Name] = user.FullName,
            [AppClaims.SessionId] = familyId.ToString(),
            [AppClaims.Role] = roles.ToArray(),
        };
        if (membership is not null)
        {
            claims[AppClaims.Institution] = membership.InstitutionId.ToString();
        }

        var accessToken = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = accessExpires.UtcDateTime,
            Claims = claims,
            SigningCredentials = new SigningCredentials(_options.GetSigningKey(), SecurityAlgorithms.HmacSha256),
        });

        var refreshToken = Base64Url(RandomNumberGenerator.GetBytes(48));
        var refreshExpires = now.AddDays(_options.RefreshTokenDays);
        var entity = new RefreshToken
        {
            Id = IdGen.New(),
            UserId = user.Id,
            TokenHash = Hash(refreshToken),
            FamilyId = familyId,
            InstitutionId = membership?.InstitutionId,
            CreatedAt = now,
            ExpiresAt = refreshExpires,
            UserAgent = userAgent is { Length: > 300 } ? userAgent[..300] : userAgent,
        };
        db.RefreshTokens.Add(entity);

        if (previous is not null)
        {
            previous.RevokedAt = now;
            previous.ReplacedById = entity.Id;
        }

        await db.SaveChangesAsync(ct);
        return new AuthSession(accessToken, accessExpires, refreshToken, refreshExpires, user.Id, membership?.InstitutionId);
    }

    private async Task<Membership?> ResolveMembershipAsync(AppUser user, Guid? preferred, CancellationToken ct)
    {
        var memberships = await db.Memberships
            .Where(m => m.UserId == user.Id && m.Status == MembershipStatus.Active)
            .OrderBy(m => m.JoinedAt)
            .ToListAsync(ct);

        return memberships.FirstOrDefault(m => m.InstitutionId == preferred)
            ?? memberships.FirstOrDefault(m => m.InstitutionId == user.LastInstitutionId)
            ?? memberships.FirstOrDefault();
    }

    private async Task RevokeFamilyAsync(Guid userId, Guid familyId, DateTimeOffset now, CancellationToken ct) =>
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
