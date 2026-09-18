import * as React from 'react'
import {
  Mail,
  MessageCircle,
  Phone,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/page-header'

export function SupportPage() {
  const [feedbackSubject, setFeedbackSubject] = React.useState('')
  const [feedbackMessage, setFeedbackMessage] = React.useState('')
  const [isSending, setIsSending] = React.useState(false)

  const handleSendFeedback = (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedbackMessage.trim()) {
      toast.error('অনুগ্রহ করে আপনার মতামত বা প্রশ্ন লিখুন')
      return
    }

    setIsSending(true)
    setTimeout(() => {
      setIsSending(false)
      toast.success('আপনার মূল্যবান মতামত গ্রহণ করা হয়েছে। ধন্যবাদ!')
      setFeedbackSubject('')
      setFeedbackMessage('')
    }, 600)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="সহায়তা ও যোগাযোগ"
        description="ই-প্রশ্ন প্ল্যাটফর্ম ব্যবহার সংক্রান্ত যেকোনো জিজ্ঞাসা ও তাৎক্ষণিক সহায়তা"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'সাপোর্ট' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Support Channels (1 col) */}
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">যোগাযোগ মাধ্যম</CardTitle>
              <CardDescription className="text-xs">
                আমাদের সাপোর্ট টিম সকাল ৯টা থেকে রাত ১০টা পর্যন্ত সক্রিয়
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <a
                href="https://wa.me/8801700000000"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 transition-colors text-foreground"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <MessageCircle className="size-4" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">WhatsApp সাপোর্ট</p>
                  <p className="text-muted-foreground text-[11px]">তাৎক্ষণিক বার্তা আদান-প্রদান</p>
                </div>
              </a>

              <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Phone className="size-4" />
                </div>
                <div>
                  <p className="font-semibold">হটলাইন হেল্পলাইন</p>
                  <p className="text-muted-foreground text-[11px]">+৮৮০ ১৭০০-০০০০০০</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                  <Mail className="size-4" />
                </div>
                <div>
                  <p className="font-semibold">ইমেইল সাপোর্ট</p>
                  <p className="text-muted-foreground text-[11px]">support@eproshno.bd</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feedback Form (2 cols) */}
        <div className="lg:col-span-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">মতামত ও পরামর্শ পাঠান</CardTitle>
              <CardDescription className="text-xs">
                কোনো নতুন ফিচার বা সংশোধন প্রয়োজন হলে সরাসরি আমাদের ডেভেলপমেন্ট টিমকে জানান
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSendFeedback}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fbSubject">বিষয় (Subject)</Label>
                  <Input
                    id="fbSubject"
                    placeholder="যেমন: গণিত সমীকরণ টাইপ সংক্রান্ত পরামর্শ"
                    value={feedbackSubject}
                    onChange={(e) => setFeedbackSubject(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fbMessage">বার্তা বা মতামত *</Label>
                  <textarea
                    id="fbMessage"
                    className="w-full min-h-[160px] rounded-md border border-input bg-background p-3 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans"
                    placeholder="আপনার মতামত বিস্তারিত লিখুন..."
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    loading={isSending}
                    loadingText="পাঠানো হচ্ছে..."
                    className="gap-2 text-xs"
                  >
                    <Send className="size-3.5" />
                    মতামত পাঠান
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
