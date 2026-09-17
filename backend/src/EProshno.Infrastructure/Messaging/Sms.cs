using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace EProshno.Infrastructure.Messaging;

public interface ISmsSender
{
    Task SendAsync(string phoneE164, string message, CancellationToken ct);
}

public sealed record DevSms(string To, string Message, DateTimeOffset SentAt);

/// <summary>Development SMS outbox. Messages are kept in memory (never logged) and read by a dev-only endpoint.</summary>
public sealed class DevSmsSender(TimeProvider clock, ILogger<DevSmsSender> logger) : ISmsSender
{
    private const int Capacity = 50;
    private readonly ConcurrentQueue<DevSms> _outbox = new();

    public IReadOnlyList<DevSms> Outbox => [.. _outbox.Reverse()];

    public Task SendAsync(string phoneE164, string message, CancellationToken ct)
    {
        _outbox.Enqueue(new DevSms(phoneE164, message, clock.GetUtcNow()));
        while (_outbox.Count > Capacity && _outbox.TryDequeue(out _))
        {
        }

        logger.LogInformation("Dev SMS queued; read it at GET /api/v1/dev/sms");
        return Task.CompletedTask;
    }
}
