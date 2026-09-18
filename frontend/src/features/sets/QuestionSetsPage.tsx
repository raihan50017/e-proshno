import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  FilePlus2,
  Printer,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useListQuestionSets } from '@/lib/api/generated/question-sets/question-sets'
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'

export function QuestionSetsPage() {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const { data, isLoading, refetch } = useListQuestionSets({})
  const sets = data?.data?.items || []

  const filteredSets = sets.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.subjectLabel.toLowerCase().includes(searchQuery.toLowerCase())
  )

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

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          placeholder="প্রশ্নপত্রের নাম বা বিষয় খুঁজুন..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="h-10 text-xs sm:w-80"
        />
        <div className="text-xs text-muted-foreground">
          মোট সংরক্ষিত: <strong className="text-foreground">{toBnDigits(sets.length)}</strong> টি প্রশ্নসেট
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
                  <TableRow>
                    <TableHead>শিরোনাম</TableHead>
                    <TableHead>শ্রেণি ও বিষয়</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>প্রশ্ন সংখ্যা</TableHead>
                    <TableHead>সময় ও পূর্ণমান</TableHead>
                    <TableHead>তারিখ</TableHead>
                    <TableHead className="text-right">অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSets.map((set) => (
                    <TableRow key={set.id}>
                      <TableCell className="font-semibold text-foreground max-w-xs">
                        <div className="truncate">{set.title}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {set.levelName} · {set.subjectLabel}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
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
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => {
                              window.open(`/api/v1/question-sets/${set.id}/paper`, '_blank')
                            }}
                          >
                            <Printer className="size-3.5" />
                            প্রিন্ট / ভিউ
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTargetId(set.id)}
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="size-4" />
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
                  searchQuery
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
    </div>
  )
}
