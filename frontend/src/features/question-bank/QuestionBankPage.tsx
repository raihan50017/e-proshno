import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, Copy, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { QuestionItemCard } from '@/components/shared/question-item-card'
import { SearchInput } from '@/components/shared/search-input'
import { AddToSetModal } from '@/features/sets/AddToSetModal'
import { QuestionEditModal } from './QuestionEditModal'
import { useListBanks } from '@/lib/api/generated/question-banks/question-banks'
import { useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import { useSearchQuestions, useCopyQuestions, useReportQuestion } from '@/lib/api/generated/questions/questions'
import type { QuestionCard, ChapterDto, SubjectDto, BankDto, QuestionSource } from '@/lib/api/model'
import { toBnDigits } from '@/lib/bn'

export function QuestionBankPage() {
  const { data: subjectsData, isLoading: subjectsLoading } = useListSubjects()
  const subjects: SubjectDto[] = React.useMemo(() => {
    if (!subjectsData) return []
    if (Array.isArray(subjectsData)) return subjectsData
    if ('data' in subjectsData && Array.isArray((subjectsData as any).data)) return (subjectsData as any).data
    return []
  }, [subjectsData])

  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('')
  const { data: chaptersData, isLoading: chaptersLoading } = useListChapters(
    selectedSubjectId,
    { query: { enabled: Boolean(selectedSubjectId) } }
  )
  const chapters: ChapterDto[] = React.useMemo(() => {
    if (!chaptersData) return []
    if (Array.isArray(chaptersData)) return chaptersData
    if ('data' in chaptersData && Array.isArray((chaptersData as any).data)) return (chaptersData as any).data
    return []
  }, [chaptersData])

  const [searchParams] = useSearchParams()
  const initialBankId = searchParams.get('bankId') || ''

  const [selectedSource, setSelectedSource] = React.useState<QuestionSource>((initialBankId ? 1 : 0) as QuestionSource)
  const [selectedBankId, setSelectedBankId] = React.useState<string>(initialBankId)
  const [selectedChapterId, setSelectedChapterId] = React.useState<string>('all')
  const [selectedType, setSelectedType] = React.useState<'All' | 'Mcq' | 'Cq'>('All')
  const [keyword, setKeyword] = React.useState('')
  const [questions, setQuestions] = React.useState<QuestionCard[]>([])

  // Edit Question Modal State
  const [editQuestion, setEditQuestion] = React.useState<QuestionCard | null>(null)

  // Add To Set Modal State
  const [addToSetQuestion, setAddToSetQuestion] = React.useState<QuestionCard | null>(null)

  // Custom Banks for Copy action
  const { data: banksData, isLoading: banksLoading } = useListBanks()
  const banks: BankDto[] = React.useMemo(() => {
    if (!banksData) return []
    if (Array.isArray(banksData)) return banksData
    if ('data' in banksData && Array.isArray((banksData as any).data)) return (banksData as any).data
    return []
  }, [banksData])

  // Copy Dialog State
  const [copyQuestion, setCopyQuestion] = React.useState<QuestionCard | null>(null)
  const [targetBankId, setTargetBankId] = React.useState<string>('')

  // Report Dialog State
  const [reportQuestion, setReportQuestion] = React.useState<QuestionCard | null>(null)
  const [reportReason, setReportReason] = React.useState('')

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

  const { mutate: executeCopy, isPending: isCopying } = useCopyQuestions({
    mutation: {
      onSuccess: () => {
        toast.success('প্রশ্ন সফলভাবে আপনার ব্যাংকে কপি করা হয়েছে!')
        setCopyQuestion(null)
      },
      onError: () => {
        toast.error('ব্যাংকে প্রশ্ন কপি করতে সমস্যা হয়েছে')
      },
    },
  })

  const { mutate: executeReport, isPending: isReporting } = useReportQuestion({
    mutation: {
      onSuccess: () => {
        toast.success('প্রশ্নের সমস্যা সফলভাবে রিপোর্ট করা হয়েছে!')
        setReportQuestion(null)
        setReportReason('')
      },
      onError: () => {
        toast.error('রিপোর্ট পাঠাতে সমস্যা হয়েছে')
      },
    },
  })

  React.useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id)
    }
  }, [subjects, selectedSubjectId])

  React.useEffect(() => {
    if (banks.length > 0 && !targetBankId) {
      setTargetBankId(banks[0].id)
    }
  }, [banks, targetBankId])

  const executeSearch = React.useCallback(() => {
    if (!selectedSubjectId && selectedSource === 0) return

    search({
      data: {
        subjectId: selectedSubjectId || '',
        chapterIds: selectedChapterId && selectedChapterId !== 'all' ? [selectedChapterId] : [],
        type: selectedType === 'All' ? null : selectedType === 'Mcq' ? 0 : 1,
        source: selectedSource,
        bankIds: selectedSource === 1 && selectedBankId ? [selectedBankId] : [],
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
  }, [selectedSubjectId, selectedChapterId, selectedType, selectedSource, selectedBankId, keyword, search])

  React.useEffect(() => {
    executeSearch()
  }, [executeSearch])

  const subjectOptions = React.useMemo(
    () =>
      subjects.map((sub) => ({
        value: sub.id,
        label: `${sub.label || sub.nameBn}${sub.paper ? ` (${toBnDigits(sub.paper)}য় পত্র)` : ''}`,
      })),
    [subjects]
  )

  const chapterOptions = React.useMemo(
    () => [
      { value: 'all', label: `সকল অধ্যায় (${toBnDigits(chapters.length)} টি)` },
      ...chapters.map((ch) => ({
        value: ch.id,
        label: `${toBnDigits(ch.number)}. ${ch.nameBn || ch.label}`,
      })),
    ],
    [chapters]
  )

  const bankOptions = React.useMemo(
    () =>
      banks.map((b) => ({
        value: b.id,
        label: b.name,
        description: b.sharing === 0 ? 'ব্যক্তিগত ব্যাংক' : 'প্রাতিষ্ঠানিক ব্যাংক',
      })),
    [banks]
  )

  const handleCopySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!copyQuestion || !targetBankId) {
      toast.error('টার্গেট ব্যাংক নির্বাচন করুন')
      return
    }

    executeCopy({
      data: {
        questionIds: [copyQuestion.id],
        bankId: targetBankId,
      },
    })
  }

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportQuestion || !reportReason.trim()) {
      toast.error('সমস্যার বিবরণ লিখুন')
      return
    }

    executeReport({
      id: reportQuestion.id,
      data: {
        reason: reportReason.trim(),
      },
    })
  }

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
        <CardContent className="p-4 space-y-3">
          {/* Source Tabs: Platform vs Custom/Imported Banks */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
            <div className="flex items-center rounded-md border border-input p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => {
                  setSelectedSource(0)
                  setSelectedBankId('')
                }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  selectedSource === 0
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                প্ল্যাটফর্ম প্রশ্নভাণ্ডার
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSource(1)
                  if (banks.length > 0 && !selectedBankId) {
                    setSelectedBankId(banks[0].id)
                  }
                }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  selectedSource === 1
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                আমার নিজস্ব / ইমপোর্ট ব্যাংক ({toBnDigits(banks.length)})
              </button>
            </div>

            {selectedSource === 1 && banks.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">টার্গেট ব্যাংক:</span>
                <div className="w-56">
                  <Combobox
                    options={bankOptions}
                    value={selectedBankId}
                    onChange={(val) => setSelectedBankId(val)}
                    placeholder="ব্যাংক নির্বাচন করুন"
                    searchPlaceholder="ব্যাংক খুঁজুন..."
                    triggerClassName="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Subject Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">বিষয়</label>
              <Combobox
                options={subjectOptions}
                value={selectedSubjectId}
                onChange={(val) => {
                  setSelectedSubjectId(val)
                  setSelectedChapterId('all')
                }}
                placeholder="বিষয় নির্বাচন করুন"
                searchPlaceholder="বিষয় খুঁজুন..."
                loading={subjectsLoading}
                triggerClassName="h-9 text-xs"
              />
            </div>

            {/* Chapter Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">অধ্যায়</label>
              <Combobox
                options={chapterOptions}
                value={selectedChapterId}
                onChange={(val) => setSelectedChapterId(val)}
                placeholder="অধ্যায় নির্বাচন করুন"
                searchPlaceholder="অধ্যায় খুঁজুন..."
                disabled={chaptersLoading || chapters.length === 0}
                loading={chaptersLoading}
                triggerClassName="h-9 text-xs"
              />
            </div>

            {/* Question Type Toggle */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">প্রশ্নের ধরন</label>
              <div className="flex rounded-md border border-input p-0.5 bg-muted/40 h-9 items-center">
                {(['All', 'Mcq', 'Cq'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedType(t)}
                    className={`flex-1 rounded h-7.5 py-1 text-xs font-medium transition-colors ${
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
              onAddToSet={(item) => setAddToSetQuestion(item)}
              onEdit={(item) => setEditQuestion(item)}
              onCopy={(item) => setCopyQuestion(item)}
              onReport={(item) => setReportQuestion(item)}
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

      {/* Copy to Custom Bank Dialog */}
      <Dialog open={Boolean(copyQuestion)} onOpenChange={(open) => !open && setCopyQuestion(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCopySubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Copy className="size-4 text-primary" />
                প্রশ্নের কপি সংরক্ষণ করুন
              </DialogTitle>
              <DialogDescription className="text-xs">
                এই প্রশ্নটি আপনার নির্বাচিত নিজস্ব প্রশ্নব্যাংকে যুক্ত হবে এবং পরবর্তীতে সম্পাদনা করতে পারবেন।
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted/40 p-3 text-xs border border-border space-y-1">
                <span className="font-semibold text-foreground block">নির্বাচিত প্রশ্ন:</span>
                <p className="text-muted-foreground line-clamp-2">
                  {copyQuestion?.stem ? (typeof copyQuestion.stem === 'string' ? copyQuestion.stem : JSON.stringify(copyQuestion.stem)) : ''}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetBank">টার্গেট প্রশ্নব্যাংক *</Label>
                {banks.length === 0 && !banksLoading ? (
                  <p className="text-xs text-rose-500">
                    আপনার কোনো নিজস্ব প্রশ্নব্যাংক নেই। &quot;আমার প্রশ্নব্যাংক&quot; মেনু থেকে একটি ব্যাংক তৈরি করুন।
                  </p>
                ) : (
                  <Combobox
                    options={bankOptions}
                    value={targetBankId}
                    onChange={setTargetBankId}
                    placeholder="প্রশ্নব্যাংক নির্বাচন করুন"
                    searchPlaceholder="প্রশ্নব্যাংক খুঁজুন..."
                    loading={banksLoading}
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCopyQuestion(null)}
                disabled={isCopying}
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                disabled={isCopying || banks.length === 0}
                loading={isCopying}
                loadingText="কপি হচ্ছে..."
              >
                কপি নিশ্চিত করুন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Report Question Dialog */}
      <Dialog open={Boolean(reportQuestion)} onOpenChange={(open) => !open && setReportQuestion(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleReportSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-rose-600">
                <Flag className="size-4" />
                প্রশ্নে অসঙ্গতি রিপোর্ট করুন
              </DialogTitle>
              <DialogDescription className="text-xs">
                প্রশ্নে কোনো ভুল উত্তর, বানান ত্রুটি বা বিভ্রান্তিকর তথ্য থাকলে বিস্তারিত জানান।
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reportReason">সমস্যার বিবরণ *</Label>
                <textarea
                  id="reportReason"
                  rows={4}
                  required
                  maxLength={500}
                  placeholder="যেমন: এই প্রশ্নের সঠিক উত্তর খ না হয়ে গ হবে কারণ..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
                />
                <p className="text-[11px] text-muted-foreground text-right">
                  {toBnDigits(reportReason.length)}/৫০০ অক্ষর
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReportQuestion(null)}
                disabled={isReporting}
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isReporting || !reportReason.trim()}
                loading={isReporting}
                loadingText="জমা দেওয়া হচ্ছে..."
              >
                রিপোর্ট জমা দিন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Question Edit Modal (for custom / imported questions) */}
      <QuestionEditModal
        question={editQuestion}
        bankId={selectedBankId || editQuestion?.bankId || undefined}
        isOpen={Boolean(editQuestion)}
        onClose={() => setEditQuestion(null)}
        onSuccess={() => executeSearch()}
      />

      {/* Add To Question Set Modal */}
      <AddToSetModal
        question={addToSetQuestion}
        isOpen={Boolean(addToSetQuestion)}
        onClose={() => setAddToSetQuestion(null)}
      />
    </div>
  )
}
