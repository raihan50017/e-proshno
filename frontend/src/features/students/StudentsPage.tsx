import * as React from 'react'
import {
  FolderPlus,
  Plus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { useListBatches, useListStudents } from '@/lib/api/generated/students/students'
import type { BatchDto, StudentDto } from '@/lib/api/model'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

export function StudentsPage() {
  const { data: batchesData, refetch: refetchBatches } = useListBatches()
  const batches: BatchDto[] = React.useMemo(() => {
    if (!batchesData) return []
    if (Array.isArray(batchesData)) return batchesData
    if ('data' in batchesData && Array.isArray((batchesData as any).data)) return (batchesData as any).data
    return []
  }, [batchesData])

  const [selectedBatchId, setSelectedBatchId] = React.useState<string>('')
  const { data: studentsData, isLoading, refetch: refetchStudents } = useListStudents(
    selectedBatchId ? { batchId: selectedBatchId } : undefined
  )
  const students: StudentDto[] = React.useMemo(() => {
    if (!studentsData) return []
    if (Array.isArray(studentsData)) return studentsData
    if ('data' in studentsData && (studentsData as any).data?.items) return (studentsData as any).data.items
    if ((studentsData as any)?.items) return (studentsData as any).items
    return []
  }, [studentsData])

  const [searchQuery, setSearchQuery] = React.useState('')
  const [studentDialogOpen, setStudentDialogOpen] = React.useState(false)
  const [fullName, setFullName] = React.useState('')
  const [roll, setRoll] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [batchId, setBatchId] = React.useState('')
  const [isSavingStudent, setIsSavingStudent] = React.useState(false)

  // Batch Creation Dialog
  const [batchDialogOpen, setBatchDialogOpen] = React.useState(false)
  const [newBatchName, setNewBatchName] = React.useState('')
  const [newBatchYear, setNewBatchYear] = React.useState(new Date().getFullYear())
  const [isSavingBatch, setIsSavingBatch] = React.useState(false)

  React.useEffect(() => {
    if (batches.length > 0 && !batchId) {
      setBatchId(batches[0].id)
    }
  }, [batches, batchId])

  const filteredStudents = students.filter((st) =>
    st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    st.roll.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const batchOptions = React.useMemo(
    () =>
      batches.map((b) => ({
        value: b.id,
        label: b.name,
        description: b.studentCount !== undefined ? `${toBnDigits(b.studentCount)} জন শিক্ষার্থী` : undefined,
      })),
    [batches]
  )

  const filterBatchOptions = React.useMemo(
    () => [
      { value: '', label: 'সকল ব্যাচ' },
      ...batches.map((b) => ({
        value: b.id,
        label: b.name,
        description: b.studentCount !== undefined ? `${toBnDigits(b.studentCount)} জন` : undefined,
      })),
    ],
    [batches]
  )

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !roll.trim()) {
      toast.error('নাম এবং রোল নম্বর প্রদান করুন')
      return
    }
    if (!batchId) {
      toast.error('অনুগ্রহ করে একটি ব্যাচ নির্বাচন করুন')
      return
    }

    setIsSavingStudent(true)
    try {
      await apiClient.post('/api/v1/students', {
        name: fullName.trim(),
        roll: roll.trim(),
        phone: phone.trim() || undefined,
        batchId: batchId,
      })

      toast.success('শিক্ষার্থী সফলভাবে যুক্ত হয়েছে!')
      setStudentDialogOpen(false)
      setFullName('')
      setRoll('')
      setPhone('')
      refetchStudents()
      refetchBatches()
    } catch {
      toast.error('শিক্ষার্থী যোগ করতে সমস্যা হয়েছে')
    } finally {
      setIsSavingStudent(false)
    }
  }

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBatchName.trim()) {
      toast.error('ব্যাচের নাম প্রদান করুন')
      return
    }

    setIsSavingBatch(true)
    try {
      const res = await apiClient.post('/api/v1/students/batches', {
        name: newBatchName.trim(),
        year: Number(newBatchYear) || undefined,
      })

      toast.success('নতুন ব্যাচ সফলভাবে তৈরি হয়েছে!')
      setBatchDialogOpen(false)
      setNewBatchName('')
      await refetchBatches()
      if (res?.data?.id) {
        setBatchId(res.data.id)
      }
    } catch {
      toast.error('ব্যাচ তৈরি করতে সমস্যা হয়েছে')
    } finally {
      setIsSavingBatch(false)
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2 shadow-xs"
              onClick={() => setBatchDialogOpen(true)}
            >
              <FolderPlus className="size-4" />
              নতুন ব্যাচ
            </Button>

            <Button
              className="gap-2 shadow-sm"
              onClick={() => setStudentDialogOpen(true)}
            >
              <Plus className="size-4" />
              নতুন শিক্ষার্থী যোগ করুন
            </Button>
          </div>
        }
      />

      {/* Filter and Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <SearchInput
            placeholder="রোল বা নাম দিয়ে খুঁজুন..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="h-10 text-xs sm:w-72"
          />

          <div className="w-56 shrink-0">
            <Combobox
              options={filterBatchOptions}
              value={selectedBatchId}
              onChange={setSelectedBatchId}
              placeholder="সকল ব্যাচ"
              searchPlaceholder="ব্যাচ খুঁজুন..."
              triggerClassName="h-10 text-xs"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground shrink-0">
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
                onAction={() => setStudentDialogOpen(true)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Student Dialog */}
      <Dialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen}>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="sBatch">ব্যাচ *</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentDialogOpen(false)
                      setBatchDialogOpen(true)
                    }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    + নতুন ব্যাচ তৈরি করুন
                  </button>
                </div>
                <Combobox
                  options={batchOptions}
                  value={batchId}
                  onChange={setBatchId}
                  placeholder="ব্যাচ নির্বাচন করুন"
                  searchPlaceholder="ব্যাচ খুঁজুন..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStudentDialogOpen(false)}
                disabled={isSavingStudent}
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                loading={isSavingStudent}
                loadingText="সংরক্ষণ হচ্ছে..."
              >
                যোগ করুন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateBatch}>
            <DialogHeader>
              <DialogTitle>নতুন ব্যাচ তৈরি করুন</DialogTitle>
              <DialogDescription className="text-xs">
                শিক্ষার্থীদের ব্যাচ অনুযায়ী বিন্যাস করতে নতুন ব্যাচের নাম দিন
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bName">ব্যাচের নাম *</Label>
                <Input
                  id="bName"
                  placeholder="যেমন: এইচএসসি ২০২৬ ব্যাচ (বিজ্ঞান)"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bYear">শিক্ষাবর্ষ / সাল</Label>
                <Input
                  id="bYear"
                  type="number"
                  placeholder="2026"
                  value={newBatchYear}
                  onChange={(e) => setNewBatchYear(Number(e.target.value))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBatchDialogOpen(false)}
                disabled={isSavingBatch}
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                loading={isSavingBatch}
                loadingText="তৈরি হচ্ছে..."
              >
                তৈরি করুন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
