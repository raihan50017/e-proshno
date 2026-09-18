import { Link } from 'react-router-dom'
import {
  BookOpen,
  Database,
  FilePlus2,
  Files,
  GraduationCap,
  Megaphone,
  Printer,
  Sparkles,
  UploadCloud,
  Users,
} from 'lucide-react'
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
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { useGetDashboard } from '@/lib/api/generated/dashboard/dashboard'
import { formatDateBn, toBnDigits } from '@/lib/bn'

export function DashboardPage() {
  const { data, isLoading } = useGetDashboard()
  const dashboard = data?.data

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={dashboard?.userName ? `স্বাগতম, ${dashboard.userName}!` : 'ড্যাশবোর্ড'}
        description={
          dashboard?.institutionName
            ? `${dashboard.institutionName} · আজকের সার্বিক চিত্র এবং দ্রুত কার্যক্রম`
            : 'আজকের সার্বিক চিত্র এবং দ্রুত কার্যক্রম'
        }
        actions={
          <Link to="/generate">
            <Button className="gap-2 shadow-sm">
              <Sparkles className="size-4" />
              ১ ক্লিকে প্রশ্ন তৈরি করুন
            </Button>
          </Link>
        }
      />

      {/* Announcements Banner (if any) */}
      {dashboard?.announcements && dashboard.announcements.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Megaphone className="size-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              {dashboard.announcements[0].titleBn}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {dashboard.announcements[0].bodyBn}
            </p>
          </div>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="মোট তৈরি প্রশ্নসেট"
          value={dashboard?.counters.sets ?? 0}
          subtitle="মুদ্রণ ও পরীক্ষার উপযোগী"
          icon={Files}
          loading={isLoading}
        />
        <StatCard
          title="নিজস্ব প্রশ্নব্যাংক"
          value={dashboard?.counters.myQuestions ?? 0}
          subtitle="সংরক্ষিত কাস্টম প্রশ্ন"
          icon={Database}
          loading={isLoading}
        />
        <StatCard
          title="নিবন্ধিত শিক্ষার্থী"
          value={dashboard?.counters.students ?? 0}
          subtitle="ব্যাচ ও সেকশন অন্তর্ভুক্ত"
          icon={GraduationCap}
          loading={isLoading}
        />
        <StatCard
          title="যুক্ত শিক্ষক"
          value={dashboard?.counters.teachers ?? 0}
          subtitle="কার্যকর সদস্য"
          icon={Users}
          loading={isLoading}
        />
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Link to="/generate" className="group">
          <Card className="h-full border border-border/80 transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">১ ক্লিকে প্রশ্নপত্র</p>
                <p className="text-xs text-muted-foreground">তাত্ক্ষণিক প্রশ্ন নির্বাচন ও প্রিন্ট</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/question-bank" className="group">
          <Card className="h-full border border-border/80 transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                <BookOpen className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">প্রশ্নব্যাংক ব্রাউজ</p>
                <p className="text-xs text-muted-foreground">সিলেবাস ও বোর্ডভিত্তিক প্রশ্ন</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/imports" className="group">
          <Card className="h-full border border-border/80 transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <UploadCloud className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">প্রশ্ন ইমপোর্ট</p>
                <p className="text-xs text-muted-foreground">Excel, Word বা টেক্সট আপলোড</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/students" className="group">
          <Card className="h-full border border-border/80 transition-colors hover:border-primary/50 hover:bg-muted/30">
            <CardContent className="p-4 flex items-center gap-3.5">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <GraduationCap className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">শিক্ষার্থী ব্যবস্থাপনা</p>
                <p className="text-xs text-muted-foreground">ব্যাচ ও রোল নম্বর পরিচালনা</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Question Sets Section */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg font-semibold">সম্প্রতি তৈরি প্রশ্নসেট</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              আপনার প্রতিষ্ঠানে সাম্প্রতিক তৈরি ও মুদ্রিত প্রশ্নপত্রসমূহ
            </CardDescription>
          </div>
          <Link to="/sets">
            <Button variant="ghost" size="sm" className="text-xs">
              সব দেখুন →
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {dashboard?.recentSets && dashboard.recentSets.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>শিরোনাম</TableHead>
                    <TableHead>শ্রেণি ও বিষয়</TableHead>
                    <TableHead>প্রশ্ন সংখ্যা</TableHead>
                    <TableHead>সময় ও পূর্ণমান</TableHead>
                    <TableHead>তারিখ</TableHead>
                    <TableHead className="text-right">অ্যাকশন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentSets.map((set) => (
                    <TableRow key={set.id}>
                      <TableCell className="font-medium text-foreground">
                        {set.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {set.levelName} · {set.subjectLabel}
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
                        <Link to={`/sets?id=${set.id}`}>
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                            <Printer className="size-3.5" />
                            প্রিন্ট
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={FilePlus2}
              title="এখনও কোনো প্রশ্নসেট তৈরি করা হয়নি"
              description="১ ক্লিকে আপনার সিলেবাস ও অধ্যায় নির্বাচন করে চমৎকার প্রশ্নপত্র তৈরি করুন"
              actionLabel="নতুন প্রশ্ন তৈরি করুন"
              onAction={() => {
                window.location.href = '/generate'
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
