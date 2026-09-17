using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using EProshno.Core.Billing;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace EProshno.Infrastructure.Billing;

public sealed record CheckoutCustomer(string Name, string? Email, string? Phone, string InstitutionName);

public sealed record CheckoutUrls(string Success, string Fail, string Cancel, string Ipn);

/// <summary>Server-to-server verified outcome. Only this may change a payment's status.</summary>
/// <param name="IsFinal">False while the gateway still reports the payment as pending.</param>
public sealed record GatewayValidation(
    string TranId,
    bool IsSuccess,
    bool IsFinal,
    long AmountPoisha,
    string Currency,
    string? GatewayRef,
    string RawJson);

public interface IPaymentGateway
{
    PaymentGateway Kind { get; }

    Task<string> InitAsync(Payment payment, string productName, CheckoutCustomer customer, CheckoutUrls urls, CancellationToken ct);

    /// <summary>Validates an IPN/POST-back with the gateway. Returns null when the callback cannot be verified.</summary>
    Task<GatewayValidation?> ValidateCallbackAsync(IReadOnlyDictionary<string, string> form, CancellationToken ct);

    /// <summary>Looks up a transaction by our tran_id (reconciliation).</summary>
    Task<GatewayValidation?> QueryAsync(string tranId, CancellationToken ct);
}

public sealed class SslCommerzOptions
{
    public const string Section = "SslCommerz";

    public string StoreId { get; set; } = "";
    public string StorePassword { get; set; } = "";
    public bool Sandbox { get; set; } = true;

    public string BaseUrl => Sandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
}

/// <summary>
/// SSLCommerz v4: session init → GatewayPageURL → IPN with val_id → validation API. Only the validation API
/// response is trusted. Non-idempotent calls (session init) are never retried automatically.
/// </summary>
public sealed class SslCommerzGateway(
    HttpClient http,
    IOptions<SslCommerzOptions> options,
    ILogger<SslCommerzGateway> logger) : IPaymentGateway
{
    private readonly SslCommerzOptions _options = options.Value;

    public PaymentGateway Kind => PaymentGateway.SslCommerz;

    public async Task<string> InitAsync(Payment payment, string productName, CheckoutCustomer customer, CheckoutUrls urls, CancellationToken ct)
    {
        var form = new Dictionary<string, string>
        {
            ["store_id"] = _options.StoreId,
            ["store_passwd"] = _options.StorePassword,
            ["total_amount"] = (payment.AmountPoisha / 100m).ToString("0.00", CultureInfo.InvariantCulture),
            ["currency"] = payment.Currency,
            ["tran_id"] = payment.TranId,
            ["success_url"] = urls.Success,
            ["fail_url"] = urls.Fail,
            ["cancel_url"] = urls.Cancel,
            ["ipn_url"] = urls.Ipn,
            ["cus_name"] = customer.Name,
            ["cus_email"] = customer.Email ?? "noreply@example.com",
            ["cus_add1"] = customer.InstitutionName,
            ["cus_city"] = "Dhaka",
            ["cus_postcode"] = "1000",
            ["cus_country"] = "Bangladesh",
            ["cus_phone"] = customer.Phone ?? "01700000000",
            ["shipping_method"] = "NO",
            ["product_name"] = productName,
            ["product_category"] = "Subscription",
            ["product_profile"] = "non-physical-goods",
            ["value_a"] = payment.Id.ToString(),
        };

        using var response = await http.PostAsync($"{_options.BaseUrl}/gwprocess/v4/api.php", new FormUrlEncodedContent(form), ct);
        var json = await response.Content.ReadFromJsonAsync<JsonObject>(ct);
        var status = (string?)json?["status"];
        var url = (string?)json?["GatewayPageURL"];
        if (!response.IsSuccessStatusCode || status != "SUCCESS" || string.IsNullOrEmpty(url))
        {
            logger.LogWarning("SSLCommerz session init failed for {TranId}: {Reason}", payment.TranId, (string?)json?["failedreason"]);
            throw new InvalidOperationException("SSLCommerz session init failed.");
        }

        return url;
    }

    public async Task<GatewayValidation?> ValidateCallbackAsync(IReadOnlyDictionary<string, string> form, CancellationToken ct)
    {
        if (!form.TryGetValue("val_id", out var valId) || string.IsNullOrWhiteSpace(valId))
        {
            // Failed/cancelled callbacks carry no val_id; confirm through the transaction query instead.
            return form.TryGetValue("tran_id", out var tranId) ? await QueryAsync(tranId, ct) : null;
        }

        var url = $"{_options.BaseUrl}/validator/api/validationserverAPI.php?val_id={Uri.EscapeDataString(valId)}" +
                  $"&store_id={Uri.EscapeDataString(_options.StoreId)}&store_passwd={Uri.EscapeDataString(_options.StorePassword)}&format=json";
        var json = await http.GetFromJsonAsync<JsonObject>(url, ct);
        return json is null ? null : FromElement(json);
    }

    public async Task<GatewayValidation?> QueryAsync(string tranId, CancellationToken ct)
    {
        var url = $"{_options.BaseUrl}/validator/api/merchantTransIDvalidationAPI.php?tran_id={Uri.EscapeDataString(tranId)}" +
                  $"&store_id={Uri.EscapeDataString(_options.StoreId)}&store_passwd={Uri.EscapeDataString(_options.StorePassword)}&format=json";
        var json = await http.GetFromJsonAsync<JsonObject>(url, ct);
        if (json?["element"] is not JsonArray elements || elements.Count == 0)
        {
            return null;
        }

        // Prefer a successful attempt when the customer retried.
        var element = elements.OfType<JsonObject>().FirstOrDefault(e => IsValid((string?)e["status"]))
            ?? elements.OfType<JsonObject>().First();
        return FromElement(element);
    }

    private static GatewayValidation? FromElement(JsonObject e)
    {
        var tranId = (string?)e["tran_id"];
        if (string.IsNullOrEmpty(tranId))
        {
            return null;
        }

        var status = (string?)e["status"];
        var currency = (string?)e["currency_type"] ?? (string?)e["currency"] ?? "";
        var amountText = (string?)e["currency_amount"] ?? (string?)e["amount"] ?? "0";
        var amount = decimal.TryParse(amountText, NumberStyles.Number, CultureInfo.InvariantCulture, out var a) ? a : 0m;

        // Drop anything card-related before storing.
        var raw = new JsonObject
        {
            ["status"] = status,
            ["tran_id"] = tranId,
            ["val_id"] = (string?)e["val_id"],
            ["amount"] = amountText,
            ["currency"] = currency,
            ["bank_tran_id"] = (string?)e["bank_tran_id"],
            ["tran_date"] = (string?)e["tran_date"],
            ["risk_level"] = e["risk_level"]?.ToString(),
        };

        return new GatewayValidation(
            tranId,
            IsSuccess: IsValid(status),
            IsFinal: status is not ("PENDING" or "PROCESSING" or "UNATTEMPTED"),
            AmountPoisha: (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero),
            Currency: currency,
            GatewayRef: (string?)e["bank_tran_id"],
            RawJson: raw.ToJsonString());
    }

    private static bool IsValid(string? status) => status is "VALID" or "VALIDATED";
}

/// <summary>
/// Development gateway: redirects to a page in the SPA where the developer approves or fails the payment.
/// Disabled unless Billing:EnableFakeGateway is true (never in production).
/// </summary>
public sealed class FakeGateway(IOptions<BillingOptions> options, IOptions<AppOptions> app) : IPaymentGateway
{
    public PaymentGateway Kind => PaymentGateway.Fake;

    public Task<string> InitAsync(Payment payment, string productName, CheckoutCustomer customer, CheckoutUrls urls, CancellationToken ct) =>
        Task.FromResult(
            $"{app.Value.PublicBaseUrl}/billing/fake-gateway?tranId={Uri.EscapeDataString(payment.TranId)}" +
            $"&amount={payment.AmountPoisha}");

    /// <summary>The fake "gateway" trusts its own form: tran_id, amount, success.</summary>
    public Task<GatewayValidation?> ValidateCallbackAsync(IReadOnlyDictionary<string, string> form, CancellationToken ct)
    {
        if (!options.Value.EnableFakeGateway
            || !form.TryGetValue("tran_id", out var tranId)
            || !form.TryGetValue("amount", out var amountText)
            || !long.TryParse(amountText, NumberStyles.None, CultureInfo.InvariantCulture, out var amount))
        {
            return Task.FromResult<GatewayValidation?>(null);
        }

        var success = form.TryGetValue("success", out var s) && s == "true";
        var raw = JsonSerializer.Serialize(new { gateway = "fake", tranId, amount, success });
        return Task.FromResult<GatewayValidation?>(
            new GatewayValidation(tranId, success, true, amount, Payment.Bdt, $"FAKE-{tranId}", raw));
    }

    public Task<GatewayValidation?> QueryAsync(string tranId, CancellationToken ct) => Task.FromResult<GatewayValidation?>(null);
}

public sealed class PaymentGatewayResolver(IEnumerable<IPaymentGateway> gateways, IOptions<BillingOptions> options)
{
    public IPaymentGateway Default => Get(options.Value.Gateway);

    public IPaymentGateway Get(PaymentGateway kind)
    {
        if (kind == PaymentGateway.Fake && !options.Value.EnableFakeGateway)
        {
            throw new InvalidOperationException("The fake payment gateway is disabled.");
        }

        return gateways.FirstOrDefault(g => g.Kind == kind)
            ?? throw new InvalidOperationException($"Payment gateway {kind} is not configured.");
    }
}
