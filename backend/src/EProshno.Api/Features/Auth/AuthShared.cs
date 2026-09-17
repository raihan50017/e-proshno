using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Messaging;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ZiggyCreatures.Caching.Fusion;

namespace EProshno.Api.Features.Auth;

public sealed record InstitutionMembershipDto(Guid InstitutionId, string Name, InstitutionRole Role, InstitutionType Type, string? LogoUrl);

public sealed record MeResponse(
    Guid Id,
    string FullName,
    string? Phone,
    string? Email,
    bool PhoneConfirmed,
    IReadOnlyList<string> PlatformRoles,
    IReadOnlyList<InstitutionMembershipDto> Institutions,
    InstitutionMembershipDto? ActiveInstitution);

/// <summary>Returned by every call that starts or refreshes a session. The refresh token travels in a cookie.</summary>
public sealed record SessionResponse(string AccessToken, DateTimeOffset ExpiresAt, MeResponse Me);

/// <summary>Login and registration either finish with a session or ask for the SMS code first.</summary>
public sealed record AuthStepResponse(bool OtpRequired, string? Phone, SessionResponse? Session);

/// <summary>Handler result: the session (for the cookie) plus the profile.</summary>
public sealed record SessionResult(AuthSession Session, MeResponse Me)
{
    public SessionResponse ToResponse() => new(Session.AccessToken, Session.AccessTokenExpiresAt, Me);
}

public sealed record AuthStepResult(bool OtpRequired, string? Phone, SessionResult? Session)
{
    public AuthStepResponse ToResponse() => new(OtpRequired, Phone, Session?.ToResponse());
}

public static class OtpPurposes
{
    public const string Login = "login";
    public const string Reset = "reset";
}

public sealed class MeReader(AppDbContext db, UserManager<AppUser> users)
{
    public async Task<MeResponse> ReadAsync(Guid userId, Guid? activeInstitutionId, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(userId.ToString()) ?? throw AppException.NotFound();
        var roles = await users.GetRolesAsync(user);
        var memberships = await db.Memberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Active)
            .OrderBy(m => m.JoinedAt)
            .Select(m => new InstitutionMembershipDto(
                m.InstitutionId, m.Institution!.Name, m.Role, m.Institution.Type, m.Institution.LogoKey))
            .ToListAsync(ct);
        memberships = memberships.Select(m => m with { LogoUrl = MediaUrls.For(m.LogoUrl) }).ToList();

        return new MeResponse(
            user.Id,
            user.FullName,
            user.PhoneNumber,
            user.Email,
            user.PhoneNumberConfirmed,
            roles.Where(r => Roles.Platform.Contains(r)).ToList(),
            memberships,
            memberships.FirstOrDefault(m => m.InstitutionId == activeInstitutionId));
    }

    public async Task<SessionResult> SessionAsync(AuthSession session, CancellationToken ct) =>
        new(session, await ReadAsync(session.UserId, session.InstitutionId, ct));
}

/// <summary>Sends login/reset codes by SMS, at most three per phone number in ten minutes.</summary>
public sealed class OtpSender(UserManager<AppUser> users, ISmsSender sms, IFusionCache cache)
{
    private const int MaxPerWindow = 3;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(10);

    public async Task SendAsync(AppUser user, string purpose, CancellationToken ct)
    {
        var key = $"otp:{user.PhoneNumber}";
        var sent = await cache.GetOrDefaultAsync(key, 0, token: ct);
        if (sent >= MaxPerWindow)
        {
            throw new AppException("auth.otp_rate_limited", Messages.TooManyRequests, 429);
        }

        await cache.SetAsync(key, sent + 1, Window, token: ct);
        var code = await users.GenerateUserTokenAsync(user, TokenOptions.DefaultPhoneProvider, purpose);
        await sms.SendAsync(user.PhoneNumber!, string.Format(System.Globalization.CultureInfo.InvariantCulture, Messages.OtpSmsText, BanglaText.ToBanglaDigits(code)), ct);
    }

    public async Task<bool> VerifyAsync(AppUser user, string purpose, string code)
    {
        if (await users.IsLockedOutAsync(user))
        {
            throw new AppException("auth.locked", Messages.AccountLocked, 403);
        }

        var ok = await users.VerifyUserTokenAsync(user, TokenOptions.DefaultPhoneProvider, purpose, BanglaText.ToAsciiDigits(code).Trim());
        if (ok)
        {
            await users.ResetAccessFailedCountAsync(user);
        }
        else
        {
            await users.AccessFailedAsync(user);
        }

        return ok;
    }
}

public static class AuthRules
{
    public static IRuleBuilderOptions<T, string> ValidPassword<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage(Messages.WeakPassword)
            .MinimumLength(8).WithMessage(Messages.WeakPassword)
            .MaximumLength(100).WithMessage(Messages.TooLong)
            .Must(p => p is not null && p.Any(char.IsLetter) && p.Any(char.IsDigit)).WithMessage(Messages.WeakPassword);

    public static IRuleBuilderOptions<T, string?> ValidPhone<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(p => PhoneNumbers.Normalize(p) is not null).WithMessage(Messages.InvalidPhone);

    public static async Task<AppUser?> FindByPhoneAsync(this UserManager<AppUser> users, string phone, CancellationToken ct)
    {
        var normalized = PhoneNumbers.Normalize(phone);
        return normalized is null ? null : await users.Users.FirstOrDefaultAsync(u => u.PhoneNumber == normalized, ct);
    }

    /// <summary>Turns Identity errors into field errors with Bangla messages.</summary>
    public static ValidationException ToValidation(this IdentityResult result, string passwordField)
    {
        var failures = result.Errors.Select(e => e.Code switch
        {
            "PasswordMismatch" => new ValidationFailure("currentPassword", Messages.WrongCurrentPassword),
            var c when c.StartsWith("Password", StringComparison.Ordinal) => new ValidationFailure(passwordField, Messages.WeakPassword),
            "DuplicateEmail" => new ValidationFailure("email", Messages.EmailTaken),
            _ => new ValidationFailure("", Messages.InvalidValue),
        });
        return new ValidationException(failures.DistinctBy(f => f.PropertyName));
    }
}
