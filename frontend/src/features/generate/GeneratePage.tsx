import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/auth-context'
import { useListLevels, useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import { apiClient } from '@/lib/api-client'
import type { LevelDto, SubjectDto, ChapterDto } from '@/lib/api/model'
import { GenerateStepCreate } from './GenerateStepCreate'
import { GenerateStepCreated } from './GenerateStepCreated'
import { GenerateStepPicker } from './GenerateStepPicker'
import { GenerateStepPreview } from './GenerateStepPreview'

type GenerateStep = 'create' | 'created' | 'picker' | 'preview'

export function GeneratePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, activeInstitution } = useAuth()
  const teacherName = user?.fullName || activeInstitution?.name || 'Md. Aburayhan'

  // Step state
  const stepParam = searchParams.get('step') as GenerateStep | null
  const setIdParam = searchParams.get('setId')
  const [step, setStep] = React.useState<GenerateStep>(stepParam || 'create')
  const [createdSetId, setCreatedSetId] = React.useState<string>(setIdParam || '')

  // Form Fields
  const [title, setTitle] = React.useState('Test-Exam')
  const [selectedLevelId, setSelectedLevelId] = React.useState<string>('')
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('')
  const [selectedChapterId, setSelectedChapterId] = React.useState<string>('')
  const [questionType, setQuestionType] = React.useState<'Mcq' | 'Cq'>('Mcq')
  const [questionCount, setQuestionCount] = React.useState<number>(30)
  const [durationMin, setDurationMin] = React.useState<number>(30)
  const [fullMarks, setFullMarks] = React.useState<number>(30)

  // Question selection in picker
  const [selectedQuestionIds, setSelectedQuestionIds] = React.useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  // Taxonomy queries
  const { data: levelsData, isLoading: levelsLoading } = useListLevels()
  const levels: LevelDto[] = React.useMemo(() => {
    if (!levelsData) return []
    if (Array.isArray(levelsData)) return levelsData
    if ('data' in levelsData && Array.isArray((levelsData as any).data)) return (levelsData as any).data
    return []
  }, [levelsData])

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

  // Sync defaults
  React.useEffect(() => {
    if (levels.length > 0 && !selectedLevelId) {
      // Prefer HSC if available
      const hsc = levels.find((l) => l.nameBn.includes('এইচএসসি') || (l.slug && l.slug.toLowerCase().includes('hsc')))
      setSelectedLevelId(hsc ? hsc.id : levels[0].id)
    }
  }, [levels, selectedLevelId])

  React.useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      // Prefer Physics 2nd Paper if available
      const phy = subjects.find((s) => s.nameBn.includes('পদার্থ') && s.paper === 2) || subjects[0]
      setSelectedSubjectId(phy.id)
    }
  }, [subjects, selectedSubjectId])

  React.useEffect(() => {
    if (chapters.length > 0 && !selectedChapterId) {
      setSelectedChapterId(chapters[0].id)
    }
  }, [chapters, selectedChapterId])

  // Load existing set items if setIdParam is provided
  React.useEffect(() => {
    if (setIdParam && !selectedQuestionIds.length) {
      apiClient
        .get(`/api/v1/question-sets/${setIdParam}`)
        .then((res) => {
          const s = res.data
          if (s) {
            setTitle(s.title || 'Test-Exam')
            if (s.subjectId) setSelectedSubjectId(s.subjectId)
            if (s.levelId) setSelectedLevelId(s.levelId)
            if (s.chapterIds && s.chapterIds.length > 0) setSelectedChapterId(s.chapterIds[0])
            if (s.targetCount) setQuestionCount(s.targetCount)
            if (s.durationMin) setDurationMin(s.durationMin)
            if (s.fullMarks) setFullMarks(s.fullMarks)
            if (s.items && Array.isArray(s.items)) {
              setSelectedQuestionIds(s.items.map((it: any) => it.questionId || it.id))
            }
          }
        })
        .catch(() => {})
    }
  }, [setIdParam])

  // Active labels
  const activeLevel = levels.find((l) => l.id === selectedLevelId)
  const activeSubject = subjects.find((s) => s.id === selectedSubjectId)
  const activeChapter = chapters.find((c) => c.id === selectedChapterId)

  const activeLevelName = activeLevel?.nameBn || 'এইচএসসি'
  const activeSubjectName = activeSubject
    ? `${activeSubject.label || activeSubject.nameBn}${activeSubject.paper ? ` (${activeSubject.paper}য় পত্র)` : ''}`
    : 'পদার্থবিজ্ঞান ২য় পত্র'
  const activeChapterName = activeChapter
    ? `অধ্যায় ${activeChapter.number} - ${activeChapter.nameBn}`
    : 'অধ্যায় ১ - তাপগতিবিদ্যা'

  // Step 1: Create Question Set
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('পরীক্ষার শিরোনাম লিখুন')
      return
    }
    if (!selectedLevelId) {
      toast.error('শ্রেণি নির্বাচন করুন')
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

    setIsSubmitting(true)
    try {
      const typeNum = questionType === 'Mcq' ? 0 : 1

      const res = await apiClient.post('/api/v1/question-sets', {
        title: title.trim(),
        levelId: selectedLevelId,
        subjectId: selectedSubjectId,
        chapterIds: [selectedChapterId],
        type: typeNum,
        mode: 0,
        source: 2, // Both Platform & Bank
        bankIds: [],
        targetCount: questionCount,
        durationMin,
        fullMarks,
      })

      const newId = res.data?.id
      if (newId) {
        setCreatedSetId(newId)
        setStep('created')
        setSearchParams({ step: 'created', setId: newId }, { replace: true })
        toast.success('প্রশ্নসেট সফলভাবে তৈরি হয়েছে!')
      }
    } catch (err: any) {
      const data = err?.response?.data
      let errorMsg = ''
      if (data?.errors && typeof data.errors === 'object') {
        const first = Object.values(data.errors)[0]
        if (Array.isArray(first) && first.length > 0) {
          errorMsg = first[0] as string
        }
      }
      if (!errorMsg && data?.detail) {
        errorMsg = data.detail
      }
      toast.error(errorMsg || 'প্রশ্নসেট তৈরিতে সমস্যা হয়েছে')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Step 2 -> Step 3
  const handleAddQuestionsFromCreated = () => {
    setStep('picker')
    setSearchParams({ step: 'picker', setId: createdSetId }, { replace: true })
  }

  // Save items into Question Set
  const handleSaveSetItems = async () => {
    if (!createdSetId) return
    setIsSaving(true)
    try {
      const marksPerItem = questionType === 'Mcq' ? 1 : 10
      await apiClient.put(`/api/v1/question-sets/${createdSetId}/items`, {
        items: selectedQuestionIds.map((qid) => ({
          questionId: qid,
          marks: marksPerItem,
        })),
      })
      toast.success('প্রশ্নসেট সফলভাবে সংরক্ষিত হয়েছে!')
    } catch {
      toast.error('প্রশ্ন সংরক্ষণ করতে সমস্যা হয়েছে')
    } finally {
      setIsSaving(false)
    }
  }

  // Step 3 -> Step 4
  const handleGoToPreview = async () => {
    if (selectedQuestionIds.length > 0) {
      await handleSaveSetItems()
    }
    setStep('preview')
    setSearchParams({ step: 'preview', setId: createdSetId }, { replace: true })
  }

  // Step 4 -> Step 3
  const handleBackToPicker = () => {
    setStep('picker')
    setSearchParams({ step: 'picker', setId: createdSetId }, { replace: true })
  }

  return (
    <div>
      {/* Step 1: 1-Click Generation Card (Matching 1.png) */}
      {step === 'create' && (
        <GenerateStepCreate
          title={title}
          setTitle={setTitle}
          selectedLevelId={selectedLevelId}
          setSelectedLevelId={setSelectedLevelId}
          levels={levels}
          levelsLoading={levelsLoading}
          selectedSubjectId={selectedSubjectId}
          setSelectedSubjectId={setSelectedSubjectId}
          subjects={subjects}
          subjectsLoading={subjectsLoading}
          selectedChapterId={selectedChapterId}
          setSelectedChapterId={setSelectedChapterId}
          chapters={chapters}
          chaptersLoading={chaptersLoading}
          questionType={questionType}
          setQuestionType={setQuestionType}
          questionCount={questionCount}
          setQuestionCount={setQuestionCount}
          isSubmitting={isSubmitting}
          onSubmit={handleCreateSubmit}
        />
      )}

      {/* Step 2: Paper Created Sheet (Matching 2.png) */}
      {step === 'created' && (
        <GenerateStepCreated
          teacherName={teacherName}
          levelName={activeLevelName}
          subjectName={activeSubjectName}
          chapterName={activeChapterName}
          durationMin={durationMin}
          fullMarks={fullMarks}
          onAddQuestions={handleAddQuestionsFromCreated}
        />
      )}

      {/* Step 3: Interactive Question Picker (Matching 3.png) */}
      {step === 'picker' && (
        <GenerateStepPicker
          setId={createdSetId}
          title={title}
          targetCount={questionCount}
          selectedSubjectId={selectedSubjectId}
          selectedChapterId={selectedChapterId}
          chapters={chapters}
          selectedQuestionIds={selectedQuestionIds}
          setSelectedQuestionIds={setSelectedQuestionIds}
          onGoToPreview={handleGoToPreview}
          onSaveSetItems={handleSaveSetItems}
          isSaving={isSaving}
        />
      )}

      {/* Step 4: Printable Paper & Customization (Matching 4.png) */}
      {step === 'preview' && (
        <GenerateStepPreview
          setId={createdSetId}
          onBackToPicker={handleBackToPicker}
          teacherName={teacherName}
        />
      )}
    </div>
  )
}
