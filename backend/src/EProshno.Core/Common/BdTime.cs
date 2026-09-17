namespace EProshno.Core.Common;

public static class BdTime
{
    /// <summary>Asia/Dhaka. Bangladesh has used a fixed UTC+6 offset without DST since 2009.</summary>
    public static readonly TimeZoneInfo Zone = Find();

    public static DateTimeOffset ToLocal(DateTimeOffset utc) => TimeZoneInfo.ConvertTime(utc, Zone);

    /// <summary>Start of the current calendar month in Dhaka, as UTC.</summary>
    public static DateTimeOffset MonthStartUtc(DateTimeOffset now)
    {
        var local = ToLocal(now);
        return new DateTimeOffset(local.Year, local.Month, 1, 0, 0, 0, local.Offset).ToUniversalTime();
    }

    private static TimeZoneInfo Find()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Dhaka");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.CreateCustomTimeZone("Asia/Dhaka", TimeSpan.FromHours(6), "Asia/Dhaka", "Asia/Dhaka");
        }
    }
}
