using EProshno.Api.Common;
using EProshno.Api.Features.QuestionSets;
using EProshno.Core.Auth;
using EProshno.Core.Common;
using EProshno.Core.Institutions;
using EProshno.Core.Papers;
using EProshno.Core.Text;
using EProshno.Infrastructure.Institutions;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.Institutions;

public sealed record InstitutionDto(
    Guid Id,
    string Name,
    string? NameEn,
    InstitutionType Type,
    string? Address,
    string? Phone,
    string? Email,
    string? LogoUrl,
    PaperSettings PaperDefaults,
    DateTimeOffset CreatedAt);

public static class CreateInstitution
{
    public sealed record Command(string Name, InstitutionType Type, string? Address, string? Phone) : ICommand<Response>;

    /// <summary>The client then calls /auth/refresh with this id to switch its session.</summary>
    public sealed record Response(Guid Id);

    public const int MaxOwnedInstitutions = 5;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Name).NotEmpty().WithMessage(Messages.Required).MaximumLength(150).WithMessage(Messages.TooLong);
            RuleFor(x => x.Type).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Address).MaximumLength(300).WithMessage(Messages.TooLong);
            RuleFor(x => x.Phone).Must(p => PhoneNumbers.Normalize(p) is not null).WithMessage(Messages.InvalidPhone)
                .When(x => !string.IsNullOrWhiteSpace(x.Phone));
        }
    }

    internal sealed class Handler(AppDbContext db, InstitutionSetup setup, ITenantContext tenant) : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var owned = await db.Memberships.CountAsync(
                m => m.UserId == tenant.UserId && m.Role == InstitutionRole.Owner && m.Status == MembershipStatus.Active, ct);
            if (owned >= MaxOwnedInstitutions)
            {
                throw AppException.Conflict("institution.limit", Messages.InstitutionLimit);
            }

            var institution = await setup.CreateAsync(
                tenant.UserId, command.Name, command.Type, command.Address, PhoneNumbers.Normalize(command.Phone), ct);
            await db.SaveChangesAsync(ct);
            return new Response(institution.Id);
        }
    }
}

public static class GetInstitution
{
    public sealed record Query : IQuery<InstitutionDto>;

    internal sealed class Handler(AppDbContext db, ITenantContext tenant) : IQueryHandler<Query, InstitutionDto>
    {
        public async Task<InstitutionDto> Handle(Query query, CancellationToken ct)
        {
            var i = await db.Institutions.AsNoTracking().Where(x => x.Id == tenant.InstitutionId).FirstOr404Async(ct);
            return new InstitutionDto(i.Id, i.Name, i.NameEn, i.Type, i.Address, i.Phone, i.Email, MediaUrls.For(i.LogoKey),
                i.PaperDefaults, i.CreatedAt);
        }
    }
}

public static class UpdateInstitution
{
    public sealed record Command(string Name, string? NameEn, InstitutionType Type, string? Address, string? Phone, string? Email)
        : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator()
        {
            RuleFor(x => x.Name).NotEmpty().WithMessage(Messages.Required).MaximumLength(150).WithMessage(Messages.TooLong);
            RuleFor(x => x.NameEn).MaximumLength(150).WithMessage(Messages.TooLong);
            RuleFor(x => x.Type).IsInEnum().WithMessage(Messages.InvalidValue);
            RuleFor(x => x.Address).MaximumLength(300).WithMessage(Messages.TooLong);
            RuleFor(x => x.Phone).Must(p => PhoneNumbers.Normalize(p) is not null).WithMessage(Messages.InvalidPhone)
                .When(x => !string.IsNullOrWhiteSpace(x.Phone));
            RuleFor(x => x.Email).EmailAddress().WithMessage(Messages.InvalidEmail).MaximumLength(200)
                .When(x => !string.IsNullOrWhiteSpace(x.Email));
        }
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var i = await db.Institutions.Where(x => x.Id == tenant.InstitutionId).FirstOr404Async(ct);
            i.Name = command.Name.Trim();
            i.NameEn = Blank(command.NameEn);
            i.Type = command.Type;
            i.Address = Blank(command.Address);
            i.Phone = PhoneNumbers.Normalize(command.Phone);
            i.Email = Blank(command.Email);
            i.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }

        private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}

public static class UploadLogo
{
    public sealed record Command(Stream Content) : ICommand<Response>;

    public sealed record Response(string LogoUrl);

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, MediaService media, IObjectStorage storage, TimeProvider clock)
        : ICommandHandler<Command, Response>
    {
        public async Task<Response> Handle(Command command, CancellationToken ct)
        {
            var i = await db.Institutions.Where(x => x.Id == tenant.InstitutionId).FirstOr404Async(ct);
            var stored = await media.SaveLogoAsync(command.Content, i.Id, ct);
            var previous = i.LogoKey;
            i.LogoKey = stored.Key;
            i.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            if (previous is not null)
            {
                await storage.DeleteAsync(previous, ct);
            }

            return new Response(stored.Url);
        }
    }
}

public static class UpdatePaperDefaults
{
    public sealed record Command(PaperSettings Settings) : ICommand<Unit>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() => RuleFor(x => x.Settings).NotNull().SetValidator(new PaperSettingsValidator());
    }

    internal sealed class Handler(AppDbContext db, ITenantContext tenant, TimeProvider clock) : ICommandHandler<Command, Unit>
    {
        public async Task<Unit> Handle(Command command, CancellationToken ct)
        {
            var i = await db.Institutions.Where(x => x.Id == tenant.InstitutionId).FirstOr404Async(ct);
            i.PaperDefaults = command.Settings with { Seed = 0 };
            i.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return Unit.Value;
        }
    }
}
