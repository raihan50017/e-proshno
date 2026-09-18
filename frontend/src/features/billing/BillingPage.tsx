import {
  Check,
  Crown,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { useGetSubscription, useListPayments } from '@/lib/api/generated/billing/billing'
import { formatDateBn, toBnDigits, toTaka } from '@/lib/bn'

export function BillingPage() {
  const { data: subData } = useGetSubscription()
  const subscription = subData?.data

  const { data: paymentsData, isLoading: paymentsLoading } = useListPayments({})
  const payments = paymentsData?.data?.items || []

  const handleCheckout = (planName: string) => {
    toast.info(`"${planName}" প্যাকেজের জন্য bKash / Nagad পেমেন্ট গেটওয়ে শীঘ্রই চালু হচ্ছে`)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="সাবস্ক্রিপশন ও বিলিং"
        description="আপনার প্রতিষ্ঠানের প্ল্যান, মেয়াদ ও ইনভয়েস ইতিহাস পর্যালোচনা করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'সাবস্ক্রিপশন ও বিলিং' },
        ]}
      />

      {/* Current Subscription Status Card */}
      <Card className="border-border bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Badge variant="success" className="text-xs gap-1 py-1">
              <Crown className="size-3.5" />
              সক্রিয় সাবস্ক্রিপশন
            </Badge>
            {subscription?.endsAt && (
              <span className="text-xs text-muted-foreground">
                মেয়াদ শেষ: <strong className="text-foreground">{formatDateBn(subscription.endsAt)}</strong>
              </span>
            )}
          </div>
          <CardTitle className="text-xl font-bold pt-2">
            {subscription?.subscriptions?.[0]?.planName || 'বিনামূল্যে ট্রায়াল (Trial)'}
          </CardTitle>
          <CardDescription className="text-xs">
            {subscription?.daysLeft !== undefined && subscription.daysLeft !== null
              ? `আর মাত্র ${toBnDigits(subscription.daysLeft)} দিন মেয়াদ বাকি রয়েছে`
              : 'সীমাহীন প্রশ্ন তৈরি ও কাস্টম প্রশ্নব্যাংক ব্যবহারের সুযোগ'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Pricing Packages */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">সাবস্ক্রিপশন প্ল্যানসমূহ</h2>
          <p className="text-xs text-muted-foreground">আপনার প্রতিষ্ঠান ও প্রয়োজনীয়তা অনুযায়ী প্ল্যান বেছে নিন</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              name: 'ব্যক্তিগত শিক্ষক (Starter)',
              price: 400,
              desc: 'ব্যক্তিগত টিউটর ও একক শিক্ষকদের জন্য',
              features: [
                'প্রতি মাসে ৫০টি প্রশ্নসেট',
                'প্ল্যাটফর্ম এনসিটিবি প্রশ্নব্যাংক',
                'A4 ২-কলাম প্রশ্নপত্র প্রিন্ট',
                '৩টি নিজস্ব প্রশ্নব্যাংক',
              ],
              popular: false,
            },
            {
              name: 'কোচিং সেন্টার (Standard)',
              price: 900,
              desc: 'ছোট ও মাঝারি কোচিং সেন্টারের জন্য আদর্শ',
              features: [
                'সীমাহীন প্রশ্নসেট তৈরি',
                'সকল শ্রেণির পূর্ণ সিলেবাস',
                'প্রতিষ্ঠানের নিজস্ব লোগো ও ওয়াটারমার্ক',
                '৫ জন শিক্ষক যুক্ত করার সুযোগ',
                'প্রশ্ন ইমপোর্ট (Excel / Word)',
              ],
              popular: true,
            },
            {
              name: 'স্কুল ও কলেজ (Premium)',
              price: 1800,
              desc: 'উচ্চ বিদ্যালয়, কলেজ ও বৃহৎ প্রতিষ্ঠানের জন্য',
              features: [
                'সবকিছু সীমাহীন',
                'ওএমআর মূল্যায়ন ও মেরিট লিস্ট',
                'অনলাইন পরীক্ষা পোর্টাল',
                'অসীম সংখ্যক শিক্ষক ও শিক্ষার্থী',
                'অগ্রাধিকার ভিআইপি সাপোর্ট',
              ],
              popular: false,
            },
          ].map((plan, idx) => (
            <Card
              key={idx}
              className={`flex flex-col justify-between border transition-all ${
                plan.popular
                  ? 'border-primary shadow-md ring-1 ring-primary relative'
                  : 'border-border'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-[10px] px-2.5 py-0.5 shadow">
                    সবচেয়ে জনপ্রিয়
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-4">
                <CardTitle className="text-base font-bold">{plan.name}</CardTitle>
                <CardDescription className="text-xs">{plan.desc}</CardDescription>
                <div className="pt-3">
                  <span className="text-3xl font-extrabold text-foreground">
                    {toBnDigits(plan.price)} ৳
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">/ মাস</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-2.5 py-2">
                {plan.features.map((feat, fIdx) => (
                  <div key={fIdx} className="flex items-center gap-2 text-xs text-foreground">
                    <Check className="size-3.5 text-primary shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter className="pt-4 border-t border-border/60">
                <Button
                  variant={plan.popular ? 'default' : 'outline'}
                  className="w-full text-xs"
                  onClick={() => handleCheckout(plan.name)}
                >
                  প্ল্যানটি বেছে নিন
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment History Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Receipt className="size-4 text-primary" />
            পেমেন্ট ও ইনভয়েস ইতিহাস
          </CardTitle>
          <CardDescription className="text-xs">
            আপনার অতীত লেনদেন ও অফিশিয়াল মানি রিসিটসমূহ
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
              ))}
            </div>
          ) : payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ট্রানজেকশন আইডি</TableHead>
                  <TableHead>প্ল্যান</TableHead>
                  <TableHead>পরিমাণ</TableHead>
                  <TableHead>গেটওয়ে</TableHead>
                  <TableHead>অবস্থা</TableHead>
                  <TableHead>তারিখ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-foreground">
                      {p.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-xs">{p.planName}</TableCell>
                    <TableCell className="text-xs font-semibold">
                      {toTaka(p.amountPoisha)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.gateway}
                    </TableCell>
                    <TableCell>
                      <Badge variant="success" className="text-[10px]">
                        সফল
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateBn(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">
              কোনো অতীত পেমেন্ট রেকর্ড নেই।
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
