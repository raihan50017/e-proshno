import * as React from 'react'
import {
  Eye,
  Save,
  MessageSquare,
  Users,
  ChevronRight,
  Flag,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RichText } from '@/components/shared/rich-text'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'
import type { QuestionCard } from '@/lib/api/model/questionCard'
import type { ChapterDto, TopicDto } from '@/lib/api/model'

interface GenerateStepPickerProps {
  setId: string
  title: string
  targetCount: number
  selectedSubjectId: string
  selectedChapterId: string
  chapters: ChapterDto[]
  selectedQuestionIds: string[]
  setSelectedQuestionIds: React.Dispatch<React.SetStateAction<string[]>>
  onGoToPreview: () => void
  onSaveSetItems: () => Promise<void>
  isSaving: boolean
}

export function GenerateStepPicker({
  setId,
  title,
  targetCount = 30,
  selectedSubjectId,
  selectedChapterId,
  chapters,
  selectedQuestionIds,
  setSelectedQuestionIds,
  onGoToPreview,
  onSaveSetItems,
  isSaving,
}: GenerateStepPickerProps) {
  // Search and Filter States matching 3.png
  const [keywordInput, setKeywordInput] = React.useState('')
  const [activeKeyword, setActiveKeyword] = React.useState('')
  const [activeMode, setActiveMode] = React.useState<'unique' | 'common'>('unique')

  // Special Search Checkboxes
  const [filterRepeatedBoard, setFilterRepeatedBoard] = React.useState(false)
  const [filterIsMath, setFilterIsMath] = React.useState<boolean | null>(null) // true = math, false = theory, null = all
  const [filterWithImage, setFilterWithImage] = React.useState(false)
  const [filterMultiChoice, setFilterMultiChoice] = React.useState(false)
  const [filterCommonInfo, setFilterCommonInfo] = React.useState(false)

  // Topic Checkboxes
  const [selectedTopicIds, setSelectedTopicIds] = React.useState<string[]>([])

  // Questions State
  const [questions, setQuestions] = React.useState<QuestionCard[]>([])
  const [isLoadingQuestions, setIsLoadingQuestions] = React.useState(false)

  // Report Modal State
  const [reportingQuestion, setReportingQuestion] = React.useState<QuestionCard | null>(null)
  const [reportReason, setReportReason] = React.useState('')
  const [isSubmittingReport, setIsSubmittingReport] = React.useState(false)

  // Find active chapter and topics
  const activeChapter = chapters.find((c) => c.id === selectedChapterId)
  const chapterTopics: TopicDto[] = (activeChapter as any)?.topics || []

  // Fetch Questions from API
  const fetchQuestions = React.useCallback(async () => {
    setIsLoadingQuestions(true)
    try {
      const modeNum = activeMode === 'unique' ? 1 : 2 // 1 = Unique, 2 = Common
      const payload: any = {
        source: 2, // Both Platform & Custom Banks
        subjectId: selectedSubjectId || null,
        chapterIds: selectedChapterId ? [selectedChapterId] : [],
        type: 0, // MCQ
        currentSetId: setId || undefined,
        filters: {
          keyword: activeKeyword.trim() || null,
          mode: modeNum,
          topicIds: selectedTopicIds,
          tagIds: [],
          withImage: filterWithImage,
          repeatedBoard: filterRepeatedBoard,
          isMath: filterIsMath,
          mcqKind: filterCommonInfo ? 2 : filterMultiChoice ? 1 : null,
        },
        limit: 100,
      }

      const res = await apiClient.post('/api/v1/questions/search', payload)
      setQuestions(res.data?.items || [])
    } catch {
      toast.error('প্রশ্ন খুঁজতে সমস্যা হয়েছে')
    } finally {
      setIsLoadingQuestions(false)
    }
  }, [
    selectedSubjectId,
    selectedChapterId,
    setId,
    activeKeyword,
    activeMode,
    selectedTopicIds,
    filterWithImage,
    filterRepeatedBoard,
    filterIsMath,
    filterCommonInfo,
    filterMultiChoice,
  ])

  React.useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // Toggle single question selection
  const toggleQuestionSelection = (qid: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qid) ? prev.filter((id) => id !== qid) : [...prev, qid]
    )
  }

  // Toggle select all
  const areAllSelected =
    questions.length > 0 && questions.every((q) => selectedQuestionIds.includes(q.id))

  const handleToggleSelectAll = () => {
    if (areAllSelected) {
      const questionIdSet = new Set(questions.map((q) => q.id))
      setSelectedQuestionIds((prev) => prev.filter((id) => !questionIdSet.has(id)))
    } else {
      const combined = new Set([...selectedQuestionIds, ...questions.map((q) => q.id)])
      setSelectedQuestionIds(Array.from(combined))
    }
  }

  // Handle reporting a question
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportingQuestion || !reportReason.trim()) return
    setIsSubmittingReport(true)
    try {
      await apiClient.post(`/api/v1/questions/${reportingQuestion.id}/report`, {
        reason: reportReason.trim(),
      })
      toast.success('রিপোর্টটি সফলভাবে জমা হয়েছে। ধন্যবাদ!')
      setReportingQuestion(null)
      setReportReason('')
    } catch {
      toast.error('রিপোর্ট পাঠাতে সমস্যা হয়েছে')
    } finally {
      setIsSubmittingReport(false)
    }
  }

  // Star rating helper
  const renderStars = (importance?: number, difficulty?: number) => {
    const count = importance ? Math.min(5, Math.max(1, importance)) : difficulty ? difficulty : 2
    return '★'.repeat(count)
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 font-sans">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Main Grid: Left Column (Cards) + Right Column (Filters) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Left Column (3 cols): Top Bar + Notice + Question Cards */}
          <div className="lg:col-span-3 space-y-4">
            {/* Top Selection Bar (Matching 3.png) */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 px-5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate max-w-xs">
                  {title || 'Test-Exam'}
                </h2>
                <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">
                  {toBnDigits(selectedQuestionIds.length)}/{toBnDigits(targetCount)} নির্বাচিত
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Select All Checkbox */}
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none font-medium px-2 py-1 rounded hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={areAllSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-4 cursor-pointer"
                  />
                  <span>সব নির্বাচন</span>
                </label>

                {/* Preview Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onGoToPreview}
                  className="h-8 text-xs gap-1.5 border-slate-200 hover:border-slate-300 text-slate-700"
                >
                  <Eye className="size-3.5" />
                  প্রিভিউ
                </Button>

                {/* Save Button */}
                <Button
                  type="button"
                  size="sm"
                  onClick={onSaveSetItems}
                  disabled={isSaving}
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                >
                  <Save className="size-3.5" />
                  {isSaving ? 'সংরক্ষণ...' : 'সেভ'}
                </Button>
              </div>
            </div>

            {/* Error Report Notice Banner (Matching 3.png) */}
            <div className="bg-[#fffbeb] border border-[#fef3c7] text-[#92400e] text-xs py-2 px-4 rounded-lg text-center font-medium shadow-2xs">
              প্রশ্নে ভুল পেলে রিপোর্ট করে প্রশ্নব্যাংক সমৃদ্ধ করুন।
            </div>

            {/* Question Cards List */}
            {isLoadingQuestions ? (
              <div className="space-y-3 p-8 text-center bg-white rounded-xl border border-slate-200">
                <div className="size-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500">প্রশ্ন খোঁজা হচ্ছে...</p>
              </div>
            ) : questions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">কোনো প্রশ্ন পাওয়া যায়নি</p>
                <p className="text-xs text-slate-500">অন্য ফিল্টার বা অধ্যায় নির্বাচন করে দেখুন</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {questions.map((q, idx) => {
                  const isSelected = selectedQuestionIds.includes(q.id)
                  const boardTagText = (q.boardTags || []).join('; ')

                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestionSelection(q.id)}
                      className={`bg-white border rounded-xl p-4 sm:p-5 transition-all cursor-pointer relative shadow-2xs ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/[0.02]'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Card Top Meta Row: Rating, Board tags, Report button */}
                      <div className="flex items-center justify-between gap-2 pb-2 text-xs">
                        <div className="flex items-center gap-2">
                          {/* Selection Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleQuestionSelection(q.id)
                            }}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-4 cursor-pointer"
                          />

                          {/* Star Rating */}
                          <span className="text-amber-500 font-bold tracking-widest text-xs">
                            {renderStars(q.importance, q.difficulty)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Board Tags Badge */}
                          {boardTagText && (
                            <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              [{boardTagText}]
                            </span>
                          )}

                          {/* Report Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setReportingQuestion(q)
                            }}
                            title="প্রশ্নে ভুল থাকলে রিপোর্ট করুন"
                            className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-slate-100 transition-colors"
                          >
                            <MessageSquare className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Question Stem */}
                      <div className="pt-1 pb-3 text-sm text-slate-900 font-medium leading-relaxed">
                        <span className="font-bold mr-1.5">{toBnDigits(idx + 1)}.</span>
                        <RichText content={q.stem} className="inline" />
                      </div>

                      {/* Options 2x2 Grid (Matching 3.png) */}
                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const optLabel = ['ক', 'খ', 'গ', 'ঘ'][oIdx] || String(oIdx + 1)
                            const isCorrect = opt.isCorrect

                            return (
                              <div
                                key={oIdx}
                                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                                  isCorrect
                                    ? 'bg-slate-100/90 border-slate-300 text-slate-900 font-medium'
                                    : 'bg-slate-50/70 border-slate-200/80 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`size-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${
                                    isCorrect
                                      ? 'bg-slate-900 text-white'
                                      : 'border border-slate-300 text-slate-600 bg-white'
                                  }`}
                                >
                                  {optLabel}
                                </span>
                                <div className="truncate flex-1">
                                  <RichText content={opt.content} className="inline" />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column (1 col): Advanced Filter Menu (Matching 3.png) */}
          <div className="lg:col-span-1 space-y-4 sticky top-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {/* Header */}
              <div className="p-3 text-center border-b border-slate-100 bg-slate-50/60">
                <h3 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                  এডভান্সড ফিল্টার মেনু
                </h3>
              </div>

              <div className="p-4 space-y-4">
                {/* Search Box */}
                <div className="flex gap-1.5">
                  <Input
                    placeholder="কীওয়ার্ড সার্চ করুন"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setActiveKeyword(keywordInput)}
                    className="h-8 text-xs border-slate-200"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveKeyword(keywordInput)}
                    className="h-8 text-xs shrink-0 px-2.5 border-slate-200"
                  >
                    সার্চ করুন
                  </Button>
                </div>

                {/* Mode Tabs: ইউনিক মোড | কমন প্রশ্ন (নতুন) */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveMode('unique')}
                      className={`py-1.5 px-2 rounded-md font-semibold text-center transition-all ${
                        activeMode === 'unique'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ইউনিক মোড
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMode('common')}
                      className={`py-1.5 px-2 rounded-md font-medium text-center transition-all ${
                        activeMode === 'common'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      কমন প্রশ্ন (নতুন)
                    </button>
                  </div>

                  {/* Mode Information Card */}
                  <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100 space-y-1">
                    <div className="text-xs font-bold text-emerald-800">
                      {activeMode === 'unique' ? 'ইউনিক প্রশ্ন তৈরী' : 'কমন প্রশ্ন নির্বাচন'}
                    </div>
                    <p className="text-[11px] text-emerald-700/90 leading-relaxed">
                      {activeMode === 'unique'
                        ? 'পূর্বের প্রশ্ন বাদ দিয়ে নতুন প্রশ্ন তৈরি হবে, একটি পরীক্ষার সাথে অন্য পরীক্ষার প্রশ্ন মিল হবে না।'
                        : 'বিভিন্ন বোর্ডে বারবার আসা বহুল ব্যবহৃত গুরুত্বপূর্ণ প্রশ্ন অগ্রাধিকার পাবে।'}
                    </p>
                    <p className="text-[10px] text-amber-700 pt-0.5 italic">
                      তৈরীভূত কোনো প্রশ্ন নেই!
                    </p>
                  </div>
                </div>

                {/* Affiliate Program Refer Card */}
                <div
                  onClick={() => window.open('/affiliate', '_self')}
                  className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/50 flex items-center justify-between cursor-pointer transition-colors text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-slate-500" />
                    <div>
                      <div className="font-semibold text-slate-800 text-[11px]">Affiliate Program</div>
                      <div className="text-[10px] text-slate-500">Refer & Earn</div>
                    </div>
                  </div>
                  <ChevronRight className="size-3.5 text-slate-400" />
                </div>

                {/* Section: ই-প্রশ্নব্যাংক স্পেশাল সার্চ */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="text-xs font-bold text-slate-800">
                    ই-প্রশ্নব্যাংক স্পেশাল সার্চ
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterRepeatedBoard}
                        onChange={(e) => setFilterRepeatedBoard(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5"
                      />
                      <span>রিপিটেড বোর্ড প্রশ্ন</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterIsMath === true}
                        onChange={(e) => setFilterIsMath(e.target.checked ? true : null)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5"
                      />
                      <span>গাণিতিক</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterIsMath === false}
                        onChange={(e) => setFilterIsMath(e.target.checked ? false : null)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5"
                      />
                      <span>তত্ত্বীয়</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterWithImage}
                        onChange={(e) => setFilterWithImage(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5"
                      />
                      <span>চিত্রযুক্ত প্রশ্ন</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterMultiChoice}
                        onChange={(e) => setFilterMultiChoice(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5"
                      />
                      <span>বহুপদী সমাপ্তিসূচক</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filterCommonInfo}
                        onChange={(e) => setFilterCommonInfo(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5"
                      />
                      <span>অভিন্ন তথ্যভিত্তিক</span>
                    </label>
                  </div>
                </div>

                {/* Section: টপিক - অধ্যায় */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="text-xs font-bold text-slate-800">
                    টপিক - {activeChapter ? activeChapter.nameBn : 'অধ্যায়'}
                  </div>

                  {chapterTopics.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">কোনো টপিক অন্তর্ভুক্ত নেই</p>
                  ) : (
                    <div className="space-y-1.5 text-xs text-slate-700 max-h-48 overflow-y-auto pr-1">
                      {chapterTopics.map((top) => {
                        const isChecked = selectedTopicIds.includes(top.id)
                        return (
                          <label
                            key={top.id}
                            className="flex items-start gap-2 cursor-pointer select-none text-[11px] leading-tight"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                setSelectedTopicIds((prev) =>
                                  prev.includes(top.id)
                                    ? prev.filter((id) => id !== top.id)
                                    : [...prev, top.id]
                                )
                              }
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-3.5 mt-0.5 shrink-0"
                            />
                            <span>{top.nameBn}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Report Question Dialog */}
      <Dialog open={Boolean(reportingQuestion)} onOpenChange={(open) => !open && setReportingQuestion(null)}>
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
                  className="w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 font-sans"
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
                onClick={() => setReportingQuestion(null)}
                disabled={isSubmittingReport}
                className="text-xs"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingReport}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
              >
                {isSubmittingReport ? 'রিপোর্ট হচ্ছে...' : 'রিপোর্ট পাঠান'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
