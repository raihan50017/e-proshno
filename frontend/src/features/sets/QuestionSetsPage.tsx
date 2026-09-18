import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Copy,
  FilePlus2,
  Files,
  Layers2,
  ListChecks,
  MonitorPlay,
  Pencil,
  Printer,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { Skeleton } from '@/components/ui/skeleton'
import { useListQuestionSets } from '@/lib/api/generated/question-sets/question-sets'
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'
import { PaperViewModal } from './PaperViewModal'
import { QuestionSetEditModal } from './QuestionSetEditModal'

export function QuestionSetsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'MCQ' | 'CQ'>('all')
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)
  const [selectedSetIdForView, setSelectedSetIdForView] = React.useState<string | null>(null)
  const [selectedSetIdForEdit, setSelectedSetIdForEdit] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)

  // Auto-open modal if ?id= is passed from Generate flow
  React.useEffect(() => {
    const idParam = searchParams.get('id')
    if (idParam) {
      setSelectedSetIdForView(idParam)
      searchParams.delete('id')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data, isLoading, refetch } = useListQuestionSets({})
  const sets = data?.data?.items || []

  // Stat calculations
  const totalSets = sets.length
  const mcqCount = sets.filter((s) => s.type === 0).length
  const cqCount = sets.filter((s) => s.type === 1).length

  const filteredSets = sets.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.subjectLabel.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'MCQ' && s.type === 0) ||
      (typeFilter === 'CQ' && s.type === 1)
    return matchesSearch && matchesType
  })

  const handleDelete = async () => {
    if (!deleteTargetId) return
    setIsDeleting(true)
    try {
      await apiClient.delete(`/api/v1/question-sets/${deleteTargetId}`)
      toast.success('প্রশ্নসেট সফলভাবে মুছে ফেলা হয়েছে')
      setDeleteTargetId(null)
      refetch()
    } catch {
      toast.error('প্রশ্নসেট মুছতে সমস্যা হয়েছে')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDuplicate = async (id: string, title: string) => {
    setDuplicatingId(id)
    try {
      await apiClient.post(`/api/v1/question-sets/${id}/duplicate`)
      toast.success(`"${title}" সফলভাবে অনুলিপি করা হয়েছে`)
      refetch()
    } catch {
      toast.error('অনুলিপি করতে সমস্যা হয়েছে')
    } finally {
      setDuplicatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="আমার প্রশ্নসেট"
        description="আপনার তৈরি ও সংরক্ষিত প্রশ্নপত্রসমূহ পর্যালোচনা, মুদ্রণ এবং পরিচালনা করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'প্রশ্নসেট' },
        ]}
        actions={
          <Link to="/generate">
            <Button className="gap-2 shadow-sm">
              <Sparkles className="size-4" />
              নতুন প্রশ্ন তৈরি
            </Button>
          </Link>
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border">
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card className="border-border bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  মোট প্রশ্নসেট
                </CardTitle>
                <Files className="size-4 text-primary/60" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{toBnDigits(totalSets)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">সংরক্ষিত প্রশ্নপত্র</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-gradient-to-br from-emerald-500/5 to-emerald-500/10">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  MCQ প্রশ্নসেট
                </CardTitle>
                <ListChecks className="size-4 text-emerald-500/70" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {toBnDigits(mcqCount)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">বহুনির্বাচনি প্রশ্নপত্র</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-gradient-to-br from-indigo-500/5 to-indigo-500/10">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  CQ প্রশ্নসেট
                </CardTitle>
                <Layers2 className="size-4 text-indigo-500/70" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {toBnDigits(cqCount)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">সৃজনশীল প্রশ্নপত্র</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="প্রশ্নপত্রের নাম বা বিষয় খুঁজুন..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="h-9 text-xs sm:w-72"
          />
          {/* Type Filter Tabs */}
          <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5 gap-0.5">
            {(['all', 'MCQ', 'CQ'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'all' ? 'সব' : t}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          দেখানো হচ্ছে:{' '}
          <strong className="text-foreground">{toBnDigits(filteredSets.length)}</strong> /{' '}
          {toBnDigits(totalSets)} টি সেট
        </div>
      </div>

      {/* Sets Table Card */}
      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : filteredSets.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">শিরোনাম</TableHead>
                    <TableHead className="text-xs font-semibold">শ্রেণি ও বিষয়</TableHead>
                    <TableHead className="text-xs font-semibold">ধরন</TableHead>
                    <TableHead className="text-xs font-semibold">প্রশ্ন সংখ্যা</TableHead>
                    <TableHead className="text-xs font-semibold">সময় ও পূর্ণমান</TableHead>
                    <TableHead className="text-xs font-semibold">তারিখ</TableHead>
                    <TableHead className="text-right text-xs font-semibold">অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSets.map((set) => (
                    <TableRow key={set.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-semibold text-foreground max-w-xs">
                        <div className="truncate">{set.title}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {set.levelName} · {set.subjectLabel}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${
                            set.type === 0
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'
                          }`}
                        >
                          {set.type === 0 ? 'MCQ' : 'CQ'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal text-xs">
                          {toBnDigits(set.itemCount)}/{toBnDigits(set.targetCount)} টি
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {toBnDigits(set.durationMin)} মি. · {toBnDigits(set.fullMarks)} নম্বর
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateBn(set.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/smartboard?setId=${set.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 border-border text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                              title="স্মার্টবোর্ড মোডে ক্লাসরুমে উপস্থাপন করুন"
                            >
                              <MonitorPlay className="size-3.5" />
                              <span className="hidden sm:inline">স্মার্টবোর্ড</span>
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1 border-border"
                            onClick={() => setSelectedSetIdForView(set.id)}
                          >
                            <Printer className="size-3.5" />
                            <span className="hidden sm:inline">প্রিন্ট</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-primary"
                            onClick={() => setSelectedSetIdForEdit(set.id)}
                            title="প্রশ্নসেট সম্পাদনা করুন"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleDuplicate(set.id, set.title)}
                            disabled={duplicatingId === set.id}
                            title="অনুলিপি করুন"
                          >
                            {duplicatingId === set.id ? (
                              <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTargetId(set.id)}
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
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
                icon={FilePlus2}
                title="কোনো প্রশ্নসেট পাওয়া যায়নি"
                description={
                  searchQuery || typeFilter !== 'all'
                    ? 'আপনার অনুসন্ধানের সাথে মেলে এমন কোনো প্রশ্নসেট পাওয়া যায়নি।'
                    : 'আপনার প্রতিষ্ঠানে এখনও কোনো প্রশ্নসেট তৈরি করা হয়নি।'
                }
                actionLabel="নতুন প্রশ্নসেট তৈরি করুন"
                onAction={() => {
                  window.location.href = '/generate'
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="প্রশ্নসেট মুছে ফেলার নিশ্চিতকরণ"
        description="আপনি কি নিশ্চিতভাবে এই প্রশ্নসেটটি মুছে ফেলতে চান? এটি মুছে ফেললে প্রশ্নপত্রটি আর পুনরুদ্ধার করা যাবে না।"
        confirmText="মুছে ফেলুন"
        cancelText="বাতিল"
        confirmVariant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />

      {/* Paper Live Preview & Print Modal */}
      <PaperViewModal
        setId={selectedSetIdForView}
        isOpen={Boolean(selectedSetIdForView)}
        onClose={() => setSelectedSetIdForView(null)}
      />

      {/* Question Set Edit Modal */}
      <QuestionSetEditModal
        setId={selectedSetIdForEdit}
        isOpen={Boolean(selectedSetIdForEdit)}
        onClose={() => setSelectedSetIdForEdit(null)}
        onSuccess={() => refetch()}
      />
    </div>
  )
}
