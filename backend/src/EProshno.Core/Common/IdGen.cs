using UUIDNext;

namespace EProshno.Core.Common;

/// <summary>Single source of entity ids: UUIDv7 (time-ordered).</summary>
public static class IdGen
{
    // After the .NET 10 upgrade this becomes Guid.CreateVersion7(); callers do not change.
    public static Guid New() => Uuid.NewDatabaseFriendly(Database.PostgreSql);
}
