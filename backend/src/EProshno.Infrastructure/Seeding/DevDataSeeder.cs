using EProshno.Core.Auth;
using EProshno.Core.Billing;
using EProshno.Core.Common;
using EProshno.Core.Imports;
using EProshno.Core.Institutions;
using EProshno.Core.Questions;
using EProshno.Core.Text;
using EProshno.Infrastructure.Identity;
using EProshno.Infrastructure.Imports;
using EProshno.Infrastructure.Institutions;
using EProshno.Infrastructure.Persistence;
using EProshno.Infrastructure.Questions;
using EProshno.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EProshno.Infrastructure.Seeding;

/// <summary>
/// Development-only demo data: an admin, a teacher who owns a demo institution with an active plan, and a few
/// published platform questions (our own sample content). Idempotent.
/// </summary>
public sealed class DevDataSeeder(
    AppDbContext db,
    UserManager<AppUser> users,
    TenantContext tenant,
    InstitutionSetup setup,
    DraftResolver resolver,
    QuestionWriter writer,
    TimeProvider clock,
    ILogger<DevDataSeeder> logger)
{
    public const string AdminEmail = "admin@example.com";
    public const string AdminPhone = "+8801700000001";
    public const string AdminPassword = "Admin12345";
    public const string TeacherEmail = "teacher@example.com";
    public const string TeacherPhone = "+8801700000002";
    public const string TeacherPassword = "Teacher12345";

    public async Task SeedAsync(CancellationToken ct)
    {
        var admin = await EnsureUserAsync(AdminEmail, AdminPhone, AdminPassword, "প্ল্যাটফর্ম অ্যাডমিন",
            [Roles.SuperAdmin, Roles.ContentEditor, Roles.ContentReviewer]);
        var teacher = await EnsureUserAsync(TeacherEmail, TeacherPhone, TeacherPassword, "নমুনা শিক্ষক", []);

        if (!await db.Memberships.AnyAsync(m => m.UserId == teacher.Id, ct))
        {
            var institution = await setup.CreateAsync(teacher.Id, "নমুনা কোচিং সেন্টার", InstitutionType.Coaching, "ঢাকা", null, ct);
            var plan = await db.Plans.FirstAsync(p => p.Code == "institution-1y", ct);
            var now = clock.GetUtcNow();
            db.Subscriptions.Add(new Subscription
            {
                Id = IdGen.New(),
                InstitutionId = institution.Id,
                PlanId = plan.Id,
                AllSubjects = true,
                StartsAt = now,
                EndsAt = now.AddDays(plan.DurationDays),
                Status = SubscriptionStatus.Active,
                CreatedAt = now,
                UpdatedAt = now,
            });
            teacher.LastInstitutionId = institution.Id;
            await db.SaveChangesAsync(ct);
        }

        if (!await db.Questions.AnyAsync(q => q.BankId == null, ct))
        {
            await SeedQuestionsAsync(admin.Id, ct);
        }

        logger.LogInformation("Development data seeded ({Admin} / {Teacher})", AdminEmail, TeacherEmail);
    }

    private async Task<AppUser> EnsureUserAsync(string email, string phone, string password, string name, string[] roles)
    {
        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            var id = IdGen.New();
            user = new AppUser
            {
                Id = id,
                UserName = id.ToString("N"),
                Email = email,
                EmailConfirmed = true,
                PhoneNumber = phone,
                PhoneNumberConfirmed = true,
                FullName = name,
                CreatedAt = clock.GetUtcNow(),
            };
            var result = await users.CreateAsync(user, password);
            if (!result.Succeeded)
            {
                throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
            }
        }

        foreach (var role in roles)
        {
            if (!await users.IsInRoleAsync(user, role))
            {
                await users.AddToRoleAsync(user, role);
            }
        }

        return user;
    }

    private async Task SeedQuestionsAsync(Guid authorId, CancellationToken ct)
    {
        var subject = await db.Subjects.FirstAsync(s => s.Code == "hsc-physics-1", ct);
        var defaults = new ImportDefaults { LevelId = subject.LevelId, SubjectId = subject.Id, Type = QuestionType.Mcq };
        tenant.Set(authorId, null, Roles.ContentEditor);

        var context = await resolver.LoadAsync(subject.Id, null, ct);
        var drafts = QuestionTextParser.Parse(SampleText());
        var rows = await resolver.ResolveAsync(drafts, defaults, context, platformTarget: true, ct);
        var groups = new Dictionary<string, Guid>(StringComparer.Ordinal);
        var created = 0;
        foreach (var row in rows.Where(r => r.Status is ImportRowStatus.Ok or ImportRowStatus.Warning))
        {
            var content = DraftMapper.ToContent(row.Draft, defaults);
            if (row.Draft.GroupKey is { } key && groups.TryGetValue(key, out var stimulusId))
            {
                content = content with { StimulusId = stimulusId };
            }

            var question = writer.Create(content with { IsCommon = created % 3 == 0 }, null, ContentStatus.Published, authorId);
            if (row.Draft.GroupKey is { } newKey && question.StimulusId is { } sid)
            {
                groups.TryAdd(newKey, sid);
            }

            created++;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} sample platform questions ({Skipped} skipped)", created, rows.Count - created);
    }

    /// <summary>Sample questions written for this project, in the teacher text format.</summary>
    private static string SampleText()
    {
        var ch = BanglaWords.Chapter;
        return $$"""
            {{ch}}: ১
            ১. নিচের কোনটি মৌলিক রাশি?
            ক. বল   খ. বেগ   গ. তড়িৎ প্রবাহ   ঘ. চাপ
            উত্তর: গ
            ব্যাখ্যা: SI পদ্ধতির সাতটি মৌলিক রাশির একটি তড়িৎ প্রবাহ।
            বোর্ড: ঢা ২০২৩; রা ২০২২
            কঠিনতা: ১
            টপিক: মৌলিক ও লব্ধ রাশি

            ২. বলের মাত্রা কোনটি?
            ক. $MLT^{-1}$   খ. $MLT^{-2}$   গ. $ML^2T^{-2}$   ঘ. $ML^{-1}T^{-2}$
            উত্তর: খ
            বোর্ড: কু ২০২১
            টপিক: মাত্রা

            ৩. কাজের SI একক কোনটি?
            ক. নিউটন   খ. জুল   গ. ওয়াট   ঘ. প্যাসকেল
            উত্তর: খ
            গুরুত্ব: ২

            ৪. $1$ নিউটন সমান কত ডাইন?
            ক. $10^3$   খ. $10^4$   গ. $10^5$   ঘ. $10^7$
            উত্তর: গ
            বোর্ড: য ২০২২; ব ২০১৯
            কঠিনতা: ২

            ৫. নিচের তথ্যগুলো লক্ষ করো:
            i. বেগ একটি ভেক্টর রাশি
            ii. দ্রুতি একটি স্কেলার রাশি
            iii. দূরত্ব একটি ভেক্টর রাশি
            নিচের কোনটি সঠিক?
            ক. i ও ii   খ. i ও iii   গ. ii ও iii   ঘ. i, ii ও iii
            উত্তর: ক

            {{ch}}: ২
            ৬. দুটি ভেক্টরের স্কেলার গুণফল শূন্য হলে তাদের মধ্যবর্তী কোণ কত?
            ক. $0^\circ$   খ. $45^\circ$   গ. $90^\circ$   ঘ. $180^\circ$
            উত্তর: গ
            বোর্ড: চ ২০২৩; সি ২০১৯; য ২০১৭; দি ২০১৬
            গুরুত্ব: ৩

            ৭. $\vec{A} \times \vec{A}$ এর মান কত?
            ক. $A^2$   খ. $0$   গ. $2A$   ঘ. $1$
            উত্তর: খ

            ৮. $\hat{i} \cdot \hat{i}$ এর মান কত?
            ক. $0$   খ. $1$   গ. $-1$   ঘ. $\hat{k}$
            উত্তর: খ

            অভিন্ন তথ্য:
            একটি বস্তুর ওপর $\vec{F} = 3\hat{i} + 4\hat{j}$ নিউটন বল ক্রিয়া করছে।
            ৯. বলটির মান কত নিউটন?
            ক. $3$   খ. $4$   গ. $5$   ঘ. $7$
            উত্তর: গ
            ১০. বস্তুটির সরণ $\vec{s} = 2\hat{i}$ মিটার হলে কৃতকাজ কত জুল?
            ক. $6$   খ. $8$   গ. $10$   ঘ. $14$
            উত্তর: ক
            ---

            সৃজনশীল ১.
            উদ্দীপক: দুটি ভেক্টর $\vec{P} = 2\hat{i} + 3\hat{j} - \hat{k}$ এবং $\vec{Q} = \hat{i} - \hat{j} + 2\hat{k}$।
            ক. একক ভেক্টর কাকে বলে? [১]
            খ. দুটি ভেক্টরের ভেক্টর গুণফল একটি ভেক্টর রাশি কেন? [২]
            গ. $\vec{P} \cdot \vec{Q}$ নির্ণয় করো। [৩]
            ঘ. ভেক্টর দুটি পরস্পর লম্ব কি না গাণিতিকভাবে যাচাই করো। [৪]
            উত্তর গ: $\vec{P} \cdot \vec{Q} = 2 - 3 - 2 = -3$

            {{ch}}: ৩
            সৃজনশীল ২.
            উদ্দীপক: একটি গাড়ি স্থির অবস্থা থেকে $2$ মি/সে² সমত্বরণে চলতে শুরু করল।
            ক. সমত্বরণ কাকে বলে? [১]
            খ. সুষম বেগে চলমান বস্তুর ত্বরণ শূন্য কেন? [২]
            গ. $5$ সেকেন্ডে গাড়িটি কত দূরত্ব অতিক্রম করবে? [৩]
            ঘ. $5$ সেকেন্ড পর গাড়িটি $1$ মি/সে² সুষম মন্দনে চললে থামার আগে মোট কত দূরত্ব অতিক্রম করবে? বিশ্লেষণ করো। [৪]
            উত্তর গ: $s = \frac{1}{2}at^2 = \frac{1}{2} \times 2 \times 5^2 = 25$ মিটার
            """;
    }
}
