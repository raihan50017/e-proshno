import * as React from 'react'
import { Check, Edit3, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import type { QuestionCard } from '@/lib/api/model/questionCard'
import { apiClient } from '@/lib/api-client'
import { OPTION_LABELS, toBnDigits } from '@/lib/bn'

interface QuestionEditModalProps {
  question: QuestionCard | null
  bankId?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function QuestionEditModal({
  question,
  bankId,
  isOpen,
  onClose,
  onSuccess,
}: QuestionEditModalProps) {
  const [stem, setStem] = React.useState('')
  const [stimulus, setStimulus] = React.useState('')
  const [explanation, setExplanation] = React.useState('')
  const [options, setOptions] = React.useState<Array<{ content: string; isCorrect: boolean }>>([
    { content: '', isCorrect: true },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
  ])
  const [cqParts, setCqParts] = React.useState<Array<{ prompt: string; marks: number; answer: string }>>([
    { prompt: '', marks: 1, answer: '' },
    { prompt: '', marks: 2, answer: '' },
    { prompt: '', marks: 3, answer: '' },
    { prompt: '', marks: 4, answer: '' },
  ])
  const [difficulty, setDifficulty] = React.useState<number>(2)
  const [isSaving, setIsSaving] = React.useState(false)

  // Initialize form state when question changes
  React.useEffect(() => {
    if (question) {
      setStem(typeof question.stem === 'string' ? question.stem : '')
      setStimulus(question.stimulus || '')
      setExplanation(question.explanation || '')
      setDifficulty(question.difficulty ?? 2)

      if (question.type === 0 && question.options && question.options.length > 0) {
        setOptions(
          question.options.map((opt) => ({
            content: typeof opt.content === 'string' ? opt.content : '',
            isCorrect: Boolean(opt.isCorrect),
          }))
        )
      } else if (question.type === 0) {
        setOptions([
          { content: '', isCorrect: true },
          { content: '', isCorrect: false },
          { content: '', isCorrect: false },
          { content: '', isCorrect: false },
        ])
      }

      if (question.type === 1 && question.cqParts && question.cqParts.length > 0) {
        setCqParts(
          question.cqParts.map((part) => ({
            prompt: typeof part.prompt === 'string' ? part.prompt : '',
            marks: Number(part.marks) || 1,
            answer: typeof part.answer === 'string' ? part.answer : '',
          }))
        )
      } else if (question.type === 1) {
        setCqParts([
          { prompt: '', marks: 1, answer: '' },
          { prompt: '', marks: 2, answer: '' },
          { prompt: '', marks: 3, answer: '' },
          { prompt: '', marks: 4, answer: '' },
        ])
      }
    }
  }, [question])

  if (!question) return null

  const effectiveBankId = bankId || question.bankId
  const isMcq = question.type === 0

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

    if (!stem.trim()) {
      toast.error('প্রশ্নের মূল বক্তব্য (Stem) প্রদান করুন')
      return
    }

    if (!effectiveBankId) {
      toast.error('টার্গেট প্রশ্নব্যাংক শনাক্ত করা যায়নি')
      return
    }

    if (isMcq) {
      const emptyOptions = options.some((o) => !o.content.trim())
      if (emptyOptions) {
        toast.error('MCQ প্রশ্নের সকল অপশন পূরণ করুন')
        return
      }
      const hasCorrect = options.some((o) => o.isCorrect)
      if (!hasCorrect) {
        toast.error('একটি সঠিক উত্তর নির্বাচন করুন')
        return
      }
    } else {
      const emptyPrompts = cqParts.some((p) => !p.prompt.trim())
      if (emptyPrompts) {
        toast.error('সৃজনশীল প্রশ্নের সবগুলো অংশের প্রশ্ন পূরণ করুন')
        return
      }
    }

    setIsSaving(true)
    try {
      const payload = {
        type: question.type,
        subjectId: question.subjectId,
        chapterId: question.chapterId,
        stem: stem.trim(),
        stimulus: stimulus.trim() || undefined,
        options: isMcq ? options.map((o) => ({ content: o.content.trim(), isCorrect: o.isCorrect })) : [],
        cqParts: !isMcq ? cqParts.map((p) => ({ prompt: p.prompt.trim(), marks: p.marks, answer: p.answer.trim() || undefined })) : [],
        explanation: explanation.trim() || undefined,
        difficulty,
        importance: question.importance ?? 1,
      }

      await apiClient.put(
        `/api/v1/question-banks/${effectiveBankId}/questions/${question.id}`,
        payload
      )

      toast.success('প্রশ্নটি সফলভাবে হালনাগাদ করা হয়েছে!')
      onSuccess()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'প্রশ্ন সংরক্ষণ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const cqPartLabels = ['ক (জ্ঞানমূলক)', 'খ (অনুধাবনমূলক)', 'গ (প্রয়োগমূলক)', 'ঘ (উচ্চতর দক্ষতা)']

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <DialogHeader className="p-4 sm:p-5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2 text-primary">
              <Edit3 className="size-5" />
              <DialogTitle className="text-base font-semibold">
                প্রশ্ন সম্পাদনা ({isMcq ? 'MCQ বহুনির্বাচনি' : 'CQ সৃজনশীল'})
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              {question.chapterName ? `অধ্যায়: ${question.chapterName} · ` : ''}
              সংরক্ষিত প্রশ্নের টেক্সট, অপশন এবং উত্তর পরিমার্জন করুন
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Stimulus (উদ্দীপক) */}
            <div className="space-y-1.5">
              <Label htmlFor="stimulus" className="text-xs font-semibold flex items-center gap-1.5">
                উদ্দীপক / অনুচ্ছেদ (ঐচ্ছিক)
              </Label>
              <textarea
                id="stimulus"
                rows={3}
                value={stimulus}
                onChange={(e) => setStimulus(e.target.value)}
                placeholder="সৃজনশীল বা বহুপদী প্রশ্নের উদ্দীপক এখানে লিখুন..."
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
              />
            </div>

            {/* Stem (মূল প্রশ্ন) */}
            <div className="space-y-1.5">
              <Label htmlFor="stem" className="text-xs font-semibold text-foreground flex items-center gap-1">
                মূল প্রশ্ন (Stem) *
              </Label>
              <textarea
                id="stem"
                rows={3}
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                placeholder="প্রশ্নের মূল বক্তব্য লিখুন..."
                required
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed font-medium"
              />
            </div>

            {/* MCQ Options */}
            {isMcq ? (
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    অপশনসমূহ (সঠিক উত্তরটি সিলেক্ট করুন) *
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    রেডিও বাটনে ক্লিক করে সঠিক উত্তর নির্ধারণ করুন
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {options.map((opt, idx) => {
                    const label = OPTION_LABELS[idx] || String.fromCharCode(65 + idx)
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                          opt.isCorrect
                            ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                            : 'border-input bg-card'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleCorrectOptionChange(idx)}
                          className={`size-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                            opt.isCorrect
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                          title="সঠিক উত্তর হিসেবে চিহ্নিত করুন"
                        >
                          {label}
                        </button>
                        <Input
                          value={opt.content}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                          placeholder={`অপশন ${label} এর টেক্সট...`}
                          className="h-8 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 p-1"
                          required
                        />
                        {opt.isCorrect && (
                          <Check className="size-4 text-emerald-600 shrink-0 mr-1" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* CQ Parts */
              <div className="space-y-3 pt-2 border-t border-border/60">
                <Label className="text-xs font-semibold text-foreground">
                  সৃজনশীল প্রশ্নের উপ-অংশসমূহ (ক, খ, গ, ঘ) *
                </Label>

                <div className="space-y-3">
                  {cqParts.map((part, idx) => (
                    <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-primary">
                          {cqPartLabels[idx] || `অংশ ${toBnDigits(idx + 1)}`}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground text-[11px]">নম্বর:</span>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={part.marks}
                            onChange={(e) =>
                              handleCqPartChange(idx, 'marks', Number(e.target.value))
                            }
                            className="h-7 w-16 text-xs text-center"
                          />
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={part.prompt}
                        onChange={(e) => handleCqPartChange(idx, 'prompt', e.target.value)}
                        placeholder={`প্রশ্নের অংশ লিখুন...`}
                        className="w-full rounded-md border border-input bg-background p-2 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation & Difficulty */}
            <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-border/60">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="explanation" className="text-xs font-semibold">
                  উত্তর ও ব্যাখ্যা (ঐচ্ছিক)
                </Label>
                <textarea
                  id="explanation"
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="প্রশ্নের বিস্তারিত সমাধান বা সূত্র..."
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">কঠিনতার স্তর</Label>
                <div className="flex flex-col gap-1.5 pt-1">
                  {[
                    { val: 1, label: 'সহজ' },
                    { val: 2, label: 'মাঝারি' },
                    { val: 3, label: 'কঠিন' },
                  ].map((d) => (
                    <button
                      key={d.val}
                      type="button"
                      onClick={() => setDifficulty(d.val)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium text-left border transition-all ${
                        difficulty === d.val
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border bg-background gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="text-xs"
            >
              বাতিল
            </Button>
            <Button
              type="submit"
              loading={isSaving}
              loadingText="সংরক্ষণ হচ্ছে..."
              className="gap-2 text-xs font-semibold"
            >
              <Save className="size-4" />
              পরিবর্তন সংরক্ষণ করুন
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
