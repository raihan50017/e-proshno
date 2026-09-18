import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  FileText,
  ListOrdered,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

interface QuestionSetEditModalProps {
  setId: string | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface SetItemRow {
  questionId: string
  position: number
  marks: number
  stem?: string
  type?: number
  chapterName?: string
}

export function QuestionSetEditModal({
  setId,
  isOpen,
  onClose,
  onSuccess,
}: QuestionSetEditModalProps) {
  const [activeTab, setActiveTab] = React.useState('info')
  const [isLoading, setIsLoading] = React.useState(true)

  // Basic Info Form State
  const [title, setTitle] = React.useState('')
  const [durationMin, setDurationMin] = React.useState<number>(30)
  const [fullMarks, setFullMarks] = React.useState<number>(30)
  const [targetCount, setTargetCount] = React.useState<number>(20)
  const [rawSetDetail, setRawSetDetail] = React.useState<any>(null)
  const [isSavingInfo, setIsSavingInfo] = React.useState(false)

  // Items State
  const [items, setItems] = React.useState<SetItemRow[]>([])
  const [isSavingItems, setIsSavingItems] = React.useState(false)

  // Search & Add State
  const [searchKeyword, setSearchKeyword] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<any[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [addingId, setAddingId] = React.useState<string | null>(null)

  // Load Set Details & Paper when opened
  const loadSetData = React.useCallback(async () => {
    if (!setId) return
    setIsLoading(true)
    try {
      // 1. Fetch set details
      const detailRes = await apiClient.get<any>(`/api/v1/question-sets/${setId}`)
      const set = detailRes.data
      setRawSetDetail(set)

      setTitle(set.title || '')
      setDurationMin(set.durationMin ?? 30)
      setFullMarks(Number(set.fullMarks) || 30)
      setTargetCount(set.targetCount ?? 20)

      // 2. Fetch paper items to get question stems and previews
      const paperRes = await apiClient.get<any>(`/api/v1/question-sets/${setId}/paper`)
      const paper = paperRes.data

      const loadedItems: SetItemRow[] = (paper?.items || []).map((pItem: any, idx: number) => ({
        questionId: pItem.questionId || pItem.id,
        position: idx + 1,
        marks: Number(pItem.marks) || (set.type === 0 ? 1 : 10),
        stem: typeof pItem.stem === 'string' ? pItem.stem : pItem.stemText || '',
        type: set.type,
        chapterName: pItem.chapterName || '',
      }))

      setItems(loadedItems)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'প্রশ্নসেটের তথ্য লোড করা যায়নি'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [setId])

  React.useEffect(() => {
    if (isOpen && setId) {
      loadSetData()
      setActiveTab('info')
    }
  }, [isOpen, setId, loadSetData])

  // Save Basic Info
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!setId || !rawSetDetail) return

    if (!title.trim()) {
      toast.error('প্রশ্নসেটের শিরোনাম লিখুন')
      return
    }

    setIsSavingInfo(true)
    try {
      await apiClient.put(`/api/v1/question-sets/${setId}`, {
        title: title.trim(),
        chapterIds: rawSetDetail.chapters?.map((c: any) => c.id) || [],
        mode: rawSetDetail.mode ?? 0,
        source: rawSetDetail.source ?? 0,
        bankIds: rawSetDetail.banks?.map((b: any) => b.id) || [],
        targetCount,
        durationMin,
        fullMarks,
      })

      toast.success('প্রশ্নসেটের সাধারণ তথ্য হালনাগাদ করা হয়েছে!')
      onSuccess()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'তথ্য সংরক্ষণ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsSavingInfo(false)
    }
  }

  // Move item Up
  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setItems((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index - 1]
      next[index - 1] = temp
      return next.map((item, i) => ({ ...item, position: i + 1 }))
    })
  }

  // Move item Down
  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return
    setItems((prev) => {
      const next = [...prev]
      const temp = next[index]
      next[index] = next[index + 1]
      next[index + 1] = temp
      return next.map((item, i) => ({ ...item, position: i + 1 }))
    })
  }

  // Change marks per item
  const handleMarksChange = (index: number, newMarks: number) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], marks: newMarks }
      return next
    })
  }

  // Remove item
  const handleRemoveItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.map((item, i) => ({ ...item, position: i + 1 }))
    })
  }

  // Save items order & marks
  const handleSaveItems = async () => {
    if (!setId) return
    setIsSavingItems(true)
    try {
      await apiClient.put(`/api/v1/question-sets/${setId}/items`, {
        items: items.map((i) => ({
          questionId: i.questionId,
          marks: i.marks,
        })),
      })

      toast.success('প্রশ্নের ক্রম ও নম্বর সফলভাবে সংরক্ষিত হয়েছে!')
      onSuccess()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'প্রশ্নের ক্রম সংরক্ষণ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsSavingItems(false)
    }
  }

  // Search questions to add
  const handleSearchQuestions = async () => {
    if (!setId) return
    setIsSearching(true)
    try {
      const res = await apiClient.post<any>(`/api/v1/question-sets/${setId}/search`, {
        filters: {
          keyword: searchKeyword.trim() || null,
          mode: 0,
          topicIds: [],
          tagIds: [],
          withImage: false,
          repeatedBoard: false,
        },
        limit: 20,
      })

      setSearchResults(res.data?.items || [])
    } catch {
      toast.error('প্রশ্ন অনুসন্ধান করতে সমস্যা হয়েছে')
    } finally {
      setIsSearching(false)
    }
  }

  // Add question to set
  const handleAddQuestionToSet = async (question: any) => {
    if (!setId) return
    const isAlreadyIn = items.some((i) => i.questionId === question.id)
    if (isAlreadyIn) {
      toast.info('এই প্রশ্নটি ইতোমধ্যেই সেটে রয়েছে')
      return
    }

    setAddingId(question.id)
    try {
      const defaultMarks = rawSetDetail?.type === 0 ? 1 : 10
      const updatedItems = [
        ...items.map((i) => ({ questionId: i.questionId, marks: i.marks })),
        { questionId: question.id, marks: defaultMarks },
      ]

      await apiClient.put(`/api/v1/question-sets/${setId}/items`, {
        items: updatedItems,
      })

      toast.success('প্রশ্নটি সেটে যুক্ত করা হয়েছে!')
      await loadSetData()
      onSuccess()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'প্রশ্ন যোগ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setAddingId(null)
    }
  }

  if (!isOpen) return null

  const currentTotalMarks = items.reduce((sum, item) => sum + (Number(item.marks) || 0), 0)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 text-primary">
            <Edit3 className="size-5" />
            <DialogTitle className="text-base font-semibold">
              প্রশ্নসেট সম্পাদনা ও পরিবর্তন
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {rawSetDetail ? `${rawSetDetail.levelName} · ${rawSetDetail.subjectLabel} · ` : ''}
            শিরোনাম, সময়, প্রশ্নের ক্রম এবং নম্বর পুনর্নির্ধারণ করুন
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-4 sm:px-5 pt-3 border-b border-border bg-card">
              <TabsList className="bg-muted/80 p-1 border border-border">
                <TabsTrigger value="info" className="gap-1.5 text-xs font-medium">
                  <Settings2 className="size-3.5" />
                  সাধারণ তথ্য
                </TabsTrigger>
                <TabsTrigger value="items" className="gap-1.5 text-xs font-medium">
                  <ListOrdered className="size-3.5" />
                  প্রশ্নের তালিকা ও ক্রম ({toBnDigits(items.length)})
                </TabsTrigger>
                <TabsTrigger value="add" className="gap-1.5 text-xs font-medium">
                  <Plus className="size-3.5" />
                  আরও প্রশ্ন যোগ করুন
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {/* ─── TAB 1: BASIC INFO ────────────────────────────────────────── */}
              <TabsContent value="info" className="mt-0">
                <form onSubmit={handleSaveInfo} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="setTitle" className="text-xs font-semibold">
                      প্রশ্নপত্রের শিরোনাম *
                    </Label>
                    <Input
                      id="setTitle"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="যেমন: অর্ধ-বার্ষিক পরীক্ষা ২০২৬ - পদার্থবিজ্ঞান"
                      required
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="setDuration" className="text-xs font-semibold">
                        পরীক্ষার সময় (মিনিট) *
                      </Label>
                      <Input
                        id="setDuration"
                        type="number"
                        min={5}
                        max={300}
                        value={durationMin}
                        onChange={(e) => setDurationMin(Number(e.target.value))}
                        required
                        className="text-xs h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="setFullMarks" className="text-xs font-semibold">
                        মোট পূর্ণমান *
                      </Label>
                      <Input
                        id="setFullMarks"
                        type="number"
                        min={1}
                        max={200}
                        value={fullMarks}
                        onChange={(e) => setFullMarks(Number(e.target.value))}
                        required
                        className="text-xs h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="setTargetCount" className="text-xs font-semibold">
                        প্রশ্ন সংখ্যা লক্ষ্যমাত্রা *
                      </Label>
                      <Input
                        id="setTargetCount"
                        type="number"
                        min={1}
                        max={100}
                        value={targetCount}
                        onChange={(e) => setTargetCount(Number(e.target.value))}
                        required
                        className="text-xs h-9"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                    <span className="font-semibold text-foreground block">স্থির তথ্য (অপরিবর্তনযোগ্য):</span>
                    <p>
                      বিষয়: <strong className="text-foreground">{rawSetDetail?.subjectLabel}</strong> · শ্রেণি:{' '}
                      <strong className="text-foreground">{rawSetDetail?.levelName}</strong> · ধরন:{' '}
                      <Badge variant="outline" className="text-[10px] ml-1">
                        {rawSetDetail?.type === 0 ? 'MCQ' : 'CQ'}
                      </Badge>
                    </p>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <Button
                      type="submit"
                      loading={isSavingInfo}
                      loadingText="সংরক্ষণ হচ্ছে..."
                      className="gap-1.5 text-xs font-semibold shadow-xs"
                    >
                      <Save className="size-3.5" />
                      সাধারণ তথ্য সংরক্ষণ করুন
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* ─── TAB 2: QUESTIONS & REORDER ─────────────────────────────────── */}
              <TabsContent value="items" className="mt-0 space-y-4">
                {/* Stats bar */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40 text-xs">
                  <div className="flex items-center gap-4">
                    <span>
                      মোট প্রশ্ন:{' '}
                      <strong className="text-foreground font-bold">{toBnDigits(items.length)}</strong> টি
                    </span>
                    <span>
                      মোট ধার্যকৃত নম্বর:{' '}
                      <strong className="text-primary font-bold">{toBnDigits(currentTotalMarks)}</strong>
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveItems}
                    loading={isSavingItems}
                    loadingText="সংরক্ষণ হচ্ছে..."
                    className="gap-1.5 h-8 text-xs font-semibold"
                  >
                    <Save className="size-3.5" />
                    ক্রম ও নম্বর সংরক্ষণ করুন
                  </Button>
                </div>

                {items.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                    এই সেটে বর্তমানে কোনো প্রশ্ন নেই। &quot;আরও প্রশ্ন যোগ করুন&quot; ট্যাব থেকে প্রশ্ন যুক্ত করুন।
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div
                        key={item.questionId}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors text-xs"
                      >
                        {/* Position number */}
                        <div className="size-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                          {toBnDigits(idx + 1)}
                        </div>

                        {/* Question stem snippet */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground line-clamp-2 leading-relaxed">
                            {item.stem || 'প্রশ্ন লোড হচ্ছে...'}
                          </p>
                          {item.chapterName && (
                            <span className="text-[11px] text-muted-foreground">
                              অধ্যায়: {item.chapterName}
                            </span>
                          )}
                        </div>

                        {/* Marks Input */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-muted-foreground text-[11px]">নম্বর:</span>
                          <Input
                            type="number"
                            min={0.5}
                            max={50}
                            step={0.5}
                            value={item.marks}
                            onChange={(e) => handleMarksChange(idx, Number(e.target.value))}
                            className="h-7 w-16 text-xs text-center"
                          />
                        </div>

                        {/* Reorder actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            disabled={idx === 0}
                            onClick={() => handleMoveUp(idx)}
                            title="উপরে নিন"
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            disabled={idx === items.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            title="নিচে নিন"
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveItem(idx)}
                            title="সেট থেকে সরান"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ─── TAB 3: SEARCH & ADD QUESTIONS ─────────────────────────────── */}
              <TabsContent value="add" className="mt-0 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="প্রশ্নের শব্দ লিখে খুঁজুন..."
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchQuestions()}
                      className="pl-8 text-xs h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleSearchQuestions}
                    loading={isSearching}
                    className="gap-1.5 text-xs h-9 font-semibold shrink-0"
                  >
                    অনুসন্ধান
                  </Button>
                </div>

                {/* Results list */}
                {isSearching ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-semibold">
                      খুঁজে পাওয়া প্রশ্নসমূহ ({toBnDigits(searchResults.length)} টি):
                    </p>
                    {searchResults.map((q) => {
                      const alreadyInSet = items.some((i) => i.questionId === q.id)
                      const isAdding = addingId === q.id
                      return (
                        <div
                          key={q.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <p className="font-medium text-foreground line-clamp-2 leading-relaxed">
                              {typeof q.stem === 'string' ? q.stem : q.stemText}
                            </p>
                            {q.chapterName && (
                              <span className="text-[11px] text-muted-foreground">
                                অধ্যায়: {q.chapterName}
                              </span>
                            )}
                          </div>

                          <Button
                            size="sm"
                            variant={alreadyInSet ? 'outline' : 'default'}
                            className="shrink-0 h-8 gap-1.5 text-xs"
                            disabled={alreadyInSet || Boolean(addingId)}
                            loading={isAdding}
                            onClick={() => handleAddQuestionToSet(q)}
                          >
                            {alreadyInSet ? (
                              <>
                                <Check className="size-3.5 text-emerald-600" />
                                যুক্ত আছে
                              </>
                            ) : (
                              <>
                                <Plus className="size-3.5" />
                                যোগ করুন
                              </>
                            )}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg space-y-1">
                    <FileText className="size-7 text-muted-foreground mx-auto opacity-50 mb-1" />
                    <p className="font-medium text-foreground">কোনো প্রশ্ন অনুসন্ধান করা হয়নি</p>
                    <p className="text-[11px]">
                      উপরে কি-ওয়ার্ড লিখে &ldquo;অনুসন্ধান&rdquo; বোতামে চাপুন।
                    </p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="p-3 border-t border-border bg-background">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            বন্ধ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
