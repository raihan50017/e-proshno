import * as React from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  ListPlus,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { useListBanks } from '@/lib/api/generated/question-banks/question-banks'
import { useListImports } from '@/lib/api/generated/imports/imports'
import { useListLevels, useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import type { ImportJobDto, ImportRowDto, LevelDto, SubjectDto, ChapterDto, BankDto } from '@/lib/api/model'
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'

interface StagedQuestion {
  id: string
  title: string
  type: number // 0 = Mcq, 1 = Cq
  options?: string[]
  correctOption?: 'ক' | 'খ' | 'গ' | 'ঘ'
  explanation?: string
  cqParts?: { prompt: string; marks: number }[]
}

export function ImportsPage() {
  const { data: banksData, isLoading: banksLoading } = useListBanks()
  const banks: BankDto[] = React.useMemo(() => {
    if (!banksData) return []
    if (Array.isArray(banksData)) return banksData
    if ('data' in banksData && Array.isArray((banksData as any).data)) return (banksData as any).data
    return []
  }, [banksData])

  const { data: importsData, isLoading: importsLoading, refetch: refetchImports } = useListImports({})
  const importJobs: ImportJobDto[] = React.useMemo(() => {
    if (!importsData) return []
    if (Array.isArray(importsData)) return importsData
    if ('data' in importsData && (importsData as any).data?.items) return (importsData as any).data.items
    if ((importsData as any)?.items) return (importsData as any).items
    return []
  }, [importsData])

  // Taxonomy for defaults
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

  const [selectedChapterId, setSelectedChapterId] = React.useState<string>('')
  const [selectedBankId, setSelectedBankId] = React.useState<string>('')
  const [questionType, setQuestionType] = React.useState<number>(0) // 0 = Mcq, 1 = Cq
  const [difficulty, setDifficulty] = React.useState<number>(2) // 1=Easy, 2=Medium, 3=Hard

  // Input states: Structured Form vs Paste vs File
  const [activeImportTab, setActiveImportTab] = React.useState<'form' | 'paste' | 'file'>('form')

  // Structured Form Input Fields (Separated Inputs)
  const [formTitle, setFormTitle] = React.useState('')
  const [formOptionA, setFormOptionA] = React.useState('')
  const [formOptionB, setFormOptionB] = React.useState('')
  const [formOptionC, setFormOptionC] = React.useState('')
  const [formOptionD, setFormOptionD] = React.useState('')
  const [formCorrectOption, setFormCorrectOption] = React.useState<'ক' | 'খ' | 'গ' | 'ঘ'>('ক')
  const [formExplanation, setFormExplanation] = React.useState('')

  // CQ Form Input Fields
  const [cqPartA, setCqPartA] = React.useState('')
  const [cqPartB, setCqPartB] = React.useState('')
  const [cqPartC, setCqPartC] = React.useState('')
  const [cqPartD, setCqPartD] = React.useState('')

  // Staged Questions Queue
  const [stagedQuestions, setStagedQuestions] = React.useState<StagedQuestion[]>([])

  // Bulk Paste & File states
  const [pasteContent, setPasteContent] = React.useState('')
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)

  // Preview Modal State
  const [previewJob, setPreviewJob] = React.useState<ImportJobDto | null>(null)
  const [previewRows, setPreviewRows] = React.useState<ImportRowDto[]>([])
  const [isLoadingRows, setIsLoadingRows] = React.useState(false)
  const [isCommitting, setIsCommitting] = React.useState(false)

  // Rollback state
  const [rollbackJobId, setRollbackJobId] = React.useState<string | null>(null)
  const [isRollingBack, setIsRollingBack] = React.useState(false)

  React.useEffect(() => {
    if (banks.length > 0 && !selectedBankId) {
      setSelectedBankId(banks[0].id)
    }
  }, [banks, selectedBankId])

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

  const bankOptions = React.useMemo(
    () =>
      banks.map((b) => ({
        value: b.id,
        label: b.name,
        description: b.sharing === 0 ? 'ব্যক্তিগত ব্যাংক' : 'প্রাতিষ্ঠানিক ব্যাংক',
      })),
    [banks]
  )

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

  const chapterOptions = React.useMemo(
    () => [
      { value: '', label: 'কোনো নির্দিষ্ট অধ্যায় নয়' },
      ...chapters.map((ch) => ({
        value: ch.id,
        label: `${toBnDigits(ch.number)}. ${ch.nameBn || ch.label}`,
      })),
    ],
    [chapters]
  )

  const handleDownloadTemplate = () => {
    if (!selectedSubjectId) {
      toast.error('প্রথমে একটি বিষয় নির্বাচন করুন')
      return
    }
    const typeStr = questionType === 0 ? 'Mcq' : 'Cq'
    window.open(`/api/v1/imports/templates/${typeStr}?subjectId=${selectedSubjectId}`, '_blank')
  }

  // Format a Staged Question into TextParser format
  const formatStagedQuestion = (q: StagedQuestion, index: number): string => {
    if (q.type === 0 && q.options) {
      const letters = ['ক', 'খ', 'গ', 'ঘ']
      const optionsText = q.options
        .map((opt, i) => `${letters[i]}) ${opt}`)
        .join('\n')
      let result = `${toBnDigits(index + 1)}. ${q.title}\n${optionsText}\nউত্তর: ${q.correctOption || 'ক'}`
      if (q.explanation && q.explanation.trim()) {
        result += `\nব্যাখ্যা: ${q.explanation.trim()}`
      }
      return result
    } else if (q.type === 1 && q.cqParts) {
      const letters = ['ক', 'খ', 'গ', 'ঘ']
      let result = `সৃজনশীল ${toBnDigits(index + 1)}. ${q.title}\n`
      result += q.cqParts.map((p, i) => `${letters[i]}. ${p.prompt} [${toBnDigits(p.marks)}]`).join('\n')
      return result
    }
    return ''
  }

  // Stage a single question from structured inputs
  const handleStageQuestion = (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (!formTitle.trim()) {
      toast.error('প্রশ্নের শিরোনাম / মূলভাব লিখুন')
      return
    }

    if (questionType === 0) {
      if (!formOptionA.trim() || !formOptionB.trim() || !formOptionC.trim() || !formOptionD.trim()) {
        toast.error('ক, খ, গ, ঘ চারটি অপশনই পূরণ করুন')
        return
      }

      const newQ: StagedQuestion = {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        type: 0,
        options: [formOptionA.trim(), formOptionB.trim(), formOptionC.trim(), formOptionD.trim()],
        correctOption: formCorrectOption,
        explanation: formExplanation.trim() || undefined,
      }

      setStagedQuestions((prev) => [...prev, newQ])
      setFormTitle('')
      setFormOptionA('')
      setFormOptionB('')
      setFormOptionC('')
      setFormOptionD('')
      setFormExplanation('')
      toast.success('প্রশ্নটি প্রস্তুত তালিকায় যুক্ত হয়েছে!')
    } else {
      if (!cqPartA.trim() || !cqPartB.trim() || !cqPartC.trim() || !cqPartD.trim()) {
        toast.error('সৃজনশীল প্রশ্নের ক, খ, গ, ঘ চারটি অংশই লিখুন')
        return
      }

      const newQ: StagedQuestion = {
        id: crypto.randomUUID(),
        title: formTitle.trim(),
        type: 1,
        cqParts: [
          { prompt: cqPartA.trim(), marks: 1 },
          { prompt: cqPartB.trim(), marks: 2 },
          { prompt: cqPartC.trim(), marks: 3 },
          { prompt: cqPartD.trim(), marks: 4 },
        ],
      }

      setStagedQuestions((prev) => [...prev, newQ])
      setFormTitle('')
      setCqPartA('')
      setCqPartB('')
      setCqPartC('')
      setCqPartD('')
      toast.success('সৃজনশীল প্রশ্নটি প্রস্তুত তালিকায় যুক্ত হয়েছে!')
    }
  }

  // Submit currently filled question or all staged questions directly to backend
  const handleImportStructured = async (importAllStaged: boolean = false) => {
    if (!selectedBankId) {
      toast.error('টার্গেট প্রশ্নব্যাংক নির্বাচন করুন')
      return
    }
    if (!selectedLevelId || !selectedSubjectId) {
      toast.error('শ্রেণি ও বিষয় নির্বাচন করুন')
      return
    }

    let questionsToSubmit: StagedQuestion[] = []

    if (importAllStaged) {
      if (stagedQuestions.length === 0) {
        toast.error('প্রস্তুত তালিকায় কোনো প্রশ্ন নেই')
        return
      }
      questionsToSubmit = [...stagedQuestions]
    } else {
      // Single question direct submit
      if (!formTitle.trim()) {
        toast.error('প্রশ্নের শিরোনাম / মূলভাব লিখুন')
        return
      }

      if (questionType === 0) {
        if (!formOptionA.trim() || !formOptionB.trim() || !formOptionC.trim() || !formOptionD.trim()) {
          toast.error('ক, খ, গ, ঘ চারটি অপশনই পূরণ করুন')
          return
        }

        questionsToSubmit = [
          {
            id: crypto.randomUUID(),
            title: formTitle.trim(),
            type: 0,
            options: [formOptionA.trim(), formOptionB.trim(), formOptionC.trim(), formOptionD.trim()],
            correctOption: formCorrectOption,
            explanation: formExplanation.trim() || undefined,
          },
        ]
      } else {
        if (!cqPartA.trim() || !cqPartB.trim() || !cqPartC.trim() || !cqPartD.trim()) {
          toast.error('সৃজনশীল প্রশ্নের ক, খ, গ, ঘ চারটি অংশই লিখুন')
          return
        }

        questionsToSubmit = [
          {
            id: crypto.randomUUID(),
            title: formTitle.trim(),
            type: 1,
            cqParts: [
              { prompt: cqPartA.trim(), marks: 1 },
              { prompt: cqPartB.trim(), marks: 2 },
              { prompt: cqPartC.trim(), marks: 3 },
              { prompt: cqPartD.trim(), marks: 4 },
            ],
          },
        ]
      }
    }

    const formattedPayload = questionsToSubmit
      .map((q, idx) => formatStagedQuestion(q, idx))
      .join('\n\n')

    setIsUploading(true)
    try {
      await apiClient.post('/api/v1/imports', {
        bankId: selectedBankId,
        sourceType: 0, // Paste
        text: formattedPayload,
        defaults: {
          levelId: selectedLevelId,
          subjectId: selectedSubjectId,
          chapterId: selectedChapterId || undefined,
          type: questionType,
          difficulty,
        },
      })

      toast.success(
        `${toBnDigits(questionsToSubmit.length)} টি প্রশ্ন সফলভাবে সিস্টেমে যুক্ত হয়েছে! ইতিহাস ট্যাবে প্রাকদর্শন দেখুন।`
      )

      if (importAllStaged) {
        setStagedQuestions([])
      } else {
        setFormTitle('')
        setFormOptionA('')
        setFormOptionB('')
        setFormOptionC('')
        setFormOptionD('')
        setFormExplanation('')
        setCqPartA('')
        setCqPartB('')
        setCqPartC('')
        setCqPartD('')
      }

      refetchImports()
    } catch {
      toast.error('প্রশ্ন ইমপোর্ট করতে সমস্যা হয়েছে')
    } finally {
      setIsUploading(false)
    }
  }

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteContent.trim()) {
      toast.error('অনুগ্রহ করে প্রশ্ন পেস্ট করুন')
      return
    }
    if (!selectedBankId) {
      toast.error('টার্গেট প্রশ্নব্যাংক নির্বাচন করুন')
      return
    }
    if (!selectedLevelId || !selectedSubjectId) {
      toast.error('শ্রেণি ও বিষয় নির্বাচন করুন')
      return
    }

    setIsUploading(true)
    try {
      await apiClient.post('/api/v1/imports', {
        bankId: selectedBankId,
        sourceType: 0, // Paste
        text: pasteContent,
        defaults: {
          levelId: selectedLevelId,
          subjectId: selectedSubjectId,
          chapterId: selectedChapterId || undefined,
          type: questionType,
          difficulty,
        },
      })
      toast.success('প্রশ্ন সফলভাবে গৃহীত হয়েছে! প্রসেসিং সম্পন্ন হলে ইতিহাস ট্যাবে প্রাকদর্শন দেখতে পাবেন।')
      setPasteContent('')
      refetchImports()
    } catch {
      toast.error('প্রশ্ন ইমপোর্ট করতে সমস্যা হয়েছে')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      toast.error('অনুগ্রহ করে Excel বা CSV ফাইল নির্বাচন করুন')
      return
    }
    if (!selectedBankId) {
      toast.error('টার্গেট প্রশ্নব্যাংক নির্বাচন করুন')
      return
    }
    if (!selectedLevelId || !selectedSubjectId) {
      toast.error('শ্রেণি ও বিষয় নির্বাচন করুন')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const uploadRes = await apiClient.post<{
        fileKey: string
        fileName: string
        size: number
        sourceType: number
      }>('/api/v1/imports/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const { fileKey, fileName, sourceType } = uploadRes.data

      await apiClient.post('/api/v1/imports', {
        bankId: selectedBankId,
        sourceType,
        fileKey,
        fileName,
        defaults: {
          levelId: selectedLevelId,
          subjectId: selectedSubjectId,
          chapterId: selectedChapterId || undefined,
          type: questionType,
          difficulty,
        },
      })

      toast.success('ফাইল আপলোড সফল হয়েছে! বিশ্লেষণের পর ইতিহাস ট্যাবে প্রাকদর্শন দেখা যাবে।')
      setSelectedFile(null)
      refetchImports()
    } catch {
      toast.error('ফাইল আপলোড ও ইমপোর্ট করতে সমস্যা হয়েছে')
    } finally {
      setIsUploading(false)
    }
  }

  const handleOpenPreview = async (job: ImportJobDto) => {
    setPreviewJob(job)
    setIsLoadingRows(true)
    try {
      const res = await apiClient.get<{ items: ImportRowDto[] }>(`/api/v1/imports/${job.id}/rows`)
      setPreviewRows(res.data?.items || [])
    } catch {
      toast.error('ইমপোর্ট করা প্রশ্নের রো লোড করতে সমস্যা হয়েছে')
    } finally {
      setIsLoadingRows(false)
    }
  }

  const handleCommitJob = async () => {
    if (!previewJob) return
    setIsCommitting(true)
    try {
      await apiClient.post(`/api/v1/imports/${previewJob.id}/commit`, {})
      toast.success('প্রশ্নসমূহ সফলভাবে ব্যাংকে সংরক্ষিত হয়েছে!')
      setPreviewJob(null)
      refetchImports()
    } catch {
      toast.error('ইমপোর্ট কমিট করতে সমস্যা হয়েছে')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleRollback = async () => {
    if (!rollbackJobId) return
    setIsRollingBack(true)
    try {
      await apiClient.post(`/api/v1/imports/${rollbackJobId}/rollback`, {})
      toast.success('ইমপোর্ট সফলভাবে রোলব্যাক করা হয়েছে!')
      setRollbackJobId(null)
      refetchImports()
    } catch {
      toast.error('রোলব্যাক করতে সমস্যা হয়েছে')
    } finally {
      setIsRollingBack(false)
    }
  }

  const statusBadge = (status: number) => {
    switch (status) {
      case 0:
        return <Badge variant="secondary">আপলোডকৃত</Badge>
      case 1:
        return <Badge variant="info">বিশ্লেষণ হচ্ছে...</Badge>
      case 2:
        return <Badge variant="warning">কলাম ম্যাপিং প্রয়োজন</Badge>
      case 3:
        return <Badge variant="info" className="bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">প্রাকদর্শন প্রস্তুত</Badge>
      case 4:
        return <Badge variant="info">কমিট হচ্ছে...</Badge>
      case 5:
        return <Badge variant="success">সফলভাবে সম্পন্ন</Badge>
      case 6:
        return <Badge variant="destructive">ব্যর্থ</Badge>
      case 7:
        return <Badge variant="destructive">রোলব্যাককৃত</Badge>
      default:
        return <Badge variant="secondary">প্রসেসিং</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রশ্ন ইমপোর্ট ও ইতিহাস"
        description="পৃথক ইনপুট ফিল্ড, সরাসরি টেক্সট পেস্ট বা Excel ফাইল থেকে সহজে ব্যাংকে প্রশ্ন যুক্ত করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'প্রশ্ন ইমপোর্ট' },
        ]}
        actions={
          <Button
            variant="outline"
            className="gap-2 text-xs"
            onClick={handleDownloadTemplate}
          >
            <Download className="size-4" />
            Excel টেমপ্লেট ডাউনলোড (.xlsx)
          </Button>
        }
      />

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList className="bg-muted/60 p-1">
          <TabsTrigger value="upload" className="text-xs gap-1.5">
            <UploadCloud className="size-3.5" />
            নতুন ইমপোর্ট
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <Clock className="size-3.5" />
            ইমপোর্ট ইতিহাস ({toBnDigits(importJobs.length)})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Upload / Input / Paste */}
        <TabsContent value="upload" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column: Config + Form (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Target & Taxonomy Configuration */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">১. টার্গেট ব্যাংক ও মৌলিক তথ্য</CardTitle>
                  <CardDescription className="text-xs">
                    ইমপোর্ট করা প্রশ্নের শ্রেণি, বিষয় ও ডিফল্ট মান নির্ধারণ করুন
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>টার্গেট প্রশ্নব্যাংক *</Label>
                    <Combobox
                      options={bankOptions}
                      value={selectedBankId}
                      onChange={setSelectedBankId}
                      placeholder="প্রশ্নব্যাংক নির্বাচন করুন"
                      searchPlaceholder="ব্যাংক খুঁজুন..."
                      loading={banksLoading}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>শ্রেণি / স্তর *</Label>
                      <Combobox
                        options={levelOptions}
                        value={selectedLevelId}
                        onChange={(val) => {
                          setSelectedLevelId(val)
                          setSelectedSubjectId('')
                          setSelectedChapterId('')
                        }}
                        placeholder="শ্রেণি নির্বাচন করুন"
                        searchPlaceholder="শ্রেণি খুঁজুন..."
                        loading={levelsLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>বিষয় *</Label>
                      <Combobox
                        options={subjectOptions}
                        value={selectedSubjectId}
                        onChange={(val) => {
                          setSelectedSubjectId(val)
                          setSelectedChapterId('')
                        }}
                        placeholder={subjects.length === 0 ? 'প্রথমে শ্রেণি নির্বাচন করুন' : 'বিষয় নির্বাচন করুন'}
                        searchPlaceholder="বিষয় খুঁজুন..."
                        disabled={!selectedLevelId || subjects.length === 0}
                        loading={subjectsLoading}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>ডিফল্ট অধ্যায় (ঐচ্ছিক)</Label>
                      <Combobox
                        options={chapterOptions}
                        value={selectedChapterId}
                        onChange={setSelectedChapterId}
                        placeholder="অধ্যায় নির্বাচন করুন"
                        searchPlaceholder="অধ্যায় খুঁজুন..."
                        disabled={!selectedSubjectId || chapters.length === 0}
                        loading={chaptersLoading}
                        clearable
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>প্রশ্নের ধরন</Label>
                      <div className="flex rounded-md border border-input p-0.5 bg-muted/40 h-10 items-center">
                        <button
                          type="button"
                          onClick={() => setQuestionType(0)}
                          className={`flex-1 rounded h-8 text-xs font-medium transition-colors ${
                            questionType === 0
                              ? 'bg-background text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          MCQ
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionType(1)}
                          className={`flex-1 rounded h-8 text-xs font-medium transition-colors ${
                            questionType === 1
                              ? 'bg-background text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          CQ
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>ডিফল্ট কাঠিন্য</Label>
                      <div className="flex rounded-md border border-input p-0.5 bg-muted/40 h-10 items-center">
                        {[
                          { val: 1, label: 'সহজ' },
                          { val: 2, label: 'মধ্যম' },
                          { val: 3, label: 'কঠিন' },
                        ].map((d) => (
                          <button
                            key={d.val}
                            type="button"
                            onClick={() => setDifficulty(d.val)}
                            className={`flex-1 rounded h-8 text-xs font-medium transition-colors ${
                              difficulty === d.val
                                ? 'bg-background text-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Mode Selection Tabs: Structured Form vs Paste vs File */}
              <Tabs
                value={activeImportTab}
                onValueChange={(v: any) => setActiveImportTab(v)}
                className="space-y-4"
              >
                <TabsList className="bg-muted/60 p-1 w-full grid grid-cols-3">
                  <TabsTrigger value="form" className="text-xs gap-1.5 font-medium">
                    <ListPlus className="size-3.5" />
                    আলাদা ইনপুট ফিল্ড (ফর্ম)
                  </TabsTrigger>
                  <TabsTrigger value="paste" className="text-xs gap-1.5">
                    <FileText className="size-3.5" />
                    সরাসরি পেস্ট (Word/Text)
                  </TabsTrigger>
                  <TabsTrigger value="file" className="text-xs gap-1.5">
                    <FileSpreadsheet className="size-3.5" />
                    Excel / CSV আপলোড
                  </TabsTrigger>
                </TabsList>

                {/* Mode 1: Structured Form with Separate Inputs for Title & Options */}
                <TabsContent value="form" className="space-y-4">
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <span>২. প্রশ্নের তথ্য ও অপশন ইনপুট</span>
                          <Badge variant="secondary" className="text-[11px]">
                            {questionType === 0 ? 'MCQ প্রশ্ন' : 'সৃজনশীল প্রশ্ন'}
                          </Badge>
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs leading-relaxed">
                        শিরোনাম ও প্রতিটি অপশনের জন্য আলাদা ফিল্ডে তথ্য পূরণ করুন
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Separate Title / Stem Input */}
                      <div className="space-y-2">
                        <Label htmlFor="qTitle" className="text-xs font-semibold text-foreground">
                          প্রশ্নের শিরোনাম / মূলভাব (Title / Stem) *
                        </Label>
                        <textarea
                          id="qTitle"
                          rows={3}
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder={
                            questionType === 0
                              ? 'যেমন: কোনো বস্তুর ভরবেগ দ্বিগুণ করা হলে গতিশক্তি কত গুণ হবে?'
                              : 'উদ্দীপক: একটি বস্তু ১০ মিটার উপর থেকে মুক্তভাবে পড়তে লাগল...'
                          }
                          className="w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
                        />
                      </div>

                      {/* Separate Option Fields for MCQ */}
                      {questionType === 0 ? (
                        <div className="space-y-3 pt-1">
                          <Label className="text-xs font-semibold text-foreground block">
                            অপশনসমূহ (Separate Options) *
                          </Label>

                          <div className="grid gap-3 sm:grid-cols-2">
                            {/* Option A */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="optA" className="text-[11px] text-muted-foreground font-medium">
                                  অপশন (ক)
                                </Label>
                                {formCorrectOption === 'ক' && (
                                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                    <Check className="size-3" /> সঠিক উত্তর
                                  </span>
                                )}
                              </div>
                              <div className="flex rounded-md shadow-2xs">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-xs font-bold text-foreground">
                                  ক
                                </span>
                                <Input
                                  id="optA"
                                  placeholder="অপশন ক এর উত্তর লিখুন..."
                                  value={formOptionA}
                                  onChange={(e) => setFormOptionA(e.target.value)}
                                  className="rounded-l-none text-xs"
                                />
                              </div>
                            </div>

                            {/* Option B */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="optB" className="text-[11px] text-muted-foreground font-medium">
                                  অপশন (খ)
                                </Label>
                                {formCorrectOption === 'খ' && (
                                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                    <Check className="size-3" /> সঠিক উত্তর
                                  </span>
                                )}
                              </div>
                              <div className="flex rounded-md shadow-2xs">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-xs font-bold text-foreground">
                                  খ
                                </span>
                                <Input
                                  id="optB"
                                  placeholder="অপশন খ এর উত্তর লিখুন..."
                                  value={formOptionB}
                                  onChange={(e) => setFormOptionB(e.target.value)}
                                  className="rounded-l-none text-xs"
                                />
                              </div>
                            </div>

                            {/* Option C */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="optC" className="text-[11px] text-muted-foreground font-medium">
                                  অপশন (গ)
                                </Label>
                                {formCorrectOption === 'গ' && (
                                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                    <Check className="size-3" /> সঠিক উত্তর
                                  </span>
                                )}
                              </div>
                              <div className="flex rounded-md shadow-2xs">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-xs font-bold text-foreground">
                                  গ
                                </span>
                                <Input
                                  id="optC"
                                  placeholder="অপশন গ এর উত্তর লিখুন..."
                                  value={formOptionC}
                                  onChange={(e) => setFormOptionC(e.target.value)}
                                  className="rounded-l-none text-xs"
                                />
                              </div>
                            </div>

                            {/* Option D */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="optD" className="text-[11px] text-muted-foreground font-medium">
                                  অপশন (ঘ)
                                </Label>
                                {formCorrectOption === 'ঘ' && (
                                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                    <Check className="size-3" /> সঠিক উত্তর
                                  </span>
                                )}
                              </div>
                              <div className="flex rounded-md shadow-2xs">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/60 text-xs font-bold text-foreground">
                                  ঘ
                                </span>
                                <Input
                                  id="optD"
                                  placeholder="অপশন ঘ এর উত্তর লিখুন..."
                                  value={formOptionD}
                                  onChange={(e) => setFormOptionD(e.target.value)}
                                  className="rounded-l-none text-xs"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Correct Option Selector */}
                          <div className="pt-2 space-y-1.5">
                            <Label className="text-xs font-medium text-foreground">
                              সঠিক উত্তর নির্ধারণ করুন *
                            </Label>
                            <div className="flex gap-2">
                              {(['ক', 'খ', 'গ', 'ঘ'] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setFormCorrectOption(opt)}
                                  className={`flex-1 py-2 rounded-md border text-xs font-bold transition-all ${
                                    formCorrectOption === opt
                                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                                      : 'border-input bg-background hover:bg-muted/60 text-muted-foreground'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Explanation Field */}
                          <div className="pt-2 space-y-1.5">
                            <Label htmlFor="qExpl" className="text-xs font-medium text-muted-foreground">
                              উত্তরের ব্যাখ্যা (ঐচ্ছিক)
                            </Label>
                            <Input
                              id="qExpl"
                              placeholder="যেমন: E = p^2 / 2m সূত্রে p দ্বিগুণ হলে গতিশক্তি ৪ গুণ হয়।"
                              value={formExplanation}
                              onChange={(e) => setFormExplanation(e.target.value)}
                              className="text-xs"
                            />
                          </div>
                        </div>
                      ) : (
                        /* CQ Parts (ক, খ, গ, ঘ) */
                        <div className="space-y-3 pt-1">
                          <Label className="text-xs font-semibold text-foreground block">
                            সৃজনশীল প্রশ্ন অংশসমূহ (CQ Parts) *
                          </Label>

                          <div className="space-y-2.5">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                ক. জ্ঞানমূলক (১ নম্বর) *
                              </Label>
                              <Input
                                placeholder="ক অংশের প্রশ্ন..."
                                value={cqPartA}
                                onChange={(e) => setCqPartA(e.target.value)}
                                className="text-xs"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                খ. অনুধাবনমূলক (২ নম্বর) *
                              </Label>
                              <Input
                                placeholder="খ অংশের প্রশ্ন..."
                                value={cqPartB}
                                onChange={(e) => setCqPartB(e.target.value)}
                                className="text-xs"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                গ. প্রয়োগমূলক (৩ নম্বর) *
                              </Label>
                              <Input
                                placeholder="গ অংশের প্রশ্ন..."
                                value={cqPartC}
                                onChange={(e) => setCqPartC(e.target.value)}
                                className="text-xs"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                ঘ. উচ্চতর দক্ষতামূলক (৪ নম্বর) *
                              </Label>
                              <Input
                                placeholder="ঘ অংশের প্রশ্ন..."
                                value={cqPartD}
                                onChange={(e) => setCqPartD(e.target.value)}
                                className="text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={handleStageQuestion}
                        >
                          <Plus className="size-3.5" />
                          তালিকায় যোগ করুন (+)
                        </Button>

                        <Button
                          type="button"
                          loading={isUploading}
                          loadingText="যুক্ত হচ্ছে..."
                          onClick={() => handleImportStructured(false)}
                          className="gap-2 text-xs"
                        >
                          <Send className="size-3.5" />
                          সরাসরি ব্যাংকে পাঠান
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Staged Questions List Queue */}
                  {stagedQuestions.length > 0 && (
                    <Card className="border-primary/30 bg-primary/[0.01]">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <ListPlus className="size-4 text-primary" />
                            প্রস্তুতকৃত প্রশ্নতালিকা ({toBnDigits(stagedQuestions.length)}টি প্রশ্ন)
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => setStagedQuestions([])}
                          >
                            সকল মুছুন
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {stagedQuestions.map((q, qIdx) => (
                            <div
                              key={q.id}
                              className="p-3 rounded-lg border border-border bg-card text-xs space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-foreground line-clamp-1">
                                  {toBnDigits(qIdx + 1)}. {q.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStagedQuestions((prev) => prev.filter((item) => item.id !== q.id))
                                  }
                                  className="text-muted-foreground hover:text-destructive p-1"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>

                              {q.type === 0 && q.options && (
                                <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground pt-0.5">
                                  {q.options.map((opt, oIdx) => (
                                    <span
                                      key={oIdx}
                                      className={`truncate ${
                                        ['ক', 'খ', 'গ', 'ঘ'][oIdx] === q.correctOption
                                          ? 'text-emerald-600 font-semibold'
                                          : ''
                                      }`}
                                    >
                                      {['ক', 'খ', 'গ', 'ঘ'][oIdx]}. {opt}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {q.explanation && (
                                <p className="text-[10px] text-muted-foreground/80 italic">
                                  ব্যাখ্যা: {q.explanation}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-border flex justify-end">
                          <Button
                            type="button"
                            loading={isUploading}
                            loadingText="ইমপোর্ট হচ্ছে..."
                            onClick={() => handleImportStructured(true)}
                            className="gap-2 text-xs"
                          >
                            <CheckCircle className="size-4" />
                            সকল প্রস্তুত প্রশ্ন ({toBnDigits(stagedQuestions.length)}টি) একসাথে ইমপোর্ট করুন
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Mode 2: Bulk Text Paste */}
                <TabsContent value="paste">
                  <Card className="border-border">
                    <form onSubmit={handlePasteSubmit}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">২. বাল্ক প্রশ্ন টেক্সট পেস্ট করুন</CardTitle>
                        <CardDescription className="text-xs leading-relaxed">
                          Word বা PDF থেকে একাধিক প্রশ্ন ক্রমিক নম্বর, অপশন এবং &quot;উত্তর: গ&quot; লাইনসহ পেস্ট করুন
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <textarea
                          className="w-full min-h-[240px] rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
                          placeholder={`১. কোনো বস্তুর ভরবেগ দ্বিগুণ করা হলে গতিশক্তি কত গুণ হবে?
ক) ২ গুণ
খ) ৪ গুণ
গ) ৮ গুণ
ঘ) অপরিবর্তিত
উত্তর: খ
ব্যাখ্যা: E = p^2 / 2m সূত্রে p দ্বিগুণ হলে গতিশক্তি ৪ গুণ হয়।`}
                          value={pasteContent}
                          onChange={(e) => setPasteContent(e.target.value)}
                        />
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            loading={isUploading}
                            loadingText="প্রসেস হচ্ছে..."
                            className="gap-2 text-xs"
                          >
                            <CheckCircle className="size-4" />
                            পেস্টকৃত প্রশ্ন যাচাই ও আপলোড করুন
                          </Button>
                        </div>
                      </CardContent>
                    </form>
                  </Card>
                </TabsContent>

                {/* Mode 3: File Upload */}
                <TabsContent value="file">
                  <Card className="border-border">
                    <form onSubmit={handleFileUploadSubmit}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold">২. Excel বা CSV ফাইল নির্বাচন করুন</CardTitle>
                        <CardDescription className="text-xs leading-relaxed">
                          অফিসিয়াল টেমপ্লেট অনুসারে সাজানো .xlsx বা .csv ফাইল নির্বাচন করে আপলোড করুন
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-muted/20 transition-colors">
                          <input
                            type="file"
                            id="importFile"
                            accept=".xlsx, .csv"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setSelectedFile(e.target.files[0])
                              }
                            }}
                            className="hidden"
                          />
                          <label htmlFor="importFile" className="cursor-pointer space-y-2 block">
                            <Upload className="size-8 mx-auto text-primary opacity-80" />
                            <p className="text-sm font-medium text-foreground">
                              {selectedFile ? selectedFile.name : 'কম্পিউটার থেকে ফাইল বেছে নিন'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedFile
                                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                                : '.xlsx বা .csv ফাইল (সর্বোচ্চ ১০ এমবি)'}
                            </p>
                          </label>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={!selectedFile || isUploading}
                            loading={isUploading}
                            loadingText="আপলোড হচ্ছে..."
                            className="gap-2 text-xs"
                          >
                            <UploadCloud className="size-4" />
                            ফাইল আপলোড ও প্রসেস করুন
                          </Button>
                        </div>
                      </CardContent>
                    </form>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right Guide Card (1 col) */}
            <div className="space-y-4">
              <Card className="border-border bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <FileSpreadsheet className="size-4 text-emerald-600" />
                    ইমপোর্ট নির্দেশিকা
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2.5 text-muted-foreground leading-relaxed">
                  <p>• <strong>আলাদা ফিল্ডে ইনপুট:</strong> প্রশ্ন শিরোনাম, ৪টি অপশন এবং সঠিক উত্তর আলাদা আলাদা ফিল্ডে টাইপ করে সহজে প্রশ্ন তৈরি করুন।</p>
                  <p>• <strong>ব্যাচ কিউ:</strong> &quot;তালিকায় যোগ করুন&quot; বোতাম চেপে একাধিক প্রশ্ন সাজিয়ে একসাথে ব্যাংকে জমা দিতে পারবেন।</p>
                  <p>• <strong>বাল্ক পেস্ট:</strong> Word বা PDF ফাইল থেকে সরাসরি প্রশ্ন ও অপশন পেস্ট করে আমদানি করুন।</p>
                  <p>• <strong>Excel আপলোড:</strong> অফিশিয়াল টেমপ্লেটে একসাথে ৫,০০০ পর্যন্ত প্রশ্ন আপলোড করুন।</p>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      onClick={handleDownloadTemplate}
                    >
                      <Download className="size-3.5" />
                      Excel টেমপ্লেট ডাউনলোড
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: History & Rollback */}
        <TabsContent value="history">
          <Card className="border-border">
            <CardContent className="p-0">
              {importsLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : importJobs.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>উৎস / ফাইল</TableHead>
                        <TableHead>টার্গেট ব্যাংক</TableHead>
                        <TableHead>মোট প্রশ্ন</TableHead>
                        <TableHead>অবস্থা</TableHead>
                        <TableHead>তারিখ</TableHead>
                        <TableHead className="text-right">পদক্ষেপ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium text-foreground">
                            {job.fileName || (job.sourceType === 0 ? 'টেক্সট পেস্ট' : 'ফাইল')}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {job.bankName || 'সাধারণ ব্যাংক'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {toBnDigits(job.totals?.total ?? 0)} টি (
                            <span className="text-emerald-600 font-medium">
                              {toBnDigits(job.totals?.imported ?? job.totals?.ok ?? 0)} টি সফল
                            </span>
                            {job.totals?.error > 0 && (
                              <span className="text-rose-600 font-medium ml-1">
                                , {toBnDigits(job.totals.error)} ত্রুটি
                              </span>
                            )}
                            )
                          </TableCell>
                          <TableCell>
                            {statusBadge(job.status)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateBn(job.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {job.status === 3 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 gap-1"
                                  onClick={() => handleOpenPreview(job)}
                                >
                                  <Eye className="size-3" />
                                  প্রাকদর্শন ও অনুমোদন
                                </Button>
                              )}

                              {job.totals?.error > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground gap-1"
                                  onClick={() =>
                                    window.open(`/api/v1/imports/${job.id}/error-report`, '_blank')
                                  }
                                >
                                  <Download className="size-3" />
                                  ত্রুটি রিপোর্ট
                                </Button>
                              )}

                              {job.canRollback && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 gap-1"
                                  onClick={() => setRollbackJobId(job.id)}
                                >
                                  <RotateCcw className="size-3" />
                                  রোলব্যাক
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-6">
                  <EmptyState
                    icon={UploadCloud}
                    title="এখনও কোনো ইমপোর্ট করা হয়নি"
                    description="ফর্ম থেকে পৃথক ফিল্ডে প্রশ্ন ইনপুট, Excel ফাইল আপলোড বা সরাসরি টেক্সট পেস্ট করে দ্রুত প্রশ্ন যোগ করুন।"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview & Commit Dialog */}
      <Dialog open={Boolean(previewJob)} onOpenChange={(open) => !open && setPreviewJob(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="size-4 text-emerald-600" />
              ইমপোর্ট প্রাকদর্শন ও অনুমোদন
            </DialogTitle>
            <DialogDescription className="text-xs">
              বিশ্লেষণকৃত প্রশ্নগুলো পর্যালোচনা করুন এবং ব্যাংকে যুক্ত করতে অনুমোদন দিন
            </DialogDescription>
          </DialogHeader>

          {previewJob && (
            <div className="flex flex-wrap items-center gap-2 py-2 border-y border-border text-xs">
              <span className="text-muted-foreground">মোট সারি: <strong>{toBnDigits(previewJob.totals.total)}</strong></span>
              <span className="text-emerald-600">ত্রুটিমুক্ত: <strong>{toBnDigits(previewJob.totals.ok)}</strong></span>
              {previewJob.totals.warning > 0 && (
                <span className="text-amber-600">সতর্কতা: <strong>{toBnDigits(previewJob.totals.warning)}</strong></span>
              )}
              {previewJob.totals.error > 0 && (
                <span className="text-rose-600">ত্রুটি: <strong>{toBnDigits(previewJob.totals.error)}</strong></span>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
            {isLoadingRows ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded bg-muted/60 animate-pulse" />
                ))}
              </div>
            ) : previewRows.length > 0 ? (
              previewRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border p-3 text-xs space-y-1.5 bg-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">
                      সারি {toBnDigits(row.rowNo)}
                    </span>
                    <Badge
                      variant={
                        row.status === 0
                          ? 'success'
                          : row.status === 1
                          ? 'warning'
                          : 'destructive'
                      }
                      className="text-[10px]"
                    >
                      {row.status === 0 ? 'সঠিক' : row.status === 1 ? 'সতর্কতা' : 'ত্রুটি'}
                    </Badge>
                  </div>
                  <p className="font-medium text-foreground line-clamp-2">
                    {row.draft?.stem}
                  </p>
                  {row.draft?.options && row.draft.options.length > 0 && (
                    <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground pt-1">
                      {row.draft.options.slice(0, 4).map((opt, oIdx) => (
                        <span key={oIdx} className="truncate">
                          {['ক', 'খ', 'গ', 'ঘ'][oIdx]}. {opt}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.draft?.correctRaw && (
                    <p className="text-[11px] text-emerald-600 font-medium">
                      উত্তর: {row.draft.correctRaw}
                    </p>
                  )}
                  {row.messages && row.messages.length > 0 && (
                    <div className="space-y-0.5 pt-1 text-[11px] text-rose-500">
                      {row.messages.map((m, mIdx) => (
                        <div key={mIdx} className="flex items-center gap-1">
                          <AlertCircle className="size-3 shrink-0" />
                          <span>{m.messageBn}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-xs text-muted-foreground py-6">
                কোনো রো খুঁজে পাওয়া যায়নি।
              </p>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewJob(null)}
              disabled={isCommitting}
            >
              বন্ধ করুন
            </Button>
            <Button
              type="button"
              disabled={
                isCommitting ||
                (previewJob?.totals?.error ?? 0) > 0 ||
                (previewJob?.totals?.ok ?? 0) === 0
              }
              loading={isCommitting}
              loadingText="কমিট হচ্ছে..."
              onClick={handleCommitJob}
              className="gap-1.5"
            >
              <CheckCircle className="size-4" />
              কমিট করুন ({toBnDigits(previewJob?.totals?.ok ?? 0)} টি প্রশ্ন ব্যাংকে যুক্ত হবে)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirmation */}
      <ConfirmDialog
        open={Boolean(rollbackJobId)}
        onOpenChange={(open) => !open && setRollbackJobId(null)}
        title="ইমপোর্ট রোলব্যাক নিশ্চিতকরণ"
        description="আপনি কি নিশ্চিত যে এই ইমপোর্টের সমস্ত প্রশ্ন ব্যাংক থেকে মুছে ফেলতে চান? (ইতোমধ্যে কোনো প্রশ্নপত্রে ব্যবহৃত হয়ে থাকলে সেগুলো সংরক্ষিত থাকবে)।"
        confirmText="হ্যাঁ, রোলব্যাক করুন"
        cancelText="বাতিল"
        confirmVariant="destructive"
        loading={isRollingBack}
        onConfirm={handleRollback}
      />
    </div>
  )
}
