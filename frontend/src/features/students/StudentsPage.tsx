import * as React from 'react'
import {
  Plus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { useListBatches, useListStudents } from '@/lib/api/generated/students/students'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

export function StudentsPage() {
  const { data: batchesData } = useListBatches()
  const batches = batchesData?.data || []

  const [selectedBatchId, setSelectedBatchId] = React.useState<string>('')
  const { data: studentsData, isLoading, refetch: refetchStudents } = useListStudents(
    selectedBatchId ? { batchId: selectedBatchId } : undefined
  )
  const students = studentsData?.data?.items || []

  const [searchQuery, setSearchQuery] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [fullName, setFullName] = React.useState('')
  const [roll, setRoll] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [batchId, setBatchId] = React.useState('')
  const [isSaving, setIsSaving] = React.useState(false)

  const filteredStudents = students.filter((st) =>
    st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    st.roll.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !roll.trim()) {
      toast.error('নাম এবং রোল নম্বর প্রদান করুন')
      return
    }

    setIsSaving(true)
    try {
      await apiClient.post('/api/v1/students', {
        fullName: fullName.trim(),
        roll: roll.trim(),
        phone: phone.trim() || undefined,
        batchId: batchId || undefined,
      })

      toast.success('শিক্ষার্থী সফলভাবে যুক্ত হয়েছে!')
      setDialogOpen(false)
      setFullName('')
      setRoll('')
      setPhone('')
      refetchStudents()
    } catch {
      toast.error('শিক্ষার্থী যোগ করতে সমস্যা হয়েছে')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="শিক্ষার্থী ব্যবস্থাপনা"
        description="ব্যাচ অনুসারে শিক্ষার্থীদের তালিকা ও রোল নম্বর পরিচালনা করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'শিক্ষার্থী' },
        ]}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-sm">
                <Plus className="size-4" />
                নতুন শিক্ষার্থী যোগ করুন
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateStudent}>
                <DialogHeader>
                  <DialogTitle>নতুন শিক্ষার্থী যোগ করুন</DialogTitle>
                  <DialogDescription className="text-xs">
                    শিক্ষার্থীর তথ্য ও ব্যাচ নির্ধারণ করুন
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="sName">শিক্ষার্থীর নাম *</Label>
                    <Input
                      id="sName"
                      placeholder="যেমন: সাকিব আল হাসান"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="sRoll">রোল নম্বর *</Label>
                      <Input
                        id="sRoll"
                        placeholder="যেমন: ১০১"
                        value={roll}
                        onChange={(e) => setRoll(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sPhone">মোবাইল নম্বর</Label>
                      <Input
                        id="sPhone"
                        placeholder="017xxxxxxxx"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sBatch">ব্যাচ</Label>
                    <select
                      id="sBatch"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                    >
                      <option value="">কোনো ব্যাচ নয় (সাধারণ)</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={isSaving}
                  >
                    বাতিল
                  </Button>
                  <Button
                    type="submit"
                    loading={isSaving}
                    loadingText="সংরক্ষণ হচ্ছে..."
                  >
                    যোগ করুন
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filter and Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder="রোল বা নাম দিয়ে খুঁজুন..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="h-10 text-xs sm:w-72"
          />

          {batches.length > 0 && (
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
            >
              <option value="">সকল ব্যাচ</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          মোট শিক্ষার্থী: <strong className="text-foreground">{toBnDigits(students.length)}</strong> জন
        </div>
      </div>

      {/* Students Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : filteredStudents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>রোল</TableHead>
                    <TableHead>শিক্ষার্থীর নাম</TableHead>
                    <TableHead>ব্যাচ</TableHead>
                    <TableHead>মোবাইল নম্বর</TableHead>
                    <TableHead>অবস্থা</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((st) => (
                    <TableRow key={st.id}>
                      <TableCell className="font-bold text-foreground">
                        {toBnDigits(st.roll)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {st.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {st.batchName || 'সাধারণ'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {st.phone ? toBnDigits(st.phone) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="success" className="text-[11px]">
                          সক্রিয়
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title="কোনো শিক্ষার্থী পাওয়া যায়নি"
                description="আপনার প্রতিষ্ঠানের শিক্ষার্থীদের যোগ করুন যাতে অনলাইন পরীক্ষা ও ওএমআর রেজাল্ট তৈরি করতে পারেন।"
                actionLabel="নতুন শিক্ষার্থী যোগ করুন"
                onAction={() => setDialogOpen(true)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
