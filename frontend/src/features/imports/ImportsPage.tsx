import * as React from 'react'
import {
  CheckCircle,
  Clock,
  Download,
  FileSpreadsheet,
  RotateCcw,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'

export function ImportsPage() {
  const { data: banksData } = useListBanks()
  const banks = banksData?.data || []

  const { data: importsData, isLoading: importsLoading, refetch: refetchImports } = useListImports({})
  const importJobs = importsData?.data?.items || []

  const [selectedBankId, setSelectedBankId] = React.useState<string>('')
  const [pasteContent, setPasteContent] = React.useState('')
  const [isUploading, setIsUploading] = React.useState(false)

  const [rollbackJobId, setRollbackJobId] = React.useState<string | null>(null)
  const [isRollingBack, setIsRollingBack] = React.useState(false)

  React.useEffect(() => {
    if (banks.length > 0 && !selectedBankId) {
      setSelectedBankId(banks[0].id)
    }
  }, [banks, selectedBankId])

  const handleDownloadTemplate = () => {
    window.open('/api/v1/imports/template?type=Mcq', '_blank')
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

    setIsUploading(true)
    try {
      await apiClient.post('/api/v1/imports', {
        bankId: selectedBankId,
        sourceType: 'PastedText',
        textPayload: pasteContent,
      })
      toast.success('প্রশ্ন সফলভাবে প্রসেস করা হয়েছে!')
      setPasteContent('')
      refetchImports()
    } catch {
      toast.error('প্রশ্ন ইমপোর্ট করতে সমস্যা হয়েছে')
    } finally {
      setIsUploading(false)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="প্রশ্ন ইমপোর্ট ও ইতিহাস"
        description="Excel, Word বা টেক্সট থেকে পাইকারি প্রশ্ন আপলোড করুন এবং পূর্ববর্তী ইমপোর্ট রোলব্যাক করুন"
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

        {/* Tab 1: Upload / Paste */}
        <TabsContent value="upload" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Upload Card (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Target Bank Selection */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">১. টার্গেট প্রশ্নব্যাংক</CardTitle>
                  <CardDescription className="text-xs">
                    যে প্রশ্নব্যাংকে এই প্রশ্নগুলো সংরক্ষিত হবে তা নির্বাচন করুন
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.sharing === 0 ? 'ব্যক্তিগত' : 'প্রাতিষ্ঠানিক'})
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>

              {/* Paste Text Card */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">২. সরাসরি প্রশ্ন পেস্ট করুন (Word / Text)</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    ক্রমিক নম্বর, ক খ গ ঘ অপশন এবং উত্তর: লাইনসহ প্রশ্ন পেস্ট করুন
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handlePasteSubmit}>
                  <CardContent className="space-y-3">
                    <textarea
                      className="w-full min-h-[220px] rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
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
            </div>

            {/* Right Guide Card (1 col) */}
            <div className="space-y-4">
              <Card className="border-border bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <FileSpreadsheet className="size-4 text-emerald-600" />
                    Excel আপলোড নিয়মাবলী
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2.5 text-muted-foreground leading-relaxed">
                  <p>• সর্বাধিক <strong>৫,০০০</strong> টি প্রশ্ন একবারে আপলোড করতে পারবেন।</p>
                  <p>• উত্তর হিসেবে ক, খ, গ, ঘ অথবা A, B, C, D গ্রহণযোগ্য।</p>
                  <p>• কোনো প্রশ্নের অধ্যায় মিল না পেলে ড্রাফট হিসেবে প্রাকদর্শন দেখানো হবে।</p>
                  <p>• আপলোডের পর ৭ দিনের মধ্যে যেকোনো ভুল ইমপোর্ট এক ক্লিকে রোলব্যাক করা যায়।</p>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      onClick={handleDownloadTemplate}
                    >
                      <Download className="size-3.5" />
                      টেমপ্লেট ডাউনলোড করুন
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
                        <TableHead className="text-right">রোলব্যাক</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium text-foreground">
                            {job.fileName || job.sourceType}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {job.bankName}
                          </TableCell>
                          <TableCell className="text-xs">
                            {toBnDigits(job.totals?.total ?? 0)} টি ({toBnDigits(job.totals?.imported ?? 0)} টি সফল)
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                job.status === 5
                                  ? 'success'
                                  : job.status === 7
                                  ? 'destructive'
                                  : 'secondary'
                              }
                              className="text-[11px]"
                            >
                              {job.status === 5
                                ? 'সফলভাবে সম্পন্ন'
                                : job.status === 7
                                ? 'রোলব্যাককৃত'
                                : job.status === 6
                                ? 'ব্যর্থ'
                                : 'প্রসেসিং'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateBn(job.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
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
                    description="Excel ফাইল আপলোড বা সরাসরি প্রশ্ন পেস্ট করে দ্রুত আপনার ব্যাংকে প্রশ্ন যোগ করুন।"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
