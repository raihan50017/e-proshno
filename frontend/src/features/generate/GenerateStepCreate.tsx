import * as React from 'react'
import {
  ChevronDown,
  Maximize2,
  Check,
  Search,
  BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LevelDto, SubjectDto, ChapterDto } from '@/lib/api/model'
import { toBnDigits } from '@/lib/bn'

interface GenerateStepCreateProps {
  title: string
  setTitle: (val: string) => void
  selectedLevelId: string
  setSelectedLevelId: (val: string) => void
  levels: LevelDto[]
  levelsLoading: boolean
  selectedSubjectId: string
  setSelectedSubjectId: (val: string) => void
  subjects: SubjectDto[]
  subjectsLoading?: boolean
  selectedChapterId: string
  setSelectedChapterId: (val: string) => void
  chapters: ChapterDto[]
  chaptersLoading?: boolean
  questionType: 'Mcq' | 'Cq'
  setQuestionType: (val: 'Mcq' | 'Cq') => void
  questionCount: number
  setQuestionCount: (val: number) => void
  isSubmitting: boolean
  onSubmit: (e: React.FormEvent) => void
}

export function GenerateStepCreate({
  title,
  setTitle,
  selectedLevelId,
  setSelectedLevelId,
  levels,
  levelsLoading,
  selectedSubjectId,
  setSelectedSubjectId,
  subjects,
  subjectsLoading: _subjectsLoading,
  selectedChapterId,
  setSelectedChapterId,
  chapters,
  chaptersLoading: _chaptersLoading,
  questionType,
  setQuestionType,
  questionCount,
  setQuestionCount,
  isSubmitting,
  onSubmit,
}: GenerateStepCreateProps) {
  const [isSubjectModalOpen, setIsSubjectModalOpen] = React.useState(false)
  const [isChapterModalOpen, setIsChapterModalOpen] = React.useState(false)
  const [subjectSearch, setSubjectSearch] = React.useState('')
  const [chapterSearch, setChapterSearch] = React.useState('')

  const activeSubject = subjects.find((s) => s.id === selectedSubjectId)
  const activeChapter = chapters.find((c) => c.id === selectedChapterId)

  const filteredSubjects = React.useMemo(() => {
    if (!subjectSearch.trim()) return subjects
    const q = subjectSearch.trim().toLowerCase()
    return subjects.filter((s) => s.nameBn.toLowerCase().includes(q) || (s.label || '').toLowerCase().includes(q))
  }, [subjects, subjectSearch])

  const filteredChapters = React.useMemo(() => {
    if (!chapterSearch.trim()) return chapters
    const q = chapterSearch.trim().toLowerCase()
    return chapters.filter((c) => c.nameBn.toLowerCase().includes(q) || String(c.number).includes(q))
  }, [chapters, chapterSearch])

  return (
    <div className="min-h-[85vh] bg-[#daf5ea] py-8 px-4 flex items-center justify-center font-sans">
      {/* macOS Style Card Window (Matching 1.png) */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden relative">
        {/* macOS Window Title Bar */}
        <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block shadow-2xs" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block shadow-2xs" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block shadow-2xs" />
          </div>
          <span className="text-xs text-slate-500 font-mono tracking-wider font-medium">
            ৪.৩.১০
          </span>
        </div>

        {/* Promotional / Announcement Header Banner */}
        <div className="relative bg-gradient-to-r from-[#0d1d36] via-[#132c52] to-[#0e2746] text-white p-5 overflow-hidden border-b border-slate-800">
          {/* Subtle background glow */}
          <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute left-1/2 -top-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-md">
              <div className="text-[11px] text-amber-300 font-semibold tracking-wide">
                সেপ্টেম্বর মাসে নতুন প্যাকেজ ক্রয় বা রিনিউ করলেই
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight flex items-center gap-1.5">
                <span>১ ক্লিকে প্রশ্ন তৈরির সফটওয়্যার!</span>
              </h2>
              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <span>আপনার ক্লাসে প্রযুক্তির শাখা বাড়ান!</span>
                <span>🌱</span>
              </p>
              <div className="text-[11px] text-slate-300 pt-0.5">
                কালার প্রিন্টার জেতার সুযোগ
              </div>
            </div>

            <div className="flex flex-col sm:flex-col gap-2 shrink-0 self-start sm:self-center">
              <Button
                type="button"
                size="sm"
                className="bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold px-3.5 h-8 shadow-xs border-0"
                onClick={() => window.open('/subscription', '_self')}
              >
                Subscribe Now!
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-transparent hover:bg-white/10 text-white border-white/30 text-xs h-8 font-medium"
                onClick={() => window.open('/subscription', '_self')}
              >
                Giveaway Details!
              </Button>
            </div>
          </div>
        </div>

        {/* Main Form Body */}
        <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-4 relative">
          {/* Status Badge */}
          <div className="flex justify-center pb-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>আপডেটেড ১৫ ঘন্টা আগে</span>
              <ChevronDown className="size-3.5 text-slate-400" />
            </div>
          </div>

          {/* Exam Title Input */}
          <div className="space-y-1">
            <Input
              id="examTitle"
              placeholder="Test-Exam"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 text-sm border-slate-200 rounded-md focus-visible:ring-emerald-500"
              required
            />
          </div>

          {/* Class / Level Dropdown */}
          <div className="space-y-1">
            <div className="relative">
              <select
                id="examLevel"
                value={selectedLevelId}
                onChange={(e) => setSelectedLevelId(e.target.value)}
                disabled={levelsLoading}
                className="w-full h-10 px-3 pr-8 rounded-md border border-slate-200 bg-white text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
              >
                {levels.length === 0 && <option value="">শ্রেণি লোড হচ্ছে...</option>}
                {levels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.nameBn}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3 size-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Subject Selector with Expand/Modal trigger */}
          <div className="space-y-1">
            <div
              onClick={() => setIsSubjectModalOpen(true)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white flex items-center justify-between text-sm cursor-pointer hover:border-slate-300 transition-colors"
            >
              <span className={activeSubject ? 'text-foreground font-medium' : 'text-slate-400'}>
                {activeSubject
                  ? `${activeSubject.label || activeSubject.nameBn}${activeSubject.paper ? ` (${toBnDigits(activeSubject.paper)}য় পত্র)` : ''}`
                  : 'পদার্থবিজ্ঞান ২য় পত্র'}
              </span>
              <Maximize2 className="size-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-rose-500 font-medium pl-0.5">
              বিষয় সিলেক্ট করুন
            </p>
          </div>

          {/* Chapter Selector with Expand/Modal trigger */}
          <div className="space-y-1">
            <div
              onClick={() => setIsChapterModalOpen(true)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white flex items-center justify-between text-sm cursor-pointer hover:border-slate-300 transition-colors"
            >
              <span className={activeChapter ? 'text-foreground font-medium' : 'text-slate-400'}>
                {activeChapter
                  ? `অধ্যায় ${toBnDigits(activeChapter.number)} - ${activeChapter.nameBn}`
                  : chapters.length > 0
                  ? `অধ্যায় ${toBnDigits(chapters[0].number)} - ${chapters[0].nameBn}`
                  : 'অধ্যায় ১ - তাপগতিবিদ্যা'}
              </span>
              <Maximize2 className="size-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-rose-500 font-medium pl-0.5">
              অধ্যায় সিলেক্ট করুন
            </p>
          </div>

          {/* Row: Question Type & Question Count */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Question Type */}
            <div className="relative">
              <select
                id="examType"
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as any)}
                className="w-full h-10 px-3 pr-8 rounded-md border border-slate-200 bg-white text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-emerald-500 appearance-none cursor-pointer"
              >
                <option value="Mcq">বহুনির্বাচনী</option>
                <option value="Cq">সৃজনশীল</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 size-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Question Count */}
            <div>
              <Input
                id="examCount"
                type="number"
                min={1}
                max={100}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))}
                className="h-10 text-sm border-slate-200 rounded-md focus-visible:ring-emerald-500"
                placeholder="30"
              />
            </div>
          </div>

          {/* Subscription Alert Bar */}
          <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-md p-2.5 px-3 flex items-center justify-between gap-3 text-xs text-[#92400e]">
            <span>সিলেক্টেড বিষয়ে সাবস্ক্রিপশন নেই</span>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3 rounded shadow-2xs"
              onClick={() => window.open('/subscription', '_self')}
            >
              Subscribe
            </Button>
          </div>

          {/* Big Green Primary Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-md shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>তৈরি হচ্ছে...</span>
                </>
              ) : (
                <span>প্রশ্ন তৈরী করুন</span>
              )}
            </Button>
          </div>

          {/* Subtle Hand Click Watermark (Bottom Right) */}
          <div className="absolute right-4 bottom-3 pointer-events-none opacity-10 select-none">
            <svg
              className="w-20 h-20 text-slate-900"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </div>
        </form>
      </div>

      {/* Subject Selector Modal */}
      <Dialog open={isSubjectModalOpen} onOpenChange={setIsSubjectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="size-4 text-emerald-600" />
              বিষয় নির্বাচন করুন
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <Input
                placeholder="বিষয় খুঁজুন..."
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {filteredSubjects.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">কোনো বিষয় পাওয়া যায়নি</p>
              ) : (
                filteredSubjects.map((sub) => {
                  const isSelected = sub.id === selectedSubjectId
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setSelectedSubjectId(sub.id)
                        setIsSubjectModalOpen(false)
                      }}
                      className={`w-full text-left p-2.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>
                        {sub.label || sub.nameBn}
                        {sub.paper ? ` (${toBnDigits(sub.paper)}য় পত্র)` : ''}
                      </span>
                      {isSelected && <Check className="size-4 text-emerald-600" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chapter Selector Modal */}
      <Dialog open={isChapterModalOpen} onOpenChange={setIsChapterModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="size-4 text-emerald-600" />
              অধ্যায় নির্বাচন করুন
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <Input
                placeholder="অধ্যায় খুঁজুন..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {filteredChapters.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">কোনো অধ্যায় পাওয়া যায়নি</p>
              ) : (
                filteredChapters.map((chap) => {
                  const isSelected = chap.id === selectedChapterId
                  return (
                    <button
                      key={chap.id}
                      type="button"
                      onClick={() => {
                        setSelectedChapterId(chap.id)
                        setIsChapterModalOpen(false)
                      }}
                      className={`w-full text-left p-2.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>
                        অধ্যায় {toBnDigits(chap.number)} - {chap.nameBn}
                      </span>
                      {isSelected && <Check className="size-4 text-emerald-600" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
