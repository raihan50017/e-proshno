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
import { Combobox } from '@/components/ui/combobox'
import type { LevelDto, SubjectDto, ChapterDto } from '@/lib/api/model'
import { useListLevels, useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

export function GeneratePage() {
  const navigate = useNavigate()
  const { data: levelsData, isLoading: levelsLoading } = useListLevels()
  const levels: LevelDto[] = React.useMemo(() => {
    if (!levelsData) return []
    if (Array.isArray(levelsData)) return levelsData
    if ('data' in levelsData && Array.isArray((levelsData as any).data)) return (levelsData as any).data
    return []
  }, [levelsData])

  const [selectedLevelId, setSelectedLevelId] = React.useState<string>('')
  const { data: subjectsData, isLoading: subjectsLoading } = useListSubjects(
    selectedLevelId ? { levelId: selectedLevelId } : undefined,
    { query: { enabled: Boolean(selectedLevelId) } }
  )
  const subjects: SubjectDto[] = React.useMemo(() => {
    if (!subjectsData) return []
    if (Array.isArray(subjectsData)) return subjectsData
    if ('data' in subjectsData && Array.isArray((subjectsData as any).data)) return (subjectsData as any).data
    return []
  }, [subjectsData])

  const [title, setTitle] = React.useState('')
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('')
  const [questionType, setQuestionType] = React.useState<'Mcq' | 'Cq'>('Mcq')
  const [questionCount, setQuestionCount] = React.useState(10)
  const [durationMin, setDurationMin] = React.useState(20)
  const [fullMarks, setFullMarks] = React.useState(10)
  const [source, setSource] = React.useState<'Platform' | 'MyBanks' | 'Both'>('Both')
  const [selectedChapterIds, setSelectedChapterIds] = React.useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = React.useState(false)

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

  const levelOptions = React.useMemo(
    () =>
      levels.map((lvl) => ({
        value: lvl.id,
        label: lvl.nameBn,
      })),
    [levels]
  )

  const subjectOptions = React.useMemo(
    () =>
      subjects.map((sub) => ({
        value: sub.id,
        label: `${sub.label || sub.nameBn}${sub.paper ? ` (${toBnDigits(sub.paper)}য় পত্র)` : ''}`,
      })),
    [subjects]
  )

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

  React.useEffect(() => {
    if (chapters.length > 0) {
      setSelectedChapterIds(chapters.map((c) => c.id))
    } else {
      setSelectedChapterIds([])
    }
  }, [chapters])

  const toggleChapter = (chapterId: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    )
  }

  const toggleAllChapters = () => {
    if (selectedChapterIds.length === chapters.length) {
      setSelectedChapterIds([])
    } else {
      setSelectedChapterIds(chapters.map((c) => c.id))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('প্রশ্নপত্রের শিরোনাম লিখুন')
      return
    }
    if (!selectedLevelId) {
      toast.error('অনুগ্রহ করে শ্রেণি বা স্তর নির্বাচন করুন')
      return
    }
    if (!selectedSubjectId) {
      toast.error('অনুগ্রহ করে বিষয় নির্বাচন করুন')
      return
    }
    if (selectedChapterIds.length === 0) {
      toast.error('কমপক্ষে একটি অধ্যায় নির্বাচন করুন')
      return
    }

    setIsSubmitting(true)
    try {
      const typeNum = questionType === 'Mcq' ? 0 : 1
      const sourceNum = source === 'Platform' ? 0 : source === 'MyBanks' ? 1 : 2
      const modeNum = 1 // Auto-selection mode

      // Step 1: Create question set scope
      const res = await apiClient.post('/api/v1/question-sets', {
        title: title.trim(),
        levelId: selectedLevelId,
        subjectId: selectedSubjectId,
        chapterIds: selectedChapterIds,
        type: typeNum,
        mode: modeNum,
        source: sourceNum,
        bankIds: [],
        targetCount: questionCount,
        durationMin,
        fullMarks,
      })

      const newId = res.data?.id
      if (newId) {
        // Step 2: Auto-select questions from database
        try {
          const autoRes = await apiClient.post(`/api/v1/question-sets/${newId}/auto-select`, {
            keepExisting: false,
            targetCount: questionCount,
          })
          const questionIds: string[] = autoRes.data?.questionIds || []

          if (questionIds.length > 0) {
            // Step 3: Save selected questions into set
            await apiClient.put(`/api/v1/question-sets/${newId}/items`, {
              items: questionIds.map((qid) => ({
                questionId: qid,
                marks: typeNum === 0 ? 1 : 10,
              })),
            })
          }
        } catch (autoErr) {
          console.warn('Auto-select completed with note:', autoErr)
        }

        toast.success('প্রশ্নপত্র সফলভাবে তৈরি হয়েছে!')
        navigate(`/sets?id=${newId}`)
      }
    } catch (err: any) {
      const data = err?.response?.data
      let errorMsg = ''
      if (data?.errors && typeof data.errors === 'object') {
        const firstError = Object.values(data.errors)[0]
        if (Array.isArray(firstError) && firstError.length > 0) {
          errorMsg = firstError[0]
        }
      }
      if (!errorMsg) {
        errorMsg = data?.title || data?.detail || data?.message || 'প্রশ্নসেট তৈরিতে সমস্যা হয়েছে'
      }
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
                    <Combobox
                      options={levelOptions}
                      value={selectedLevelId}
                      onChange={(val) => {
                        setSelectedLevelId(val)
                        setSelectedSubjectId('')
                      }}
                      placeholder="শ্রেণি / স্তর নির্বাচন করুন"
                      searchPlaceholder="শ্রেণি খুঁজুন..."
                      loading={levelsLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">বিষয় *</Label>
                    <Combobox
                      options={subjectOptions}
                      value={selectedSubjectId}
                      onChange={(val) => setSelectedSubjectId(val)}
                      placeholder={
                        !selectedLevelId
                          ? 'প্রথমে শ্রেণি নির্বাচন করুন'
                          : subjects.length === 0
                          ? 'কোনো বিষয় পাওয়া যায়নি'
                          : 'বিষয় নির্বাচন করুন'
                      }
                      searchPlaceholder="বিষয় খুঁজুন..."
                      disabled={!selectedLevelId || subjects.length === 0}
                      loading={subjectsLoading}
                    />
                  </div>
                </div>

                {/* Chapters Selection Card */}
                {selectedSubjectId && (
                  <div className="space-y-2 pt-2 border-t border-border/80">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">
                        অন্তর্ভুক্ত অধ্যায়সমূহ * ({toBnDigits(selectedChapterIds.length)}/{toBnDigits(chapters.length)})
                      </Label>
                      {chapters.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary"
                          onClick={toggleAllChapters}
                        >
                          {selectedChapterIds.length === chapters.length ? 'সবগুলো বাদ দিন' : 'সবগুলো নির্বাচন'}
                        </Button>
                      )}
                    </div>

                    {chaptersLoading ? (
                      <div className="text-xs text-muted-foreground p-3 bg-muted/40 rounded-md animate-pulse">
                        অধ্যায় লোড হচ্ছে...
                      </div>
                    ) : chapters.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-md">
                        এই বিষয়ে কোনো অধ্যায় পাওয়া যায়নি।
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border rounded-md bg-muted/10">
                        {chapters.map((chapter) => {
                          const isChecked = selectedChapterIds.includes(chapter.id)
                          return (
                            <label
                              key={chapter.id}
                              className={`flex items-center gap-2 p-2 rounded text-xs cursor-pointer transition-colors border ${
                                isChecked
                                  ? 'bg-primary/5 border-primary/40 text-foreground font-medium'
                                  : 'bg-card border-border/60 text-muted-foreground hover:bg-muted/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="rounded text-primary size-4 accent-primary"
                                checked={isChecked}
                                onChange={() => toggleChapter(chapter.id)}
                              />
                              <span className="truncate">
                                অধ্যায় {toBnDigits(chapter.number)}: {chapter.nameBn}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

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
