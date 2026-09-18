import * as React from 'react'
import { BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { QuestionItemCard } from '@/components/shared/question-item-card'
import { SearchInput } from '@/components/shared/search-input'
import { useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import { useSearchQuestions } from '@/lib/api/generated/questions/questions'
import type { QuestionCard } from '@/lib/api/model/questionCard'
import type { ChapterDto } from '@/lib/api/model/chapterDto'
import { toBnDigits } from '@/lib/bn'

export function QuestionBankPage() {
  const { data: subjectsData, isLoading: subjectsLoading } = useListSubjects()
  const subjects = subjectsData?.data || []

  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('')
  const { data: chaptersData, isLoading: chaptersLoading } = useListChapters(
    selectedSubjectId,
    { query: { enabled: Boolean(selectedSubjectId) } }
  )
  const chapters: ChapterDto[] = (chaptersData?.data as ChapterDto[]) || []

  const [selectedChapterId, setSelectedChapterId] = React.useState<string>('all')
  const [selectedType, setSelectedType] = React.useState<'All' | 'Mcq' | 'Cq'>('All')
  const [keyword, setKeyword] = React.useState('')
  const [questions, setQuestions] = React.useState<QuestionCard[]>([])

  const { mutate: search, isPending } = useSearchQuestions({
    mutation: {
      onSuccess: (data: any) => {
        setQuestions(data?.data?.items || [])
      },
      onError: () => {
        toast.error('প্রশ্ন লোড করতে সমস্যা হয়েছে')
      },
    },
  })

  React.useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id)
    }
  }, [subjects, selectedSubjectId])

  // Trigger search on parameter changes
  React.useEffect(() => {
    if (!selectedSubjectId) return

    search({
      data: {
        subjectId: selectedSubjectId,
        chapterIds: selectedChapterId && selectedChapterId !== 'all' ? [selectedChapterId] : [],
        type: selectedType === 'All' ? null : selectedType === 'Mcq' ? 0 : 1,
        source: 0, // 0 = Platform
        bankIds: [],
        filters: {
          keyword: keyword.trim() || null,
          mode: 0,
          topicIds: [],
          tagIds: [],
          withImage: false,
          repeatedBoard: false,
        },
        limit: 50,
      },
    })
  }, [selectedSubjectId, selectedChapterId, selectedType, keyword, search])

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রশ্নব্যাংক ব্রাউজ"
        description="এনসিটিবি সিলেবাসভিত্তিক সমৃদ্ধ প্রশ্নভাণ্ডার অন্বেষণ ও পর্যালোচনা করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'প্রশ্নব্যাংক' },
        ]}
      />

      {/* Filter Toolbar Card */}
      <Card className="border-border">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Subject Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">বিষয়</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value)
                  setSelectedChapterId('all')
                }}
                disabled={subjectsLoading}
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.label || sub.nameBn} {sub.paper ? `(${toBnDigits(sub.paper)}য় পত্র)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Chapter Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">অধ্যায়</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedChapterId}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                disabled={chaptersLoading || chapters.length === 0}
              >
                <option value="all">সকল অধ্যায় ({toBnDigits(chapters.length)} টি)</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {toBnDigits(ch.number)}. {ch.nameBn || ch.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Question Type Toggle */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">প্রশ্নের ধরন</label>
              <div className="flex rounded-md border border-input p-0.5 bg-muted/40">
                {(['All', 'Mcq', 'Cq'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedType(t)}
                    className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                      selectedType === t
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'All' ? 'সকল' : t === 'Mcq' ? 'MCQ' : 'CQ'}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">অনুসন্ধান</label>
              <SearchInput
                placeholder="প্রশ্নের মূলভাব বা টপিক খুঁজুন..."
                value={keyword}
                onChange={setKeyword}
                className="h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          মোট পাওয়া গেছে: <strong className="text-foreground">{toBnDigits(questions.length)}</strong> টি প্রশ্ন
        </span>
        {isPending && <span className="text-primary font-medium">লোড হচ্ছে...</span>}
      </div>

      {/* Question Cards List */}
      {isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-lg border border-border bg-card/60 animate-pulse" />
          ))}
        </div>
      ) : questions.length > 0 ? (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <QuestionItemCard
              key={q.id}
              question={q}
              index={idx}
              onCopy={(item) => toast.success(`"${item.stem.slice(0, 20)}..." নিজস্ব ব্যাংকে কপি করা হয়েছে!`)}
              onReport={() => toast.info('প্রশ্নের ভুল রিপোর্টের ফর্ম খোলা হয়েছে')}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="কোনো প্রশ্ন পাওয়া যায়নি"
          description="বর্তমান ফিল্টার বা অনুসন্ধান শব্দ পরিবর্তন করে আবার চেষ্টা করুন।"
        />
      )}
    </div>
  )
}
