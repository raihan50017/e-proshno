using EProshno.Infrastructure;
using EProshno.Infrastructure.Billing;
using EProshno.Infrastructure.Jobs;
using Hangfire;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
builder.Host.UseSerilog((context, logger) => logger
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

// Register Infrastructure services
builder.Services.AddInfrastructure(builder.Configuration);

// Register Hangfire server
var connectionString = builder.Configuration.PostgresConnectionString();
builder.Services.AddHangfire(c => c.UseAppStorage(connectionString));
builder.Services.AddHangfireServer(o =>
{
    o.Queues = JobQueues.All;
    o.WorkerCount = Math.Max(1, Environment.ProcessorCount / 2);
});

var app = builder.Build();

app.UseSerilogRequestLogging();

if (app.Environment.IsDevelopment())
{
    app.MapHangfireDashboard("/hangfire");
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

// Register recurring jobs
var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();
recurringJobs.AddOrUpdate<BillingJobs>("reconcile", x => x.ReconcileAsync(CancellationToken.None), "*/15 * * * *");
recurringJobs.AddOrUpdate<BillingJobs>("renewal-reminders", x => x.RenewalRemindersAsync(CancellationToken.None), "0 4 * * *"); // 10:00 BDT = 04:00 UTC
recurringJobs.AddOrUpdate<CleanupJobs>("cleanup", x => x.RunAsync(CancellationToken.None), "30 3 * * *"); // 09:30 BDT

await app.RunAsync();
