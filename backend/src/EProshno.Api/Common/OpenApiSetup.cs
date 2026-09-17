using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace EProshno.Api.Common;

public static class OpenApiSetup
{
    public static IServiceCollection AddAppOpenApi(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(o =>
        {
            o.SwaggerDoc("v1", new OpenApiInfo { Title = "e-proshno API", Version = "v1" });
            o.SupportNonNullableReferenceTypes();
            o.NonNullableReferenceTypesAsRequired();
            o.UseAllOfToExtendReferenceSchemas();
            o.CustomSchemaIds(SchemaId);
            o.AddSecurityDefinition("bearer", new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Description = "Access token from /api/v1/auth/*",
            });
            o.AddSecurityRequirement(document => new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("bearer", document)] = [],
            });
        });
        return services;
    }

    /// <summary>
    /// Nested feature records get their declaring type as a prefix (CreateQuestionSet.Command →
    /// CreateQuestionSetCommand); generic types become NameOfArg (PageOfQuestionCard).
    /// </summary>
    public static string SchemaId(Type type)
    {
        var name = type.Name;
        if (type.IsGenericType)
        {
            name = name[..name.IndexOf('`', StringComparison.Ordinal)] + "Of" +
                   string.Join("And", type.GetGenericArguments().Select(SchemaId));
        }

        return type.DeclaringType is null ? name : SchemaId(type.DeclaringType) + name;
    }
}
