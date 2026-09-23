import * as React from 'react'
import { Check, Edit3, PlusCircle, Save, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useListBanks } from '@/lib/api/generated/question-banks/question-banks'
import { useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import type { QuestionCard } from '@/lib/api/model/questionCard'
import type { BankDto, SubjectDto, ChapterDto } from '@/lib/api/model'
import { apiClient } from '@/lib/api-client'
import { OPTION_LABELS, toBnDigits } from '@/lib/bn'
import { textToTipTapJson, tipTapJsonToText, cleanOptionText } from '@/lib/rich-content'

export interface QuestionUpsertModalProps {
  question?: QuestionCard | null
  bankId?: string
  subjectId?: string
  chapterId?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function QuestionUpsertModal({
  question,
  bankId: initialBankId,
  subjectId: initialSubjectId,
  chapterId: initialChapterId,
  isOpen,
  onClose,
  onSuccess,
}: QuestionUpsertModalProps) {
  const isEdit = Boolean(question)

  // Bank list
  const { data: banksData, isLoading: banksLoading } = useListBanks()
  const banks: BankDto[] = React.useMemo(() => {
    if (!banksData) return []
    if (Array.isArray(banksData)) return banksData
    if ('data' in banksData && Array.isArray((banksData as any).data)) return (banksData as any).data
    return []
  }, [banksData])

  // Subject list
  const { data: subjectsData, isLoading: subjectsLoading } = useListSubjects()
  const subjects: SubjectDto[] = React.useMemo(() => {
    if (!subjectsData) return []
    if (Array.isArray(subjectsData)) return subjectsData
    if ('data' in subjectsData && Array.isArray((subjectsData as any).data)) return (subjectsData as any).data
    return []
  }, [subjectsData])

  // Form states
  const [selectedBankId, setSelectedBankId] = React.useState<string>(initialBankId || '')
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>(initialSubjectId || '')
  const [selectedChapterId, setSelectedChapterId] = React.useState<string>(initialChapterId || '')
  const [type, setType] = React.useState<number>(0) // 0 = Mcq, 1 = Cq
  const [stem, setStem] = React.useState('')
  const [stimulus, setStimulus] = React.useState('')
  const [explanation, setExplanation] = React.useState('')
  const [difficulty, setDifficulty] = React.useState<number>(2) // 1=Easy, 2=Medium, 3=Hard
  const [importance, setImportance] = React.useState<number>(1) // 0..3

  // MCQ Options
  const [options, setOptions] = React.useState<Array<{ content: string; isCorrect: boolean }>>([
    { content: '', isCorrect: true },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
  ])

  // CQ Parts
  const [cqParts, setCqParts] = React.useState<Array<{ prompt: string; marks: number; answer: string }>>([
    { prompt: '', marks: 1, answer: '' },
    { prompt: '', marks: 2, answer: '' },
    { prompt: '', marks: 3, answer: '' },
    { prompt: '', marks: 4, answer: '' },
  ])

  const [isSaving, setIsSaving] = React.useState(false)

  // Chapters query based on selected subject
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

  // Track modal open/question ID to avoid resetting user input on background refetches
  const initializedIdRef = React.useRef<string | null>(null)

  // Reset or initialize fields when modal opens or question changes
  React.useEffect(() => {
    if (!isOpen) {
      initializedIdRef.current = null
      return
    }

    const currentKey = question
      ? question.id || (question as any).questionId || 'edit-question'
      : 'create-new'
    if (initializedIdRef.current === currentKey) {
      return
    }
    initializedIdRef.current = currentKey

    if (question) {
      // Edit mode
      const isMcqQ =
        question.type === 0 ||
        (question.type as any) === 'Mcq' ||
        (question.type as any) === '0'
      const typeNum = isMcqQ ? 0 : 1

      setSelectedBankId(question.bankId || initialBankId || (banks.length > 0 ? banks[0].id : ''))
      setSelectedSubjectId(question.subjectId || initialSubjectId || '')
      setSelectedChapterId(question.chapterId || initialChapterId || '')
      setType(typeNum)
      setStem(tipTapJsonToText(question.stem ?? (question as any).stemText ?? ''))
      setStimulus(tipTapJsonToText(question.stimulus))
      setExplanation(tipTapJsonToText(question.explanation))
      setDifficulty(question.difficulty ?? 2)
      setImportance(question.importance ?? 1)

      if (isMcqQ) {
        let loadedOpts: Array<{ content: string; isCorrect: boolean }> = []
        if (question.options && question.options.length > 0) {
          loadedOpts = question.options.map((opt: any) => ({
            content: cleanOptionText(tipTapJsonToText(opt.content ?? opt.text ?? opt, { stripMathDelimiters: true })),
            isCorrect: Boolean(opt.isCorrect),
          }))
        }
        while (loadedOpts.length < 4) {
          loadedOpts.push({ content: '', isCorrect: false })
        }
        if (!loadedOpts.some((o) => o.isCorrect)) {
          loadedOpts[0].isCorrect = true
        }
        setOptions(loadedOpts)
      }

      if (!isMcqQ) {
        let loadedParts: Array<{ prompt: string; marks: number; answer: string }> = []
        if (question.cqParts && question.cqParts.length > 0) {
          loadedParts = question.cqParts.map((part: any) => ({
            prompt: tipTapJsonToText(part.prompt ?? part.text ?? ''),
            marks: Number(part.marks) || 1,
            answer: tipTapJsonToText(part.answer ?? ''),
          }))
        }
        while (loadedParts.length < 4) {
          const idx = loadedParts.length
          loadedParts.push({ prompt: '', marks: idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? 3 : 4, answer: '' })
        }
        setCqParts(loadedParts)
      }
    } else {
      // Create mode
      setSelectedBankId(initialBankId || (banks.length > 0 ? banks[0].id : ''))
      setSelectedSubjectId(initialSubjectId || '')
      setSelectedChapterId(initialChapterId || '')
      setType(0)
      setStem('')
      setStimulus('')
      setExplanation('')
      setDifficulty(2)
      setImportance(1)
      setOptions([
        { content: '', isCorrect: true },
        { content: '', isCorrect: false },
        { content: '', isCorrect: false },
        { content: '', isCorrect: false },
      ])
      setCqParts([
        { prompt: '', marks: 1, answer: '' },
        { prompt: '', marks: 2, answer: '' },
        { prompt: '', marks: 3, answer: '' },
        { prompt: '', marks: 4, answer: '' },
      ])
    }
  }, [isOpen, question, initialBankId, initialSubjectId, initialChapterId, banks])

  // Prevent race condition: if banks finish loading after modal opened with empty bankId
  React.useEffect(() => {
    if (!isOpen) return
    if (!selectedBankId && banks.length > 0) {
      const fallback = question?.bankId || initialBankId || banks[0].id
      if (fallback) setSelectedBankId(fallback)
    }
  }, [isOpen, selectedBankId, banks, question?.bankId, initialBankId])

  // Prevent race condition: if subjects finish loading after modal opened
  React.useEffect(() => {
    if (!isOpen) return
    if (!selectedSubjectId && subjects.length > 0 && question?.subjectId) {
      setSelectedSubjectId(question.subjectId)
    }
  }, [isOpen, selectedSubjectId, subjects, question?.subjectId])

  // Prevent race condition: if chapters finish loading after modal opened
  React.useEffect(() => {
    if (!isOpen) return
    if (!selectedChapterId && chapters.length > 0 && question?.chapterId) {
      setSelectedChapterId(question.chapterId)
    }
  }, [isOpen, selectedChapterId, chapters, question?.chapterId])

  // If bank changes and bank has a subject, default to that subject
  const handleBankChange = (val: string) => {
    setSelectedBankId(val)
    const b = banks.find((item) => item.id === val)
    if (b?.subjectId && !selectedSubjectId) {
      setSelectedSubjectId(b.subjectId)
    }
  }

  const handleOptionChange = (index: number, content: string) => {
    setOptions((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], content }
      return next
    })
  }

  const handleCorrectOptionChange = (selectedIndex: number) => {
    setOptions((prev) =>
      prev.map((opt, idx) => ({
        ...opt,
        isCorrect: idx === selectedIndex,
      }))
    )
  }

  const handleCqPartChange = (index: number, field: 'prompt' | 'marks' | 'answer', value: any) => {
    setCqParts((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedBankId) {
      toast.error('টার্গেট প্রশ্নব্যাংক নির্বাচন করুন')
      return
    }

    if (!selectedSubjectId) {
      toast.error('বিষয় নির্বাচন করুন')
      return
    }

    if (!selectedChapterId) {
      toast.error('অধ্যায় নির্বাচন করুন')
      return
    }

    const isMcq = type === 0

    if (isMcq) {
      if (!stem.trim()) {
        toast.error('MCQ প্রশ্নের মূল বক্তব্য (Stem) প্রদান করুন')
        return
      }
      const emptyOptions = options.some((o) => !o.content.trim())
      if (emptyOptions) {
        toast.error('ক, খ, গ, ঘ চারটি অপশনই পূরণ করুন')
        return
      }
      const hasCorrect = options.some((o) => o.isCorrect)
      if (!hasCorrect) {
        toast.error('একটি সঠিক উত্তর চিহ্নিত করুন')
        return
      }
    } else {
      if (!stimulus.trim()) {
        toast.error('সৃজনশীল প্রশ্নের উদ্দীপক আবশ্যক')
        return
      }
      const emptyPrompts = cqParts.some((p) => !p.prompt.trim())
      if (emptyPrompts) {
        toast.error('সৃজনশীল প্রশ্নের ক, খ, গ, ঘ চারটি অংশের প্রশ্ন পূরণ করুন')
        return
      }
    }

    setIsSaving(true)
    try {
      const payload: any = {
        type,
        subjectId: selectedSubjectId,
        chapterId: selectedChapterId,
        stem: textToTipTapJson(stem.trim() || (isMcq ? '' : 'সৃজনশীল প্রশ্ন')),
        stimulus: stimulus.trim() ? textToTipTapJson(stimulus.trim()) : undefined,
        explanation: explanation.trim() ? textToTipTapJson(explanation.trim()) : undefined,
        difficulty,
        importance,
        options: isMcq
          ? options.map((o) => ({ content: textToTipTapJson(o.content.trim()), isCorrect: o.isCorrect }))
          : [],
        cqParts: !isMcq
          ? cqParts.map((p) => ({
              prompt: textToTipTapJson(p.prompt.trim()),
              marks: Number(p.marks) || 1,
              answer: p.answer.trim() ? textToTipTapJson(p.answer.trim()) : undefined,
            }))
          : [],
        appearances: [],
        tagIds: [],
      }

      if (isMcq) {
        payload.mcqKind = stimulus.trim() ? 2 : 0 // 2 = CommonInfo if stimulus, else 0 = Simple
      }

      const targetBank = selectedBankId || question?.bankId || initialBankId || (banks.length > 0 ? banks[0].id : '')
      if (!targetBank) {
        toast.error('টার্গেট প্রশ্নব্যাংক নির্বাচন করুন')
        setIsSaving(false)
        return
      }

      if (isEdit && question && question.id) {
        const updateBankId = selectedBankId || question.bankId || targetBank
        await apiClient.put(
          `/api/v1/question-banks/${updateBankId}/questions/${question.id}`,
          payload
        )
        toast.success('প্রশ্নটি সফলভাবে হালনাগাদ করা হয়েছে!')
      } else {
        await apiClient.post(
          `/api/v1/question-banks/${targetBank}/questions`,
          payload
        )
        toast.success(
          isEdit
            ? 'প্রশ্নটি কাস্টমাইজ করে আপনার ব্যাংকে সফলভাবে সংরক্ষিত হয়েছে!'
            : 'নতুন প্রশ্নটি আপনার ব্যাংকে সফলভাবে সংরক্ষিত হয়েছে!'
        )
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      const data = err?.response?.data
      let errorMsg = ''
      if (data?.errors && typeof data.errors === 'object') {
        const first = Object.values(data.errors)[0]
        if (Array.isArray(first) && first.length > 0) {
          errorMsg = first[0] as string
        }
      }
      if (!errorMsg) {
        errorMsg = data?.detail || data?.message || 'প্রশ্ন সংরক্ষণ করতে সমস্যা হয়েছে'
      }
      toast.error(errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  const bankOptions = React.useMemo(() => {
    const list = banks.map((b) => ({
      value: b.id,
      label: b.name,
      description: b.sharing === 0 ? 'ব্যক্তিগত' : 'প্রাতিষ্ঠানিক',
    }))
    const curBankId = question?.bankId || initialBankId
    if (curBankId && !list.some((b) => b.value === curBankId)) {
      list.unshift({
        value: curBankId,
        label: question?.bankName || 'বর্তমান ব্যাংক',
        description: 'প্রশ্নব্যাংক',
      })
    }
    return list
  }, [banks, question, initialBankId])

  const subjectOptions = React.useMemo(() => {
    const list = subjects.map((sub) => ({
      value: sub.id,
      label: `${sub.label || sub.nameBn}${sub.paper ? ` (${toBnDigits(sub.paper)}য় পত্র)` : ''}`,
    }))
    if (question?.subjectId && !list.some((sub) => sub.value === question.subjectId)) {
      list.unshift({
        value: question.subjectId,
        label: 'বর্তমান বিষয়',
      })
    }
    return list
  }, [subjects, question])

  const chapterOptions = React.useMemo(() => {
    const list = chapters.map((ch) => ({
      value: ch.id,
      label: `${toBnDigits(ch.number)}. ${ch.nameBn || ch.label}`,
    }))
    if (question?.chapterId && !list.some((ch) => ch.value === question.chapterId)) {
      list.unshift({
        value: question.chapterId,
        label: question.chapterName
          ? `${toBnDigits(question.chapterNumber || 1)}. ${question.chapterName}`
          : 'বর্তমান অধ্যায়',
      })
    }
    return list
  }, [chapters, question])

  const isMcq = type === 0
  const cqPartLabels = ['ক (জ্ঞানমূলক)', 'খ (অনুধাবনমূলক)', 'গ (প্রয়োগমূলক)', 'ঘ (উচ্চতর দক্ষতা)']

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[96vw] h-[92vh] max-h-[95vh] sm:h-[90vh] sm:max-h-[92vh] flex flex-col p-0 overflow-hidden shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <DialogHeader className="shrink-0 p-4 sm:px-6 sm:py-3.5 border-b border-border bg-muted/25">
            <div className="space-y-0.5 pr-8">
              <div className="flex items-center gap-2 text-primary">
                {isEdit ? <Edit3 className="size-5" /> : <PlusCircle className="size-5" />}
                <DialogTitle className="text-base font-bold">
                  {isEdit ? 'প্রশ্ন সম্পাদনা ও আপডেট' : 'নতুন প্রশ্ন তৈরি করুন'}
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {isEdit
                  ? 'প্রশ্নের টেক্সট, অপশন বা উত্তর পরিবর্তন করে নিচের আপডেট বাটনে চাপুন'
                  : 'আপনার নিজস্ব প্রশ্নব্যাংকে নতুন MCQ বা সৃজনশীল প্রশ্ন যুক্ত করুন'}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Top Config Row: Bank, Subject, Chapter, Type */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 bg-muted/30 p-3.5 rounded-lg border border-border/80">
              {/* Target Bank */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">টার্গেট ব্যাংক *</Label>
                <Combobox
                  options={bankOptions}
                  value={selectedBankId}
                  onChange={handleBankChange}
                  placeholder="ব্যাংক নির্বাচন..."
                  searchPlaceholder="ব্যাংক খুঁজুন..."
                  loading={banksLoading}
                  triggerClassName="h-9 text-xs"
                />
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">বিষয় *</Label>
                <Combobox
                  options={subjectOptions}
                  value={selectedSubjectId}
                  onChange={(val) => {
                    setSelectedSubjectId(val)
                    setSelectedChapterId('')
                  }}
                  placeholder="বিষয় নির্বাচন..."
                  searchPlaceholder="বিষয় খুঁজুন..."
                  loading={subjectsLoading}
                  triggerClassName="h-9 text-xs"
                />
              </div>

              {/* Chapter */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">অধ্যায় *</Label>
                <Combobox
                  options={chapterOptions}
                  value={selectedChapterId}
                  onChange={setSelectedChapterId}
                  placeholder="অধ্যায় নির্বাচন..."
                  searchPlaceholder="অধ্যায় খুঁজুন..."
                  disabled={!selectedSubjectId || (chaptersLoading && chapterOptions.length === 0) || chapterOptions.length === 0}
                  loading={chaptersLoading}
                  triggerClassName="h-9 text-xs"
                />
              </div>

              {/* Question Type Switcher */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">প্রশ্নের ধরন *</Label>
                <div className="flex rounded-md border border-input p-0.5 bg-background h-9 items-center">
                  <button
                    type="button"
                    onClick={() => setType(0)}
                    className={`flex-1 rounded h-7.5 py-1 text-xs font-medium transition-colors ${
                      type === 0
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    MCQ
                  </button>
                  <button
                    type="button"
                    onClick={() => setType(1)}
                    className={`flex-1 rounded h-7.5 py-1 text-xs font-medium transition-colors ${
                      type === 1
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    সৃজনশীল (CQ)
                  </button>
                </div>
              </div>
            </div>

            {/* Stimulus (উদ্দীপক) - Required for CQ, Optional for MCQ */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="stimulus" className="text-xs font-semibold flex items-center gap-1.5">
                  উদ্দীপক / অনুচ্ছেদ {!isMcq && <span className="text-rose-500">* (আবশ্যক)</span>}
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {isMcq ? 'অভিন্ন তথ্যভিত্তিক বহুনির্বাচনি প্রশ্নের ক্ষেত্রে প্রযোজ্য' : 'সৃজনশীল প্রশ্নের দৃশ্যকল্প / উদ্দীপক'}
                </span>
              </div>
              <textarea
                id="stimulus"
                rows={isMcq ? 2 : 3}
                value={stimulus}
                onChange={(e) => setStimulus(e.target.value)}
                placeholder="উদ্দীপক বা তথ্য এখানে লিখুন (গাণিতিক সূত্রের জন্য $E=mc^2$ ব্যবহার করুন)..."
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
              />
            </div>

            {/* Stem (মূল প্রশ্ন) */}
            <div className="space-y-1.5">
              <Label htmlFor="stem" className="text-xs font-semibold text-foreground flex items-center gap-1">
                {isMcq ? 'মূল প্রশ্ন (Stem) *' : 'সৃজনশীল শিরোনাম বা সাধারণ নির্দেশনা (ঐচ্ছিক)'}
              </Label>
              <textarea
                id="stem"
                rows={isMcq ? 2 : 2}
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                placeholder={isMcq ? 'প্রশ্নের মূল বক্তব্য লিখুন...' : 'যেমন: উদ্দীপকটি পড়ে নিচের প্রশ্নগুলোর উত্তর দাও:'}
                required={isMcq}
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed font-medium"
              />
            </div>

            {/* MCQ Options Form */}
            {isMcq ? (
              <div className="space-y-3 pt-1">
                {/* Dedicated Correct Answer Selector Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40">
                  <div className="flex items-center gap-1.5">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-foreground">
                      সঠিক উত্তর নির্বাচন করুন:
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {options.map((opt, idx) => {
                      const label = OPTION_LABELS[idx] || String.fromCharCode(65 + idx)
                      return (
                        <Button
                          key={idx}
                          type="button"
                          variant={opt.isCorrect ? 'default' : 'outline'}
                          size="sm"
                          className={`h-7 px-3 text-xs font-bold transition-all ${
                            opt.isCorrect
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                          onClick={() => handleCorrectOptionChange(idx)}
                        >
                          {opt.isCorrect && <Check className="size-3 mr-0.5 stroke-[3]" />}
                          অপশন {label}
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {options.map((opt, idx) => {
                    const label = OPTION_LABELS[idx] || String.fromCharCode(65 + idx)
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 transition-all ${
                          opt.isCorrect
                            ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/60 dark:bg-emerald-950/20'
                            : 'border-input bg-card hover:border-muted-foreground/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleCorrectOptionChange(idx)}
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-transform active:scale-95 cursor-pointer ${
                            opt.isCorrect
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                          title={`অপশন ${label} কে সঠিক উত্তর করুন`}
                        >
                          {opt.isCorrect ? <Check className="size-4 stroke-[3]" /> : label}
                        </button>
                        <Input
                          type="text"
                          value={opt.content || ''}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                          placeholder={`অপশন ${label} এর বিবরণ...`}
                          required
                          className="h-8 flex-1 text-xs bg-background"
                        />
                        <button
                          type="button"
                          onClick={() => handleCorrectOptionChange(idx)}
                          className={`text-[10px] font-bold px-2 py-1 rounded cursor-pointer transition-colors ${
                            opt.isCorrect
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {opt.isCorrect ? 'সঠিক ✓' : 'সঠিক করুন'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* CQ Parts Form */
              <div className="space-y-3 pt-1">
                <Label className="text-xs font-semibold text-foreground block">
                  সৃজনশীল প্রশ্নের ৪টি অংশ (ক, খ, গ, ঘ) *
                </Label>

                <div className="space-y-3">
                  {cqParts.map((part, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-card p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                          <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[11px] font-bold">
                            {OPTION_LABELS[idx]}
                          </span>
                          {cqPartLabels[idx]}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">নম্বর:</span>
                          <Input
                            type="number"
                            min="0.5"
                            max="10"
                            step="0.5"
                            value={part.marks}
                            onChange={(e) =>
                              handleCqPartChange(idx, 'marks', parseFloat(e.target.value) || 1)
                            }
                            className="h-7 w-16 text-center text-xs font-semibold"
                          />
                        </div>
                      </div>

                      <Input
                        value={part.prompt || ''}
                        onChange={(e) => handleCqPartChange(idx, 'prompt', e.target.value)}
                        placeholder={`অংশ ${OPTION_LABELS[idx]} এর প্রশ্ন লিখুন...`}
                        required
                        className="text-xs"
                      />

                      <Input
                        value={part.answer || ''}
                        onChange={(e) => handleCqPartChange(idx, 'answer', e.target.value)}
                        placeholder={`অংশ ${OPTION_LABELS[idx]} এর আদর্শ উত্তর বা মূল পয়েন্ট (ঐচ্ছিক)...`}
                        className="text-xs text-foreground bg-muted/30"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation / Notes */}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="explanation" className="text-xs font-semibold text-foreground">
                ব্যাখ্যা / সমাধান নোট (ঐচ্ছিক)
              </Label>
              <textarea
                id="explanation"
                rows={2}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="শিক্ষার্থীদের জন্য সহায়ক ব্যাখ্যা বা সূত্র..."
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
              />
            </div>

            {/* Difficulty & Importance Bottom Bar */}
            <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/60">
              {/* Difficulty */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">কঠিনতার স্তর</Label>
                <div className="flex rounded-md border border-input p-0.5 bg-muted/40 h-8 items-center">
                  {[
                    { val: 1, label: 'সহজ' },
                    { val: 2, label: 'মাঝারি' },
                    { val: 3, label: 'কঠিন' },
                  ].map((lvl) => (
                    <button
                      key={lvl.val}
                      type="button"
                      onClick={() => setDifficulty(lvl.val)}
                      className={`flex-1 rounded h-6.5 text-[11px] font-medium transition-colors ${
                        difficulty === lvl.val
                          ? 'bg-background text-foreground shadow-xs font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Importance */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">গুরুত্ব (Importance)</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {importance === 0
                      ? 'সাধারণ'
                      : importance === 1
                      ? 'গুরুত্বপূর্ণ'
                      : importance === 2
                      ? 'খুব গুরুত্বপূর্ণ'
                      : 'বোর্ড স্ট্যান্ডার্ড'}
                  </span>
                </div>
                <div className="flex items-center gap-1 h-8">
                  {[1, 2, 3].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setImportance(importance === star ? star - 1 : star)}
                      className="p-1 rounded hover:bg-muted text-amber-500 transition-colors"
                      title={`${star} স্টার`}
                    >
                      <Star
                        className={`size-5 ${
                          star <= importance ? 'fill-amber-500' : 'text-muted-foreground/40'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          <DialogFooter className="shrink-0 p-3.5 sm:px-6 sm:py-3 border-t border-border bg-muted/25 flex items-center justify-between sm:justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="text-xs h-9 px-4"
            >
              বাতিল (Cancel)
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              loading={isSaving}
              loadingText={isEdit ? 'আপডেট হচ্ছে...' : 'সংরক্ষণ হচ্ছে...'}
              className="gap-2 font-bold text-xs sm:text-sm h-9 px-5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isEdit ? <Check className="size-4 stroke-[2.5]" /> : <Save className="size-4" />}
              {isEdit ? 'আপডেট সংরক্ষণ করুন (Update)' : 'প্রশ্ন সংরক্ষণ করুন'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
