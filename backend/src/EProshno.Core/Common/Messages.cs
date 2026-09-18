namespace EProshno.Core.Common;

/// <summary>User-facing Bangla messages for API errors and validation (bn-BD, polite form, danda at the end).</summary>
public static class Messages
{
    // General
    public const string NotFound = "তথ্যটি পাওয়া যায়নি।";
    public const string Forbidden = "এই কাজের অনুমতি আপনার নেই।";
    public const string LoginRequired = "অনুগ্রহ করে লগইন করুন।";
    public const string InstitutionRequired = "আগে একটি প্রতিষ্ঠান নির্বাচন বা তৈরি করুন।";
    public const string ValidationFailed = "কিছু তথ্য সঠিক নয়। অনুগ্রহ করে যাচাই করুন।";
    public const string UnexpectedError = "একটি অপ্রত্যাশিত সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
    public const string TooManyRequests = "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
    public const string Required = "এই ঘরটি পূরণ করুন।";
    public const string TooLong = "লেখাটি অনেক বড়।";
    public const string InvalidValue = "মানটি সঠিক নয়।";

    // Auth
    public const string InvalidCredentials = "মোবাইল/ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।";
    public const string AccountLocked = "অনেকবার ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে বন্ধ আছে।";
    public const string PhoneOrEmailRequired = "মোবাইল নম্বর অথবা ইমেইল দিন।";
    public const string InvalidPhone = "সঠিক মোবাইল নম্বর দিন (যেমন ০১৭XXXXXXXX)।";
    public const string InvalidEmail = "সঠিক ইমেইল ঠিকানা দিন।";
    public const string PhoneTaken = "এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।";
    public const string EmailTaken = "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।";
    public const string WeakPassword = "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং তাতে অক্ষর ও সংখ্যা থাকতে হবে।";
    public const string WrongCurrentPassword = "বর্তমান পাসওয়ার্ড সঠিক নয়।";
    public const string InvalidOtp = "কোডটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।";
    public const string OtpSmsText = "আপনার লগইন কোড: {0}। কোডটি কাউকে জানাবেন না।";
    public const string SessionExpired = "সেশনের মেয়াদ শেষ হয়েছে। আবার লগইন করুন।";
    public const string NotAMember = "আপনি এই প্রতিষ্ঠানের সদস্য নন।";

    // Institution
    public const string InvitationInvalid = "আমন্ত্রণটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।";
    public const string AlreadyMember = "আপনি ইতিমধ্যে এই প্রতিষ্ঠানের সদস্য।";
    public const string InvitationSms = "{0} আপনাকে তাদের প্রতিষ্ঠানে যুক্ত হতে আমন্ত্রণ জানিয়েছে: {1}";
    public const string InstitutionLimit = "আপনি সর্বোচ্চ সংখ্যক প্রতিষ্ঠান তৈরি করেছেন।";
    public const string CannotChangeOwner = "প্রতিষ্ঠানের মালিকের ভূমিকা পরিবর্তন বা অপসারণ করা যাবে না।";
    public const string CannotRemoveSelf = "নিজেকে প্রতিষ্ঠান থেকে অপসারণ করা যাবে না।";
    public const string InvalidFileType = "ফাইলের ধরন গ্রহণযোগ্য নয়।";
    public const string FileTooLarge = "ফাইলটি অনুমোদিত আকারের চেয়ে বড়।";

    // Taxonomy and questions
    public const string SubjectNotFound = "বিষয়টি পাওয়া যায়নি।";
    public const string ChapterNumberTaken = "এই নম্বরের অধ্যায় আগেই আছে।";
    public const string SyllabusInUse = "এটি প্রশ্ন বা প্রশ্নসেটে ব্যবহৃত হয়েছে, তাই মুছে ফেলা যাবে না।";
    public const string ChapterNotInSubject = "অধ্যায়টি নির্বাচিত বিষয়ের অন্তর্গত নয়।";
    public const string TopicNotInChapter = "টপিকটি নির্বাচিত অধ্যায়ের অন্তর্গত নয়।";
    public const string McqNeedsFourOptions = "বহুনির্বাচনি প্রশ্নে ঠিক ৪টি অপশন থাকতে হবে।";
    public const string McqNeedsOneCorrect = "ঠিক একটি সঠিক উত্তর নির্বাচন করুন।";
    public const string McqKindRequired = "বহুনির্বাচনি প্রশ্নের ধরন নির্বাচন করুন।";
    public const string StimulusRequired = "উদ্দীপক লিখুন।";
    public const string CqNeedsFourParts = "সৃজনশীল প্রশ্নে ক, খ, গ, ঘ — চারটি অংশ থাকতে হবে।";
    public const string CqPartMarks = "প্রতিটি অংশের নম্বর ১ থেকে ১০ এর মধ্যে হতে হবে।";
    public const string StemRequired = "প্রশ্ন লিখুন।";
    public const string OptionRequired = "অপশনের লেখা দিন।";
    public const string InvalidContent = "প্রশ্নের লেখার ফরম্যাট সঠিক নয়।";
    public const string DifficultyRange = "কঠিনতা ১ থেকে ৩ এর মধ্যে হতে হবে।";
    public const string ImportanceRange = "গুরুত্ব ০ থেকে ৩ এর মধ্যে হতে হবে।";
    public const string AppearanceYear = "সাল ১৯৮০ থেকে বর্তমান বছরের মধ্যে হতে হবে।";
    public const string BoardRequired = "বোর্ড নির্বাচন করুন।";
    public const string DuplicateInBank = "এই প্রশ্নটি এই প্রশ্নব্যাংকে আগেই আছে।";
    public const string CommonInfoGroupSize = "অভিন্ন তথ্যভিত্তিক গ্রুপে ২ অথবা ৩টি প্রশ্ন থাকতে হবে।";
    public const string CommonInfoOnlySimple = "অভিন্ন তথ্যভিত্তিক গ্রুপের প্রতিটি প্রশ্ন বহুনির্বাচনি হতে হবে।";
    public const string InvalidStatusChange = "প্রশ্নের বর্তমান অবস্থা থেকে এই পরিবর্তন সম্ভব নয়।";
    public const string PlatformQuestionReadOnly = "প্ল্যাটফর্মের প্রশ্ন সম্পাদনা করা যাবে না। নিজের প্রশ্নব্যাংকে কপি করে নিন।";
    public const string ReportReasonRequired = "সমস্যাটি সংক্ষেপে লিখুন।";

    // Banks
    public const string BankNameRequired = "প্রশ্নব্যাংকের নাম দিন।";
    public const string BankNotEditable = "এই প্রশ্নব্যাংকে পরিবর্তনের অনুমতি আপনার নেই।";
    public const string DefaultBankName = "আমার প্রশ্ন";
    public const string CannotArchiveDefaultBank = "ডিফল্ট প্রশ্নব্যাংক আর্কাইভ করা যাবে না।";
    public const string BankLimitReached = "আপনার প্ল্যানে আর নতুন প্রশ্নব্যাংক তৈরি করা যাবে না।";
    public const string QuestionLimitReached = "আপনার প্ল্যানে নিজস্ব প্রশ্নের সীমা পূর্ণ হয়েছে।";
    public const string ImportLimitReached = "এই মাসের ইমপোর্ট সীমা পূর্ণ হয়েছে।";
    public const string SetLimitReached = "আপনার প্ল্যানে সংরক্ষিত প্রশ্নসেটের সীমা পূর্ণ হয়েছে।";
    public const string StudentLimitReached = "আপনার প্ল্যানে শিক্ষার্থীর সীমা পূর্ণ হয়েছে।";
    public const string TeacherLimitReached = "আপনার প্ল্যানে শিক্ষকের সীমা পূর্ণ হয়েছে।";

    // Sets and papers
    public const string SubjectSubscriptionRequired = "নির্বাচিত বিষয়ে সাবস্ক্রিপশন নেই।";
    public const string SetTitleRequired = "পরীক্ষার নাম দিন।";
    public const string ChaptersRequired = "অন্তত একটি অধ্যায় নির্বাচন করুন।";
    public const string BanksRequired = "অন্তত একটি প্রশ্নব্যাংক নির্বাচন করুন।";
    public const string TargetCountRange = "প্রশ্নের সংখ্যা ১ থেকে ২০০ এর মধ্যে হতে হবে।";
    public const string DurationRange = "সময় ৫ থেকে ৩০০ মিনিটের মধ্যে হতে হবে।";
    public const string FullMarksRange = "পূর্ণমান ১ থেকে ১০০০ এর মধ্যে হতে হবে।";
    public const string QuestionNotAvailable = "কিছু প্রশ্ন এই সেটে যোগ করা যায়নি।";
    public const string TooManyItems = "একটি সেটে সর্বোচ্চ ২০০টি প্রশ্ন রাখা যাবে।";
    public const string AutoSelectShortfall = "চাহিদা অনুযায়ী যথেষ্ট প্রশ্ন নেই — {0}টির মধ্যে {1}টি পাওয়া গেছে।";
    public const string InvalidVariant = "সেট নম্বর সঠিক নয়।";
    public const string SetHasNoQuestions = "সেটে কোনো প্রশ্ন নেই। আগে প্রশ্ন যুক্ত করুন।";
    public const string DefaultInstructions = "প্রশ্নপত্রে কোনো প্রকার দাগ/চিহ্ন দেয়া যাবে না।";
    public const string InvalidRenderToken = "লিংকটি সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।";
    public const string PdfRenderFailed = "PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।";

    // Imports
    public const string ImportTextRequired = "প্রশ্নের লেখা পেস্ট করুন।";
    public const string ImportFileRequired = "একটি ফাইল নির্বাচন করুন।";
    public const string ImportTooManyQuestions = "একবারে সর্বোচ্চ ৫,০০০টি প্রশ্ন ইমপোর্ট করা যাবে।";
    public const string ImportNotReady = "ইমপোর্টটি এখন এই ধাপে নেই।";
    public const string ImportHasErrors = "ত্রুটিযুক্ত সারিগুলো ঠিক করুন অথবা বাদ দিন।";
    public const string ImportNothingToCommit = "ইমপোর্ট করার মতো কোনো প্রশ্ন নেই।";
    public const string RollbackWindowOver = "৭ দিনের বেশি পুরোনো ইমপোর্ট ফিরিয়ে নেওয়া যাবে না।";
    public const string WordNotSupportedYet = "Word ফাইল ইমপোর্ট শীঘ্রই আসছে। আপাতত লেখা কপি করে পেস্ট করুন।";
    public const string LegacyOfficeFile = "পুরোনো ফরম্যাটের ফাইল (.xls/.doc) বা ম্যাক্রোযুক্ত ফাইল গ্রহণযোগ্য নয়। .xlsx হিসেবে সংরক্ষণ করে আবার চেষ্টা করুন।";
    public const string ImportMissingColumns = "টেমপ্লেটের প্রয়োজনীয় কলাম পাওয়া যায়নি: {0}";
    public const string ParseNoOptions = "৪টি অপশন (ক, খ, গ, ঘ) পাওয়া যায়নি।";
    public const string ParseNoAnswer = "উত্তর দেওয়া হয়নি।";
    public const string ParseBadAnswer = "উত্তরটি ক, খ, গ, ঘ অথবা ১–৪ হতে হবে।";
    public const string ParseAnswerMatchedText = "উত্তরের লেখা মিলিয়ে অপশন নির্ধারণ করা হয়েছে।";
    public const string ParseNoStimulus = "উদ্দীপক পাওয়া যায়নি।";
    public const string ParseMissingParts = "সৃজনশীল প্রশ্নের সব অংশ (ক–ঘ) পাওয়া যায়নি।";
    public const string ParseMarksDefaulted = "নম্বর না থাকায় ১-২-৩-৪ ধরা হয়েছে।";
    public const string ParseNumberGap = "প্রশ্নের নম্বরে ফাঁক আছে।";
    public const string ParseUnknownBoard = "বোর্ডের নাম চেনা যায়নি; ট্যাগটি বাদ দেওয়া হয়েছে।";
    public const string ParseChapterNotFound = "অধ্যায়টি পাওয়া যায়নি।";
    public const string ParseChapterFuzzy = "অধ্যায়টি \"{0}\" এর সাথে মেলানো হয়েছে।";
    public const string ParseEmptyStem = "প্রশ্নের লেখা নেই।";
    public const string ParseOrphanLine = "এই লাইনটি কোনো প্রশ্নের অংশ হিসেবে চেনা যায়নি।";
    public const string DuplicateInFile = "একই প্রশ্ন ফাইলে আগেও আছে।";
    public const string DuplicateInInstitution = "এই প্রশ্নটি আপনার প্রশ্নব্যাংকে আগেই আছে।";
    public const string DuplicateInPlatform = "প্ল্যাটফর্মের প্রশ্নব্যাংকে একই রকম প্রশ্ন আছে।";
    public const string ImportNoQuestionsFound = "ফাইলে কোনো প্রশ্ন পাওয়া যায়নি। ফরম্যাট যাচাই করুন।";
    public const string PdfNotSupportedYet = "PDF ইমপোর্ট শীঘ্রই আসছে। আপাতত Excel টেমপ্লেট বা লেখা পেস্ট ব্যবহার করুন।";
    public const string ImportMergedCells = "এই সারিতে একত্রিত (merged) ঘর আছে; ঘরগুলো আলাদা করুন।";
    public const string ImportImageIgnored = "ছবি এখনো ইমপোর্ট করা যায় না; ছবিটি পরে প্রশ্ন সম্পাদনা করে যুক্ত করুন।";
    public const string ImportInvalidPackage = "প্রশ্নব্যাংক ফাইলটি সঠিক নয় বা এই সংস্করণ সমর্থিত নয়।";
    public const string ImportTooManyRows = "ফাইলে অনেক বেশি সারি আছে।";
    public const string ImportTopicNotFound = "টপিকটি পাওয়া যায়নি; টপিক ছাড়া ইমপোর্ট হবে।";
    public const string ImportGroupIncomplete = "অভিন্ন তথ্যভিত্তিক গ্রুপের সব প্রশ্ন একসাথে ইমপোর্ট বা বাদ দিতে হবে।";
    public const string ImportRollbackNotAllowed = "শুধু ইমপোর্টকারী বা প্রতিষ্ঠানের অ্যাডমিন ইমপোর্ট ফিরিয়ে নিতে পারবেন।";
    public const string ImportUnsupportedSource = "এই ধরনের ফাইল এখানে গ্রহণযোগ্য নয়।";
    public const string ImportCommitFailed = "ইমপোর্ট সম্পূর্ণ হয়নি। আবার চেষ্টা করুন — আগে যুক্ত প্রশ্নগুলো দ্বিতীয়বার যুক্ত হবে না।";
    public const string ImportDailyLimit = "আজ অনেকগুলো ইমপোর্ট করা হয়েছে। আগামীকাল আবার চেষ্টা করুন।";
    public const string ImportFileExpired = "আপলোড করা ফাইলটি পাওয়া যায়নি। ফাইলটি আবার আপলোড করুন।";
    public const string ImportRowOk = "ঠিক আছে";
    public const string ImportRowWarning = "সতর্কতা";
    public const string ImportRowError = "ত্রুটি";
    public const string ImportRowDuplicate = "ডুপ্লিকেট";
    public const string ImportRowExcluded = "বাদ দেওয়া হয়েছে";
    public const string ImportRowImported = "ইমপোর্ট হয়েছে";

    // Billing
    public const string PlanNotFound = "প্ল্যানটি পাওয়া যায়নি।";
    public const string SubjectsRequiredForPlan = "এই প্ল্যানের জন্য অন্তত একটি বিষয় নির্বাচন করুন।";
    public const string TooManySubjectsForPlan = "এই প্ল্যানে এত বিষয় নির্বাচন করা যাবে না।";
    public const string PaymentGatewayUnavailable = "পেমেন্ট গেটওয়েতে এখন সংযোগ করা যাচ্ছে না। কিছুক্ষণ পর চেষ্টা করুন।";
    public const string FreePlanNoCheckout = "ফ্রি প্ল্যানের জন্য পেমেন্ট প্রয়োজন নেই।";
    public const string RenewalReminderSms = "আপনার \"{0}\" সাবস্ক্রিপশনের মেয়াদ {1} দিন পর শেষ হবে। নবায়ন করতে লগইন করুন।";
    public const string PaymentNotFound = "পেমেন্টের তথ্য পাওয়া যায়নি।";

    // Students
    public const string RollTaken = "এই ব্যাচে এই রোল নম্বর আগেই আছে।";
    public const string RollRequired = "রোল নম্বর দিন।";
    public const string RollDuplicateInFile = "ফাইলে এই রোল নম্বর একাধিকবার আছে।";
    public const string BatchNotEmpty = "ব্যাচে শিক্ষার্থী আছে। আগে শিক্ষার্থীদের সরিয়ে নিন বা মুছে ফেলুন।";
    public const string BatchNameTaken = "এই নামে আগেই একটি ব্যাচ আছে।";
    public const string StudentFileMissingColumns = "প্রয়োজনীয় কলাম পাওয়া যায়নি: {0}";
    public const string BatchNameRequired = "ব্যাচের নাম দিন।";
    public const string NameRequired = "নাম লিখুন।";
}
