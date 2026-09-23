import * as React from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Timer,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RichText } from '@/components/shared/rich-text'
import { PageHeader } from '@/components/shared/page-header'
import { apiClient } from '@/lib/api-client'
import { OPTION_LABELS, toBnDigits } from '@/lib/bn'
import type { RenderedPaper } from '@/lib/api/model/renderedPaper'
import type { PaperBlock } from '@/lib/api/model/paperBlock'
import type { PaperQuestion } from '@/lib/api/model/paperQuestion'
import { cn } from '@/lib/utils'

interface QuestionSetSummary {
  id: string
  title: string
  subjectName?: string
  subjectLabel?: string
  levelName?: string
  type: number // 0 = MCQ, 1 = CQ
  itemCount: number
  targetCount: number
  durationMin: number
  fullMarks: number
  createdAt: string
}

type ThemeMode = 'chalkboard' | 'dark' | 'light'
type FontSizeLevel = 'normal' | 'large' | 'xl' | 'huge'

interface FlatQuestion extends PaperQuestion {
  stimulus?: string | null
  blockIndex: number
}

export function SmartboardPage() {
  const { setId: routeSetId } = useParams<{ setId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSetId = routeSetId || searchParams.get('setId')

  // Set Selection State
  const [sets, setSets] = React.useState<QuestionSetSummary[]>([])
  const [isLoadingSets, setIsLoadingSets] = React.useState<boolean>(false)
  const [searchQuery, setSearchQuery] = React.useState<string>('')
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'MCQ' | 'CQ'>('all')

  // Smartboard Presentation State
  const [paper, setPaper] = React.useState<RenderedPaper | null>(null)
  const [isLoadingPaper, setIsLoadingPaper] = React.useState<boolean>(false)
  const [currentIndex, setCurrentIndex] = React.useState<number>(0)
  const [showAnswer, setShowAnswer] = React.useState<boolean>(false)
  const [showExplanation, setShowExplanation] = React.useState<boolean>(false)
  const [theme, setTheme] = React.useState<ThemeMode>('chalkboard')
  const [fontSize, setFontSize] = React.useState<FontSizeLevel>('large')
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(false)
  const [isJumpOpen, setIsJumpOpen] = React.useState<boolean>(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = React.useState<boolean>(false)

  // Live Classroom Polling State: { [optionIndex: number]: count }
  const [pollVotes, setPollVotes] = React.useState<Record<number, number>>({})
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null)

  // Timer State
  const [timerSeconds, setTimerSeconds] = React.useState<number>(60)
  const [timerRemaining, setTimerRemaining] = React.useState<number>(60)
  const [isTimerRunning, setIsTimerRunning] = React.useState<boolean>(false)
  const [isTimerVisible, setIsTimerVisible] = React.useState<boolean>(true)

  const containerRef = React.useRef<HTMLDivElement>(null)

  // Fetch question sets for launcher
  const fetchSets = React.useCallback(async () => {
    setIsLoadingSets(true)
    try {
      const res = await apiClient.get('/api/v1/question-sets')
      const items: QuestionSetSummary[] = res.data?.items || res.data || []
      setSets(items)
    } catch {
      toast.error('প্রশ্নসেট তালিকা লোড করতে সমস্যা হয়েছে')
    } finally {
      setIsLoadingSets(false)
    }
  }, [])

  // Fetch active paper data
  const fetchPaper = React.useCallback(async (setId: string) => {
    setIsLoadingPaper(true)
    setShowAnswer(false)
    setShowExplanation(false)
    setSelectedOption(null)
    setPollVotes({})
    try {
      const res = await apiClient.get(`/api/v1/question-sets/${setId}/paper?variant=0`)
      setPaper(res.data)
      setCurrentIndex(0)
    } catch {
      toast.error('প্রশ্নসেট ডেটা লোড করতে ব্যর্থ হয়েছে')
      setPaper(null)
    } finally {
      setIsLoadingPaper(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSets()
  }, [fetchSets])

  React.useEffect(() => {
    if (activeSetId) {
      fetchPaper(activeSetId)
    } else {
      setPaper(null)
    }
  }, [activeSetId, fetchPaper])

  // Extract flattened list of questions with their stimulus
  const questions: FlatQuestion[] = React.useMemo(() => {
    if (!paper || !paper.blocks) return []
    const list: FlatQuestion[] = []
    paper.blocks.forEach((block: PaperBlock, bIdx: number) => {
      if (block.questions && block.questions.length > 0) {
        block.questions.forEach((q: PaperQuestion) => {
          list.push({
            ...q,
            stimulus: block.stimulus,
            blockIndex: bIdx,
          })
        })
      }
    })
    return list
  }, [paper])

  const currentQuestion = questions[currentIndex] || null
  const totalQuestions = questions.length

  // Timer Tick
  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (isTimerRunning && timerRemaining > 0) {
      interval = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isTimerRunning, timerRemaining])

  const handleStartTimer = (sec?: number) => {
    const s = sec ?? timerSeconds
    setTimerRemaining(s)
    setIsTimerRunning(true)
  }

  const handleResetTimer = () => {
    setIsTimerRunning(false)
    setTimerRemaining(timerSeconds)
  }

  // Question navigation
  const handleNext = React.useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1)
      setShowAnswer(false)
      setShowExplanation(false)
      setSelectedOption(null)
      setPollVotes({})
      handleResetTimer()
    }
  }, [currentIndex, totalQuestions, timerSeconds])

  const handlePrev = React.useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
      setShowAnswer(false)
      setShowExplanation(false)
      setSelectedOption(null)
      setPollVotes({})
      handleResetTimer()
    }
  }, [currentIndex, timerSeconds])

  const handleJumpTo = (index: number) => {
    setCurrentIndex(index)
    setShowAnswer(false)
    setShowExplanation(false)
    setSelectedOption(null)
    setPollVotes({})
    setIsJumpOpen(false)
    handleResetTimer()
  }

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {
        toast.info('ব্রাউজারে ফুলস্ক্রিন অ্যাক্টিভ করা সম্ভব হয়নি')
      })
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  React.useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Keyboard Shortcuts
  React.useEffect(() => {
    if (!activeSetId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when inside inputs
      if (['input', 'textarea', 'select'].includes((e.target as HTMLElement).tagName.toLowerCase())) {
        return
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setShowAnswer((prev) => !prev)
      } else if (e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setShowExplanation((prev) => !prev)
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        toggleFullscreen()
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        setIsTimerRunning((prev) => !prev)
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setIsJumpOpen(true)
      } else if (e.key === '?') {
        e.preventDefault()
        setIsShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSetId, handleNext, handlePrev])

  // Vote handler
  const handleVote = (optIdx: number, delta: number) => {
    setPollVotes((prev) => {
      const current = prev[optIdx] || 0
      const nextVal = Math.max(0, current + delta)
      return { ...prev, [optIdx]: nextVal }
    })
  }

  const totalVotes = Object.values(pollVotes).reduce((a, b) => a + b, 0)

  // Font Size CSS mappings
  const fontSizeClasses = {
    normal: {
      stem: 'text-xl sm:text-2xl',
      stimulus: 'text-base sm:text-lg',
      option: 'text-lg sm:text-xl',
      badge: 'text-base size-8',
    },
    large: {
      stem: 'text-2xl sm:text-3xl',
      stimulus: 'text-lg sm:text-xl',
      option: 'text-xl sm:text-2xl',
      badge: 'text-lg size-10',
    },
    xl: {
      stem: 'text-3xl sm:text-4xl',
      stimulus: 'text-xl sm:text-2xl',
      option: 'text-2xl sm:text-3xl',
      badge: 'text-xl size-12',
    },
    huge: {
      stem: 'text-4xl sm:text-5xl',
      stimulus: 'text-2xl sm:text-3xl',
      option: 'text-3xl sm:text-4xl',
      badge: 'text-2xl size-14',
    },
  }[fontSize]

  // Theme Styling
  const themeStyles = {
    chalkboard: {
      bg: 'bg-[#102319] text-[#f2ede4]',
      card: 'bg-[#163024]/90 border-[#27533f] text-[#f4efe8]',
      optionBg: 'bg-[#19382a] hover:bg-[#204735] border-[#295943]',
      optionSelected: 'bg-[#295943] border-[#4ade80]',
      optionCorrect: 'bg-emerald-900/90 border-emerald-400 text-emerald-100 shadow-lg shadow-emerald-500/20',
      headerBg: 'bg-[#0b1b13] border-[#1d4231]',
      footerBg: 'bg-[#0b1b13] border-[#1d4231]',
      textMuted: 'text-[#9cb7a8]',
      accentBadge: 'bg-[#214a37] text-emerald-300 border-[#2f684d]',
      stimulusBg: 'bg-[#0d1f16] border-[#295943]/80 text-[#e6f0eb]',
    },
    dark: {
      bg: 'bg-slate-950 text-slate-100',
      card: 'bg-slate-900/90 border-slate-800 text-slate-100',
      optionBg: 'bg-slate-900 hover:bg-slate-800/80 border-slate-800',
      optionSelected: 'bg-slate-800 border-primary',
      optionCorrect: 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-500/20',
      headerBg: 'bg-slate-950/90 border-slate-800/80',
      footerBg: 'bg-slate-950/90 border-slate-800/80',
      textMuted: 'text-slate-400',
      accentBadge: 'bg-slate-800 text-slate-300 border-slate-700',
      stimulusBg: 'bg-slate-900/60 border-slate-800 text-slate-200',
    },
    light: {
      bg: 'bg-slate-50 text-slate-900',
      card: 'bg-white border-slate-200 text-slate-900 shadow-sm',
      optionBg: 'bg-white hover:bg-slate-100 border-slate-200 shadow-xs',
      optionSelected: 'bg-slate-100 border-primary',
      optionCorrect: 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm',
      headerBg: 'bg-white/90 border-slate-200',
      footerBg: 'bg-white/90 border-slate-200',
      textMuted: 'text-slate-500',
      accentBadge: 'bg-slate-100 text-slate-700 border-slate-200',
      stimulusBg: 'bg-amber-50/50 border-amber-200 text-slate-800',
    },
  }[theme]

  // Filtered sets for launcher
  const filteredSets = sets.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.subjectName && s.subjectName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.levelName && s.levelName.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'MCQ' && s.type === 0) ||
      (typeFilter === 'CQ' && s.type === 1)

    return matchesSearch && matchesType
  })

  // ══════════════════════════════════════════════════════════════════════
  // VIEW 1: SET SELECTION LAUNCHER (When no setId is active)
  // ══════════════════════════════════════════════════════════════════════
  if (!activeSetId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="স্মার্টবোর্ড ও ক্লাসরুম প্রজেক্টর মোড"
          description="ডিজিটাল বোর্ড বা প্রজেক্টরে এক ক্লিকে একটি করে প্রশ্ন উপস্থাপন করুন, সঠিক উত্তর ও ব্যাখ্যা উন্মোচন করুন এবং লাইভ ক্লাস কুইজ পরিচালনা করুন।"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsShortcutsOpen(true)}
              className="text-xs gap-1.5"
            >
              <Sparkles className="size-3.5 text-primary" />
              কিবোর্ড শর্টকাট
            </Button>
          }
        />

        {/* Feature Hero Card */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10 p-6 sm:p-8 shadow-sm">
          <div className="max-w-3xl space-y-3">
            <Badge className="bg-primary/20 text-primary border-primary/30">
              ক্লাসরুম প্রেজেন্টার
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              প্রজেক্টরে ক্লাসের জন্য প্রস্তুত হোন
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              যেকোনো তৈরি করা প্রশ্নসেট সিলেক্ট করে সরাসরি ফুলস্ক্রিন প্রেজেন্টেশন মোডে চলে যান। ঐতিহ্যবাহী চকবোর্ড সবুজ ব্যাকগ্রাউন্ড, বড় বাংলা ফন্ট, লাইভ হ্যান্ড-রেজ ভোট ও কুইজ টাইমার সহ পুরো ক্লাসকে ইন্টারঅ্যাক্টিভ রাখুন।
            </p>
            <div className="flex flex-wrap gap-2 pt-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 font-medium text-foreground border border-border shadow-xs">
                📺 ফুলস্ক্রিন প্রজেক্টর মোড
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 font-medium text-foreground border border-border shadow-xs">
                🟩 চকবোর্ড গ্রিন ও ডার্ক থিম
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 font-medium text-foreground border border-border shadow-xs">
                ⏱️ ৩০-১২০ সেকেন্ড কুইজ টাইমার
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1 font-medium text-foreground border border-border shadow-xs">
                🙋 লাইভ হ্যান্ড-রেজ পোলিং
              </span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="প্রশ্নসেটের নাম বা বিষয় খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {/* Type tabs */}
            <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5 text-xs">
              {(['all', 'MCQ', 'CQ'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    'rounded px-3 py-1 font-medium transition-colors',
                    typeFilter === t
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t === 'all' ? 'সকল সেট' : t}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            মোট সেটের সংখ্যা:{' '}
            <strong className="text-foreground">{toBnDigits(filteredSets.length)}</strong> টি
          </div>
        </div>

        {/* Set Grid Cards */}
        {isLoadingSets ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 rounded-xl bg-muted/50 animate-pulse border border-border" />
            ))}
          </div>
        ) : filteredSets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSets.map((s) => (
              <Card
                key={s.id}
                className="border-border hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] font-bold uppercase',
                        s.type === 0
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      )}
                    >
                      {s.type === 0 ? 'MCQ প্রশ্ন' : 'CQ সৃজনশীল'}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {toBnDigits(s.itemCount)} টি প্রশ্ন
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {s.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.levelName} · {s.subjectLabel || s.subjectName}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/50">
                    <span>সময়: {toBnDigits(s.durationMin)} মি.</span>
                    <span>·</span>
                    <span>পূর্ণমান: {toBnDigits(s.fullMarks)}</span>
                  </div>
                </CardContent>

                <div className="p-4 pt-0 flex items-center gap-2">
                  <Button
                    className="flex-1 text-xs gap-1.5 font-bold shadow-sm"
                    onClick={() => setSearchParams({ setId: s.id })}
                  >
                    <MonitorPlay className="size-4" />
                    স্মার্টবোর্ডে উপস্থাপন করুন
                  </Button>
                  <Link to={`/sets/${s.id}`}>
                    <Button variant="outline" size="icon" className="size-8" title="প্রিন্ট প্রিভিউ">
                      <Printer className="size-3.5" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-2xl border-dashed border-border bg-muted/20 space-y-3">
            <MonitorPlay className="size-12 text-muted-foreground mx-auto stroke-1" />
            <p className="text-base font-semibold text-foreground">কোনো প্রশ্নসেট পাওয়া যায়নি</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              প্রজেক্টরে উপস্থাপন করতে প্রথমে ১-ক্লিকে অথবা ম্যানুয়ালি একটি প্রশ্নসেট তৈরি করুন।
            </p>
            <Link to="/generate">
              <Button size="sm" className="mt-2 text-xs gap-1.5">
                <Sparkles className="size-3.5" />
                নতুন প্রশ্নসেট তৈরি করুন
              </Button>
            </Link>
          </div>
        )}

        {/* Keyboard Shortcuts Dialog */}
        <Dialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                স্মার্টবোর্ড কিবোর্ড শর্টকাট
              </DialogTitle>
              <DialogDescription>
                ক্লাসরুম চলাকালে মাউস ছাড়াই কীবোর্ড দিয়ে পুরো সেশন নিয়ন্ত্রণ করুন:
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2.5 py-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">পরবর্তী প্রশ্ন (Next Question)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  → তীর / Space / PageDn
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">পূর্ববর্তী প্রশ্ন (Previous Question)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  ← তীর / PageUp
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">সঠিক উত্তর উন্মোচন (Toggle Answer)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  Space / Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">ব্যাখ্যা প্রদর্শন (Toggle Explanation)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  E কী (Key E)
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">ফুলস্ক্রিন টগল (Fullscreen)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  F কী / F11
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">টাইমার চালু / বন্ধ (Timer Toggle)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  T কী (Key T)
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60">
                <span className="font-medium">প্রশ্ন জাম্প ড্রয়ার (Jump to Question)</span>
                <kbd className="px-2 py-1 rounded bg-background border font-mono text-[11px] shadow-xs">
                  J কী (Key J)
                </kbd>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════
  // VIEW 2: FULL PRESENTER & SMARTBOARD CANVAS (When setId is active)
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col min-h-screen select-none font-sans transition-colors duration-300',
        themeStyles.bg,
        isFullscreen && 'fixed inset-0 z-50 p-0 m-0'
      )}
    >
      {/* ── Top Projector Header ── */}
      <header
        className={cn(
          'sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-3 border-b backdrop-blur-md transition-colors',
          themeStyles.headerBg
        )}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchParams({})}
            className={cn('text-xs gap-1.5 h-8', themeStyles.textMuted)}
            title="সেট তালিকা পৃষ্ঠায় ফিরে যান"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">সেট পরিবর্তন</span>
          </Button>

          <div className="h-4 w-px bg-current opacity-20 hidden sm:block" />

          {/* Paper Title & Progress */}
          <div>
            <h1 className="text-sm sm:text-base font-bold truncate max-w-xs sm:max-w-md">
              {paper?.header?.title || 'স্মার্টবোর্ড প্রেজেন্টার'}
            </h1>
            <p className={cn('text-[11px]', themeStyles.textMuted)}>
              {paper?.header?.levelName} · {paper?.header?.subjectName}
            </p>
          </div>
        </div>

        {/* Center Progress & Question Jump Chip */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsJumpOpen(true)}
            className={cn(
              'text-xs font-bold gap-1.5 h-8 rounded-full border px-3',
              themeStyles.accentBadge
            )}
          >
            <span>প্রশ্ন {toBnDigits(currentIndex + 1)} / {toBnDigits(totalQuestions)}</span>
          </Button>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Font Size Adjusters */}
          <div className="hidden sm:flex items-center rounded-lg border border-current/20 p-0.5">
            <button
              type="button"
              onClick={() => {
                const sizes: FontSizeLevel[] = ['normal', 'large', 'xl', 'huge']
                const cur = sizes.indexOf(fontSize)
                if (cur > 0) setFontSize(sizes[cur - 1])
              }}
              className="px-2 py-1 text-xs font-bold opacity-70 hover:opacity-100"
              title="ফন্ট সাইজ ছোট করুন"
            >
              A-
            </button>
            <span className="text-[10px] opacity-40">|</span>
            <button
              type="button"
              onClick={() => {
                const sizes: FontSizeLevel[] = ['normal', 'large', 'xl', 'huge']
                const cur = sizes.indexOf(fontSize)
                if (cur < sizes.length - 1) setFontSize(sizes[cur + 1])
              }}
              className="px-2 py-1 text-xs font-bold opacity-70 hover:opacity-100"
              title="ফন্ট সাইজ বড় করুন"
            >
              A+
            </button>
          </div>

          {/* Theme Mode Selector */}
          <div className="flex items-center rounded-lg border border-current/20 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTheme('chalkboard')}
              className={cn(
                'px-2 py-1 rounded text-xs transition-colors',
                theme === 'chalkboard' && 'bg-emerald-800 text-emerald-100 font-bold'
              )}
              title="চকবোর্ড মোড (সবুজ চকশীট)"
            >
              চকবোর্ড
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={cn(
                'px-2 py-1 rounded text-xs transition-colors',
                theme === 'dark' && 'bg-slate-800 text-slate-100 font-bold'
              )}
              title="ডার্ক মোড (কালো)"
            >
              গাঢ়
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={cn(
                'px-2 py-1 rounded text-xs transition-colors',
                theme === 'light' && 'bg-white text-slate-900 font-bold shadow-xs'
              )}
              title="লাইট মোড (সাদা)"
            >
              শুভ্র
            </button>
          </div>

          {/* Timer Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsTimerVisible((v) => !v)}
            className={cn('size-8 text-current/80 hover:text-current', isTimerVisible && 'bg-current/10')}
            title="টাইমার প্রদর্শন / লুকান"
          >
            <Timer className="size-4" />
          </Button>

          {/* Fullscreen Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="size-8 text-current/80 hover:text-current"
            title="ফুলস্ক্রিন প্রজেক্টর মোড (F)"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </header>

      {/* ── Sub Progress Bar ── */}
      <div className="w-full h-1.5 bg-current/10 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / Math.max(1, totalQuestions)) * 100}%` }}
        />
      </div>

      {/* ── Main Question Stage ── */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 max-w-5xl mx-auto w-full">
        {isLoadingPaper ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 animate-pulse">
            <RefreshCw className="size-8 animate-spin opacity-50" />
            <p className="text-sm font-medium opacity-70">প্রশ্নপত্র লোড হচ্ছে...</p>
          </div>
        ) : currentQuestion ? (
          <div className="w-full space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Top Meta & Board Tag */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold opacity-70">
                  প্রশ্ন নং {toBnDigits(currentQuestion.number || currentIndex + 1)}
                </span>
                {currentQuestion.boardTags && currentQuestion.boardTags.length > 0 && (
                  <Badge variant="outline" className={cn('text-[10px]', themeStyles.accentBadge)}>
                    {currentQuestion.boardTags.join('; ')}
                  </Badge>
                )}
              </div>

              {/* Floating Countdown Timer Widget */}
              {isTimerVisible && (
                <div className="flex items-center gap-2 bg-current/5 border border-current/20 rounded-full px-3 py-1 text-xs">
                  <Timer
                    className={cn(
                      'size-3.5',
                      timerRemaining <= 10 && isTimerRunning && 'text-red-400 animate-bounce'
                    )}
                  />
                  <span
                    className={cn(
                      'font-mono font-bold text-sm tracking-widest',
                      timerRemaining <= 10 && 'text-red-400 font-extrabold'
                    )}
                  >
                    {toBnDigits(Math.floor(timerRemaining / 60))}:
                    {toBnDigits((timerRemaining % 60).toString().padStart(2, '0'))}
                  </span>
                  <button
                    onClick={() => setIsTimerRunning((r) => !r)}
                    className="p-1 rounded-full hover:bg-current/10 transition-colors"
                    title={isTimerRunning ? 'বিরতি (Pause)' : 'শুরু (Start)'}
                  >
                    {isTimerRunning ? <Pause className="size-3" /> : <Play className="size-3" />}
                  </button>
                  <button
                    onClick={handleResetTimer}
                    className="p-1 rounded-full hover:bg-current/10 transition-colors"
                    title="রিসেট (Reset)"
                  >
                    <RotateCcw className="size-3" />
                  </button>
                  {/* Presets */}
                  <div className="hidden sm:flex items-center gap-1 border-l border-current/20 pl-2">
                    {[30, 60, 120].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => {
                          setTimerSeconds(sec)
                          handleStartTimer(sec)
                        }}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded hover:bg-current/10 opacity-70 hover:opacity-100"
                      >
                        {toBnDigits(sec)}s
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stimulus Box (উদ্দীপক) */}
            {currentQuestion.stimulus && (
              <div
                className={cn(
                  'rounded-xl p-5 border shadow-sm leading-relaxed',
                  themeStyles.stimulusBg
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold mb-2 opacity-80">
                  <Sparkles className="size-3.5 text-amber-400" />
                  <span>উদ্দীপক / তথ্য:</span>
                </div>
                <div className={fontSizeClasses.stimulus}>
                  <RichText content={currentQuestion.stimulus} />
                </div>
              </div>
            )}

            {/* Stem (মূল প্রশ্ন) */}
            <div className={cn('font-bold leading-relaxed tracking-tight py-2', fontSizeClasses.stem)}>
              <RichText content={currentQuestion.stem} />
            </div>

            {/* MCQ Options (ক, খ, গ, ঘ) */}
            {currentQuestion.type === 0 && currentQuestion.options && currentQuestion.options.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {currentQuestion.options.map((opt, oIdx) => {
                  const label = OPTION_LABELS[opt.label ?? oIdx] || String.fromCharCode(65 + oIdx)
                  const isCorrect = opt.isCorrect
                  const isUserSelected = selectedOption === oIdx
                  const votes = pollVotes[oIdx] || 0
                  const votePercentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

                  return (
                    <div
                      key={oIdx}
                      className={cn(
                        'relative rounded-2xl border-2 p-4 sm:p-5 transition-all cursor-pointer flex flex-col justify-between overflow-hidden',
                        showAnswer && isCorrect
                          ? themeStyles.optionCorrect
                          : isUserSelected
                          ? themeStyles.optionSelected
                          : themeStyles.optionBg
                      )}
                      onClick={() => setSelectedOption(oIdx)}
                    >
                      {/* Option Header & Letter */}
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'rounded-xl flex items-center justify-center font-bold shrink-0 border transition-all',
                            fontSizeClasses.badge,
                            showAnswer && isCorrect
                              ? 'bg-emerald-500 text-white border-emerald-400 shadow-md'
                              : 'bg-current/10 border-current/20'
                          )}
                        >
                          {label}
                        </div>
                        <div className={cn('flex-1 font-medium leading-snug', fontSizeClasses.option)}>
                          <RichText content={opt.content} />
                        </div>
                      </div>

                      {/* Correct Answer Glow Pill */}
                      {showAnswer && isCorrect && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30 w-fit">
                          <span>✓ সঠিক উত্তর</span>
                        </div>
                      )}

                      {/* Live Classroom Polling Tally Bar */}
                      <div className="mt-3 pt-2 border-t border-current/10 flex items-center justify-between text-xs opacity-75">
                        <div className="flex items-center gap-2">
                          <Users className="size-3" />
                          <span>ভোট: {toBnDigits(votes)} জন</span>
                          {totalVotes > 0 && (
                            <span className="font-mono">({toBnDigits(votePercentage)}%)</span>
                          )}
                        </div>

                        {/* +1 / -1 Buttons for Teacher Hand Tally */}
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleVote(oIdx, -1)}
                            className="size-6 flex items-center justify-center rounded-md bg-current/10 hover:bg-current/20 font-bold"
                            title="ভোট হ্রাস"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVote(oIdx, 1)}
                            className="px-2 h-6 flex items-center justify-center rounded-md bg-current/10 hover:bg-current/20 font-bold text-xs"
                            title="হ্যান্ড রেজ ভোট যোগ করুন"
                          >
                            +১ ভোট
                          </button>
                        </div>
                      </div>

                      {/* Vote percentage bar indicator */}
                      {totalVotes > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-current/10">
                          <div
                            className={cn(
                              'h-full transition-all duration-300',
                              showAnswer && isCorrect ? 'bg-emerald-400' : 'bg-primary'
                            )}
                            style={{ width: `${votePercentage}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* CQ Parts (ক, খ, গ, ঘ) */}
            {currentQuestion.type === 1 && currentQuestion.cqParts && currentQuestion.cqParts.length > 0 && (
              <div className="space-y-4 pt-2">
                {currentQuestion.cqParts.map((part, pIdx) => {
                  const label = OPTION_LABELS[part.part ?? pIdx] || String.fromCharCode(65 + pIdx)
                  return (
                    <div
                      key={pIdx}
                      className={cn(
                        'rounded-xl border p-4 sm:p-5 flex items-start justify-between gap-4',
                        themeStyles.card
                      )}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <span className="font-bold text-lg rounded-lg size-8 flex items-center justify-center bg-current/10 shrink-0">
                          {label}
                        </span>
                        <div className={cn('leading-relaxed', fontSizeClasses.option)}>
                          <RichText content={part.prompt} />
                        </div>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 text-xs', themeStyles.accentBadge)}>
                        {toBnDigits(part.marks)} নম্বর
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Explanation / Solution Accordion (ব্যাখ্যা ও বিস্তারিত সমাধান) */}
            {showExplanation && (
              <div
                className={cn(
                  'rounded-2xl p-6 border shadow-sm space-y-2 animate-in fade-in duration-200',
                  themeStyles.stimulusBg
                )}
              >
                <div className="flex items-center justify-between text-xs font-bold opacity-80 border-b border-current/10 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-4 text-emerald-400" />
                    ব্যাখ্যা ও সমাধান:
                  </span>
                  <button
                    onClick={() => setShowExplanation(false)}
                    className="p-1 hover:opacity-100 opacity-60"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="text-base sm:text-lg leading-relaxed pt-1">
                  {currentQuestion.explanation ? (
                    <RichText content={currentQuestion.explanation} />
                  ) : (
                    <p className="italic opacity-60">
                      এই প্রশ্নের কোনো অতিরিক্ত ব্যাখ্যা দেওয়া নেই। সঠিক উত্তর উপরে চিহ্নিত করা হয়েছে।
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 space-y-2">
            <p className="text-lg font-bold">এই প্রশ্নসেটে কোনো প্রশ্ন পাওয়া যায়নি</p>
            <Button size="sm" onClick={() => setSearchParams({})}>
              অন্য প্রশ্নসেট নির্বাচন করুন
            </Button>
          </div>
        )}
      </main>

      {/* ── Bottom Projector Controls ── */}
      <footer
        className={cn(
          'sticky bottom-0 z-40 flex items-center justify-between px-4 sm:px-8 py-3 border-t backdrop-blur-md transition-colors',
          themeStyles.footerBg
        )}
      >
        {/* Left: Previous Button */}
        <Button
          size="lg"
          variant="outline"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="h-11 sm:h-12 px-4 sm:px-6 text-sm font-bold gap-2 rounded-xl border-current/20 hover:bg-current/10"
        >
          <ChevronLeft className="size-5" />
          <span className="hidden sm:inline">পূর্ববর্তী</span>
        </Button>

        {/* Center: Reveal Answer & Explanation Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            size="lg"
            variant={showAnswer ? 'secondary' : 'default'}
            onClick={() => setShowAnswer((a) => !a)}
            className={cn(
              'h-11 sm:h-12 px-5 sm:px-8 text-sm sm:text-base font-bold gap-2 rounded-xl shadow-md transition-all',
              showAnswer
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-0'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            )}
          >
            {showAnswer ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            <span>{showAnswer ? 'উত্তর লুকান' : 'উত্তর উন্মোচন'}</span>
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={() => setShowExplanation((e) => !e)}
            className={cn(
              'h-11 sm:h-12 px-3 sm:px-5 text-sm font-semibold gap-2 rounded-xl border-current/20 hover:bg-current/10',
              showExplanation && 'bg-current/10'
            )}
            title="প্রশ্নের সমাধান ও ব্যাখ্যা দেখুন (E)"
          >
            <Sparkles className="size-4 text-emerald-400" />
            <span className="hidden md:inline">ব্যাখ্যা</span>
          </Button>

          {totalVotes > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPollVotes({})}
              className="text-xs opacity-70 hover:opacity-100 hidden sm:flex"
              title="বর্তমান প্রশ্নের ক্লাস ভোট রিসেট করুন"
            >
              ভোট রিসেট
            </Button>
          )}
        </div>

        {/* Right: Next Button */}
        <Button
          size="lg"
          onClick={handleNext}
          disabled={currentIndex >= totalQuestions - 1}
          className="h-11 sm:h-12 px-4 sm:px-6 text-sm font-bold gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
        >
          <span className="hidden sm:inline">পরবর্তী</span>
          <ChevronRight className="size-5" />
        </Button>
      </footer>

      {/* ── Question Quick-Jump Grid Modal ── */}
      <Dialog open={isJumpOpen} onOpenChange={setIsJumpOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MonitorPlay className="size-4 text-primary" />
              নির্দিষ্ট প্রশ্নে জাম্প করুন
            </DialogTitle>
            <DialogDescription>
              যেকোনো প্রশ্নে ক্লিক করে সরাসরি সেই প্রশ্নে চলে যান:
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 py-4 max-h-80 overflow-y-auto">
            {questions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleJumpTo(idx)}
                className={cn(
                  'h-11 rounded-xl font-bold text-sm flex flex-col items-center justify-center border transition-all',
                  idx === currentIndex
                    ? 'bg-primary text-primary-foreground border-primary shadow-md scale-105'
                    : 'bg-muted/50 hover:bg-muted text-foreground border-border'
                )}
              >
                <span>{toBnDigits(idx + 1)}</span>
                <span className="text-[9px] font-normal opacity-70">
                  {q.type === 0 ? 'MCQ' : 'CQ'}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
