import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  ListPlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Upload,
  UploadCloud,
  X,
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
import { RichText } from '@/components/shared/rich-text'
import { cleanOptionText, textToTipTapJson } from '@/lib/rich-content'
import { QuestionUpsertModal } from '@/features/question-bank/QuestionUpsertModal'
import { useListBanks } from '@/lib/api/generated/question-banks/question-banks'
import { useListImports } from '@/lib/api/generated/imports/imports'
import { useListLevels, useListSubjects, useListChapters } from '@/lib/api/generated/taxonomy/taxonomy'
import { useSearchQuestions } from '@/lib/api/generated/questions/questions'
import type { ImportJobDto, ImportRowDto, LevelDto, SubjectDto, ChapterDto, BankDto } from '@/lib/api/model'
import type { QuestionCard } from '@/lib/api/model/questionCard'
import type { QuestionDetail } from '@/lib/api/model/questionDetail'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { formatDateBn, toBnDigits, OPTION_LABELS } from '@/lib/bn'

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

  // Editing Row in Preview Modal
  const [editingRow, setEditingRow] = React.useState<ImportRowDto | null>(null)
  const [editStem, setEditStem] = React.useState('')
  const [editOptionA, setEditOptionA] = React.useState('')
  const [editOptionB, setEditOptionB] = React.useState('')
  const [editOptionC, setEditOptionC] = React.useState('')
  const [editOptionD, setEditOptionD] = React.useState('')
  const [editCorrectRaw, setEditCorrectRaw] = React.useState<'ক' | 'খ' | 'গ' | 'ঘ' | string>('ক')
  const [editExplanation, setEditExplanation] = React.useState('')
  const [editCqPartA, setEditCqPartA] = React.useState('')
  const [editCqPartB, setEditCqPartB] = React.useState('')
  const [editCqPartC, setEditCqPartC] = React.useState('')
  const [editCqPartD, setEditCqPartD] = React.useState('')
  const [editExcluded, setEditExcluded] = React.useState(false)
  const [isSavingRow, setIsSavingRow] = React.useState(false)
  const [togglingRowId, setTogglingRowId] = React.useState<string | null>(null)

  // Staged Question Editing in Structured Form
  const [editingStagedId, setEditingStagedId] = React.useState<string | null>(null)

  const [searchParams] = useSearchParams()
  const bankIdFromUrl = searchParams.get('bankId')
  const tabFromUrl = searchParams.get('tab')
  const [rootTab, setRootTab] = React.useState<string>(
    tabFromUrl === 'questions' || tabFromUrl === 'history' ? tabFromUrl : 'upload'
  )

  React.useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && (tabParam === 'questions' || tabParam === 'history' || tabParam === 'upload')) {
      setRootTab(tabParam)
    }
  }, [searchParams])

  // Preview modal search & filter state
  const [previewSearchText, setPreviewSearchText] = React.useState('')
  const [previewStatusFilter, setPreviewStatusFilter] = React.useState<
    'all' | 'ok' | 'warning' | 'error' | 'duplicate' | 'excluded'
  >('all')

  // History search state
  const [historySearch, setHistorySearch] = React.useState('')

  // Questions Search Tab states
  const [searchKeyword, setSearchKeyword] = React.useState('')
  const [searchBankId, setSearchBankId] = React.useState<string>('all')
  const [searchType, setSearchType] = React.useState<'All' | 'Mcq' | 'Cq'>('All')
  const [searchSubjectId] = React.useState<string>('all')
  const [searchChapterId] = React.useState<string>('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState<boolean>(false)

  // Questions Tab Pagination
  const [currentPage, setCurrentPage] = React.useState<number>(1)
  const [pageSize, setPageSize] = React.useState<number>(10)

  // Question Upsert & Delete states
  const [editingBankQuestion, setEditingBankQuestion] = React.useState<QuestionCard | null>(null)
  const isEditingBankQuestionRef = React.useRef(false)
  const [isLoadingQuestionDetail, setIsLoadingQuestionDetail] = React.useState(false)
  const [questionToDelete, setQuestionToDelete] = React.useState<QuestionCard | null>(null)
  const [isDeletingQuestion, setIsDeletingQuestion] = React.useState(false)

  React.useEffect(() => {
    if (banks.length > 0) {
      if (bankIdFromUrl && banks.some((b) => b.id === bankIdFromUrl)) {
        setSelectedBankId(bankIdFromUrl)
        const matched = banks.find((b) => b.id === bankIdFromUrl)
        if (matched?.subjectId) {
          setSelectedSubjectId(matched.subjectId)
        }
      } else if (!selectedBankId) {
        setSelectedBankId(banks[0].id)
      }
    }
  }, [banks, bankIdFromUrl, selectedBankId])

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

  // Edit a staged question from queue
  const handleEditStaged = (q: StagedQuestion) => {
    setEditingStagedId(q.id)
    setFormTitle(q.title)
    setQuestionType(q.type)
    if (q.type === 0 && q.options) {
      setFormOptionA(cleanOptionText(q.options[0] || ''))
      setFormOptionB(cleanOptionText(q.options[1] || ''))
      setFormOptionC(cleanOptionText(q.options[2] || ''))
      setFormOptionD(cleanOptionText(q.options[3] || ''))
      setFormCorrectOption(q.correctOption || 'ক')
      setFormExplanation(q.explanation || '')
    } else if (q.type === 1 && q.cqParts) {
      setCqPartA(q.cqParts[0]?.prompt || '')
      setCqPartB(q.cqParts[1]?.prompt || '')
      setCqPartC(q.cqParts[2]?.prompt || '')
      setCqPartD(q.cqParts[3]?.prompt || '')
    }
    toast.info('প্রশ্নটি সম্পাদনার জন্য ফর্মে লোড করা হয়েছে')
  }

  // Cancel staged editing
  const handleCancelEditStaged = () => {
    setEditingStagedId(null)
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

  // Stage or update a single question from structured inputs
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
        id: editingStagedId || crypto.randomUUID(),
        title: formTitle.trim(),
        type: 0,
        options: [formOptionA.trim(), formOptionB.trim(), formOptionC.trim(), formOptionD.trim()],
        correctOption: formCorrectOption,
        explanation: formExplanation.trim() || undefined,
      }

      if (editingStagedId) {
        setStagedQuestions((prev) =>
          prev.map((item) => (item.id === editingStagedId ? newQ : item))
        )
        setEditingStagedId(null)
        toast.success('প্রশ্নটি প্রস্তুত তালিকায় হালনাগাদ করা হয়েছে!')
      } else {
        setStagedQuestions((prev) => [...prev, newQ])
        toast.success('প্রশ্নটি প্রস্তুত তালিকায় যুক্ত হয়েছে!')
      }

      setFormTitle('')
      setFormOptionA('')
      setFormOptionB('')
      setFormOptionC('')
      setFormOptionD('')
      setFormExplanation('')
    } else {
      if (!cqPartA.trim() || !cqPartB.trim() || !cqPartC.trim() || !cqPartD.trim()) {
        toast.error('সৃজনশীল প্রশ্নের ক, খ, গ, ঘ চারটি অংশই লিখুন')
        return
      }

      const newQ: StagedQuestion = {
        id: editingStagedId || crypto.randomUUID(),
        title: formTitle.trim(),
        type: 1,
        cqParts: [
          { prompt: cqPartA.trim(), marks: 1 },
          { prompt: cqPartB.trim(), marks: 2 },
          { prompt: cqPartC.trim(), marks: 3 },
          { prompt: cqPartD.trim(), marks: 4 },
        ],
      }

      if (editingStagedId) {
        setStagedQuestions((prev) =>
          prev.map((item) => (item.id === editingStagedId ? newQ : item))
        )
        setEditingStagedId(null)
        toast.success('সৃজনশীল প্রশ্নটি প্রস্তুত তালিকায় হালনাগাদ করা হয়েছে!')
      } else {
        setStagedQuestions((prev) => [...prev, newQ])
        toast.success('সৃজনশীল প্রশ্নটি প্রস্তুত তালিকায় যুক্ত হয়েছে!')
      }

      setFormTitle('')
      setCqPartA('')
      setCqPartB('')
      setCqPartC('')
      setCqPartD('')
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
    if (!selectedChapterId) {
      toast.error('অধ্যায় নির্বাচন করুন')
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

    const buildPayload = (q: StagedQuestion) => {
      const isMcq = q.type === 0
      return {
        type: q.type,
        mcqKind: isMcq ? 0 : undefined,
        subjectId: selectedSubjectId,
        chapterId: selectedChapterId,
        stem: textToTipTapJson(q.title.trim() || (isMcq ? '' : 'সৃজনশীল প্রশ্ন')),
        stimulus: !isMcq ? textToTipTapJson(q.title.trim()) : undefined,
        explanation: q.explanation?.trim() ? textToTipTapJson(q.explanation.trim()) : undefined,
        difficulty,
        importance: 1,
        options:
          isMcq && q.options
            ? q.options.map((opt, idx) => ({
                content: textToTipTapJson(cleanOptionText(opt.trim())),
                isCorrect: ['ক', 'খ', 'গ', 'ঘ'][idx] === q.correctOption,
              }))
            : [],
        cqParts:
          !isMcq && q.cqParts
            ? q.cqParts.map((p) => ({
                prompt: textToTipTapJson(p.prompt.trim()),
                marks: Number(p.marks) || 1,
                answer: undefined,
              }))
            : [],
        appearances: [],
        tagIds: [],
      }
    }

    setIsUploading(true)
    try {
      await Promise.all(
        questionsToSubmit.map((q) =>
          apiClient.post(`/api/v1/question-banks/${selectedBankId}/questions`, buildPayload(q))
        )
      )

      toast.success(
        importAllStaged
          ? `${toBnDigits(questionsToSubmit.length)} টি প্রশ্ন সরাসরি ব্যাংকে সংরক্ষিত হয়েছে!`
          : 'প্রশ্নটি সরাসরি প্রশ্নব্যাংকে সফলভাবে সংরক্ষিত হয়েছে!'
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
      executeQuestionSearch()
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
      toast.error(errorMsg || 'প্রশ্ন ব্যাংকে সংরক্ষণ করতে সমস্যা হয়েছে')
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
    if (!selectedChapterId) {
      toast.error('অধ্যায় নির্বাচন করুন')
      return
    }

    setIsUploading(true)
    try {
      const res = await apiClient.post<ImportJobDto>('/api/v1/imports', {
        bankId: selectedBankId,
        sourceType: 0, // Paste
        text: pasteContent,
        defaults: {
          levelId: selectedLevelId,
          subjectId: selectedSubjectId,
          chapterId: selectedChapterId,
          type: questionType,
          difficulty,
        },
      })
      toast.success('প্রশ্নসমূহ প্রসেস হয়েছে! প্রাকদর্শন দেখুন ও ব্যাংকে সংরক্ষণ করুন।')
      setPasteContent('')
      refetchImports()
      executeQuestionSearch()
      if (res.data) {
        handleOpenPreview(res.data)
      }
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

      const res = await apiClient.post<ImportJobDto>('/api/v1/imports', {
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

      toast.success('ফাইল আপলোড ও প্রসেসিং সফল হয়েছে! প্রাকদর্শন দেখুন ও ব্যাংকে সংরক্ষণ করুন।')
      setSelectedFile(null)
      refetchImports()
      executeQuestionSearch()
      if (res.data) {
        handleOpenPreview(res.data)
      }
    } catch {
      toast.error('ফাইল আপলোড ও ইমপোর্ট করতে সমস্যা হয়েছে')
    } finally {
      setIsUploading(false)
    }
  }

  const handleOpenPreview = async (job: ImportJobDto) => {
    setPreviewJob(job)
    setEditingRow(null)
    setPreviewSearchText('')
    setPreviewStatusFilter('all')
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

  const filteredPreviewRows = React.useMemo(() => {
    let list = previewRows
    if (previewStatusFilter !== 'all') {
      if (previewStatusFilter === 'ok') list = list.filter((r) => r.status === 0 || r.status === 5)
      else if (previewStatusFilter === 'warning') list = list.filter((r) => r.status === 1)
      else if (previewStatusFilter === 'error') list = list.filter((r) => r.status === 2)
      else if (previewStatusFilter === 'duplicate') list = list.filter((r) => r.status === 3)
      else if (previewStatusFilter === 'excluded') list = list.filter((r) => r.status === 4)
    }
    if (previewSearchText.trim()) {
      const q = previewSearchText.trim().toLowerCase()
      list = list.filter((r) => {
        const stem = (r.draft?.stem || r.draft?.stimulus || '').toLowerCase()
        const opts = (r.draft?.options || []).join(' ').toLowerCase()
        const cq = (r.draft?.cqParts || []).map((p) => p.prompt).join(' ').toLowerCase()
        const exp = (r.draft?.explanation || '').toLowerCase()
        const rowNoStr = String(r.rowNo)
        const rowNoBn = toBnDigits(r.rowNo)
        return (
          stem.includes(q) ||
          opts.includes(q) ||
          cq.includes(q) ||
          exp.includes(q) ||
          rowNoStr.includes(q) ||
          rowNoBn.includes(q)
        )
      })
    }
    return list
  }, [previewRows, previewStatusFilter, previewSearchText])

  const handleEditImportedQuestion = async (row: ImportRowDto) => {
    if (!row.createdQuestionId) {
      handleOpenEditRow(row)
      return
    }
    setIsLoadingQuestionDetail(true)
    try {
      const res = await apiClient.get<QuestionDetail>(`/api/v1/questions/${row.createdQuestionId}`)
      if (res.data?.card) {
        isEditingBankQuestionRef.current = true
        setEditingBankQuestion(res.data.card)
      } else {
        handleOpenEditRow(row)
      }
    } catch {
      handleOpenEditRow(row)
    } finally {
      setIsLoadingQuestionDetail(false)
    }
  }

  const filteredImportJobs = React.useMemo(() => {
    if (!historySearch.trim()) return importJobs
    const q = historySearch.trim().toLowerCase()
    return importJobs.filter((job) => {
      const fn = (job.fileName || '').toLowerCase()
      const bn = (job.bankName || '').toLowerCase()
      return fn.includes(q) || bn.includes(q)
    })
  }, [importJobs, historySearch])

  const previewJobsList = React.useMemo(() => {
    return (importJobs || []).filter((job) => String(job.status) === 'Preview' || (job.status as any) === 0)
  }, [importJobs])

  const [searchedQuestions, setSearchedQuestions] = React.useState<QuestionCard[]>([])

  const {
    mutate: searchQuestions,
    isPending: isSearchingQuestions,
  } = useSearchQuestions({
    mutation: {
      onSuccess: (data: any) => {
        setSearchedQuestions(data?.data?.items || data?.items || [])
      },
      onError: () => {
        toast.error('প্রশ্ন খুঁজতে সমস্যা হয়েছে')
      },
    },
  })




  const executeQuestionSearch = React.useCallback(() => {
    searchQuestions({
      data: {
        source: 1, // MyBanks (imported questions are stored in custom banks)
        bankIds: searchBankId && searchBankId !== 'all' ? [searchBankId] : [],
        subjectId: searchSubjectId && searchSubjectId !== 'all' ? searchSubjectId : null,
        chapterIds: searchChapterId && searchChapterId !== 'all' ? [searchChapterId] : [],
        type: searchType === 'All' ? null : searchType === 'Mcq' ? 0 : 1,
        filters: {
          keyword: searchKeyword.trim() || null,
          mode: 0,
          topicIds: [],
          tagIds: [],
          withImage: false,
          repeatedBoard: false,
        },
        limit: 500,
      },
    })
  }, [searchQuestions, searchBankId, searchSubjectId, searchChapterId, searchType, searchKeyword])

  React.useEffect(() => {
    const timer = setTimeout(() => {
      executeQuestionSearch()
    }, 250)
    return () => clearTimeout(timer)
  }, [executeQuestionSearch])

  React.useEffect(() => {
    if (rootTab === 'questions') {
      executeQuestionSearch()
    }
  }, [rootTab, executeQuestionSearch])

  // Reset to page 1 whenever any search filter changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchKeyword, searchBankId, searchType])

  const displayedQuestions = React.useMemo(() => {
    return [...searchedQuestions].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      if (timeB !== timeA) return timeB - timeA
      return b.id.localeCompare(a.id)
    })
  }, [searchedQuestions])
  const totalQuestions = displayedQuestions.length
  const totalPages = Math.max(1, Math.ceil(totalQuestions / pageSize))

  // Ensure current page does not exceed total pages
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedQuestions = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return displayedQuestions.slice(start, start + pageSize)
  }, [displayedQuestions, currentPage, pageSize])

  const isMcqQuestion = (q: any) =>
    q.type === 0 || (q.type as any) === '0' || (q.type as any) === 'Mcq' || (q.type as any) === 'mcq'
  const isCqQuestion = (q: any) =>
    q.type === 1 || (q.type as any) === '1' || (q.type as any) === 'Cq' || (q.type as any) === 'cq'
  const isDraftMcq = (draft?: any) =>
    draft?.type === 0 || (draft?.type as any) === '0' || (draft?.type as any) === 'Mcq' || (draft?.type as any) === 'mcq'
  const isDraftCq = (draft?: any) =>
    draft?.type === 1 || (draft?.type as any) === '1' || (draft?.type as any) === 'Cq' || (draft?.type as any) === 'cq'

  const handleDeleteQuestion = async () => {
    if (!questionToDelete) return
    const targetBankId = questionToDelete.bankId || (searchBankId !== 'all' ? searchBankId : selectedBankId)
    if (!targetBankId) {
      toast.error('টার্গেট ব্যাংক পাওয়া যায়নি')
      return
    }
    setIsDeletingQuestion(true)
    try {
      await apiClient.delete(`/api/v1/question-banks/${targetBankId}/questions/${questionToDelete.id}`)
      toast.success('প্রশ্নটি ব্যাংক থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে!')
      setQuestionToDelete(null)
      executeQuestionSearch()
      refetchImports()
    } catch {
      toast.error('প্রশ্নটি মুছতে সমস্যা হয়েছে')
    } finally {
      setIsDeletingQuestion(false)
    }
  }

  const searchBankOptions = React.useMemo(
    () => [
      { value: 'all', label: 'সকল ব্যাংক (সব কাস্টম ব্যাংক)' },
      ...banks.map((b) => ({
        value: b.id,
        label: b.name,
        description: b.sharing === 0 ? 'ব্যক্তিগত ব্যাংক' : 'প্রাতিষ্ঠানিক ব্যাংক',
      })),
    ],
    [banks]
  )




  const handleOpenEditRow = (row: ImportRowDto) => {
    setEditingRow(row)
    setEditStem(row.draft?.stem || row.draft?.stimulus || '')
    const isRowMcq =
      row.draft?.type === 0 ||
      (row.draft?.type as any) === 'Mcq' ||
      (row.draft?.type as any) === '0'

    if (isRowMcq) {
      const opts = row.draft?.options || []
      setEditOptionA(cleanOptionText(opts[0] || ''))
      setEditOptionB(cleanOptionText(opts[1] || ''))
      setEditOptionC(cleanOptionText(opts[2] || ''))
      setEditOptionD(cleanOptionText(opts[3] || ''))
      setEditCorrectRaw(row.draft?.correctRaw || 'ক')
      setEditExplanation(row.draft?.explanation || '')
    } else {
      const parts = row.draft?.cqParts || []
      setEditCqPartA(parts[0]?.prompt || '')
      setEditCqPartB(parts[1]?.prompt || '')
      setEditCqPartC(parts[2]?.prompt || '')
      setEditCqPartD(parts[3]?.prompt || '')
      setEditExplanation(row.draft?.explanation || '')
    }
    setEditExcluded(row.status === 4)
  }

  const handleToggleExclude = async (row: ImportRowDto) => {
    if (!previewJob) return
    const willExclude = row.status !== 4
    setTogglingRowId(row.id)
    try {
      const res = await apiClient.patch<{
        row: ImportRowDto
        totals: any
        affectedRowIds: string[]
      }>(`/api/v1/imports/${previewJob.id}/rows/${row.id}`, {
        excluded: willExclude,
      })

      const updatedRow = res.data.row
      const updatedTotals = res.data.totals

      setPreviewRows((prev) =>
        prev.map((r) => (r.id === updatedRow.id ? updatedRow : r))
      )
      setPreviewJob((prev) => (prev ? { ...prev, totals: updatedTotals } : null))
      refetchImports()

      if (willExclude) {
        toast.info(`সারি ${toBnDigits(row.rowNo)} ইমপোর্ট থেকে বাদ দেওয়া হয়েছে`)
      } else {
        toast.success(`সারি ${toBnDigits(row.rowNo)} পুনরায় অন্তর্ভুক্ত করা হয়েছে`)
      }
    } catch {
      toast.error('অবস্থা পরিবর্তন করতে সমস্যা হয়েছে')
    } finally {
      setTogglingRowId(null)
    }
  }

  const handleSaveEditRow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!previewJob || !editingRow) return

    if (!editStem.trim()) {
      toast.error('প্রশ্নের শিরোনাম / মূলভাব লিখুন')
      return
    }

    setIsSavingRow(true)
    try {
      const isMcq = editingRow.draft?.type === 0 ||
        (editingRow.draft?.type as any) === 'Mcq' ||
        (editingRow.draft?.type as any) === '0'
      const updatedDraft: any = {
        ...editingRow.draft,
        stem: editStem.trim(),
        explanation: editExplanation.trim() || undefined,
      }

      if (isMcq) {
        if (!editOptionA.trim() || !editOptionB.trim() || !editOptionC.trim() || !editOptionD.trim()) {
          toast.error('ক, খ, গ, ঘ চারটি অপশনই পূরণ করুন')
          setIsSavingRow(false)
          return
        }
        updatedDraft.options = [
          editOptionA.trim(),
          editOptionB.trim(),
          editOptionC.trim(),
          editOptionD.trim(),
        ]
        const letterMap: Record<string, number> = { 'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3, 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 }
        const cIdx = typeof editCorrectRaw === 'string' && editCorrectRaw in letterMap ? letterMap[editCorrectRaw] : 0
        updatedDraft.correctRaw = editCorrectRaw
        updatedDraft.correctIndex = cIdx
        updatedDraft.cqParts = []
      } else {
        if (!editCqPartA.trim() || !editCqPartB.trim() || !editCqPartC.trim() || !editCqPartD.trim()) {
          toast.error('সৃজনশীল প্রশ্নের ক, খ, গ, ঘ চারটি অংশই লিখুন')
          setIsSavingRow(false)
          return
        }
        updatedDraft.stimulus = editStem.trim()
        updatedDraft.options = []
        updatedDraft.correctRaw = undefined
        updatedDraft.correctIndex = null
        updatedDraft.cqParts = [
          { prompt: editCqPartA.trim(), marks: 1 },
          { prompt: editCqPartB.trim(), marks: 2 },
          { prompt: editCqPartC.trim(), marks: 3 },
          { prompt: editCqPartD.trim(), marks: 4 },
        ]
      }

      const res = await apiClient.patch<{
        row: ImportRowDto
        totals: any
        affectedRowIds: string[]
      }>(`/api/v1/imports/${previewJob.id}/rows/${editingRow.id}`, {
        draft: updatedDraft,
        excluded: editExcluded,
      })

      const updatedRow = res.data.row
      const updatedTotals = res.data.totals

      setPreviewRows((prev) =>
        prev.map((r) => (r.id === updatedRow.id ? updatedRow : r))
      )
      setPreviewJob((prev) => (prev ? { ...prev, totals: updatedTotals } : null))
      refetchImports()

      if (updatedRow.status === 0) {
        toast.success('প্রশ্নটি সফলভাবে সংশোধিত ও সঠিক হিসেবে চিহ্নিত হয়েছে!')
      } else if (updatedRow.status === 4) {
        toast.info('প্রশ্নটি ইমপোর্ট তালিকা থেকে বাদ দেওয়া হয়েছে।')
      } else if (updatedRow.status === 1) {
        toast.warning('প্রশ্নটি সংরক্ষিত হয়েছে, তবে কিছু সতর্কতা রয়েছে।')
      } else if (updatedRow.status === 2) {
        toast.error('প্রশ্নটি সংরক্ষিত হয়েছে, তবে এখনও কিছু ত্রুটি রয়ে গেছে।')
      } else {
        toast.success('প্রশ্নটি সফলভাবে সংরক্ষিত হয়েছে!')
      }

      setEditingRow(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.title || 'প্রশ্ন হালনাগাদ করতে সমস্যা হয়েছে')
    } finally {
      setIsSavingRow(false)
    }
  }

  const handleCommitJob = async () => {
    if (!previewJob) return
    setIsCommitting(true)
    try {
      await apiClient.post(`/api/v1/imports/${previewJob.id}/commit`, {})
      const targetBank = previewJob.bankId || selectedBankId
      toast.success('প্রশ্নসমূহ সফলভাবে ব্যাংকে সংরক্ষিত হয়েছে!', {
        action: targetBank
          ? {
              label: 'ব্যাংকে দেখুন',
              onClick: () => {
                window.location.href = `/question-bank?bankId=${targetBank}`
              },
            }
          : undefined,
      })
      setPreviewJob(null)
      refetchImports()
      executeQuestionSearch()
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
      executeQuestionSearch()
    } catch {
      toast.error('রোলব্যাক করতে সমস্যা হয়েছে')
    } finally {
      setIsRollingBack(false)
    }
  }

  const statusBadge = (status: any) => {
    switch (status) {
      case 0:
      case 'Uploaded':
      case 'uploaded':
        return <Badge variant="secondary">আপলোডকৃত</Badge>
      case 1:
      case 'Parsing':
      case 'parsing':
        return <Badge variant="info">বিশ্লেষণ হচ্ছে...</Badge>
      case 2:
      case 'NeedsMapping':
      case 'needsMapping':
        return <Badge variant="warning">কলাম ম্যাপিং প্রয়োজন</Badge>
      case 3:
      case 'Preview':
      case 'preview':
        return <Badge variant="info" className="bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">প্রাকদর্শন প্রস্তুত (কমিট বাকি)</Badge>
      case 4:
      case 'Committing':
      case 'committing':
        return <Badge variant="info">কমিট হচ্ছে...</Badge>
      case 5:
      case 'Completed':
      case 'completed':
        return <Badge variant="success">সফলভাবে সম্পন্ন</Badge>
      case 6:
      case 'Failed':
      case 'failed':
        return <Badge variant="destructive">ব্যর্থ</Badge>
      case 7:
      case 'RolledBack':
      case 'rolledBack':
        return <Badge variant="destructive">রোলব্যাককৃত</Badge>
      default:
        return <Badge variant="secondary">প্রসেসিং</Badge>
    }
  }

  const rowStatusBadge = (status: any) => {
    switch (status) {
      case 0:
      case 'Ok':
      case 'ok':
        return <Badge variant="success" className="text-[10px]">সঠিক</Badge>
      case 1:
      case 'Warning':
      case 'warning':
        return <Badge variant="warning" className="text-[10px]">সতর্কতা</Badge>
      case 2:
      case 'Error':
      case 'error':
        return <Badge variant="destructive" className="text-[10px]">ত্রুটি</Badge>
      case 3:
      case 'Duplicate':
      case 'duplicate':
        return <Badge variant="warning" className="text-[10px] bg-amber-500 text-white">ডুপ্লিকেট</Badge>
      case 4:
      case 'Excluded':
      case 'excluded':
        return <Badge variant="secondary" className="text-[10px] line-through opacity-70">বাদ দেওয়া হয়েছে</Badge>
      case 5:
      case 'Imported':
      case 'imported':
        return <Badge variant="info" className="text-[10px]">সংরক্ষিত</Badge>
      default:
        return <Badge variant="secondary" className="text-[10px]">অজ্ঞাত</Badge>
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

      <Tabs value={rootTab} onValueChange={setRootTab} className="space-y-4">
        <TabsList className="bg-muted/60 p-1 w-full sm:w-auto grid grid-cols-3">
          <TabsTrigger value="upload" className="text-xs gap-1.5">
            <UploadCloud className="size-3.5" />
            নতুন ইমপোর্ট
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1.5">
            <Clock className="size-3.5" />
            ইমপোর্ট ইতিহাস ({toBnDigits(importJobs.length)})
          </TabsTrigger>
          <TabsTrigger value="questions" className="text-xs gap-1.5">
            <Search className="size-3.5" />
            আমদানিকৃত প্রশ্ন ও অনুসন্ধান
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-primary border-primary/30"
                          onClick={() => {
                            if (questionType === 0) {
                              setFormTitle('কোনো বস্তুর ভরবেগ দ্বিগুণ করা হলে গতিশক্তি কত গুণ হবে?')
                              setFormOptionA('২ গুণ')
                              setFormOptionB('৪ গুণ')
                              setFormOptionC('৮ গুণ')
                              setFormOptionD('অপরিবর্তিত')
                              setFormCorrectOption('খ')
                              setFormExplanation('E = p^2 / 2m সূত্রে p দ্বিগুণ হলে গতিশক্তি ৪ গুণ হয়।')
                            } else {
                              setFormTitle('২ কেজি ভরের একটি স্থির বস্তুর উপর ১০ নিউটন বল ৫ সেকেন্ড প্রযুক্ত হলো।')
                              setCqPartA('ত্বরণ কাকে বলে?')
                              setCqPartB('সুষম বেগ ও গড় বেগের পার্থক্য লেখো।')
                              setCqPartC('বস্তুটির ত্বরণ নির্ণয় করো।')
                              setCqPartD('৫ সেকেন্ডে বস্তুটি কত দূরত্ব অতিক্রম করবে? গাণিতিক বিশ্লেষণ করো।')
                            }
                            toast.info('নমুনা তথ্য ফর্মে লোড করা হয়েছে!')
                          }}
                        >
                          নমুনা তথ্য লোড
                        </Button>
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
                        {editingStagedId ? (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="default"
                              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={handleStageQuestion}
                            >
                              <Check className="size-3.5" />
                              হালনাগাদ সম্পন্ন করুন (✓)
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={handleCancelEditStaged}
                            >
                              সম্পাদনা বাতিল
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={handleStageQuestion}
                          >
                            <Plus className="size-3.5" />
                            তালিকায় যোগ করুন (+)
                          </Button>
                        )}

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
                            onClick={() => {
                              if (editingStagedId) handleCancelEditStaged()
                              setStagedQuestions([])
                            }}
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
                              className={`p-3 rounded-lg border text-xs space-y-1.5 transition-all ${
                                editingStagedId === q.id
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs'
                                  : 'border-border bg-card'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-foreground line-clamp-1">
                                  {toBnDigits(qIdx + 1)}. {q.title}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleEditStaged(q)}
                                    className="text-muted-foreground hover:text-primary p-1 rounded hover:bg-muted/80 transition-colors"
                                    title="সম্পাদনা করুন"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editingStagedId === q.id) handleCancelEditStaged()
                                      setStagedQuestions((prev) => prev.filter((item) => item.id !== q.id))
                                    }}
                                    className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                                    title="মুছে ফেলুন"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
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
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base font-semibold">২. বাল্ক প্রশ্ন টেক্সট পেস্ট করুন</CardTitle>
                            <CardDescription className="text-xs leading-relaxed">
                              Word বা PDF থেকে একাধিক প্রশ্ন ক্রমিক নম্বর, অপশন এবং &quot;উত্তর: গ&quot; লাইনসহ পেস্ট করুন
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 text-primary border-primary/30"
                              onClick={() => {
                                setQuestionType(0)
                                setPasteContent(`১. কোনো বস্তুর ভরবেগ দ্বিগুণ করা হলে গতিশক্তি কত গুণ হবে?
ক) ২ গুণ
খ) ৪ গুণ
গ) ৮ গুণ
ঘ) অপরিবর্তিত
উত্তর: খ
ব্যাখ্যা: E = p^2 / 2m সূত্রে ভরবেগ দ্বিগুণ হলে গতিশক্তি ৪ গুণ হয়।

২. নিচের কোনটি ভেক্টর রাশি?
ক) দ্রুতি
খ) তাপমাত্রা
গ) বল
ঘ) সময়
উত্তর: গ
ব্যাখ্যা: বলের মান ও দিক উভয়ই আছে।

৩. এসআই পদ্ধতিতে তাপমাত্রার একক কোনটি?
ক) সেলসিয়াস
খ) কেলভিন
গ) ফারেনহাইট
ঘ) ক্যালোরি
উত্তর: খ`)
                                toast.info('নমুনা MCQ প্রশ্ন টেক্সট পেস্ট বক্সে লোড করা হয়েছে!')
                              }}
                            >
                              নমুনা MCQ লোড
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 text-indigo-600 border-indigo-300 dark:text-indigo-400"
                              onClick={() => {
                                setQuestionType(1)
                                setPasteContent(`সৃজনশীল ১.
উদ্দীপক: ২ কেজি ভরের একটি স্থির বস্তুর উপর ১০ নিউটন বল ৫ সেকেন্ড যাবত প্রযুক্ত হলো। এরপর বল অপসারণ করা হলো।
ক. ত্বরণ কাকে বলে? [১]
খ. সুষম বেগ ও গড় বেগের পার্থক্য লেখো। [২]
গ. প্রযুক্ত বলের কারণে বস্তুটির ত্বরণ নির্ণয় করো। [৩]
ঘ. ৫ সেকেন্ড পর বস্তুটির গতিশক্তি কত হবে? গাণিতিক বিশ্লেষণ করো। [৪]`)
                                toast.info('নমুনা সৃজনশীল (CQ) প্রশ্ন পেস্ট বক্সে লোড করা হয়েছে!')
                              }}
                            >
                              নমুনা CQ লোড
                            </Button>
                          </div>
                        </div>
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-border">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-foreground">ইমপোর্ট ব্যাচ তালিকা</h3>
                <p className="text-xs text-muted-foreground">পূর্ববর্তী সকল আমদানি কার্যক্রম ও অবস্থা</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="ফাইল বা ব্যাংকের নাম দিয়ে খুঁজুন..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <CardContent className="p-0">
              {importsLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : filteredImportJobs.length > 0 ? (
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
                      {filteredImportJobs.map((job) => (
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
                              {String(job.status) === '3' || String(job.status) === 'Preview' || (job.status as any) === 3 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 gap-1 font-semibold"
                                  onClick={() => handleOpenPreview(job)}
                                >
                                  <Eye className="size-3" />
                                  প্রাকদর্শন ও কমিট করুন
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1 hover:border-primary hover:text-primary"
                                  onClick={() => handleOpenPreview(job)}
                                >
                                  <Eye className="size-3" />
                                  আমদানিকৃত প্রশ্ন দেখুন
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
                    title={historySearch ? 'কোনো ইমপোর্ট ব্যাচ পাওয়া যায়নি' : 'এখনও কোনো ইমপোর্ট করা হয়নি'}
                    description={
                      historySearch
                        ? 'আপনার অনুসন্ধান করা নামের সাথে কোনো ইমপোর্ট ব্যাচ মেলেনি।'
                        : 'ফর্ম থেকে পৃথক ফিল্ডে প্রশ্ন ইনপুট, Excel ফাইল আপলোড বা সরাসরি টেক্সট পেস্ট করে দ্রুত প্রশ্ন যোগ করুন।'
                    }
                    action={
                      historySearch ? (
                        <Button variant="outline" size="sm" onClick={() => setHistorySearch('')}>
                          অনুসন্ধান মুছুন
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: My Imported Questions — Simple View */}
        <TabsContent value="questions" className="space-y-4">
          {/* Pending Uncommitted Preview Jobs Banner */}
          {previewJobsList.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  আপনার <strong>{toBnDigits(previewJobsList.length)}</strong>টি ইমপোর্ট খসড়া/প্রাকদর্শন অবস্থায় রয়েছে যা এখনো ব্যাংকে কমিট করা হয়নি।
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 font-semibold shrink-0"
                onClick={() => handleOpenPreview(previewJobsList[0])}
              >
                প্রাকদর্শন ও ব্যাংকে কমিট করুন
              </Button>
            </div>
          )}

          {/* Simple Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="প্রশ্ন খুঁজুন..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-9 text-sm"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Bank Filter */}
            <div className="w-full sm:w-56">
              <Combobox
                options={searchBankOptions}
                value={searchBankId}
                onChange={setSearchBankId}
                placeholder="সকল ব্যাংক"
                searchPlaceholder="ব্যাংক খুঁজুন..."
                loading={banksLoading}
              />
            </div>

            {/* Type Toggle */}
            <div className="flex items-center gap-1">
              {[
                { id: 'All' as const, label: 'সব' },
                { id: 'Mcq' as const, label: 'MCQ' },
                { id: 'Cq' as const, label: 'CQ' },
              ].map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  variant={searchType === t.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 text-xs px-3"
                  onClick={() => setSearchType(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            {/* Refresh */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-1.5"
              onClick={executeQuestionSearch}
              disabled={isSearchingQuestions}
            >
              <RotateCcw className={`size-3.5 ${isSearchingQuestions ? 'animate-spin' : ''}`} />
              রিফ্রেশ
            </Button>

            {/* Create New Question Button */}
            <Button
              type="button"
              size="sm"
              className="h-9 px-3.5 gap-1.5 font-semibold bg-primary text-primary-foreground shadow-xs shrink-0"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="size-4" />
              নতুন প্রশ্ন
            </Button>
          </div>

          {/* Question Count & Pagination Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
            <div>
              {totalQuestions > 0 ? (
                <span>
                  মোট <strong>{toBnDigits(totalQuestions)}</strong> টি প্রশ্ন পাওয়া গেছে (প্রদর্শিত:{' '}
                  <strong>{toBnDigits((currentPage - 1) * pageSize + 1)}</strong> -{' '}
                  <strong>{toBnDigits(Math.min(currentPage * pageSize, totalQuestions))}</strong>)
                </span>
              ) : (
                <span>কোনো প্রশ্ন নেই</span>
              )}
            </div>
            {totalQuestions > pageSize && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-[11px]">প্রতি পৃষ্ঠায়:</span>
                {[10, 20, 50].map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant={pageSize === size ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setPageSize(size)
                      setCurrentPage(1)
                    }}
                  >
                    {toBnDigits(size)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Questions List */}
          {isSearchingQuestions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-lg border border-border bg-card animate-pulse" />
              ))}
            </div>
          ) : totalQuestions > 0 ? (
            <div className="space-y-3">
              {paginatedQuestions.map((q, idx) => {
                const globalIndex = (currentPage - 1) * pageSize + idx + 1
                const isMcq = isMcqQuestion(q)
                const isCq = isCqQuestion(q)

                return (
                  <Card key={q.id} className="border-border hover:border-border/80 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      {/* Top row: index, type badge, actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex size-6 items-center justify-center rounded bg-muted font-bold text-xs text-foreground">
                            {toBnDigits(globalIndex)}
                          </span>
                          <Badge variant={isMcq ? 'secondary' : 'outline'} className="text-[11px]">
                            {isMcq ? 'MCQ' : 'সৃজনশীল (CQ)'}
                          </Badge>
                          {q.bankName && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {q.bankName}
                            </Badge>
                          )}
                          {q.chapterName && (
                            <span className="text-[10px] text-muted-foreground">
                              অধ্যায় {toBnDigits(q.chapterNumber)}: {q.chapterName}
                            </span>
                          )}
                        </div>

                        {/* Edit & Delete Buttons — always visible */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs gap-1.5 font-medium border-primary/30 hover:border-primary text-foreground hover:text-primary"
                            onClick={() => {
                              isEditingBankQuestionRef.current = true
                              setEditingBankQuestion(q)
                            }}
                          >
                            <Pencil className="size-3.5 text-primary" />
                            সম্পাদনা ও আপডেট
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive gap-1.5"
                            onClick={() => setQuestionToDelete(q)}
                          >
                            <Trash2 className="size-3.5" />
                            মুছুন
                          </Button>
                        </div>
                      </div>

                      {/* Question Stimulus */}
                      {q.stimulus && (
                        <div className="p-2.5 rounded bg-muted/50 border border-border/60 text-xs">
                          <span className="font-semibold text-primary text-[11px]">উদ্দীপক: </span>
                          <RichText content={q.stimulus} className="text-xs inline" />
                        </div>
                      )}

                      {/* Question Stem */}
                      <div className="text-sm text-foreground leading-relaxed">
                        <RichText content={q.stem} className="text-sm" />
                      </div>

                      {/* MCQ Options */}
                      {isMcq && q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {q.options.map((opt, optIdx) => (
                            <div
                              key={optIdx}
                              className={cn(
                                'flex items-center gap-2 px-2.5 py-1.5 rounded text-xs border',
                                opt.isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300'
                                  : 'bg-background border-border text-muted-foreground'
                              )}
                            >
                              <span className="font-bold">{OPTION_LABELS[optIdx]}.</span>
                              <RichText content={opt.content} className="text-xs inline" />
                              {opt.isCorrect && (
                                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 ml-auto shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* CQ Parts */}
                      {isCq && q.cqParts && q.cqParts.length > 0 && (
                        <div className="space-y-1.5">
                          {q.cqParts.map((part, partIdx) => (
                            <div
                              key={partIdx}
                              className="flex items-start gap-2 text-xs bg-muted/30 px-2.5 py-1.5 rounded border border-border/40"
                            >
                              <span className="font-semibold text-primary">{OPTION_LABELS[partIdx]}.</span>
                              <div className="flex-1">
                                <RichText content={part.prompt} className="text-xs inline" />
                              </div>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                                {toBnDigits(part.marks)} নম্বর
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {/* Pagination Navigation Bar */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border mt-4">
                  <div className="text-xs text-muted-foreground">
                    পৃষ্ঠা <strong>{toBnDigits(currentPage)}</strong> / <strong>{toBnDigits(totalPages)}</strong>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* First Page */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      title="প্রথম পৃষ্ঠা"
                    >
                      <ChevronsLeft className="size-4" />
                    </Button>

                    {/* Previous Page */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      title="পূর্ববর্তী পৃষ্ঠা"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>

                    {/* Page Numbers */}
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1
                      // Show current, first, last, and up to 2 around current
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      ) {
                        return (
                          <Button
                            key={pageNum}
                            type="button"
                            variant={currentPage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 min-w-8 px-2 text-xs"
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {toBnDigits(pageNum)}
                          </Button>
                        )
                      }
                      if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                        return (
                          <span key={pageNum} className="text-xs text-muted-foreground px-1">
                            ...
                          </span>
                        )
                      }
                      return null
                    })}

                    {/* Next Page */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      title="পরবর্তী পৃষ্ঠা"
                    >
                      <ChevronRight className="size-4" />
                    </Button>

                    {/* Last Page */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      title="শেষ পৃষ্ঠা"
                    >
                      <ChevronsRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="কোনো প্রশ্ন পাওয়া যায়নি"
              description={
                searchKeyword || searchBankId !== 'all' || searchType !== 'All'
                  ? 'ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।'
                  : 'আপনার ব্যাংকে এখনও কোনো প্রশ্ন নেই। উপরের ট্যাব থেকে প্রশ্ন ইমপোর্ট করুন।'
              }
              action={
                searchKeyword || searchBankId !== 'all' || searchType !== 'All' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchKeyword('')
                      setSearchBankId('all')
                      setSearchType('All')
                    }}
                  >
                    ফিল্টার মুছুন
                  </Button>
                ) : undefined
              }
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Preview & Commit Dialog */}
      <Dialog
        open={Boolean(previewJob) && !editingBankQuestion}
        onOpenChange={(open) => {
          if (!open) {
            if (!isEditingBankQuestionRef.current) {
              setPreviewJob(null)
              setEditingRow(null)
            }
          }
        }}
      >
        <DialogContent className="max-w-4xl w-[96vw] h-[92vh] max-h-[95vh] sm:h-[90vh] sm:max-h-[92vh] flex flex-col p-0 overflow-hidden shadow-2xl">
          {editingRow ? (
            /* Mode B: Edit Selected Row */
            <>
              <DialogHeader className="shrink-0 p-4 sm:px-6 sm:py-3.5 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <DialogTitle className="flex items-center gap-2 text-base font-bold text-primary">
                      <Pencil className="size-4.5" />
                      সারি {toBnDigits(editingRow.rowNo)}: প্রশ্ন সম্পাদনা ও সংশোধন
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      প্রশ্নের মূলভাব, অপশন ও সঠিক উত্তর সংশোধন করুন। সংরক্ষণের সাথে সাথে স্বয়ংক্রিয়ভাবে পুনঃযাচাই হবে।
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pr-8">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                      onClick={() => setEditingRow(null)}
                    >
                      <ArrowLeft className="size-3.5" />
                      প্রাকদর্শনে ফিরুন
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
                {/* Warning / Error notice */}
                {editingRow.messages && editingRow.messages.length > 0 && (
                  <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 text-xs space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="size-4 text-rose-600 shrink-0" />
                      চিহ্নিত সমস্যা / ত্রুটি:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
                      {editingRow.messages.map((m, mIdx) => (
                        <li key={mIdx}>{m.messageBn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Stem / Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="editStem" className="text-xs font-semibold text-foreground">
                    প্রশ্নের শিরোনাম / উদ্দীপক (Title / Stem) *
                  </Label>
                  <textarea
                    id="editStem"
                    rows={3}
                    value={editStem}
                    onChange={(e) => setEditStem(e.target.value)}
                    placeholder="প্রশ্নের মূলভাব বা উদ্দীপক লিখুন..."
                    className="w-full rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
                  />
                </div>

                {/* MCQ Options */}
                {(editingRow.draft?.type === 0 ||
                  (editingRow.draft?.type as any) === 'Mcq' ||
                  (editingRow.draft?.type as any) === '0') ? (
                  <div className="space-y-3 pt-1">
                    <Label className="text-xs font-semibold text-foreground block">
                      অপশনসমূহ (Separate Options) *
                    </Label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Option ক */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="editOptA" className="text-[11px] text-muted-foreground font-medium">
                            অপশন (ক)
                          </Label>
                          {editCorrectRaw === 'ক' && (
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
                            id="editOptA"
                            value={editOptionA}
                            onChange={(e) => setEditOptionA(e.target.value)}
                            placeholder="অপশন ক..."
                            className="rounded-l-none text-xs"
                          />
                        </div>
                      </div>

                      {/* Option খ */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="editOptB" className="text-[11px] text-muted-foreground font-medium">
                            অপশন (খ)
                          </Label>
                          {editCorrectRaw === 'খ' && (
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
                            id="editOptB"
                            value={editOptionB}
                            onChange={(e) => setEditOptionB(e.target.value)}
                            placeholder="অপশন খ..."
                            className="rounded-l-none text-xs"
                          />
                        </div>
                      </div>

                      {/* Option গ */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="editOptC" className="text-[11px] text-muted-foreground font-medium">
                            অপশন (গ)
                          </Label>
                          {editCorrectRaw === 'গ' && (
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
                            id="editOptC"
                            value={editOptionC}
                            onChange={(e) => setEditOptionC(e.target.value)}
                            placeholder="অপশন গ..."
                            className="rounded-l-none text-xs"
                          />
                        </div>
                      </div>

                      {/* Option ঘ */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="editOptD" className="text-[11px] text-muted-foreground font-medium">
                            অপশন (ঘ)
                          </Label>
                          {editCorrectRaw === 'ঘ' && (
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
                            id="editOptD"
                            value={editOptionD}
                            onChange={(e) => setEditOptionD(e.target.value)}
                            placeholder="অপশন ঘ..."
                            className="rounded-l-none text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Correct Answer Selection */}
                    <div className="pt-2 space-y-1.5">
                      <Label className="text-xs font-medium text-foreground">
                        সঠিক উত্তর নির্বাচন করুন *
                      </Label>
                      <div className="flex gap-2">
                        {(['ক', 'খ', 'গ', 'ঘ'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setEditCorrectRaw(opt)}
                            className={`flex-1 py-2 rounded-md border text-xs font-bold transition-all ${
                              editCorrectRaw === opt
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                                : 'border-input bg-background hover:bg-muted/60 text-muted-foreground'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* CQ Parts */
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
                          value={editCqPartA}
                          onChange={(e) => setEditCqPartA(e.target.value)}
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          খ. অনুধাবনমূলক (২ নম্বর) *
                        </Label>
                        <Input
                          placeholder="খ অংশের প্রশ্ন..."
                          value={editCqPartB}
                          onChange={(e) => setEditCqPartB(e.target.value)}
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          গ. প্রয়োগমূলক (৩ নম্বর) *
                        </Label>
                        <Input
                          placeholder="গ অংশের প্রশ্ন..."
                          value={editCqPartC}
                          onChange={(e) => setEditCqPartC(e.target.value)}
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          ঘ. উচ্চতর দক্ষতামূলক (৪ নম্বর) *
                        </Label>
                        <Input
                          placeholder="ঘ অংশের প্রশ্ন..."
                          value={editCqPartD}
                          onChange={(e) => setEditCqPartD(e.target.value)}
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Explanation */}
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="editExpl" className="text-xs font-medium text-muted-foreground">
                    উত্তরের ব্যাখ্যা (ঐচ্ছিক)
                  </Label>
                  <Input
                    id="editExpl"
                    value={editExplanation}
                    onChange={(e) => setEditExplanation(e.target.value)}
                    placeholder="উত্তরের ব্যাখ্যা লিখুন..."
                    className="text-xs"
                  />
                </div>

                {/* Exclude Toggle */}
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <input
                    type="checkbox"
                    id="editExcludeToggle"
                    checked={editExcluded}
                    onChange={(e) => setEditExcluded(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-gray-300 text-primary accent-primary focus:ring-primary cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="editExcludeToggle" className="text-xs font-semibold text-foreground cursor-pointer">
                      এই প্রশ্নটি ইমপোর্ট থেকে বাদ দিন (Exclude)
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      যদি কোনো প্রশ্ন ইমপোর্ট করতে না চান বা এর সমস্যা পরে দেখতে চান, তবে এটি বাদ দিয়ে বাকি প্রশ্নগুলো কমিট করতে পারেন।
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 p-3.5 sm:px-6 sm:py-3 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingRow(null)}
                  disabled={isSavingRow}
                  className="text-xs h-9 px-4"
                >
                  বাতিল
                </Button>
                <Button
                  type="button"
                  loading={isSavingRow}
                  loadingText="আপডেট হচ্ছে..."
                  onClick={handleSaveEditRow}
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm h-9 px-5 shadow-sm"
                >
                  <CheckCircle className="size-4" />
                  আপডেট ও সংরক্ষণ করুন
                </Button>
              </DialogFooter>
            </>
          ) : (
            /* Mode A: Preview List of Rows */
            <>
              <DialogHeader className="shrink-0 p-4 sm:px-6 sm:py-3.5 border-b border-border bg-muted/20">
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  {previewJob?.status === 5 ? (
                    <>
                      <Eye className="size-4.5 text-primary" />
                      আমদানিকৃত প্রশ্নের তালিকা ও পর্যালোচনা
                    </>
                  ) : (
                    <>
                      <CheckCircle className="size-4.5 text-emerald-600" />
                      ইমপোর্ট প্রাকদর্শন ও অনুমোদন
                    </>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {previewJob?.status === 5
                    ? 'এই ইমপোর্টের মাধ্যমে ব্যাংকে সংরক্ষিত প্রশ্নসমূহ পর্যালোচনা ও সরাসরি সম্পাদনা করুন'
                    : 'বিশ্লেষণকৃত প্রশ্নগুলো পর্যালোচনা করুন, প্রয়োজনমতো সম্পাদনা করুন এবং ব্যাংকে যুক্ত করতে অনুমোদন দিন'}
                </DialogDescription>
              </DialogHeader>

              {previewJob && (
                <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-border bg-muted/10 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      মোট সারি: <strong>{toBnDigits(previewJob.totals.total)}</strong>
                    </span>
                    <span className="text-emerald-600">
                      ত্রুটিমুক্ত/সংরক্ষিত: <strong>{toBnDigits(previewJob.totals.imported || previewJob.totals.ok)}</strong>
                    </span>
                    {previewJob.totals.warning > 0 && (
                      <span className="text-amber-600">
                        সতর্কতা: <strong>{toBnDigits(previewJob.totals.warning)}</strong>
                      </span>
                    )}
                    {previewJob.totals.error > 0 && (
                      <span className="text-rose-600">
                        ত্রুটি: <strong>{toBnDigits(previewJob.totals.error)}</strong>
                      </span>
                    )}
                    {previewJob.totals.excluded > 0 && (
                      <span className="text-muted-foreground line-through">
                        বাদ দেওয়া হয়েছে: <strong>{toBnDigits(previewJob.totals.excluded)}</strong>
                      </span>
                    )}
                  </div>

                  {/* Question Search & Status Filter in Dialog */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="প্রশ্ন, অপশন বা উত্তর লিখে খুঁজুন..."
                        value={previewSearchText}
                        onChange={(e) => setPreviewSearchText(e.target.value)}
                        className="pl-8 text-xs h-8"
                      />
                      {previewSearchText && (
                        <button
                          type="button"
                          onClick={() => setPreviewSearchText('')}
                          className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                      {[
                        { id: 'all', label: 'সকল', count: previewRows.length },
                        {
                          id: 'ok',
                          label: previewJob?.status === 5 ? 'সংরক্ষিত' : 'সঠিক',
                          count: previewRows.filter((r) => r.status === 0 || r.status === 5).length,
                        },
                        {
                          id: 'warning',
                          label: 'সতর্কতা',
                          count: previewRows.filter((r) => r.status === 1).length,
                        },
                        {
                          id: 'error',
                          label: 'ত্রুটি',
                          count: previewRows.filter((r) => r.status === 2).length,
                        },
                        {
                          id: 'excluded',
                          label: 'বাদ দেওয়া',
                          count: previewRows.filter((r) => r.status === 4).length,
                        },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setPreviewStatusFilter(f.id as any)}
                          className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                            previewStatusFilter === f.id
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {f.label} ({toBnDigits(f.count)})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-2.5">
                {isLoadingRows ? (
                  <div className="space-y-2 py-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 rounded bg-muted/60 animate-pulse" />
                    ))}
                  </div>
                ) : filteredPreviewRows.length > 0 ? (
                  filteredPreviewRows.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-lg border p-3 text-xs space-y-2 transition-all ${
                        row.status === 4
                          ? 'border-dashed border-border/80 bg-muted/20 opacity-70'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            সারি {toBnDigits(row.rowNo)}
                          </span>
                          {rowStatusBadge(row.status)}
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {row.draft?.type === 0 || (row.draft?.type as any) === 'Mcq' || (row.draft?.type as any) === '0' ? 'MCQ' : 'CQ'}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 px-2.5 hover:border-primary hover:text-primary"
                            disabled={isLoadingQuestionDetail}
                            onClick={() => {
                              if (row.status === 5 || row.createdQuestionId) {
                                handleEditImportedQuestion(row)
                              } else {
                                handleOpenEditRow(row)
                              }
                            }}
                          >
                            <Pencil className="size-3" />
                            সম্পাদনা
                          </Button>

                          {previewJob?.status === 3 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={togglingRowId === row.id}
                              className={`h-7 text-xs px-2 ${
                                row.status === 4
                                  ? 'text-primary hover:bg-primary/10'
                                  : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                              }`}
                              onClick={() => handleToggleExclude(row)}
                            >
                              {row.status === 4 ? 'অন্তর্ভুক্ত করুন' : 'বাদ দিন'}
                            </Button>
                          )}
                        </div>
                      </div>

                      <p className="font-medium text-foreground line-clamp-2">
                        {row.draft?.stem || row.draft?.stimulus}
                      </p>

                      {/* Options preview for MCQ */}
                      {isDraftMcq(row.draft) && row.draft.options && row.draft.options.length > 0 && (
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground pt-0.5">
                          {row.draft.options.slice(0, 4).map((opt, oIdx) => {
                            const letter = ['ক', 'খ', 'গ', 'ঘ'][oIdx]
                            const isCorrect =
                              row.draft?.correctRaw === letter || row.draft?.correctIndex === oIdx
                            return (
                              <span
                                key={oIdx}
                                className={`truncate ${
                                  isCorrect ? 'text-emerald-600 font-semibold' : ''
                                }`}
                              >
                                {letter}. {opt}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* CQ Parts preview */}
                      {isDraftCq(row.draft) && row.draft.cqParts && row.draft.cqParts.length > 0 && (
                        <div className="space-y-1 text-[11px] text-muted-foreground pt-0.5">
                          {row.draft.cqParts.map((p, pIdx) => (
                            <div key={pIdx} className="flex items-start gap-1">
                              <span className="font-semibold text-foreground">
                                {['ক', 'খ', 'গ', 'ঘ'][pIdx]}.
                              </span>
                              <span className="truncate flex-1">{p.prompt}</span>
                              {p.marks && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  [{toBnDigits(p.marks)}]
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {row.draft?.correctRaw && (
                        <p className="text-[11px] text-emerald-600 font-medium">
                          উত্তর: {row.draft.correctRaw}
                        </p>
                      )}

                      {row.draft?.explanation && (
                        <p className="text-[10px] text-muted-foreground/80 italic">
                          ব্যাখ্যা: {row.draft.explanation}
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
                  <div className="text-center text-xs text-muted-foreground py-8 space-y-2">
                    <p>এই অনুসন্ধানে কোনো সারি বা প্রশ্ন খুঁজে পাওয়া যায়নি।</p>
                    {(previewSearchText || previewStatusFilter !== 'all') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setPreviewSearchText('')
                          setPreviewStatusFilter('all')
                        }}
                      >
                        ফিল্টার মুছুন
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="shrink-0 p-3.5 sm:px-6 sm:py-3 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
                {previewJob?.status === 3 ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">
                      মোট <strong>{toBnDigits(filteredPreviewRows.length)}</strong> টি প্রশ্ন প্রদর্শিত
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPreviewJob(null)}
                    >
                      বন্ধ করুন
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
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

      {/* Question Upsert Modal for editing imported bank questions */}
      <QuestionUpsertModal
        isOpen={Boolean(editingBankQuestion)}
        question={editingBankQuestion}
        bankId={editingBankQuestion?.bankId || (searchBankId !== 'all' ? searchBankId : undefined) || selectedBankId || undefined}
        subjectId={editingBankQuestion?.subjectId}
        chapterId={editingBankQuestion?.chapterId}
        onClose={() => {
          isEditingBankQuestionRef.current = false
          setEditingBankQuestion(null)
        }}
        onSuccess={() => {
          isEditingBankQuestionRef.current = false
          setEditingBankQuestion(null)
          if (previewJob) {
            handleOpenPreview(previewJob)
          }
          executeQuestionSearch()
          refetchImports()
        }}
      />

      {/* Question Upsert Modal for creating a new question */}
      <QuestionUpsertModal
        isOpen={isCreateModalOpen}
        question={null}
        bankId={searchBankId !== 'all' ? searchBankId : selectedBankId || undefined}
        subjectId={searchSubjectId !== 'all' ? searchSubjectId : undefined}
        chapterId={searchChapterId !== 'all' ? searchChapterId : undefined}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false)
          executeQuestionSearch()
          refetchImports()
        }}
      />

      {/* Delete Question Confirmation */}
      <ConfirmDialog
        open={Boolean(questionToDelete)}
        onOpenChange={(open) => !open && setQuestionToDelete(null)}
        title="প্রশ্ন মুছে ফেলা নিশ্চিতকরণ"
        description="আপনি কি নিশ্চিত যে এই প্রশ্নটি ব্যাংক থেকে স্থায়ীভাবে মুছে ফেলতে চান?"
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="বাতিল"
        confirmVariant="destructive"
        loading={isDeletingQuestion}
        onConfirm={handleDeleteQuestion}
      />
    </div>
  )
}
