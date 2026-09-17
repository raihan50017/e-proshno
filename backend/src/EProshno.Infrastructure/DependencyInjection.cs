using EProshno.Core.Common;
using EProshno.Infrastructure.Auth;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Institutions;
using EProshno.Infrastructure.Jobs;
using EProshno.Infrastructure.Messaging;
using EProshno.Infrastructure.Papers;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using EProshno.Infrastructure.Seeding;
using EProshno.Infrastructure.Storage;
using EProshno.Infrastructure.Tenancy;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace EProshno.Infrastructure;

public static class DependencyInjection
{
    public static void ConfigureDbContext(DbContextOptionsBuilder options, string connectionString) =>
        options
            .UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history"))
            .UseSnakeCaseNamingConvention()
            .ConfigureWarnings(w => w.Ignore(CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning));

    public static string PostgresConnectionString(this IConfiguration config) =>
        config.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("ConnectionStrings:Postgres is not configured.");

    /// <summary>Hangfire storage shared by the API (client) and the Worker (server).</summary>
    public static IGlobalConfiguration UseAppStorage(this IGlobalConfiguration hangfire, string connectionString) =>
        hangfire
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(
                o => o.UseNpgsqlConnection(connectionString),
                new PostgreSqlStorageOptions { SchemaName = "hangfire", PrepareSchemaIfNecessary = true });

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = config.PostgresConnectionString();

        services.TryAddSingleton(TimeProvider.System);
        services.AddHttpContextAccessor();

        services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
        services.Configure<StorageOptions>(config.GetSection(StorageOptions.Section));
        services.Configure<BillingOptions>(config.GetSection(BillingOptions.Section));
        services.Configure<AppOptions>(config.GetSection(AppOptions.Section));
        services.Configure<SslCommerzOptions>(config.GetSection(SslCommerzOptions.Section));
        services.Configure<RenderOptions>(config.GetSection(RenderOptions.Section));
        services.Configure<JobOptions>(config.GetSection(JobOptions.Section));
        services.Configure<SeedOptions>(config.GetSection(SeedOptions.Section));

        // Tenancy + persistence
        services.AddScoped<TenantContext>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
        services.AddScoped<AuditInterceptor>();
        services.AddDbContext<AppDbContext>((sp, options) =>
        {
            ConfigureDbContext(options, connectionString);
            options.AddInterceptors(sp.GetRequiredService<AuditInterceptor>());
        });

        // Identity (users, hashing, lockout, OTP token providers). Sessions are JWT, see TokenService.
        services
            .AddIdentityCore<AppUser>(o =>
            {
                o.Password.RequiredLength = 8;
                o.Password.RequireDigit = true;
                o.Password.RequireLowercase = false;
                o.Password.RequireUppercase = false;
                o.Password.RequireNonAlphanumeric = false;
                o.Password.RequiredUniqueChars = 1;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                o.User.RequireUniqueEmail = false;   // email is optional; a filtered unique index enforces it
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders()
            .AddPasswordValidator<LetterPasswordValidator>();

        services.AddFusionCache();

        // Storage and messaging
        var storageOptions = config.GetSection(StorageOptions.Section).Get<StorageOptions>() ?? new StorageOptions();
        if (string.Equals(storageOptions.Provider, "S3", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IObjectStorage, S3ObjectStorage>();
        }
        else
        {
            services.AddSingleton<IObjectStorage, LocalObjectStorage>();
        }

        services.AddSingleton<FileUrlSigner>();
        services.AddScoped<MediaService>();
        services.AddSingleton<DevSmsSender>();
        services.AddSingleton<ISmsSender>(sp => sp.GetRequiredService<DevSmsSender>());

        // Domain services
        services.AddScoped<TokenService>();
        services.AddScoped<InstitutionSetup>();
        services.AddSingleton<QuestionContentValidator>();
        services.AddScoped<QuestionWriter>();
        services.AddScoped<DraftResolver>();
        services.AddScoped<ImportProcessor>();
        services.AddScoped<ImportCommitter>();
        services.AddScoped<ImportRollback>();
        services.AddScoped<PaperLoader>();
        services.AddSingleton<RenderTokenService>();

        // Billing
        services.AddScoped<IEntitlements, Entitlements>();
        services.AddScoped<PaymentApplier>();
        services.AddScoped<TrialService>();
        services.AddHttpClient<SslCommerzGateway>(c => c.Timeout = TimeSpan.FromSeconds(30));
        services.AddScoped<IPaymentGateway>(sp => sp.GetRequiredService<SslCommerzGateway>());
        services.AddScoped<IPaymentGateway, FakeGateway>();
        services.AddScoped<PaymentGatewayResolver>();
        services.AddScoped<BillingJobs>();
        services.AddScoped<CleanupJobs>();

        // Seeding
        services.AddScoped<DataSeeder>();
        services.AddScoped<DevDataSeeder>();

        // Jobs: Hangfire in normal operation (the host registers the Hangfire client), inline for tests.
        services.AddSingleton<IJobScheduler>(sp =>
            sp.GetRequiredService<IOptions<JobOptions>>().Value.IsInline
                ? ActivatorUtilities.CreateInstance<InlineJobScheduler>(sp)
                : ActivatorUtilities.CreateInstance<HangfireJobScheduler>(sp));

        return services;
    }
}
