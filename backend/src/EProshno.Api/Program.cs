using System.Text.Json.Serialization;
using EProshno.Api.Common;
using EProshno.Api.Features;
using EProshno.Infrastructure;
using EProshno.Infrastructure.Jobs;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Seeding;
using FluentValidation;
using Hangfire;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, logger) => logger
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

const long MaxRequestBytes = 25L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxRequestBytes);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = MaxRequestBytes);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddCqrs(typeof(Program).Assembly);
builder.Services.AddValidatorsFromAssemblyContaining<Program>(ServiceLifetime.Scoped, includeInternalTypes: true);
builder.Services.AddFeatureServices(builder.Configuration);
builder.Services.AddAppProblemDetails();
builder.Services.AddAppAuth(builder.Configuration);
builder.Services.AddAppOpenApi();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database");

var jobOptions = builder.Configuration.GetSection(JobOptions.Section).Get<JobOptions>() ?? new JobOptions();
if (!jobOptions.IsInline)
{
    // Client only: the Worker runs the Hangfire server.
    var connectionString = builder.Configuration.PostgresConnectionString();
    builder.Services.AddHangfire(c => c.UseAppStorage(connectionString));
}

var app = builder.Build();

if (args.Contains("seed"))
{
    await SeedAsync(app.Services, dev: args.Contains("--dev"));
    return;
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("OpenApi:Enabled"))
{
    app.UseSwagger();
    app.MapScalarApiReference(o => o.OpenApiRoutePattern = "/swagger/{documentName}/swagger.json");
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapAppEndpoints();

var seed = app.Services.GetRequiredService<IOptions<SeedOptions>>().Value;
if (seed.OnStartup)
{
    await SeedAsync(app.Services, dev: seed.DevData && app.Environment.IsDevelopment());
}

await app.RunAsync();

static async Task SeedAsync(IServiceProvider services, bool dev)
{
    await using var scope = services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var pending = await db.Database.GetPendingMigrationsAsync();
    if (pending.Any())
    {
        if (dev)
        {
            logger.LogInformation("Applying {Count} pending migrations...", pending.Count());
            await db.Database.MigrateAsync();
        }
        else
        {
            logger.LogWarning("Skipping seed: {Count} migrations are pending. Run `dotnet ef database update` first.", pending.Count());
            return;
        }
    }

    await scope.ServiceProvider.GetRequiredService<DataSeeder>().SeedAsync(CancellationToken.None);
    if (dev)
    {
        await scope.ServiceProvider.GetRequiredService<DevDataSeeder>().SeedAsync(CancellationToken.None);
    }
}

/// <summary>Entry point; public for WebApplicationFactory in integration tests.</summary>
public partial class Program;
