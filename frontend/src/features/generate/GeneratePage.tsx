import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers,
  Sparkles,
  HelpCircle,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/page-header'
import { useListLevels, useListSubjects } from '@/lib/api/generated/taxonomy/taxonomy'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

export function GeneratePage() {
  const navigate = useNavigate()
  const { data: levelsData, isLoading: levelsLoading } = useListLevels()
  const levels = levelsData?.data || []

  const [selectedLevelId, setSelectedLevelId] = React.useState<string>('')
  const { data: subjectsData, isLoading: subjectsLoading } = useListSubjects(
    selectedLevelId ? { levelId: selectedLevelId } : undefined,
    { query: { enabled: Boolean(selectedLevelId) } }
  )
  const subjects = subjectsData?.data || []

  const [title, setTitle] = React.useState('')
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('')
  const [questionType, setQuestionType] = React.useState<'Mcq' | 'Cq'>('Mcq')
  const [questionCount, setQuestionCount] = React.useState(25)
  const [durationMin, setDurationMin] = React.useState(30)
  const [fullMarks, setFullMarks] = React.useState(25)
  const [source, setSource] = React.useState<'Platform' | 'MyBanks' | 'Both'>('Both')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (levels.length > 0 && !selectedLevelId) {
      setSelectedLevelId(levels[0].id)
    }
  }, [levels, selectedLevelId])

  React.useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id)
    }
  }, [subjects, selectedSubjectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('প্রশ্নপত্রের শিরোনাম লিখুন')
      return
    }
    if (!selectedSubjectId) {
      toast.error('অনুগ্রহ করে বিষয় নির্বাচন করুন')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await apiClient.post('/api/v1/question-sets', {
        title: title.trim(),
        subjectId: selectedSubjectId,
        type: questionType,
        targetCount: questionCount,
        durationMin,
        fullMarks,
        source,
      })

      const newId = res.data?.id
      toast.success('প্রশ্নসেট সফলভাবে তৈরি হয়েছে!')
      navigate(`/sets?id=${newId || ''}`)
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'প্রশ্নসেট তৈরিতে সমস্যা হয়েছে'
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="১ ক্লিকে প্রশ্নপত্র তৈরি"
        description="সিলেবাস, অধ্যায় ও প্রশ্নের ধরন নির্ধারণ করে দ্রুত প্রশ্নপত্র তৈরি ও প্রিন্ট করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'প্রশ্ন তৈরি' },
        ]}
      />

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="size-5 text-primary" />
                  প্রাথমিক তথ্য
                </CardTitle>
                <CardDescription className="text-xs">
                  প্রশ্নপত্রের নাম, সময় এবং মোট নম্বর প্রদান করুন
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">প্রশ্নপত্রের শিরোনাম *</Label>
                  <Input
                    id="title"
                    placeholder="যেমন: ১০ম শ্রেণি - পদার্থবিজ্ঞান ১ম মডেল টেস্ট"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="level">শ্রেণি / স্তর *</Label>
                    <select
                      id="level"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={selectedLevelId}
                      onChange={(e) => {
                        setSelectedLevelId(e.target.value)
                        setSelectedSubjectId('')
                      }}
                      disabled={levelsLoading}
                      required
                    >
                      {levels.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.nameBn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">বিষয় *</Label>
                    <select
                      id="subject"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      disabled={subjectsLoading || subjects.length === 0}
                      required
                    >
                      {subjects.length === 0 ? (
                        <option value="">কোনো বিষয় পাওয়া যায়নি</option>
                      ) : (
                        subjects.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.label || sub.nameBn} {sub.paper ? `(${toBnDigits(sub.paper)}য় পত্র)` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Question Type Selection */}
                <div className="space-y-2 pt-2">
                  <Label>প্রশ্নের ধরন *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionType('Mcq')
                        setQuestionCount(25)
                        setFullMarks(25)
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm font-medium transition-all ${
                        questionType === 'Mcq'
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                          : 'border-input bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="font-semibold text-base">বহুনির্বাচনি (MCQ)</span>
                      <span className="text-xs opacity-80 mt-0.5">৪টি বিকল্প, ওএমআর মূল্যায়নযোগ্য</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setQuestionType('Cq')
                        setQuestionCount(8)
                        setFullMarks(50)
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm font-medium transition-all ${
                        questionType === 'Cq'
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                          : 'border-input bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="font-semibold text-base">সৃজনশীল (CQ)</span>
                      <span className="text-xs opacity-80 mt-0.5">উদ্দীপক ও ক, খ, গ, ঘ উপ-প্রশ্ন</span>
                    </button>
                  </div>
                </div>

                {/* Numbers */}
                <div className="grid gap-4 sm:grid-cols-3 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="count">প্রশ্নের সংখ্যা</Label>
                    <Input
                      id="count"
                      type="number"
                      min={1}
                      max={100}
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duration">সময় (মিনিট)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={5}
                      max={300}
                      value={durationMin}
                      onChange={(e) => setDurationMin(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marks">পূর্ণমান</Label>
                    <Input
                      id="marks"
                      type="number"
                      min={1}
                      max={200}
                      value={fullMarks}
                      onChange={(e) => setFullMarks(Number(e.target.value))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Source Selection Card */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  প্রশ্নের উৎস (Question Source)
                </CardTitle>
                <CardDescription className="text-xs">
                  কোথা থেকে প্রশ্নসমূহ সংগ্রহ করা হবে নির্বাচন করুন
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { id: 'Platform', title: 'প্ল্যাটফর্ম ব্যাংক', desc: 'অফিসিয়াল এনসিটিবি ব্যাংক' },
                    { id: 'MyBanks', title: 'আমার প্রশ্নব্যাংক', desc: 'ব্যক্তিগত ও আমদানিকৃত প্রশ্ন' },
                    { id: 'Both', title: 'উভয় উৎস (সুপারিশকৃত)', desc: 'প্ল্যাটফর্ম ও নিজস্ব ব্যাংক একত্রে' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSource(s.id as any)}
                      className={`p-3 rounded-lg border text-left text-sm transition-all ${
                        source === s.id
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                          : 'border-input bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <p className="font-medium text-foreground">{s.title}</p>
                      <p className="text-xs opacity-75 mt-0.5">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Summary Sidebar (1 col) */}
          <div className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">প্রশ্নপত্রের সারসংক্ষেপ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b border-border text-xs">
                  <span className="text-muted-foreground">প্রশ্নের ধরন:</span>
                  <Badge variant="outline">
                    {questionType === 'Mcq' ? 'বহুনির্বাচনি (MCQ)' : 'সৃজনশীল (CQ)'}
                  </Badge>
                </div>

                <div className="flex justify-between py-1.5 border-b border-border text-xs">
                  <span className="text-muted-foreground">মোট প্রশ্ন:</span>
                  <span className="font-semibold text-foreground">{toBnDigits(questionCount)} টি</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-border text-xs">
                  <span className="text-muted-foreground">সময়:</span>
                  <span className="font-semibold text-foreground">{toBnDigits(durationMin)} মিনিট</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-border text-xs">
                  <span className="text-muted-foreground">পূর্ণমান:</span>
                  <span className="font-semibold text-foreground">{toBnDigits(fullMarks)} নম্বর</span>
                </div>

                <div className="pt-3">
                  <Button
                    type="submit"
                    className="w-full gap-2 shadow-sm font-medium"
                    loading={isSubmitting}
                    loadingText="তৈরি হচ্ছে..."
                  >
                    <Sparkles className="size-4" />
                    প্রশ্নসেট তৈরি করুন
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border/80 bg-muted/40 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <HelpCircle className="size-3.5 text-primary" />
                পরবর্তী ধাপ:
              </p>
              <p className="leading-relaxed">
                সেট তৈরি হওয়ার পর আপনি পছন্দমতো প্রশ্ন যোগ, পরিবর্তন ও বাদ দিতে পারবেন এবং সরাসরি A4 ফরম্যাটে ২-কলাম প্রিন্ট করতে পারবেন।
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
