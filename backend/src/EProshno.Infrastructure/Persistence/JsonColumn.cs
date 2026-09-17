using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace EProshno.Infrastructure.Persistence;

public static class AppJson
{
    /// <summary>Shared serializer settings: web defaults + string enums. Used for jsonb columns and the API.</summary>
    public static readonly JsonSerializerOptions Options = Create();

    public static JsonSerializerOptions Create()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}

internal static class JsonColumn
{
    /// <summary>Maps a value object to jsonb. Missing JSON properties fall back to the type's defaults.</summary>
    public static PropertyBuilder<T> HasJsonConversion<T>(this PropertyBuilder<T> property)
        where T : class, new()
    {
        var converter = new ValueConverter<T, string>(
            v => JsonSerializer.Serialize(v, AppJson.Options),
            v => JsonSerializer.Deserialize<T>(v, AppJson.Options) ?? new T());

        var comparer = new ValueComparer<T>(
            (a, b) => JsonSerializer.Serialize(a, AppJson.Options) == JsonSerializer.Serialize(b, AppJson.Options),
            v => JsonSerializer.Serialize(v, AppJson.Options).GetHashCode(StringComparison.Ordinal),
            v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, AppJson.Options), AppJson.Options)!);

        return property.HasConversion(converter, comparer).HasColumnType("jsonb");
    }
}
