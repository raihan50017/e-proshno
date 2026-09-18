using System.Text.RegularExpressions;
using EProshno.Api.Common;
using EProshno.Core.Billing;
using EProshno.Infrastructure.Billing;
using Microsoft.Extensions.Options;

namespace EProshno.Api.Features.Billing;

public static partial class BillingEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/v1/billing").WithTags("Billing").RequireAuthorization(Policies.Member);

        g.MapGet("/plans", async (Dispatcher d, CancellationToken ct) => TypedResults.Ok(await d.Query(new ListPlans.Query(), ct)))
            .WithName("listPlans");

        g.MapGet("/subscription", async (Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetSubscription.Query(), ct)))
            .WithName("getSubscription");

        g.MapPost("/checkout", async (Checkout.Command command, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(command, ct)))
            .WithName("checkout")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        g.MapGet("/payments", async (string? cursor, int? limit, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new ListPayments.Query(cursor, limit), ct)))
            .WithName("listPayments")
            .RequireAuthorization(Policies.InstitutionAdmin);

        g.MapGet("/payments/{tranId}", async (string tranId, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetPayment.Query(tranId), ct)))
            .WithName("getPayment")
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapGet("/invoices/{id:guid}", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new GetInvoice.Query(id), ct)))
            .WithName("getInvoice")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound);

        g.MapPost("/invoices/{id:guid}/pdf", async (Guid id, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Send(new RequestInvoicePdf.Command(id), ct)))
            .WithName("requestInvoicePdf")
            .RequireAuthorization(Policies.InstitutionAdmin)
            .ProducesProblem(StatusCodes.Status404NotFound);

        app.MapGet("/api/v1/render/invoices/{id:guid}", async (Guid id, string? token, Dispatcher d, CancellationToken ct) =>
                TypedResults.Ok(await d.Query(new RenderInvoice.Query(id, token), ct)))
            .WithTags("Render")
            .WithName("renderInvoice")
            .AllowAnonymous()
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        // Gateway server-to-server notification. Anonymous and form-encoded; verified with the gateway before use.
        app.MapPost("/api/v1/billing/payments/{gateway}/ipn", async (PaymentGateway gateway, HttpRequest request, Dispatcher d, CancellationToken ct) =>
            {
                var form = await ReadFormAsync(request, ct);
                var status = await d.Send(new HandleGatewayCallback.Command(gateway, form), ct);
                return TypedResults.Ok(new IpnResponse(status?.ToString() ?? "unknown"));
            })
            .WithTags("Billing")
            .WithName("paymentIpn")
            .AllowAnonymous()
            .DisableAntiforgery()
            .RequireRateLimiting(RateLimits.Ipn)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound);

        // The customer's browser comes back here (SSLCommerz POSTs). Never activates anything: it only redirects to
        // the SPA's return page, which polls getPayment.
        app.MapMethods("/api/v1/billing/payments/{gateway}/return/{outcome}", ["GET", "POST"], async (
                PaymentGateway gateway, string outcome, HttpRequest request, IOptions<AppOptions> options, CancellationToken ct) =>
            {
                var form = await ReadFormAsync(request, ct);
                var tranId = form.GetValueOrDefault("tran_id") ?? request.Query["tran_id"].ToString();
                var safeOutcome = outcome is "success" or "fail" or "cancel" ? outcome : "fail";
                var target = $"{options.Value.PublicBaseUrl.TrimEnd('/')}/billing/return?outcome={safeOutcome}";
                if (TranIdPattern().IsMatch(tranId))
                {
                    target += "&tranId=" + Uri.EscapeDataString(tranId);
                }

                return TypedResults.Redirect(target);
            })
            .WithTags("Billing")
            .WithName("paymentReturn")
            .AllowAnonymous()
            .DisableAntiforgery()
            .ExcludeFromDescription();
    }

    private static async Task<Dictionary<string, string>> ReadFormAsync(HttpRequest request, CancellationToken ct)
    {
        if (!request.HasFormContentType)
        {
            return [];
        }

        var form = await request.ReadFormAsync(ct);
        return form.Where(f => f.Key.Length <= 64).ToDictionary(f => f.Key, f => f.Value.ToString(), StringComparer.Ordinal);
    }

    [GeneratedRegex("^[A-Za-z0-9_-]{1,40}$", RegexOptions.None, matchTimeoutMilliseconds: 100)]
    private static partial Regex TranIdPattern();
}

public sealed record IpnResponse(string Status);
