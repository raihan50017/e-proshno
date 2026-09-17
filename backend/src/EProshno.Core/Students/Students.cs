using EProshno.Core.Common;

namespace EProshno.Core.Students;

public sealed class Batch : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public string Name { get; set; } = "";
    public Guid? LevelId { get; set; }
    public int? Year { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class Student : ITenantOwned
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Guid BatchId { get; set; }
    public string Roll { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? GuardianPhone { get; set; }
    public string? Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Batch? Batch { get; set; }
}
