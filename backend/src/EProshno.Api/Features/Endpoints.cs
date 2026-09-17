using System.Reflection;
using EProshno.Api.Features.Auth;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features;

public sealed class SupportOptions
{
    public const string Section = "Support";

    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string? WhatsApp { get; set; }
    public string? Messenger { get; set; }
    public string Hours { get; set; } = "";
}

public static class Endpoints
{
    public static IServiceCollection AddFeatureServices(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<SupportOptions>(config.GetSection(SupportOptions.Section));
        services.AddScoped<MeReader>();
        services.AddScoped<OtpSender>();
        services.AddScoped<Questions.QuestionSearch>();
        services.AddScoped<Questions.QuestionReader>();
        services.AddScoped<QuestionBanks.BankAccess>();
        services.AddScoped<QuestionBanks.BankQuestionRemover>();
        services.AddScoped<Imports.ImportAccess>();
        services.AddScoped<QuestionSets.SetAccess>();
        return services;
    }

    public static void MapAppEndpoints(this WebApplication app)
    {
        app.MapHealthEndpoints();
        app.MapAuthEndpoints();
        Institutions.InstitutionEndpoints.Map(app);
        Taxonomy.TaxonomyEndpoints.Map(app);
        Questions.QuestionEndpoints.Map(app);
        QuestionBanks.QuestionBankEndpoints.Map(app);
        Imports.ImportEndpoints.Map(app);
        QuestionSets.QuestionSetEndpoints.Map(app);
        Files.FileEndpoints.Map(app);
        Billing.BillingEndpoints.Map(app);
        Dashboard.DashboardEndpoints.Map(app);
        Students.StudentEndpoints.Map(app);
        Admin.AdminEndpoints.Map(app);

        if (app.Environment.IsDevelopment())
        {
            app.MapDevEndpoints();
        }
    }

    private static void MapHealthEndpoints(this IEndpointRouteBuilder app) =>
        app.MapGet("/api/v1/health", async (AppDbContext db, TimeProvider clock, CancellationToken ct) =>
            {
                bool database;
                try
                {
                    database = await db.Database.CanConnectAsync(ct);
                }
                catch (Exception)
                {
                    database = false;
                }

                return TypedResults.Ok(new HealthResponse(
                    database ? "ok" : "degraded",
                    Version,
                    database,
                    clock.GetUtcNow()));
            })
            .WithTags("Health")
            .WithName("getHealth")
            .AllowAnonymous();

    public static readonly string Version =
        typeof(Endpoints).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "0.0.0";
}

public sealed record HealthResponse(string Status, string Version, bool Database, DateTimeOffset Time);
