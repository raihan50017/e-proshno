import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Award,
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'
import { OmrSheetDocument } from './OmrSheetDocument'
import type { RenderedPaper } from '@/lib/api/model/renderedPaper'
import type { PaperBlock } from '@/lib/api/model/paperBlock'

interface StudentResult {
  id: string
  roll: string
  name: string
  answers: Record<number, string> // { [qNum: number]: 'ক' | 'খ' | 'গ' | 'ঘ' }
  correctCount: number
  wrongCount: number
  unansweredCount: number
  rawScore: number
  negativeDeduction: number
  finalScore: number
  evaluatedAt: string
}

interface QuestionSetSummary {
  id: string
  title: string
  subjectName?: string
  subjectLabel?: string
  levelName?: string
  type: number
  itemCount: number
  targetCount: number
}

const BUBBLES = ['ক', 'খ', 'গ', 'ঘ']

export function OmrPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSetId = searchParams.get('setId')

  const [activeTab, setActiveTab] = React.useState('sheet')

  // Available Question Sets for OMR Linking
  const [questionSets, setQuestionSets] = React.useState<QuestionSetSummary[]>([])
  const [selectedSetId, setSelectedSetId] = React.useState<string>(initialSetId || '')

  // Sheet Generator Configuration
  const [institutionName, setInstitutionName] = React.useState('ই-প্রশ্ন জাতীয় একাডেমি')
  const [examTitle, setExamTitle] = React.useState('মডেল টেস্ট পরীক্ষা ২০২৬')
  const [subjectName, setSubjectName] = React.useState('পদার্থবিজ্ঞান')
  const [questionCount, setQuestionCount] = React.useState<number>(30)
  const [rollDigits, setRollDigits] = React.useState<number>(6)
  const [setVariant, setSetVariant] = React.useState<string>('ক')

  // Scoring & Answer Key State
  const [markPerQuestion, setMarkPerQuestion] = React.useState<number>(1.0)
  const [negativeMark, setNegativeMark] = React.useState<number>(0.25)
  const [answerKey, setAnswerKey] = React.useState<Record<number, string>>({})

  // Evaluation & Results State
  const [results, setResults] = React.useState<StudentResult[]>([])
  const [evalRoll, setEvalRoll] = React.useState('')
  const [evalName, setEvalName] = React.useState('')
  const [evalAnswers, setEvalAnswers] = React.useState<Record<number, string>>({})
  const [rawStringInput, setRawStringInput] = React.useState('')

  // Load question sets on mount
  React.useEffect(() => {
    const fetchSets = async () => {
      try {
        const res = await apiClient.get('/api/v1/question-sets')
        const items: QuestionSetSummary[] = res.data?.items || res.data || []
        // Filter MCQ sets
        const mcqSets = items.filter((s) => s.type === 0)
        setQuestionSets(mcqSets)
      } catch {
        // Silently handle
      }
    }
    fetchSets()
  }, [])

  // Auto-populate when a question set is chosen
  React.useEffect(() => {
    if (!selectedSetId) return

    const loadSetDetails = async () => {
      try {
        const res = await apiClient.get<RenderedPaper>(`/api/v1/question-sets/${selectedSetId}/paper?variant=0`)
        const paper = res.data
        if (paper && paper.header) {
          if (paper.header.institutionName) setInstitutionName(paper.header.institutionName)
          if (paper.header.title) setExamTitle(paper.header.title)
          if (paper.header.subjectName) setSubjectName(paper.header.subjectName)

          // Extract total question count and answer key
          const newKey: Record<number, string> = {}
          let count = 0
          paper.blocks.forEach((block: PaperBlock) => {
            block.questions.forEach((q) => {
              count++
              const num = q.number || count
              const correctOpt = q.options?.find((o) => o.isCorrect)
              if (correctOpt) {
                const optIndex = q.options.indexOf(correctOpt)
                newKey[num] = BUBBLES[optIndex] || 'ক'
              } else {
                newKey[num] = 'ক'
              }
            })
          })

          if (count > 0) {
            setQuestionCount(count <= 25 ? 25 : count <= 30 ? 30 : count <= 50 ? 50 : 100)
            setAnswerKey(newKey)
          }
        }
      } catch {
        toast.error('প্রশ্নসেটের উত্তরমালা লোড করতে সমস্যা হয়েছে')
      }
    }

    loadSetDetails()
  }, [selectedSetId])

  // Handle setting correct answer in answer key
  const handleSetAnswer = (qNum: number, ans: string) => {
    setAnswerKey((prev) => ({
      ...prev,
      [qNum]: ans,
    }))
  }

  // Handle Student Evaluation
  const handleEvaluateStudent = (e: React.FormEvent) => {
    e.preventDefault()

    if (!evalRoll.trim()) {
      toast.error('শিক্ষার্থীর রোল নম্বর লিখুন')
      return
    }

    // Determine answers from either interactive clicks or raw string input
    const answersToGrade = { ...evalAnswers }

    if (rawStringInput.trim()) {
      const clean = rawStringInput.trim().replace(/\s+/g, '')
      for (let i = 0; i < clean.length && i < questionCount; i++) {
        const char = clean[i]
        if (BUBBLES.includes(char)) {
          answersToGrade[i + 1] = char
        }
      }
    }

    let correct = 0
    let wrong = 0
    let unanswered = 0

    for (let i = 1; i <= questionCount; i++) {
      const studentAns = answersToGrade[i]
      const masterAns = answerKey[i]

      if (!studentAns) {
        unanswered++
      } else if (masterAns && studentAns === masterAns) {
        correct++
      } else {
        wrong++
      }
    }

    const raw = correct * markPerQuestion
    const deduction = wrong * negativeMark
    const finalScore = Math.max(0, parseFloat((raw - deduction).toFixed(2)))

    const newResult: StudentResult = {
      id: Math.random().toString(36).substring(2, 9),
      roll: evalRoll.trim(),
      name: evalName.trim() || `শিক্ষার্থী ${toBnDigits(evalRoll)}`,
      answers: answersToGrade,
      correctCount: correct,
      wrongCount: wrong,
      unansweredCount: unanswered,
      rawScore: raw,
      negativeDeduction: deduction,
      finalScore,
      evaluatedAt: new Date().toISOString(),
    }

    setResults((prev) => [newResult, ...prev])
    toast.success(`রোল ${newResult.roll}-এর মূল্যায়ন সম্পন্ন! প্রাপ্ত নম্বর: ${toBnDigits(finalScore)}`)

    // Reset entry inputs
    setEvalRoll('')
    setEvalName('')
    setEvalAnswers({})
    setRawStringInput('')
  }

  // Remove result
  const handleDeleteResult = (id: string) => {
    setResults((prev) => prev.filter((r) => r.id !== id))
    toast.info('ফলাফল মুছে ফেলা হয়েছে')
  }

  // Calculate Merit List Statistics
  const totalEvaluated = results.length
  const highestScore = results.length > 0 ? Math.max(...results.map((r) => r.finalScore)) : 0
  const avgScore =
    results.length > 0
      ? (results.reduce((acc, r) => acc + r.finalScore, 0) / results.length).toFixed(1)
      : '০'
  const passCount = results.filter((r) => r.finalScore >= (questionCount * markPerQuestion) * 0.4).length
  const passRate = totalEvaluated > 0 ? Math.round((passCount / totalEvaluated) * 100) : 0

  // Export results as CSV
  const handleExportCsv = () => {
    if (results.length === 0) {
      toast.info('এক্সপোর্ট করার মতো কোনো ফলাফল নেই')
      return
    }

    const headers = 'মেধা ক্রম,রোল,নাম,সঠিক,ভুল,উত্তরহীন,নেগেটিভ কর্তন,প্রাপ্ত নম্বর,তারিখ\n'
    const rows = results
      .slice()
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((r, i) => `${i + 1},${r.roll},"${r.name}",${r.correctCount},${r.wrongCount},${r.unansweredCount},${r.negativeDeduction},${r.finalScore},${r.evaluatedAt}`)
      .join('\n')

    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `OMR_Merit_List_${examTitle}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('মেরিট লিস্ট সিএসভি ডাউনলোড হয়েছে')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ওএমআর (OMR) মূল্যায়ন ও শীট জেনারেটর"
        description="স্ট্যান্ডার্ড অপটিক্যাল মার্ক রিডার (OMR) শীট তৈরি ও প্রিন্ট করুন, উত্তরমালা নির্ধারণ করুন এবং দ্রুত ফলাফল মূল্যায়ন করুন।"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="text-xs gap-1.5 shadow-xs"
            >
              <Printer className="size-3.5" />
              ওএমআর শীট প্রিন্ট
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/80 p-1 border border-border">
          <TabsTrigger value="sheet" className="text-xs font-semibold gap-1.5">
            <FileText className="size-3.5" />
            ওএমআর শীট জেনারেটর
          </TabsTrigger>
          <TabsTrigger value="scoring" className="text-xs font-semibold gap-1.5">
            <Calculator className="size-3.5" />
            উত্তরমালা ও স্কোরিং সেটিংস
          </TabsTrigger>
          <TabsTrigger value="eval" className="text-xs font-semibold gap-1.5">
            <Award className="size-3.5" />
            খাতা মূল্যায়ন ও মেধা তালিকা
            {results.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4 bg-primary/20 text-primary">
                {toBnDigits(results.length)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 1: OMR SHEET GENERATOR & LIVE PRINT PREVIEW
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="sheet" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Control Panel */}
            <Card className="lg:col-span-4 border-border print:hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  শীট কনফিগারেশন
                </CardTitle>
                <CardDescription className="text-xs">
                  প্রশ্নসেট থেকে অটো-লোড করুন অথবা নিজস্ব শিরোনাম ও প্রশ্ন সংখ্যা নির্ধারণ করুন
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {/* Linked Question Set Picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs">প্রশ্নসেট থেকে অটো-লোড (ঐচ্ছিক)</Label>
                  <select
                    value={selectedSetId}
                    onChange={(e) => {
                      setSelectedSetId(e.target.value)
                      if (e.target.value) {
                        setSearchParams({ setId: e.target.value })
                      } else {
                        setSearchParams({})
                      }
                    }}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">-- নিজস্ব তথ্য দিয়ে তৈরি করুন --</option>
                    {questionSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({toBnDigits(s.itemCount)} টি প্রশ্ন)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Institution Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs">প্রতিষ্ঠানের নাম</Label>
                  <Input
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="প্রতিষ্ঠানের নাম"
                  />
                </div>

                {/* Exam Title */}
                <div className="space-y-1.5">
                  <Label className="text-xs">পরীক্ষার নাম</Label>
                  <Input
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="যেমন: অর্ধবার্ষিক পরীক্ষা ২০২৬"
                  />
                </div>

                {/* Subject Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs">বিষয়</Label>
                  <Input
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="যেমন: পদার্থবিজ্ঞান"
                  />
                </div>

                {/* Question Count Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs">প্রশ্নের সংখ্যা</Label>
                  <div className="grid grid-cols-5 gap-1">
                    {[20, 25, 30, 50, 100].map((count) => (
                      <Button
                        key={count}
                        type="button"
                        variant={questionCount === count ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 text-xs font-bold p-0"
                        onClick={() => setQuestionCount(count)}
                      >
                        {toBnDigits(count)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Roll Digits & Set Code */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">রোল ডিজিট</Label>
                    <div className="flex gap-1">
                      {[5, 6].map((digits) => (
                        <Button
                          key={digits}
                          type="button"
                          variant={rollDigits === digits ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => setRollDigits(digits)}
                        >
                          {toBnDigits(digits)} ডিজিট
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">সেট কোড</Label>
                    <div className="flex gap-1">
                      {BUBBLES.map((b) => (
                        <Button
                          key={b}
                          type="button"
                          variant={setVariant === b ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 h-8 text-xs font-bold p-0"
                          onClick={() => setSetVariant(b)}
                        >
                          {b}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => window.print()}
                    className="w-full gap-2 text-xs font-bold shadow-sm"
                  >
                    <Printer className="size-4" />
                    ওএমআর শীট সরাসরি প্রিন্ট করুন
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right Live A4 Sheet Preview */}
            <div className="lg:col-span-8 flex justify-center bg-muted/40 p-4 sm:p-8 rounded-xl border border-border overflow-x-auto print:p-0 print:m-0 print:border-none print:bg-white">
              <OmrSheetDocument
                institutionName={institutionName}
                examTitle={examTitle}
                subjectName={subjectName}
                questionCount={questionCount}
                rollDigits={rollDigits}
                setVariant={setVariant}
              />
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2: ANSWER KEY & SCORING SETTINGS
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="scoring" className="space-y-6">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Calculator className="size-4 text-primary" />
                    মাস্টার উত্তরমালা ও মার্কিং স্কিম
                  </CardTitle>
                  <CardDescription className="text-xs">
                    প্রতিটি প্রশ্নের সঠিক উত্তর এবং নেগেটিভ মার্কিং নির্ধারণ করুন
                  </CardDescription>
                </div>
                {selectedSetId && (
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary w-fit">
                    প্রশ্নসেট থেকে সিঙ্ক করা হয়েছে
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6 text-xs">
              {/* Scoring Rules Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/40 border border-border">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">প্রতিটি সঠিক উত্তরের মান:</Label>
                  <Input
                    type="number"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={markPerQuestion}
                    onChange={(e) => setMarkPerQuestion(Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">প্রতিটি ভুল উত্তরের জন্য কর্তন:</Label>
                  <select
                    value={negativeMark}
                    onChange={(e) => setNegativeMark(Number(e.target.value))}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={0}>০.০০ (কোনো নেগেটিভ মার্কিং নেই)</option>
                    <option value={0.25}>০.২৫ (চারটি ভুলে ১ নম্বর কর্তন)</option>
                    <option value={0.5}>০.৫০ (দুইটি ভুলে ১ নম্বর কর্তন)</option>
                    <option value={1}>১.০০ (প্রতি ভুলে ১ নম্বর কর্তন)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">সর্বমোট পূর্ণমান:</Label>
                  <div className="h-8 flex items-center font-bold text-sm text-primary">
                    {toBnDigits(questionCount * markPerQuestion)} নম্বর
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">উত্তরমালা রিসেট:</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAnswerKey({})}
                    className="h-8 text-xs w-full gap-1"
                  >
                    <RotateCcw className="size-3" />
                    সব ফাঁকা করুন
                  </Button>
                </div>
              </div>

              {/* Interactive Answer Key Grid */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs text-foreground">
                  প্রশ্নের উত্তর নির্বাচন করুন (১ থেকে {toBnDigits(questionCount)}):
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {Array.from({ length: questionCount }).map((_, idx) => {
                    const qNum = idx + 1
                    const currentAns = answerKey[qNum] || ''
                    return (
                      <div
                        key={qNum}
                        className="flex items-center justify-between p-2 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                      >
                        <span className="font-bold font-mono text-[11px] text-muted-foreground w-6">
                          {toBnDigits(qNum)}.
                        </span>
                        <div className="flex gap-1">
                          {BUBBLES.map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => handleSetAnswer(qNum, b)}
                              className={`size-6 rounded-full text-xs font-bold transition-all ${
                                currentAns === b
                                  ? 'bg-emerald-600 text-white shadow-xs scale-105'
                                  : 'bg-muted/60 hover:bg-muted text-foreground border border-border'
                              }`}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3: EVALUATION & MERIT LIST
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="eval" className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="মোট মূল্যায়িত খাতা"
              value={`${toBnDigits(totalEvaluated)} জন`}
              icon={Award}
              subtitle="সংরক্ষিত শিক্ষার্থীর ফলাফল"
            />
            <StatCard
              title="সর্বোচ্চ প্রাপ্ত নম্বর"
              value={`${toBnDigits(highestScore)}`}
              icon={CheckCircle2}
              subtitle={`পূর্ণমান: ${toBnDigits(questionCount * markPerQuestion)}`}
            />
            <StatCard
              title="গড় প্রাপ্ত নম্বর"
              value={`${toBnDigits(avgScore)}`}
              icon={Calculator}
              subtitle="শ্রেণির গড় পারফরম্যান্স"
            />
            <StatCard
              title="উত্তীর্ণের হার"
              value={`${toBnDigits(passRate)}%`}
              icon={FileSpreadsheet}
              subtitle={`উত্তীর্ণ: ${toBnDigits(passCount)} জন`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Rapid Candidate Answer Input */}
            <Card className="lg:col-span-5 border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Plus className="size-4 text-primary" />
                  নতুন খাতা মূল্যায়ন করুন
                </CardTitle>
                <CardDescription className="text-xs">
                  শিক্ষার্থীর রোল ও উত্তর ইনপুট দিয়ে তাৎক্ষণিক নম্বর হিসাব করুন
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleEvaluateStudent} className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">রোল নম্বর *</Label>
                      <Input
                        value={evalRoll}
                        onChange={(e) => setEvalRoll(e.target.value)}
                        placeholder="যেমন: ১০১"
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">শিক্ষার্থীর নাম (ঐচ্ছিক)</Label>
                      <Input
                        value={evalName}
                        onChange={(e) => setEvalName(e.target.value)}
                        placeholder="নাম লিখুন"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Fast String Input (e.g. গকঘখক...) */}
                  <div className="space-y-1.5 p-3 rounded-lg border border-border bg-muted/30">
                    <Label className="text-xs font-semibold block">
                      দ্রুত স্ট্রিং ইনপুট (Fast String Entry):
                    </Label>
                    <Input
                      value={rawStringInput}
                      onChange={(e) => setRawStringInput(e.target.value)}
                      placeholder="যেমন: কখগঘকখগঘ..."
                      className="h-8 text-xs font-mono tracking-widest uppercase"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      টিপস: ক্রমানুসারে অপশনগুলো টাইপ করুন (যেমন: কখগঘ)। ফাঁকা থাকলে নিচের বাবলগুলো ট্যাপ করুন।
                    </p>
                  </div>

                  {/* Mini Bubble Clicker */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-border rounded-lg p-2 bg-card">
                    <span className="font-semibold text-muted-foreground block text-[11px] mb-1">
                      ম্যানুয়াল বাবল ইনপুট:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Array.from({ length: questionCount }).map((_, idx) => {
                        const qNum = idx + 1
                        const current = evalAnswers[qNum] || (rawStringInput[idx] || '')
                        return (
                          <div key={qNum} className="flex items-center justify-between p-1 rounded bg-muted/40 text-[11px]">
                            <span className="font-mono font-bold w-5">{toBnDigits(qNum)}.</span>
                            <div className="flex gap-1">
                              {BUBBLES.map((b) => (
                                <button
                                  key={b}
                                  type="button"
                                  onClick={() => setEvalAnswers((prev) => ({ ...prev, [qNum]: b }))}
                                  className={`size-5 rounded-full text-[10px] font-bold ${
                                    current === b
                                      ? 'bg-primary text-primary-foreground font-extrabold'
                                      : 'bg-background hover:bg-muted text-foreground border border-border'
                                  }`}
                                >
                                  {b}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <Button type="submit" className="w-full gap-2 text-xs font-bold shadow-sm">
                    <Calculator className="size-4" />
                    খাতা মূল্যায়ন ও মেধা তালিকায় যুক্ত করুন
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Right: Merit List Table */}
            <Card className="lg:col-span-7 border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Award className="size-4 text-primary" />
                    মেধা তালিকা (Merit List)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    প্রাপ্ত নম্বরের ভিত্তিতে ক্রমানুসারে সাজানো
                  </CardDescription>
                </div>
                {results.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    className="text-xs gap-1.5 h-8"
                  >
                    <Download className="size-3.5" />
                    সিএসভি এক্সপোর্ট
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {results.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs font-bold w-12 text-center">মেধা</TableHead>
                          <TableHead className="text-xs font-bold">রোল ও নাম</TableHead>
                          <TableHead className="text-xs font-bold text-center">সঠিক / ভুল</TableHead>
                          <TableHead className="text-xs font-bold text-center">নেগেটিভ</TableHead>
                          <TableHead className="text-xs font-bold text-right">প্রাপ্ত নম্বর</TableHead>
                          <TableHead className="text-xs font-bold text-right w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results
                          .slice()
                          .sort((a, b) => b.finalScore - a.finalScore)
                          .map((res, rankIdx) => (
                            <TableRow key={res.id} className="hover:bg-muted/30 text-xs">
                              <TableCell className="text-center font-bold">
                                {rankIdx === 0 ? (
                                  <Badge className="bg-amber-500 text-white font-bold text-[10px]">১ম</Badge>
                                ) : rankIdx === 1 ? (
                                  <Badge className="bg-slate-400 text-white font-bold text-[10px]">২য়</Badge>
                                ) : rankIdx === 2 ? (
                                  <Badge className="bg-amber-700 text-white font-bold text-[10px]">৩য়</Badge>
                                ) : (
                                  toBnDigits(rankIdx + 1)
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-foreground">{res.name}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  রোল: <strong className="text-foreground">{toBnDigits(res.roll)}</strong>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className="text-emerald-600 font-bold">{toBnDigits(res.correctCount)}</span>
                                <span className="text-muted-foreground mx-1">/</span>
                                <span className="text-red-500 font-bold">{toBnDigits(res.wrongCount)}</span>
                              </TableCell>
                              <TableCell className="text-center font-mono text-red-500">
                                -{toBnDigits(res.negativeDeduction)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-sm text-primary">
                                {toBnDigits(res.finalScore)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteResult(res.id)}
                                  title="মুছে ফেলুন"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-16 p-6 space-y-2 text-muted-foreground text-xs">
                    <Award className="size-10 mx-auto opacity-40 mb-2" />
                    <p className="font-semibold text-foreground text-sm">কোনো খাতা মূল্যায়ন করা হয়নি</p>
                    <p>বামের ফর্মে শিক্ষার্থীর রোল ও উত্তর ইনপুট দিয়ে মূল্যায়ন শুরু করুন।</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
