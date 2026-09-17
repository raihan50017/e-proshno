using System.Globalization;
using System.Security.Cryptography;
using EProshno.Api.Common;
using EProshno.Core.Auth;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Messaging;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EProshno.Api.Features.Institutions;

public sealed record MemberDto(
    Guid UserId,
    string FullName,
    string? Phone,
    string? Email,
    InstitutionRole Role,
    DateTimeOffset JoinedAt,
    DateTimeOffset? LastLoginAt,
    bool IsMe);

public static class ListMembers
{
    public sealed record Query : IQuery<IReadOnlyList<MemberDto>>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : IQueryHandler<Query, IReadOnlyList<MemberDto>>
    {
        public async Task<IReadOnlyList<MemberDto>> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var userId = tenant.UserId;
            return await (
                    from m in db.Memberships.AsNoTracking()
                    join u in db.Set<AppUser>() on m.UserId equals u.Id
                    where m.InstitutionId == institutionId && m.Status == MembershipStatus.Active
                    orderby m.Role, m.JoinedAt
                    select new MemberDto(u.Id, u.FullName, u.PhoneNumber, u.Email, m.Role, m.JoinedAt, u.LastLoginAt, u.Id == userId))
                .ToListAsync(ct);
        }
    }
}

public static class ChangeMemberRole
{
    public sealed record Request(InstitutionRole Role);

    public sealed record Command(Guid UserId, Request Body) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() =>
            RuleFor(x => x.Body.Role).Must(r => r is InstitutionRole.Admin or InstitutionRole.Teacher).WithMessage(Messages.CannotChangeOwner);
    }

    /// <summary>Admins manage teachers; only the owner promotes or demotes admins. The owner's role never changes.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var member = await MemberAsync(db, tenant.InstitutionId, command.UserId, ct);
            if (member.Role == InstitutionRole.Owner)
            {
                throw AppException.Conflict("member.owner", Messages.CannotChangeOwner);
            }

            var touchesAdmin = member.Role == InstitutionRole.Admin || command.Body.Role == InstitutionRole.Admin;
            if (touchesAdmin && !tenant.IsInRole(Roles.Owner))
            {
                throw AppException.Forbidden();
            }

            member.Role = command.Body.Role;
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }

    internal static async Task<Membership> MemberAsync(AppDbContext db, Guid institutionId, Guid userId, CancellationToken ct) =>
        await db.Memberships
            .Where(m => m.InstitutionId == institutionId && m.UserId == userId && m.Status == MembershipStatus.Active)
            .FirstOr404Async(ct);
}

public static class RemoveMember
{
    public sealed record Command(Guid UserId) : ICommand<Unit>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            if (command.UserId == tenant.UserId)
            {
                throw AppException.Conflict("member.self", Messages.CannotRemoveSelf);
            }

            var member = await ChangeMemberRole.MemberAsync(db, tenant.InstitutionId, command.UserId, ct);
            if (member.Role == InstitutionRole.Owner)
            {
                throw AppException.Conflict("member.owner", Messages.CannotChangeOwner);
            }

            if (member.Role == InstitutionRole.Admin && !tenant.IsInRole(Roles.Owner))
            {
                throw AppException.Forbidden();
            }

            member.Status = MembershipStatus.Removed;
            member.RemovedAt = clock.GetUtcNow();

            // Their questions stay; their banks (the default one too) move to the remover so nothing is orphaned.
            await db.QuestionBanks
                .Where(b => b.OwnerId == command.UserId)
                .ExecuteUpdateAsync(s => s.SetProperty(b => b.OwnerId, tenant.UserId).SetProperty(b => b.IsDefault, false), ct);
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public sealed record InvitationDto(
    Guid Id,
    string? Name,
    string? Phone,
    string? Email,
    InstitutionRole Role,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt);

public static class CreateInvitation
{
    public sealed record Command(string? Name, string? Phone, string? Email, InstitutionRole Role) : ICommand<Response>;

    /// <summary>The token is shown once; only its hash is stored.</summary>
    public sealed record Response(Guid Id, string Token, string Link, bool SmsSent);

    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Name).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x.Role).Must(r => r is InstitutionRole.Admin or InstitutionRole.Teacher).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Phone).Must(p => PhoneNumbers.Normalize(p) is not null).WithMessage(Messages.InvalidPhone)
                .When(x => !string.IsNullOrWhiteSpace(x.Phone));
            RuleFor(x => x.Email).EmailAddress().WithMessage(Messages.InvalidEmail).MaximumLength(200)
                .When(x => !string.IsNullOrWhiteSpace(x.Email));
        }
    }

    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        IEntitlements entitlements,
        ISmsSender sms,
        IOptions<AppOptions> app,
        TimeProvider clock) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            if (command.Role == InstitutionRole.Admin && !tenant.IsInRole(Roles.Owner))
            {
                throw AppException.Forbidden();
            }

            await entitlements.AssertWithinLimitAsync(tenant.InstitutionId, LimitKey.Teachers, ct);

            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            var now = clock.GetUtcNow();
            var phone = PhoneNumbers.Normalize(command.Phone);
            var invitation = new Invitation
            {
                Id = IdGen.New(),
                InstitutionId = tenant.InstitutionId,
                Role = command.Role,
                Name = string.IsNullOrWhiteSpace(command.Name) ? null : command.Name.Trim(),
                Phone = phone,
                Email = string.IsNullOrWhiteSpace(command.Email) ? null : command.Email.Trim(),
                TokenHash = TokenService.Hash(token),
                Status = InvitationStatus.Pending,
                ExpiresAt = now + Lifetime,
                CreatedById = tenant.UserId,
                CreatedAt = now,
            };
            db.Invitations.Add(invitation);
            await db.SaveChangesAsync(ct);

            var link = $"{app.Value.PublicBaseUrl.TrimEnd('/')}/invite/{token}";
            if (phone is not null)
            {
                var institutionName = await db.Institutions.Where(i => i.Id == tenant.InstitutionId).Select(i => i.Name).FirstAsync(ct);
                await sms.SendAsync(phone, string.Format(CultureInfo.InvariantCulture, Messages.InvitationSms, institutionName, link), ct);
            }

            return new Response(invitation.Id, token, link, phone is not null);
        }
    }
}

public static class ListInvitations
{
    public sealed record Query : IQuery<IReadOnlyList<InvitationDto>>;

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : IQueryHandler<Query, IReadOnlyList<InvitationDto>>
    {
        public async Task<IReadOnlyList<InvitationDto>> Handle(Query query, CancellationToken ct)
        {
            var now = clock.GetUtcNow();
            return await db.Invitations.AsNoTracking()
                .Where(i => i.Status == InvitationStatus.Pending && i.ExpiresAt > now)
                .OrderByDescending(i => i.CreatedAt)
                .Select(i => new InvitationDto(i.Id, i.Name, i.Phone, i.Email, i.Role, i.ExpiresAt, i.CreatedAt))
                .ToListAsync(ct);
        }
    }
}

public static class RevokeInvitation
{
    public sealed record Command(Guid Id) : ICommand<Unit>;

    internal sealed class Handler(AppDbContext db) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var invitation = await db.Invitations.Where(i => i.Id == command.Id).FirstOr404Async(ct);
            invitation.Status = InvitationStatus.Revoked;
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public static class GetInvitation
{
    public sealed record Query(string Token) : IQuery<Response>;

    public sealed record Response(string InstitutionName, InstitutionRole Role, string? InvitedName, bool IsValid);

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : IQueryHandler<Query, Response>
    {
        public async Task<Response> Handle(Query query, CancellationToken ct)
        {
            var hash = TokenService.Hash(query.Token);

            // Anonymous lookup across tenants, authorised by possession of the unguessable token (like a signed link).
            var invitation = await db.Invitations.AsNoTracking().IgnoreQueryFilters()
                .Where(i => i.TokenHash == hash)
                .Select(i => new { i.Status, i.ExpiresAt, i.Role, i.Name, InstitutionName = i.Institution!.Name })
                .FirstOrDefaultAsync(ct);
            if (invitation is null)
            {
                throw new AppException("invitation.invalid", Messages.InvitationInvalid, 404);
            }

            var valid = invitation.Status == InvitationStatus.Pending && invitation.ExpiresAt > clock.GetUtcNow();
            return new Response(invitation.InstitutionName, invitation.Role, invitation.Name, valid);
        }
    }
}

public static class AcceptInvitation
{
    public sealed record Command(string Token) : ICommand<Response>;

    /// <summary>The client then calls /auth/refresh with this id to switch its session.</summary>
    public sealed record Response(Guid InstitutionId);

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var hash = TokenService.Hash(command.Token);
            var now = clock.GetUtcNow();

            // Authorised by the unguessable token; the invitation belongs to a tenant the user may not have yet.
            var invitation = await db.Invitations.IgnoreQueryFilters().FirstOrDefaultAsync(i => i.TokenHash == hash, ct);
            if (invitation is null || invitation.Status != InvitationStatus.Pending || invitation.ExpiresAt <= now)
            {
                throw new AppException("invitation.invalid", Messages.InvitationInvalid, 400);
            }

            var userId = tenant.UserId;
            var membership = await db.Memberships.FirstOrDefaultAsync(
                m => m.InstitutionId == invitation.InstitutionId && m.UserId == userId, ct);
            if (membership is { Status: MembershipStatus.Active })
            {
                throw AppException.Conflict("invitation.already_member", Messages.AlreadyMember);
            }

            if (membership is null)
            {
                db.Memberships.Add(new Membership
                {
                    Id = IdGen.New(),
                    InstitutionId = invitation.InstitutionId,
                    UserId = userId,
                    Role = invitation.Role,
                    Status = MembershipStatus.Active,
                    JoinedAt = now,
                });
            }
            else
            {
                membership.Status = MembershipStatus.Active;
                membership.Role = invitation.Role;
                membership.JoinedAt = now;
                membership.RemovedAt = null;
            }

            invitation.Status = InvitationStatus.Accepted;
            invitation.AcceptedById = userId;
            invitation.AcceptedAt = now;
            await db.SaveChangesAsync(ct);
            return new Response(invitation.InstitutionId);
        }
    }
}

public sealed record ActivityDto(
    Guid Id,
    string? ActorName,
    string Action,
    string EntityType,
    string? EntityId,
    IReadOnlyList<string> ChangedFields,
    DateTimeOffset CreatedAt);

public static class ListActivity
{
    public sealed record Query(Guid? UserId, string? Cursor, int? Limit) : IQuery<CursorPage<ActivityDto>>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : IQueryHandler<Query, CursorPage<ActivityDto>>
    {
        public async Task<CursorPage<ActivityDto>> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tenant.InstitutionId;
            var logs = db.AuditLogs.AsNoTracking().Where(a => a.InstitutionId == institutionId);
            if (query.UserId is { } userId)
            {
                logs = logs.Where(a => a.ActorId == userId);
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                logs = logs.Where(a => a.Id.CompareTo(cursor) < 0);
            }

            var page = await (
                    from a in logs
                    join u in db.Set<AppUser>() on a.ActorId equals u.Id into actors
                    from u in actors.DefaultIfEmpty()
                    orderby a.Id descending
                    select new { a.Id, ActorName = u != null ? u.FullName : null, a.Action, a.EntityType, a.EntityId, a.Meta, a.CreatedAt })
                .ToPageAsync(r => Paging.Cursor(r.Id), query.Limit, ct);

            return new CursorPage<ActivityDto>(
                page.Items.Select(r => new ActivityDto(
                    r.Id,
                    r.ActorName,
                    r.Action,
                    r.EntityType,
                    r.EntityId,
                    r.Meta is null ? [] : System.Text.Json.JsonSerializer.Deserialize<string[]>(r.Meta) ?? [],
                    r.CreatedAt)).ToList(),
                page.NextCursor);
        }
    }
}
