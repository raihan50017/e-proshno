using System.Text.RegularExpressions;
using EProshno.Api.Common;
using EProshno.Api.Features.Billing;
using EProshno.Core.Auth;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Platform;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Persistence;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Admin;

// Every handler in this file is a platform back-office feature: reading across institutions is intended, so the
// tenant query filter is bypassed explicitly (IgnoreQueryFilters) and only staff policies can reach these endpoints.

public sealed record AdminOverview(
    int Users,
    int Institutions,
    int PaidSubscriptions,
    int PendingPayments,
    long RevenueThisMonthPoisha,
    int PublishedQuestions,
    int QuestionsInReview,
    int OpenReports);

public static class GetAdminOverview
{
    public sealed record Query : IQuery<AdminOverview>;

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : IQueryHandler<Query, AdminOverview>
    {
        public async Task<AdminOverview> Handle(Query query, CancellationToken ct)
        {
            var now = clock.GetUtcNow();
            var monthStart = BdTime.MonthStartUtc(now);
            var payments = db.Payments.IgnoreQueryFilters();
            return new AdminOverview(
                await db.Set<AppUser>().CountAsync(ct),
                await db.Institutions.CountAsync(ct),
                await db.Subscriptions.IgnoreQueryFilters().CountAsync(
                    s => s.Status == SubscriptionStatus.Active && s.StartsAt <= now && s.EndsAt > now
                         && s.Plan!.Pricing != PlanPricing.Free && s.Plan.Code != TrialService.TrialPlanCode, ct),
                await payments.CountAsync(p => p.Status == PaymentStatus.Pending, ct),
                await payments.Where(p => p.Status == PaymentStatus.Paid && p.PaidAt >= monthStart).SumAsync(p => p.AmountPoisha, ct),
                await db.Questions.CountAsync(q => q.BankId == null && q.Status == ContentStatus.Published, ct),
                await db.Questions.CountAsync(q => q.BankId == null && q.Status == ContentStatus.InReview, ct),
                await db.QuestionReports.IgnoreQueryFilters().CountAsync(r => r.Status == ReportStatus.Open, ct));
        }
    }
}

public sealed record AdminInstitutionDto(
    Guid Id,
    string Name,
    InstitutionType Type,
    string? Phone,
    string? OwnerName,
    string? OwnerPhone,
    int Members,
    string? ActivePlan,
    DateTimeOffset? PlanEndsAt,
    DateTimeOffset CreatedAt);

public static class ListAdminInstitutions
{
    public sealed record Query(string? Keyword, string? Cursor, int? Limit) : IQuery<CursorPage<AdminInstitutionDto>>;

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : IQueryHandler<Query, CursorPage<AdminInstitutionDto>>
    {
        public async Task<CursorPage<AdminInstitutionDto>> Handle(Query query, CancellationToken ct)
        {
            var now = clock.GetUtcNow();
            var institutions = db.Institutions.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(query.Keyword))
            {
                var pattern = $"%{LikePattern.Escape(query.Keyword.Trim())}%";
                institutions = institutions.Where(i => EF.Functions.ILike(i.Name, pattern, @"\") || (i.Phone != null && EF.Functions.ILike(i.Phone, pattern, @"\")));
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                institutions = institutions.Where(i => i.Id.CompareTo(cursor) < 0);
            }

            var subscriptions = db.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.Status == SubscriptionStatus.Active && s.StartsAt <= now && s.EndsAt > now);
            return await institutions
                .OrderByDescending(i => i.Id)
                .Select(i => new AdminInstitutionDto(
                    i.Id,
                    i.Name,
                    i.Type,
                    i.Phone,
                    db.Memberships.Where(m => m.InstitutionId == i.Id && m.Role == InstitutionRole.Owner)
                        .Join(db.Set<AppUser>(), m => m.UserId, u => u.Id, (m, u) => u.FullName).FirstOrDefault(),
                    db.Memberships.Where(m => m.InstitutionId == i.Id && m.Role == InstitutionRole.Owner)
                        .Join(db.Set<AppUser>(), m => m.UserId, u => u.Id, (m, u) => u.PhoneNumber).FirstOrDefault(),
                    db.Memberships.Count(m => m.InstitutionId == i.Id && m.Status == MembershipStatus.Active),
                    subscriptions.Where(s => s.InstitutionId == i.Id).OrderByDescending(s => s.EndsAt).Select(s => s.Plan!.NameBn).FirstOrDefault(),
                    subscriptions.Where(s => s.InstitutionId == i.Id).Max(s => (DateTimeOffset?)s.EndsAt),
                    i.CreatedAt))
                .ToPageAsync(i => Paging.Cursor(i.Id), query.Limit, ct);
        }
    }
}

public sealed record AdminUserDto(
    Guid Id,
    string FullName,
    string? Phone,
    string? Email,
    bool PhoneConfirmed,
    IReadOnlyList<string> Roles,
    int Institutions,
    bool LockedOut,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);

public static class ListAdminUsers
{
    public sealed record Query(string? Keyword, string? Role, string? Cursor, int? Limit) : IQuery<CursorPage<AdminUserDto>>;

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : IQueryHandler<Query, CursorPage<AdminUserDto>>
    {
        public async Task<CursorPage<AdminUserDto>> Handle(Query query, CancellationToken ct)
        {
            var now = clock.GetUtcNow();
            var users = db.Set<AppUser>().AsNoTracking();
            if (!string.IsNullOrWhiteSpace(query.Keyword))
            {
                var keyword = BanglaText.ToAsciiDigits(query.Keyword.Trim());
                var pattern = $"%{LikePattern.Escape(keyword)}%";
                users = users.Where(u => EF.Functions.ILike(u.FullName, pattern, @"\")
                                         || (u.PhoneNumber != null && EF.Functions.ILike(u.PhoneNumber, pattern, @"\"))
                                         || (u.Email != null && EF.Functions.ILike(u.Email, pattern, @"\")));
            }

            if (!string.IsNullOrWhiteSpace(query.Role))
            {
                var role = query.Role;
                users = users.Where(u => db.UserRoles.Any(ur => ur.UserId == u.Id && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == role)));
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                users = users.Where(u => u.Id.CompareTo(cursor) < 0);
            }

            return await users
                .OrderByDescending(u => u.Id)
                .Select(u => new AdminUserDto(
                    u.Id,
                    u.FullName,
                    u.PhoneNumber,
                    u.Email,
                    u.PhoneNumberConfirmed,
                    db.UserRoles.Where(ur => ur.UserId == u.Id)
                        .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => r.Name!)
                        .ToList(),
                    db.Memberships.Count(m => m.UserId == u.Id && m.Status == MembershipStatus.Active),
                    u.LockoutEnd != null && u.LockoutEnd > now,
                    u.CreatedAt,
                    u.LastLoginAt))
                .ToPageAsync(u => Paging.Cursor(u.Id), query.Limit, ct);
        }
    }
}

public static class SetUserRoles
{
    public sealed record Request(IReadOnlyList<string> Roles);

    public sealed record Command(Guid UserId, Request Body) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() =>
            RuleFor(x => x.Body.Roles).NotNull().WithMessage(Messages.Required)
                .Must(r => r is null || r.All(Roles.Platform.Contains)).WithMessage(Messages.InvalidValue);
    }

    /// <summary>Platform roles take effect at the user's next token refresh (within 15 minutes).</summary>
    internal sealed class Handler(UserManager<AppUser> users, ITenantContext tenant, TokenService tokens) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByIdAsync(command.UserId.ToString()) ?? throw AppException.NotFound();
            var wanted = command.Body.Roles.Distinct().ToList();
            if (user.Id == tenant.UserId && !wanted.Contains(Roles.SuperAdmin))
            {
                throw AppException.Conflict("admin.self_demote", Messages.Forbidden);
            }

            var current = (await users.GetRolesAsync(user)).Where(Roles.Platform.Contains).ToList();
            var removed = current.Except(wanted).ToList();
            var added = wanted.Except(current).ToList();
            if (removed.Count > 0)
            {
                await users.RemoveFromRolesAsync(user, removed);
            }

            if (added.Count > 0)
            {
                await users.AddToRolesAsync(user, added);
            }

            if (removed.Count > 0)
            {
                // Removing access should not wait for the refresh token to expire.
                await tokens.RevokeAllAsync(user.Id, ct);
            }

            return Unit.Value;
        }
    }
}

public static class UnlockUser
{
    public sealed record Command(Guid UserId) : ICommand<Unit>;

    internal sealed class Handler(UserManager<AppUser> users) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var user = await users.FindByIdAsync(command.UserId.ToString()) ?? throw AppException.NotFound();
            await users.SetLockoutEndDateAsync(user, null);
            await users.ResetAccessFailedCountAsync(user);
            return Unit.Value;
        }
    }
}

public sealed record AdminPlanDto(PlanDto Plan, bool IsActive, int Sort, int ActiveSubscriptions);

public static class ListAdminPlans
{
    public sealed record Query : IQuery<IReadOnlyList<AdminPlanDto>>;

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : IQueryHandler<Query, IReadOnlyList<AdminPlanDto>>
    {
        public async Task<IReadOnlyList<AdminPlanDto>> Handle(Query query, CancellationToken ct)
        {
            var now = clock.GetUtcNow();
            var plans = await db.Plans.AsNoTracking().OrderBy(p => p.Sort).ToListAsync(ct);
            var active = await db.Subscriptions.IgnoreQueryFilters()
                .Where(s => s.Status == SubscriptionStatus.Active && s.StartsAt <= now && s.EndsAt > now)
                .GroupBy(s => s.PlanId)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.Key, g => g.Count, ct);
            var levels = await db.Levels.AsNoTracking().ToDictionaryAsync(l => l.Slug, l => l.NameBn, ct);
            return plans.Select(p => new AdminPlanDto(ListPlans.ToDto(p, levels), p.IsActive, p.Sort, active.GetValueOrDefault(p.Id))).ToList();
        }
    }
}

public static partial class SavePlan
{
    public sealed record Request(
        string Code,
        string NameBn,
        string? DescriptionBn,
        PlanPricing Pricing,
        long PricePoisha,
        int DurationDays,
        int VatRateBasisPoints,
        PlanLimits Limits,
        bool IsActive,
        int Sort);

    public sealed record Command(Guid? Id, Request Body) : ICommand<AdminPlanDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.Code).NotEmpty().WithMessage(Messages.Required).Matches(CodePattern()).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.NameBn).NotEmpty().WithMessage(Messages.Required).MaximumLength(120).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.DescriptionBn).MaximumLength(500).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.Pricing).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.PricePoisha).InclusiveBetween(0, 100_000_000).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.PricePoisha).Equal(0).WithMessage(Messages.InvalidValue).When(x => x.Body.Pricing == PlanPricing.Free);
            RuleFor(x => x.Body.PricePoisha).GreaterThan(0).WithMessage(Messages.InvalidValue).When(x => x.Body.Pricing != PlanPricing.Free && x.Body.IsActive);
            RuleFor(x => x.Body.DurationDays).InclusiveBetween(1, 3660).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.VatRateBasisPoints).InclusiveBetween(0, 5000).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Body.Limits).NotNull().WithMessage(Messages.Required);
            RuleFor(x => x.Body.Limits.LevelSlugs).NotNull().WithMessage(Messages.Required).When(x => x.Body.Limits is not null);
            RuleFor(x => x.Body.Limits).Must(l => new[] { l.MaxSubjects, l.SavedSets, l.Teachers, l.Students, l.CustomBanks, l.CustomQuestions, l.ImportsPerMonth, l.OnlineExamsPerMonth }
                    .All(v => v is null or >= 0) && l.OmrTokensIncluded >= 0)
                .WithMessage(Messages.InvalidValue)
                .When(x => x.Body.Limits is not null);
        }
    }

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : ICommandHandler<Command, AdminPlanDto>
    {
        public async Task<AdminPlanDto> Handle(Command command, CancellationToken ct)
        {
            var body = command.Body;
            if (body.Limits.LevelSlugs.Length > 0)
            {
                var slugs = body.Limits.LevelSlugs.Distinct().ToList();
                if (await db.Levels.CountAsync(l => slugs.Contains(l.Slug), ct) != slugs.Count)
                {
                    throw Guard.Invalid("limits.levelSlugs", Messages.InvalidValue);
                }
            }

            if (await db.Plans.AnyAsync(p => p.Code == body.Code && p.Id != command.Id, ct))
            {
                throw Guard.Invalid("code", Messages.InvalidValue);
            }

            var now = clock.GetUtcNow();
            Plan plan;
            if (command.Id is { } id)
            {
                plan = await db.Plans.Where(p => p.Id == id).FirstOr404Async(ct);
            }
            else
            {
                plan = new Plan { Id = IdGen.New(), CreatedAt = now };
                db.Plans.Add(plan);
            }

            plan.Code = body.Code;
            plan.NameBn = body.NameBn.Trim();
            plan.DescriptionBn = string.IsNullOrWhiteSpace(body.DescriptionBn) ? null : body.DescriptionBn.Trim();
            plan.Pricing = body.Pricing;
            plan.PricePoisha = body.PricePoisha;
            plan.DurationDays = body.DurationDays;
            plan.VatRateBasisPoints = body.VatRateBasisPoints;
            plan.Limits = body.Limits with { LevelSlugs = body.Limits.LevelSlugs.Distinct().ToArray() };
            plan.IsActive = body.IsActive;
            plan.Sort = body.Sort;
            plan.UpdatedAt = now;
            await db.SaveChangesAsync(ct);

            // Cached entitlements pick up new limits within five minutes.
            var levels = await db.Levels.AsNoTracking().ToDictionaryAsync(l => l.Slug, l => l.NameBn, ct);
            return new AdminPlanDto(ListPlans.ToDto(plan, levels), plan.IsActive, plan.Sort, 0);
        }
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,39}$", RegexOptions.None, matchTimeoutMilliseconds: 100)]
    private static partial Regex CodePattern();
}

public sealed record AdminPaymentDto(PaymentDto Payment, Guid InstitutionId, string InstitutionName);

public static class ListAdminPayments
{
    public sealed record Query(PaymentStatus? Status, string? TranId, string? Cursor, int? Limit) : IQuery<CursorPage<AdminPaymentDto>>;

    internal sealed class Handler(AppDbContext db, BillingReader reader) : IQueryHandler<Query, CursorPage<AdminPaymentDto>>
    {
        public async Task<CursorPage<AdminPaymentDto>> Handle(Query query, CancellationToken ct)
        {
            var payments = db.Payments.IgnoreQueryFilters().AsNoTracking();
            if (query.Status is { } status)
            {
                payments = payments.Where(p => p.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(query.TranId))
            {
                var tranId = query.TranId.Trim();
                payments = payments.Where(p => p.TranId == tranId);
            }

            if (Paging.GuidCursor(query.Cursor) is { } cursor)
            {
                payments = payments.Where(p => p.Id.CompareTo(cursor) < 0);
            }

            var page = await payments
                .OrderByDescending(p => p.Id)
                .Select(p => new { p.Id, p.InstitutionId, InstitutionName = db.Institutions.Where(i => i.Id == p.InstitutionId).Select(i => i.Name).FirstOrDefault() })
                .ToPageAsync(p => Paging.Cursor(p.Id), query.Limit, ct);

            var ids = page.Items.Select(p => p.Id).ToList();
            var dtos = await reader.Payments(db.Payments.IgnoreQueryFilters().Where(p => ids.Contains(p.Id))).ToDictionaryAsync(p => p.Id, ct);
            return new CursorPage<AdminPaymentDto>(
                page.Items.Select(p => new AdminPaymentDto(dtos[p.Id], p.InstitutionId, p.InstitutionName ?? "")).ToList(),
                page.NextCursor);
        }
    }
}

public static class GrantSubscription
{
    public sealed record Command(Guid InstitutionId, Guid PlanId, int Days, IReadOnlyList<Guid> SubjectIds) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.InstitutionId).NotEmpty().WithMessage(Messages.Required);
            RuleFor(x => x.PlanId).NotEmpty().WithMessage(Messages.PlanNotFound);
            RuleFor(x => x.Days).InclusiveBetween(1, 3660).WithMessage(Messages.InvalidValue);
            RuleFor(x => x.SubjectIds).NotNull().WithMessage(Messages.Required)
                .Must(s => s is null || s.Count <= 100).WithMessage(Messages.InvalidValue);
        }
    }

    /// <summary>Support tool for offline payments and goodwill extensions; recorded in the audit log.</summary>
    internal sealed class Handler(AppDbContext db, IEntitlements entitlements, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            if (!await db.Institutions.AnyAsync(i => i.Id == command.InstitutionId, ct))
            {
                throw AppException.NotFound();
            }

            var plan = await db.Plans.AsNoTracking().FirstOrDefaultAsync(p => p.Id == command.PlanId, ct)
                       ?? throw AppException.NotFound(Messages.PlanNotFound);
            var subjectIds = plan.Pricing == PlanPricing.PerSubject ? command.SubjectIds.Distinct().ToList() : [];
            if (plan.Pricing == PlanPricing.PerSubject)
            {
                if (subjectIds.Count == 0)
                {
                    throw Guard.Invalid("subjectIds", Messages.SubjectsRequiredForPlan);
                }

                if (await db.Subjects.CountAsync(s => subjectIds.Contains(s.Id) && s.InstitutionId == null, ct) != subjectIds.Count)
                {
                    throw Guard.Invalid("subjectIds", Messages.SubjectNotFound);
                }
            }

            var now = clock.GetUtcNow();
            db.Subscriptions.Add(new Subscription
            {
                Id = IdGen.New(),
                InstitutionId = command.InstitutionId,
                PlanId = plan.Id,
                AllSubjects = plan.Pricing == PlanPricing.AllSubjects,
                StartsAt = now,
                EndsAt = now.AddDays(command.Days),
                Status = SubscriptionStatus.Active,
                CreatedAt = now,
                UpdatedAt = now,
                Subjects = subjectIds.Select(id => new SubscriptionSubject { SubjectId = id }).ToList(),
            });
            await db.SaveChangesAsync(ct);
            await entitlements.InvalidateAsync(command.InstitutionId, ct);
            return Unit.Value;
        }
    }
}

public sealed record AdminAnnouncementDto(
    Guid Id,
    string TitleBn,
    string BodyBn,
    string? LinkUrl,
    DateTimeOffset StartsAt,
    DateTimeOffset? EndsAt,
    bool IsActive,
    DateTimeOffset CreatedAt);

public static class ListAnnouncements
{
    public sealed record Query : IQuery<IReadOnlyList<AdminAnnouncementDto>>;

    internal sealed class Handler(AppDbContext db) : IQueryHandler<Query, IReadOnlyList<AdminAnnouncementDto>>
    {
        public async Task<IReadOnlyList<AdminAnnouncementDto>> Handle(Query query, CancellationToken ct) =>
            await db.Announcements.AsNoTracking()
                .OrderByDescending(a => a.StartsAt)
                .Take(200)
                .Select(a => new AdminAnnouncementDto(a.Id, a.TitleBn, a.BodyBn, a.LinkUrl, a.StartsAt, a.EndsAt, a.IsActive, a.CreatedAt))
                .ToListAsync(ct);
    }
}

public static class SaveAnnouncement
{
    public sealed record Request(string TitleBn, string BodyBn, string? LinkUrl, DateTimeOffset StartsAt, DateTimeOffset? EndsAt, bool IsActive);

    public sealed record Command(Guid? Id, Request Body) : ICommand<AdminAnnouncementDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Body.TitleBn).NotEmpty().WithMessage(Messages.Required).MaximumLength(150).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.BodyBn).NotEmpty().WithMessage(Messages.Required).MaximumLength(1000).WithMessage(Messages.TooLong);
            RuleFor(x => x.Body.LinkUrl).MaximumLength(500).WithMessage(Messages.TooLong)
                .Must(IsSafeLink).WithMessage(Messages.InvalidValue)
                .When(x => !string.IsNullOrWhiteSpace(x.Body.LinkUrl));
            RuleFor(x => x.Body.EndsAt).GreaterThan(x => x.Body.StartsAt).WithMessage(Messages.InvalidValue)
                .When(x => x.Body.EndsAt is not null);
        }

        /// <summary>In-app paths or https links only (never javascript: or data: URLs).</summary>
        public static bool IsSafeLink(string? url) =>
            url is not null
            && ((url.StartsWith('/') && !url.StartsWith("//", StringComparison.Ordinal))
                || (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps));
    }

    internal sealed class Handler(AppDbContext db, TimeProvider clock) : ICommandHandler<Command, AdminAnnouncementDto>
    {
        public async Task<AdminAnnouncementDto> Handle(Command command, CancellationToken ct)
        {
            Announcement a;
            if (command.Id is { } id)
            {
                a = await db.Announcements.Where(x => x.Id == id).FirstOr404Async(ct);
            }
            else
            {
                a = new Announcement { Id = IdGen.New(), CreatedAt = clock.GetUtcNow() };
                db.Announcements.Add(a);
            }

            var body = command.Body;
            a.TitleBn = body.TitleBn.Trim();
            a.BodyBn = body.BodyBn.Trim();
            a.LinkUrl = string.IsNullOrWhiteSpace(body.LinkUrl) ? null : body.LinkUrl.Trim();
            a.StartsAt = body.StartsAt.ToUniversalTime();
            a.EndsAt = body.EndsAt?.ToUniversalTime();
            a.IsActive = body.IsActive;
            await db.SaveChangesAsync(ct);
            return new AdminAnnouncementDto(a.Id, a.TitleBn, a.BodyBn, a.LinkUrl, a.StartsAt, a.EndsAt, a.IsActive, a.CreatedAt);
        }
    }
}

public static class DeleteAnnouncement
{
    public sealed record Command(Guid Id) : ICommand<Unit>;

    internal sealed class Handler(AppDbContext db) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var a = await db.Announcements.Where(x => x.Id == command.Id).FirstOr404Async(ct);
            db.Announcements.Remove(a);
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}

public static class AdminEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/admin").WithTags("Admin").RequireAuthorization(Policies.Staff);

        g.MapGet("/overview", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new GetAdminOverview.Query(), ct)))
            .WithName("getAdminOverview");

        g.MapGet("/institutions", async (string? keyword, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListAdminInstitutions.Query(keyword, cursor, limit), ct)))
            .WithName("listAdminInstitutions");

        g.MapGet("/users", async (string? keyword, string? role, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListAdminUsers.Query(keyword, role, cursor, limit), ct)))
            .WithName("listAdminUsers");

        g.MapPut("/users/{id:guid}/roles", async (Guid id, SetUserRoles.Request body, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new SetUserRoles.Command(id, body), ct);
                return TypedResults.NoContent();
            })
            .WithName("setUserRoles")
            .RequireAuthorization(Policies.SuperAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        g.MapPost("/users/{id:guid}/unlock", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new UnlockUser.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("unlockUser")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/plans", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListAdminPlans.Query(), ct)))
            .WithName("listAdminPlans");

        g.MapPost("/plans", async (SavePlan.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SavePlan.Command(null, body), ct)))
            .WithName("createPlan")
            .RequireAuthorization(Policies.SuperAdmin)
            .ProducesValidationProblem();

        g.MapPut("/plans/{id:guid}", async (Guid id, SavePlan.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SavePlan.Command(id, body), ct)))
            .WithName("updatePlan")
            .RequireAuthorization(Policies.SuperAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/payments", async (PaymentStatus? status, string? tranId, string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListAdminPayments.Query(status, tranId, cursor, limit), ct)))
            .WithName("listAdminPayments");

        g.MapPost("/subscriptions", async (GrantSubscription.Command command, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(command, ct);
                return TypedResults.NoContent();
            })
            .WithName("grantSubscription")
            .RequireAuthorization(Policies.SuperAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/announcements", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListAnnouncements.Query(), ct)))
            .WithName("listAnnouncements");

        g.MapPost("/announcements", async (SaveAnnouncement.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveAnnouncement.Command(null, body), ct)))
            .WithName("createAnnouncement")
            .ProducesValidationProblem();

        g.MapPut("/announcements/{id:guid}", async (Guid id, SaveAnnouncement.Request body, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new SaveAnnouncement.Command(id, body), ct)))
            .WithName("updateAnnouncement")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapDelete("/announcements/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
            {
                await d.Send(new DeleteAnnouncement.Command(id), ct);
                return TypedResults.NoContent();
            })
            .WithName("deleteAnnouncement")
            .ProducesProblem(StatusCodes.Status404NotFound);
    }
}
