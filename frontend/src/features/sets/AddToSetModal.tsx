import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  Files,
  Plus,
  PlusCircle,
  Sparkles,
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
import { Skeleton } from '@/components/ui/skeleton'
import type { QuestionCard } from '@/lib/api/model/questionCard'
import { useListQuestionSets } from '@/lib/api/generated/question-sets/question-sets'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

interface AddToSetModalProps {
  question: QuestionCard | null
  isOpen: boolean
  onClose: () => void
}

export function AddToSetModal({ question, isOpen, onClose }: AddToSetModalProps) {
  const [addingToSetId, setAddingToSetId] = React.useState<string | null>(null)

  const { data: setsData, isLoading, refetch } = useListQuestionSets(
    {},
    { query: { enabled: isOpen && Boolean(question) } }
  )

  const allSets = setsData?.data?.items || []

  // Filter sets that match the question's type (MCQ with MCQ, CQ with CQ) and preferably subject
  const matchingSets = React.useMemo(() => {
    if (!question) return []
    return allSets.filter((s) => s.type === question.type)
  }, [allSets, question])

  const handleAddQuestionToSet = async (setId: string, setTitle: string) => {
    if (!question) return

    setAddingToSetId(setId)
    try {
      // 1. Fetch current set detail
      const setRes = await apiClient.get<any>(`/api/v1/question-sets/${setId}`)
      const setDetail = setRes.data

      const currentItems: Array<{ questionId: string; marks: number }> =
        setDetail.items?.map((item: any) => ({
          questionId: item.questionId,
          marks: Number(item.marks) || (question.type === 0 ? 1 : 10),
        })) || []

      // 2. Check if already added
      const alreadyInSet = currentItems.some((item) => item.questionId === question.id)
      if (alreadyInSet) {
        toast.info('এই প্রশ্নটি ইতোমধ্যেই এই প্রশ্নসেটে যুক্ত আছে!')
        setAddingToSetId(null)
        return
      }

      // 3. Append new item
      const updatedItems = [
        ...currentItems,
        {
          questionId: question.id,
          marks: question.type === 0 ? 1 : 10,
        },
      ]

      // 4. Save items
      await apiClient.put(`/api/v1/question-sets/${setId}/items`, {
        items: updatedItems,
      })

      toast.success(`প্রশ্নটি "${setTitle}" সেটে সফলভাবে যুক্ত করা হয়েছে!`)
      refetch()
      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'প্রশ্নসেটে প্রশ্ন যোগ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setAddingToSetId(null)
    }
  }

  if (!question) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 text-primary">
            <PlusCircle className="size-5" />
            <DialogTitle className="text-base font-semibold">প্রশ্নসেটে যুক্ত করুন</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            কোন প্রশ্নসেটে এই প্রশ্নটি যোগ করতে চান তা নির্বাচন করুন
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Target Question Summary Banner */}
          <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {question.type === 0 ? 'MCQ' : 'CQ'}
              </Badge>
              {question.chapterName && (
                <span className="text-muted-foreground text-[11px]">
                  অধ্যায়: {question.chapterName}
                </span>
              )}
            </div>
            <p className="font-medium text-foreground line-clamp-2 leading-relaxed">
              {typeof question.stem === 'string' ? question.stem : JSON.stringify(question.stem)}
            </p>
          </div>

          {/* Sets List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span>উপলব্ধ প্রশ্নসেটসমূহ ({toBnDigits(matchingSets.length)})</span>
              <Link
                to="/generate"
                className="text-primary hover:underline flex items-center gap-1 font-normal text-[11px]"
                onClick={onClose}
              >
                <Plus className="size-3" />
                নতুন সেট তৈরি করুন
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : matchingSets.length > 0 ? (
              <div className="space-y-2">
                {matchingSets.map((s) => {
                  const isAdding = addingToSetId === s.id
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-bold text-foreground truncate">{s.title}</p>
                        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                          <span>{s.levelName}</span>
                          <span>·</span>
                          <span>{s.subjectLabel}</span>
                          <span>·</span>
                          <span className="font-medium text-primary">
                            {toBnDigits(s.itemCount)}/{toBnDigits(s.targetCount)} টি প্রশ্ন
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        className="shrink-0 h-8 gap-1.5 text-xs font-semibold"
                        onClick={() => handleAddQuestionToSet(s.id, s.title)}
                        loading={isAdding}
                        loadingText="যোগ হচ্ছে..."
                        disabled={Boolean(addingToSetId)}
                      >
                        <Plus className="size-3.5" />
                        যুক্ত করুন
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs space-y-3">
                <Files className="size-8 text-muted-foreground mx-auto opacity-50" />
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    ম্যাচিং কোনো {question.type === 0 ? 'MCQ' : 'CQ'} প্রশ্নসেট পাওয়া যায়নি
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    এই ধরনের প্রশ্ন যুক্ত করতে প্রথমে ১ ক্লিকে একটি প্রশ্নসেট তৈরি করুন।
                  </p>
                </div>
                <Link to="/generate" onClick={onClose}>
                  <Button size="sm" className="gap-1.5 text-xs mt-1">
                    <Sparkles className="size-3.5" />
                    প্রশ্নসেট তৈরি করুন
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-3 border-t border-border bg-background">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            বন্ধ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
