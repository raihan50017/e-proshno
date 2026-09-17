using EProshno.Core.Billing;

namespace EProshno.Infrastructure.Seeding;

public sealed record SeedLevel(string Slug, string NameBn, int Sort, IReadOnlyList<SeedSubject> Subjects);

public sealed record SeedSubject(string Code, string NameBn, int? Paper, IReadOnlyList<SeedChapter> Chapters);

public sealed record SeedChapter(int Number, string NameBn, params string[] Topics);

public sealed record SeedBoard(string Code, string NameBn, string NameEn, string ShortBn);

/// <summary>
/// Official syllabus seed (NCTB 2012 curriculum for SSC and HSC science groups). The content team verifies names
/// against the current NCTB books and manages topics from the admin panel; the seeder only upserts.
/// </summary>
public static class SeedData
{
    public static readonly IReadOnlyList<SeedBoard> Boards =
    [
        new("dhaka", "ঢাকা", "Dhaka", "ঢা"),
        new("rajshahi", "রাজশাহী", "Rajshahi", "রা"),
        new("jashore", "যশোর", "Jashore", "য"),
        new("cumilla", "কুমিল্লা", "Cumilla", "কু"),
        new("chattogram", "চট্টগ্রাম", "Chattogram", "চ"),
        new("barishal", "বরিশাল", "Barishal", "ব"),
        new("sylhet", "সিলেট", "Sylhet", "সি"),
        new("dinajpur", "দিনাজপুর", "Dinajpur", "দি"),
        new("mymensingh", "ময়মনসিংহ", "Mymensingh", "ম"),
    ];

    public static readonly IReadOnlyList<SeedLevel> Levels =
    [
        new("ssc", "এসএসসি", 1,
        [
            new("ssc-physics", "পদার্থবিজ্ঞান", null,
            [
                new(1, "ভৌত রাশি এবং পরিমাপ"),
                new(2, "গতি"),
                new(3, "বল"),
                new(4, "কাজ, ক্ষমতা ও শক্তি"),
                new(5, "পদার্থের অবস্থা ও চাপ"),
                new(6, "বস্তুর উপর তাপের প্রভাব"),
                new(7, "তরঙ্গ ও শব্দ"),
                new(8, "আলোর প্রতিফলন"),
                new(9, "আলোর প্রতিসরণ"),
                new(10, "স্থির তড়িৎ"),
                new(11, "চল তড়িৎ"),
                new(12, "বিদ্যুতের চৌম্বক ক্রিয়া"),
                new(13, "আধুনিক পদার্থবিজ্ঞান ও ইলেকট্রনিক্স"),
                new(14, "জীবন বাঁচাতে পদার্থবিজ্ঞান"),
            ]),
            new("ssc-chemistry", "রসায়ন", null,
            [
                new(1, "রসায়নের ধারণা"),
                new(2, "পদার্থের অবস্থা"),
                new(3, "পদার্থের গঠন"),
                new(4, "পর্যায় সারণি"),
                new(5, "রাসায়নিক বন্ধন"),
                new(6, "মোলের ধারণা ও রাসায়নিক গণনা"),
                new(7, "রাসায়নিক বিক্রিয়া"),
                new(8, "রসায়ন ও শক্তি"),
                new(9, "এসিড-ক্ষার সমতা"),
                new(10, "খনিজ সম্পদ: ধাতু-অধাতু"),
                new(11, "খনিজ সম্পদ: জীবাশ্ম"),
                new(12, "আমাদের জীবনে রসায়ন"),
            ]),
            new("ssc-biology", "জীববিজ্ঞান", null,
            [
                new(1, "জীবন পাঠ"),
                new(2, "জীবকোষ ও টিস্যু"),
                new(3, "কোষ বিভাজন"),
                new(4, "জীবনীশক্তি"),
                new(5, "খাদ্য, পুষ্টি এবং পরিপাক"),
                new(6, "জীবে পরিবহন"),
                new(7, "গ্যাসীয় বিনিময়"),
                new(8, "রেচন প্রক্রিয়া"),
                new(9, "দৃঢ়তা প্রদান ও চলন"),
                new(10, "সমন্বয়"),
                new(11, "জীবের প্রজনন"),
                new(12, "জীবের বংশগতি ও বিবর্তন"),
                new(13, "জীবের পরিবেশ"),
                new(14, "জীবপ্রযুক্তি"),
            ]),
            new("ssc-higher-math", "উচ্চতর গণিত", null,
            [
                new(1, "সেট ও ফাংশন"),
                new(2, "বীজগাণিতিক রাশি"),
                new(3, "জ্যামিতি"),
                new(4, "জ্যামিতিক অঙ্কন"),
                new(5, "সমীকরণ"),
                new(6, "অসমতা"),
                new(7, "অসীম ধারা"),
                new(8, "ত্রিকোণমিতি"),
                new(9, "সূচকীয় ও লগারিদমীয় ফাংশন"),
                new(10, "দ্বিপদী বিস্তৃতি"),
                new(11, "স্থানাঙ্ক জ্যামিতি"),
                new(12, "সমতলীয় ভেক্টর"),
                new(13, "ঘন জ্যামিতি"),
                new(14, "সম্ভাবনা"),
            ]),
        ]),
        new("hsc", "এইচএসসি", 2,
        [
            new("hsc-physics-1", "পদার্থবিজ্ঞান", 1,
            [
                new(1, "ভৌতজগৎ ও পরিমাপ", "পদার্থবিজ্ঞানের পরিসর", "মৌলিক ও লব্ধ রাশি", "পরিমাপের একক", "মাত্রা", "পরিমাপের ত্রুটি"),
                new(2, "ভেক্টর", "স্কেলার ও ভেক্টর রাশি", "ভেক্টরের যোগ ও বিয়োগ", "ভেক্টরের বিভাজন", "স্কেলার গুণন", "ভেক্টর গুণন"),
                new(3, "গতিবিদ্যা", "সরণ, বেগ ও ত্বরণ", "গতির সমীকরণ", "পড়ন্ত বস্তু", "প্রাসের গতি", "বৃত্তীয় গতি"),
                new(4, "নিউটনিয়ান বলবিদ্যা"),
                new(5, "কাজ, শক্তি ও ক্ষমতা"),
                new(6, "মহাকর্ষ ও অভিকর্ষ"),
                new(7, "পদার্থের গাঠনিক ধর্ম"),
                new(8, "পর্যাবৃত্ত গতি"),
                new(9, "তরঙ্গ"),
                new(10, "আদর্শ গ্যাস ও গ্যাসের গতিতত্ত্ব"),
            ]),
            new("hsc-physics-2", "পদার্থবিজ্ঞান", 2,
            [
                new(1, "তাপগতিবিদ্যা"),
                new(2, "স্থির তড়িৎ"),
                new(3, "চল তড়িৎ"),
                new(4, "তড়িৎ প্রবাহের চৌম্বক ক্রিয়া ও চুম্বকত্ব"),
                new(5, "তাড়িতচৌম্বকীয় আবেশ ও পরিবর্তী প্রবাহ"),
                new(6, "জ্যামিতিক আলোকবিজ্ঞান"),
                new(7, "ভৌত আলোকবিজ্ঞান"),
                new(8, "আধুনিক পদার্থবিজ্ঞানের সূচনা"),
                new(9, "পরমাণুর মডেল এবং নিউক্লিয়ার পদার্থবিজ্ঞান"),
                new(10, "সেমিকন্ডাক্টর ও ইলেকট্রনিক্স"),
                new(11, "জ্যোতির্বিজ্ঞান"),
            ]),
            new("hsc-chemistry-1", "রসায়ন", 1,
            [
                new(1, "ল্যাবরেটরির নিরাপদ ব্যবহার"),
                new(2, "গুণগত রসায়ন"),
                new(3, "মৌলের পর্যায়বৃত্ত ধর্ম ও রাসায়নিক বন্ধন"),
                new(4, "রাসায়নিক পরিবর্তন"),
                new(5, "কর্মমুখী রসায়ন"),
            ]),
            new("hsc-chemistry-2", "রসায়ন", 2,
            [
                new(1, "পরিবেশ রসায়ন"),
                new(2, "জৈব রসায়ন"),
                new(3, "পরিমাণগত রসায়ন"),
                new(4, "তড়িৎ রসায়ন"),
                new(5, "অর্থনৈতিক রসায়ন"),
            ]),
            new("hsc-biology-1", "জীববিজ্ঞান", 1,
            [
                new(1, "কোষ ও এর গঠন"),
                new(2, "কোষ বিভাজন"),
                new(3, "কোষ রসায়ন"),
                new(4, "অণুজীব"),
                new(5, "শৈবাল ও ছত্রাক"),
                new(6, "ব্রায়োফাইটা ও টেরিডোফাইটা"),
                new(7, "নগ্নবীজী ও আবৃতবীজী উদ্ভিদ"),
                new(8, "টিস্যু ও টিস্যুতন্ত্র"),
                new(9, "উদ্ভিদ শারীরতত্ত্ব"),
                new(10, "উদ্ভিদ প্রজনন"),
                new(11, "জীবপ্রযুক্তি"),
                new(12, "জীবের পরিবেশ, বিস্তার ও সংরক্ষণ"),
            ]),
            new("hsc-biology-2", "জীববিজ্ঞান", 2,
            [
                new(1, "প্রাণীর বিভিন্নতা ও শ্রেণিবিন্যাস"),
                new(2, "প্রাণীর পরিচিতি"),
                new(3, "মানব শারীরতত্ত্ব: পরিপাক ও শোষণ"),
                new(4, "মানব শারীরতত্ত্ব: রক্ত ও সঞ্চালন"),
                new(5, "মানব শারীরতত্ত্ব: শ্বসন ও শ্বাসক্রিয়া"),
                new(6, "মানব শারীরতত্ত্ব: বর্জ্য ও নিষ্কাশন"),
                new(7, "মানব শারীরতত্ত্ব: চলন ও অঙ্গচালনা"),
                new(8, "মানব শারীরতত্ত্ব: সমন্বয় ও নিয়ন্ত্রণ"),
                new(9, "মানব জীবনের ধারাবাহিকতা"),
                new(10, "মানবদেহের প্রতিরক্ষা"),
                new(11, "জিনতত্ত্ব ও বিবর্তন"),
                new(12, "প্রাণীর আচরণ"),
            ]),
            new("hsc-higher-math-1", "উচ্চতর গণিত", 1,
            [
                new(1, "ম্যাট্রিক্স ও নির্ণায়ক"),
                new(2, "ভেক্টর"),
                new(3, "সরলরেখা"),
                new(4, "বৃত্ত"),
                new(5, "বিন্যাস ও সমাবেশ"),
                new(6, "ত্রিকোণমিতিক অনুপাত"),
                new(7, "সংযুক্ত কোণের ত্রিকোণমিতিক অনুপাত"),
                new(8, "ফাংশন ও ফাংশনের লেখচিত্র"),
                new(9, "অন্তরীকরণ"),
                new(10, "যোগজীকরণ"),
            ]),
            new("hsc-higher-math-2", "উচ্চতর গণিত", 2,
            [
                new(1, "বাস্তব সংখ্যা ও অসমতা"),
                new(2, "যোগাশ্রয়ী প্রোগ্রাম"),
                new(3, "জটিল সংখ্যা"),
                new(4, "বহুপদী ও বহুপদী সমীকরণ"),
                new(5, "দ্বিপদী বিস্তৃতি"),
                new(6, "কণিক"),
                new(7, "বিপরীত ত্রিকোণমিতিক ফাংশন ও ত্রিকোণমিতিক সমীকরণ"),
                new(8, "স্থিতিবিদ্যা"),
                new(9, "সমতলে বস্তুকণার গতি"),
                new(10, "বিস্তার পরিমাপ ও সম্ভাবনা"),
            ]),
            new("hsc-ict", "তথ্য ও যোগাযোগ প্রযুক্তি", null,
            [
                new(1, "তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত"),
                new(2, "কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং"),
                new(3, "সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস"),
                new(4, "ওয়েব ডিজাইন পরিচিতি এবং HTML"),
                new(5, "প্রোগ্রামিং ভাষা"),
                new(6, "ডেটাবেজ ম্যানেজমেন্ট সিস্টেম"),
            ]),
        ]),
        new("admission", "বিশ্ববিদ্যালয় ভর্তি", 3, []),
    ];

    /// <summary>Placeholder prices and limits until the business decides (PRD §3b); admins edit plans later.</summary>
    public static IReadOnlyList<Plan> Plans() =>
    [
        new()
        {
            Code = "trial", NameBn = "ট্রায়াল", Pricing = PlanPricing.AllSubjects, PricePoisha = 0, DurationDays = 7,
            IsActive = false, Sort = 0,
            Limits = new PlanLimits { SavedSets = 30, Teachers = 3, Students = 100, CustomBanks = 5, CustomQuestions = 1_000, ImportsPerMonth = 10 },
        },
        new()
        {
            Code = "subject-6m", NameBn = "বিষয়ভিত্তিক — ৬ মাস", DescriptionBn = "নির্বাচিত প্রতিটি বিষয়ের জন্য মূল্য।",
            Pricing = PlanPricing.PerSubject, PricePoisha = 30_000, DurationDays = 182, IsActive = true, Sort = 1,
            Limits = new PlanLimits { MaxSubjects = 10, Teachers = 5, Students = 500, CustomBanks = 20, CustomQuestions = 10_000, ImportsPerMonth = 30 },
        },
        new()
        {
            Code = "ssc-all-1y", NameBn = "এসএসসি — সব বিষয় (১ বছর)", Pricing = PlanPricing.AllSubjects,
            PricePoisha = 200_000, DurationDays = 365, IsActive = true, Sort = 2,
            Limits = new PlanLimits { LevelSlugs = ["ssc"], Teachers = 10, Students = 1_000, CustomBanks = 50, CustomQuestions = 25_000, ImportsPerMonth = 60 },
        },
        new()
        {
            Code = "hsc-all-1y", NameBn = "এইচএসসি — সব বিষয় (১ বছর)", Pricing = PlanPricing.AllSubjects,
            PricePoisha = 250_000, DurationDays = 365, IsActive = true, Sort = 3,
            Limits = new PlanLimits { LevelSlugs = ["hsc"], Teachers = 10, Students = 1_000, CustomBanks = 50, CustomQuestions = 25_000, ImportsPerMonth = 60 },
        },
        new()
        {
            Code = "institution-1y", NameBn = "প্রতিষ্ঠান — সব লেভেল (১ বছর)", Pricing = PlanPricing.AllSubjects,
            PricePoisha = 800_000, DurationDays = 365, IsActive = true, Sort = 4,
            Limits = new PlanLimits { Teachers = 50, Students = 5_000, ImportsPerMonth = 200 },
        },
    ];
}
