using EProshno.Api.Common;
using EProshno.Core.Common;
using EProshno.Core.Papers;
using EProshno.Core.Platform;
using EProshno.Infrastructure.Jobs;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Storage;
using EProshno.Infrastructure.Tenancy;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace EProshno.Api.Features.QuestionSets;

public sealed record JobDto(
    Guid Id,
    JobKind Kind,
    JobState State,
    string? DownloadUrl,
    string? Error,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

public static class JobProjection
{
    public static readonly TimeSpan DownloadLinkLifetime = TimeSpan.FromMinutes(15);

    public static JobDto ToDto(JobRecord j, FileUrlSigner signer) => new(
        j.Id,
        j.Kind,
        j.State,
        j is { State: JobState.Succeeded, ResultKey: { } key } ? signer.CreateUrl(key, DownloadLinkLifetime, j.DownloadName) : null,
        j.Error,
        j.CreatedAt,
        j.CompletedAt);
}

/// <summary>Creates PDF job records: served from the content-addressed cache when possible, otherwise rendered by the Worker.</summary>
public sealed class PdfJobs(AppDbContext db, IObjectStorage storage, IJobScheduler jobs, FileUrlSigner signer, TimeProvider clock)
{
    public async Task<JobDto> RequestAsync(
        Guid institutionId, Guid userId, JobKind kind, Guid targetId, int variant, string objectKey, string downloadName, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var record = new JobRecord
        {
            Id = IdGen.New(),
            InstitutionId = institutionId,
            UserId = userId,
            Kind = kind,
            TargetId = targetId,
            Variant = variant,
            ObjectKey = objectKey,
            DownloadName = downloadName,
            State = JobState.Queued,
            CreatedAt = now,
        };

        var cached = await storage.ExistsAsync(objectKey, ct);
        if (cached)
        {
            record.State = JobState.Succeeded;
            record.ResultKey = objectKey;
            record.CompletedAt = now;
        }

        db.JobRecords.Add(record);
        await db.SaveChangesAsync(ct);

        if (!cached)
        {
            var recordId = record.Id;
            await jobs.EnqueueAsync<IRenderPdfJob>(JobQueues.Pdf, j => j.RunAsync(institutionId, recordId, CancellationToken.None));
            await db.Entry(record).ReloadAsync(ct);
        }

        return JobProjection.ToDto(record, signer);
    }

    /// <summary>Printable file names keep Bangla letters and digits; everything else becomes a dash.</summary>
    public static string SafeFileName(string title, string suffix)
    {
        var name = new string(title.Select(ch => char.IsLetterOrDigit(ch) || char.GetUnicodeCategory(ch) is
            System.Globalization.UnicodeCategory.NonSpacingMark or System.Globalization.UnicodeCategory.SpacingCombiningMark
            ? ch
            : '-').ToArray()).Trim('-');
        if (name.Length > 80)
        {
            name = name[..80];
        }

        return (name.Length == 0 ? "paper" : name) + suffix;
    }
}

public static class UpdateSetSettings
{
    /// <param name="Reshuffle">Draw a new seed: a different question and option order for every variant.</param>
    public sealed record Request(PaperSettings Settings, bool Reshuffle);

    public sealed record Command(Guid SetId, Request Body) : ICommand<PaperSettings>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() => RuleFor(x => x.Body.Settings).NotNull().WithMessage(Messages.Required).SetValidator(new PaperSettingsValidator());
    }

    /// <summary>Print editor autosave. The seed is server-owned: kept unless a reshuffle is requested.</summary>
    internal sealed class Handler(AppDbContext db, SetAccess access, TimeProvider clock) : ICommandHandler<Command, PaperSettings>
    {
        public async Task<PaperSettings> Handle(Command command, CancellationToken ct)
        {
            var set = await access.GetAsync(command.SetId, ct);
            var seed = command.Body.Reshuffle ? SetAccess.NewSeed() : set.Settings.Seed;
            set.Settings = command.Body.Settings with
            {
                Seed = seed,
                Watermark = string.IsNullOrWhiteSpace(command.Body.Settings.Watermark) ? null : command.Body.Settings.Watermark.Trim(),
            };
            set.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return set.Settings;
        }
    }
}

public static class GetSetPaper
{
    public sealed record Query(Guid SetId, int Variant) : IQuery<RenderedPaper>;

    /// <summary>The composed paper for the live preview (same data the print route receives).</summary>
    internal sealed class Handler(SetAccess access, PaperLoader loader) : IQueryHandler<Query, RenderedPaper>
    {
        public async Task<RenderedPaper> Handle(Query query, CancellationToken ct)
        {
            var set = await access.GetAsync(query.SetId, ct);
            return await loader.LoadAsync(set.Id, query.Variant, ct);
        }
    }
}

public static class RequestSetPdf
{
    public sealed record Request(int Variant);

    public sealed record Command(Guid SetId, Request Body) : ICommand<JobDto>;

    public sealed class Validator : AbstractValidator<Command>
    {
        public Validator() =>
            RuleFor(x => x.Body.Variant).InclusiveBetween(0, PaperComposer.MaxVariants - 1).WithMessage(Messages.InvalidVariant);
    }

    internal sealed class Handler(
        AppDbContext db,
        ITenantContext tenant,
        SetAccess access,
        PaperLoader loader,
        PdfJobs pdfs,
        IOptions<RenderOptions> options) : ICommandHandler<Command, JobDto>
    {
        public async Task<JobDto> Handle(Command command, CancellationToken ct)
        {
            var set = await access.GetAsync(command.SetId, ct);
            var variant = command.Body.Variant;
            if (variant >= Math.Clamp(set.Settings.Variants, 1, PaperComposer.MaxVariants))
            {
                throw SetAccess.Invalid("variant", Messages.InvalidVariant);
            }

            if (!await db.QuestionSetItems.AnyAsync(i => i.SetId == set.Id, ct))
            {
                throw AppException.Conflict("set.empty", Messages.SetHasNoQuestions);
            }

            var cacheKey = await loader.CacheKeyAsync(set.Id, variant, options.Value.RendererVersion, ct);
            var suffix = set.Settings.Variants > 1 ? $"-{PaperComposer.VariantLabels[variant]}.pdf" : ".pdf";
            return await pdfs.RequestAsync(
                set.InstitutionId,
                tenant.UserId,
                JobKind.PaperPdf,
                set.Id,
                variant,
                StorageKeys.Pdf(set.InstitutionId, cacheKey),
                PdfJobs.SafeFileName(set.Title, suffix),
                ct);
        }
    }
}

public static class GetJob
{
    public sealed record Query(Guid Id) : IQuery<JobDto>;

    /// <summary>Polling fallback for PDF jobs; users only see their own jobs.</summary>
    internal sealed class Handler(AppDbContext db, ITenantContext tenant, FileUrlSigner signer) : IQueryHandler<Query, JobDto>
    {
        public async Task<JobDto> Handle(Query query, CancellationToken ct)
        {
            var userId = tenant.UserId;
            var job = await db.JobRecords.AsNoTracking().Where(j => j.Id == query.Id && j.UserId == userId).FirstOr404Async(ct);
            return JobProjection.ToDto(job, signer);
        }
    }
}

public static class RenderSetPaper
{
    public sealed record Query(Guid SetId, int Variant, string? Token) : IQuery<RenderedPaper>;

    /// <summary>
    /// For the Worker's Chromium: no user session, authorised by a short-lived HMAC token that also names the
    /// institution. The tenant is set from the token, so the normal query filter applies.
    /// </summary>
    internal sealed class Handler(RenderTokenService tokens, TenantContext tenant, PaperLoader loader) : IQueryHandler<Query, RenderedPaper>
    {
        public Task<RenderedPaper> Handle(Query query, CancellationToken ct)
        {
            var institutionId = tokens.Validate(RenderResources.Set, query.SetId, query.Variant, query.Token)
                ?? throw new AppException("render.token", Messages.InvalidRenderToken, 401);
            tenant.Set(null, institutionId);
            return loader.LoadAsync(query.SetId, query.Variant, ct);
        }
    }
}
