import * as React from 'react'
import {
  Download,
  FolderPlus,
  Lock,
  Plus,
  Share2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { useListBanks } from '@/lib/api/generated/question-banks/question-banks'
import { apiClient } from '@/lib/api-client'
import { toBnDigits } from '@/lib/bn'

export function MyBanksPage() {
  const { data, isLoading, refetch } = useListBanks()
  const banks = data?.data || []

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [bankName, setBankName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [sharing, setSharing] = React.useState<'Private' | 'Institution'>('Private')
  const [isCreating, setIsCreating] = React.useState(false)

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bankName.trim()) {
      toast.error('ব্যাংকের নাম লিখুন')
      return
    }

    setIsCreating(true)
    try {
      await apiClient.post('/api/v1/question-banks', {
        name: bankName.trim(),
        description: description.trim() || undefined,
        sharing: sharing === 'Private' ? 0 : 1,
        requireApproval: false,
      })

      toast.success('নতুন প্রশ্নব্যাংক সফলভাবে তৈরি হয়েছে!')
      setDialogOpen(false)
      setBankName('')
      setDescription('')
      refetch()
    } catch {
      toast.error('প্রশ্নব্যাংক তৈরি করতে সমস্যা হয়েছে')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="আমার প্রশ্নব্যাংক"
        description="আপনার নিজস্ব বা প্রতিষ্ঠানের জন্য তৈরি কাস্টম প্রশ্নব্যাংক ব্যবস্থাপনা করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'আমার প্রশ্নব্যাংক' },
        ]}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-sm">
                <Plus className="size-4" />
                নতুন প্রশ্নব্যাংক তৈরি
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateBank}>
                <DialogHeader>
                  <DialogTitle>নতুন প্রশ্নব্যাংক তৈরি করুন</DialogTitle>
                  <DialogDescription className="text-xs">
                    ব্যাংকের নাম এবং শেয়ারিং সেটিংস নির্ধারণ করুন
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName">ব্যাংকের নাম *</Label>
                    <Input
                      id="bankName"
                      placeholder="যেমন: এইচএসসি রসায়ন - মডেল টেস্ট স্পেশাল"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">বিবরণ (ঐচ্ছিক)</Label>
                    <Input
                      id="description"
                      placeholder="ব্যাংকটির লক্ষ্য ও উদ্দেশ্য..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>শেয়ারিং মোড</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSharing('Private')}
                        className={`p-3 rounded-lg border text-left text-xs transition-all ${
                          sharing === 'Private'
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-input bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="font-semibold block flex items-center gap-1.5">
                          <Lock className="size-3.5" />
                          ব্যক্তিগত (Private)
                        </span>
                        <span className="opacity-75 mt-0.5 block">শুধু আপনি দেখতে ও ব্যবহার করতে পারবেন</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSharing('Institution')}
                        className={`p-3 rounded-lg border text-left text-xs transition-all ${
                          sharing === 'Institution'
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-input bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="font-semibold block flex items-center gap-1.5">
                          <Users className="size-3.5" />
                          প্রাতিষ্ঠানিক (Shared)
                        </span>
                        <span className="opacity-75 mt-0.5 block">প্রতিষ্ঠানের সকল শিক্ষক ব্যবহার করতে পারবেন</span>
                      </button>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={isCreating}
                  >
                    বাতিল
                  </Button>
                  <Button
                    type="submit"
                    loading={isCreating}
                    loadingText="তৈরি হচ্ছে..."
                  >
                    ব্যাংক তৈরি করুন
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Bank Cards Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-lg bg-muted/60 animate-pulse border border-border" />
          ))}
        </div>
      ) : banks.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((bank) => (
            <Card key={bank.id} className="border-border flex flex-col justify-between hover:border-primary/40 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant={bank.sharing === 0 ? 'secondary' : 'info'} className="text-[11px] gap-1">
                    {bank.sharing === 0 ? (
                      <>
                        <Lock className="size-3" /> ব্যক্তিগত
                      </>
                    ) : (
                      <>
                        <Share2 className="size-3" /> প্রাতিষ্ঠানিক
                      </>
                    )}
                  </Badge>
                  {bank.isDefault && (
                    <Badge variant="outline" className="text-[10px]">
                      ডিফল্ট
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base font-semibold pt-2 leading-snug">
                  {bank.name}
                </CardTitle>
                {bank.description && (
                  <CardDescription className="text-xs line-clamp-2">
                    {bank.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="py-2">
                <div className="flex items-center justify-between text-xs py-2 border-t border-border/60">
                  <span className="text-muted-foreground">সংরক্ষিত প্রশ্ন:</span>
                  <span className="font-bold text-foreground text-sm">
                    {toBnDigits(bank.questionCount)} টি
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-1 text-muted-foreground">
                  <span>তৈরি করেছেন:</span>
                  <span>{bank.ownerName}</span>
                </div>
              </CardContent>

              <CardFooter className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 bg-muted/20">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex-1"
                  onClick={() => {
                    window.location.href = `/question-bank?bankId=${bank.id}`
                  }}
                >
                  প্রশ্ন দেখুন
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => {
                    toast.info(`"${bank.name}" এক্সপোর্ট প্রস্তুত করা হচ্ছে...`)
                  }}
                >
                  <Download className="size-3.5" />
                  এক্সপোর্ট
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderPlus}
          title="কোনো কাস্টম প্রশ্নব্যাংক পাওয়া যায়নি"
          description="আপনার নিজস্ব প্রশ্ন সংগ্রহ বা মডেল টেস্ট সংরক্ষণের জন্য একটি নতুন ব্যাংক তৈরি করুন।"
          actionLabel="নতুন প্রশ্নব্যাংক তৈরি করুন"
          onAction={() => setDialogOpen(true)}
        />
      )}
    </div>
  )
}
