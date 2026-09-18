import * as React from 'react'
import {
  Building2,
  Check,
  CreditCard,
  Crown,
  FileCheck2,
  Flag,
  HelpCircle,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
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
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'

export function AdminPage() {
  const [activeTab, setActiveTab] = React.useState('institutions')

  // Overview KPIs State
  const [overview, setOverview] = React.useState<any>(null)
  const [loadingOverview, setLoadingOverview] = React.useState(true)

  // Institutions State
  const [institutions, setInstitutions] = React.useState<any[]>([])
  const [loadingInstitutions, setLoadingInstitutions] = React.useState(false)
  const [instKeyword, setInstKeyword] = React.useState('')

  // Payments State
  const [payments, setPayments] = React.useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = React.useState(false)

  // Users State
  const [users, setUsers] = React.useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = React.useState(false)
  const [userKeyword, setUserKeyword] = React.useState('')

  // Reports State
  const [reports, setReports] = React.useState<any[]>([])
  const [loadingReports, setLoadingReports] = React.useState(false)
  const [resolvingReportId, setResolvingReportId] = React.useState<string | null>(null)
  const [resolveActionNote, setResolveActionNote] = React.useState('')

  // Announcements State
  const [announcements, setAnnouncements] = React.useState<any[]>([])
  const [loadingAnnouncements, setLoadingAnnouncements] = React.useState(false)
  const [announcementModalOpen, setAnnouncementModalOpen] = React.useState(false)
  const [annTitle, setAnnTitle] = React.useState('')
  const [annBody, setAnnBody] = React.useState('')
  const [isSavingAnnouncement, setIsSavingAnnouncement] = React.useState(false)

  // Grant Subscription Modal State
  const [grantModalOpen, setGrantModalOpen] = React.useState(false)
  const [grantTargetInstId, setGrantTargetInstId] = React.useState('')
  const [grantDays, setGrantDays] = React.useState<number>(365)
  const [availablePlans, setAvailablePlans] = React.useState<any[]>([])
  const [selectedPlanId, setSelectedPlanId] = React.useState('')
  const [isGranting, setIsGranting] = React.useState(false)

  // Role Edit Modal State
  const [editingRoleUser, setEditingRoleUser] = React.useState<any>(null)
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>([])
  const [isSavingRoles, setIsSavingRoles] = React.useState(false)

  // Load Overview Data
  const loadOverview = React.useCallback(async () => {
    setLoadingOverview(true)
    try {
      const res = await apiClient.get<any>('/api/v1/admin/overview')
      setOverview(res.data)
    } catch {
      toast.error('অ্যাডমিন ওভারভিউ লোড করা যায়নি')
    } finally {
      setLoadingOverview(false)
    }
  }, [])

  // Load Institutions
  const loadInstitutions = React.useCallback(async () => {
    setLoadingInstitutions(true)
    try {
      const res = await apiClient.get<any>('/api/v1/admin/institutions', {
        params: { keyword: instKeyword.trim() || undefined, limit: 50 },
      })
      setInstitutions(res.data?.items || [])
    } catch {
      toast.error('প্রতিষ্ঠান তালিকা লোড করা যায়নি')
    } finally {
      setLoadingInstitutions(false)
    }
  }, [instKeyword])

  // Load Payments
  const loadPayments = React.useCallback(async () => {
    setLoadingPayments(true)
    try {
      const res = await apiClient.get<any>('/api/v1/admin/payments', {
        params: { limit: 50 },
      })
      setPayments(res.data?.items || [])
    } catch {
      toast.error('পেমেন্ট তালিকা লোড করা যায়নি')
    } finally {
      setLoadingPayments(false)
    }
  }, [])

  // Load Users
  const loadUsers = React.useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await apiClient.get<any>('/api/v1/admin/users', {
        params: { keyword: userKeyword.trim() || undefined, limit: 50 },
      })
      setUsers(res.data?.items || [])
    } catch {
      toast.error('ব্যবহারকারী তালিকা লোড করা যায়নি')
    } finally {
      setLoadingUsers(false)
    }
  }, [userKeyword])

  // Load Reports
  const loadReports = React.useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await apiClient.get<any>('/api/v1/admin/question-reports', {
        params: { status: 0, limit: 50 },
      })
      setReports(res.data?.items || [])
    } catch {
      toast.error('প্রশ্ন রিপোর্ট লোড করা যায়নি')
    } finally {
      setLoadingReports(false)
    }
  }, [])

  // Load Announcements
  const loadAnnouncements = React.useCallback(async () => {
    setLoadingAnnouncements(true)
    try {
      const res = await apiClient.get<any>('/api/v1/admin/announcements')
      setAnnouncements(res.data || [])
    } catch {
      toast.error('ঘোষণা লোড করা যায়নি')
    } finally {
      setLoadingAnnouncements(false)
    }
  }, [])

  // Load Plans for Grant Subscription
  const loadPlans = React.useCallback(async () => {
    try {
      const res = await apiClient.get<any>('/api/v1/admin/plans')
      const pList = res.data || []
      setAvailablePlans(pList)
      if (pList.length > 0 && !selectedPlanId) {
        setSelectedPlanId(pList[0].plan?.id || pList[0].id)
      }
    } catch {
      // ignore
    }
  }, [selectedPlanId])

  React.useEffect(() => {
    loadOverview()
    loadPlans()
  }, [loadOverview, loadPlans])

  React.useEffect(() => {
    if (activeTab === 'institutions') loadInstitutions()
    else if (activeTab === 'payments') loadPayments()
    else if (activeTab === 'users') loadUsers()
    else if (activeTab === 'reports') loadReports()
    else if (activeTab === 'announcements') loadAnnouncements()
  }, [activeTab, loadInstitutions, loadPayments, loadUsers, loadReports, loadAnnouncements])

  // Unlock User
  const handleUnlockUser = async (userId: string, name: string) => {
    try {
      await apiClient.post(`/api/v1/admin/users/${userId}/unlock`)
      toast.success(`${name}-এর অ্যাকাউন্ট সফলভাবে আনলক করা হয়েছে`)
      loadUsers()
    } catch {
      toast.error('অ্যাকাউন্ট আনলক করতে সমস্যা হয়েছে')
    }
  }

  // Save User Roles
  const handleSaveRoles = async () => {
    if (!editingRoleUser) return
    setIsSavingRoles(true)
    try {
      await apiClient.put(`/api/v1/admin/users/${editingRoleUser.id}/roles`, {
        roles: selectedRoles,
      })
      toast.success(`${editingRoleUser.fullName}-এর ভূমিকা হালনাগাদ করা হয়েছে`)
      setEditingRoleUser(null)
      loadUsers()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'ভূমিকা পরিবর্তন করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsSavingRoles(false)
    }
  }

  // Resolve Question Report
  const handleResolveReport = async () => {
    if (!resolvingReportId) return
    try {
      await apiClient.post(`/api/v1/admin/question-reports/${resolvingReportId}/resolve`, {
        action: 1, // 1 = Fixed
        note: resolveActionNote.trim() || 'সংশোধন সম্পন্ন হয়েছে',
      })
      toast.success('রিপোর্টটি সফলভাবে সমাধান করা হয়েছে!')
      setResolvingReportId(null)
      setResolveActionNote('')
      loadReports()
      loadOverview()
    } catch {
      toast.error('রিপোর্ট সমাধান করতে সমস্যা হয়েছে')
    }
  }

  // Save Announcement
  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!annTitle.trim() || !annBody.trim()) {
      toast.error('ঘোষণার শিরোনাম ও বিবরণ পূরণ করুন')
      return
    }

    setIsSavingAnnouncement(true)
    try {
      await apiClient.post('/api/v1/admin/announcements', {
        titleBn: annTitle.trim(),
        bodyBn: annBody.trim(),
        levelSlugs: [],
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
      })
      toast.success('নতুন ঘোষণা সফলভাবে প্রকাশিত হয়েছে!')
      setAnnouncementModalOpen(false)
      setAnnTitle('')
      setAnnBody('')
      loadAnnouncements()
    } catch {
      toast.error('ঘোষণা তৈরি করতে সমস্যা হয়েছে')
    } finally {
      setIsSavingAnnouncement(false)
    }
  }

  // Delete Announcement
  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/admin/announcements/${id}`)
      toast.success('ঘোষণাটি মুছে ফেলা হয়েছে')
      loadAnnouncements()
    } catch {
      toast.error('ঘোষণা মুছতে সমস্যা হয়েছে')
    }
  }

  // Grant Subscription
  const handleGrantSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!grantTargetInstId || !selectedPlanId) {
      toast.error('প্রতিষ্ঠান ও প্ল্যান নির্বাচন করুন')
      return
    }

    setIsGranting(true)
    try {
      await apiClient.post('/api/v1/admin/subscriptions', {
        institutionId: grantTargetInstId,
        planId: selectedPlanId,
        days: grantDays,
        subjectIds: [],
      })
      toast.success('সাবস্ক্রিপশন সফলভাবে সক্রিয় করা হয়েছে!')
      setGrantModalOpen(false)
      loadOverview()
      loadInstitutions()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'সাবস্ক্রিপশন প্রদান করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsGranting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <PageHeader
        title="প্ল্যাটফর্ম ব্যাক-অফিস অ্যাডমিন প্যানেল"
        description="সার্বিক প্রতিষ্ঠান, ব্যবহারকারী, পেমেন্ট ভেরিফিকেশন ও প্ল্যাটফর্ম মাননিয়ন্ত্রণ"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'ব্যাক-অফিস' },
        ]}
        actions={
          <Button
            className="gap-2 shadow-sm font-semibold bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => setGrantModalOpen(true)}
          >
            <Crown className="size-4" />
            সাবস্ক্রিপশন মঞ্জুর করুন
          </Button>
        }
      />

      {/* Overview KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="মোট ব্যবহারকারী"
          value={overview?.users ?? 0}
          subtitle="নিবন্ধিত শিক্ষক ও সদস্য"
          icon={Users}
          loading={loadingOverview}
        />
        <StatCard
          title="নিবন্ধিত প্রতিষ্ঠান"
          value={overview?.institutions ?? 0}
          subtitle="স্কুল, কলেজ ও একাডেমি"
          icon={Building2}
          loading={loadingOverview}
        />
        <StatCard
          title="পেইড সাবস্ক্রিপশন"
          value={overview?.paidSubscriptions ?? 0}
          subtitle="সক্রিয় প্রিমিয়াম সদস্য"
          icon={Crown}
          loading={loadingOverview}
        />
        <StatCard
          title="চলতি মাসের মোট আয়"
          value={overview?.revenueThisMonthPoisha ? `৳ ${toBnDigits(Math.round(overview.revenueThisMonthPoisha / 100))}` : '৳ ০'}
          subtitle="পেমেন্ট ও নবায়ন রাজস্ব"
          icon={CreditCard}
          loading={loadingOverview}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">প্রকাশিত প্রশ্নভান্ডার</p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {toBnDigits(overview?.publishedQuestions ?? 0)} টি
            </p>
          </div>
          <FileCheck2 className="size-8 text-emerald-500/60" />
        </Card>

        <Card className="border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">পর্যালোচনাধীন প্রশ্ন</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {toBnDigits(overview?.questionsInReview ?? 0)} টি
            </p>
          </div>
          <HelpCircle className="size-8 text-amber-500/60" />
        </Card>

        <Card className="border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">সমাধানযোগ্য রিপোর্ট</p>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              {toBnDigits(overview?.openReports ?? 0)} টি
            </p>
          </div>
          <Flag className="size-8 text-rose-500/60" />
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/80 p-1 border border-border flex flex-wrap h-auto">
          <TabsTrigger value="institutions" className="gap-1.5 text-xs font-medium">
            <Building2 className="size-3.5" />
            প্রতিষ্ঠানসমূহ
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5 text-xs font-medium">
            <CreditCard className="size-3.5" />
            পেমেন্ট ও লেনদেন
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 text-xs font-medium">
            <Users className="size-3.5" />
            ব্যবহারকারী ও ভূমিকা
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5 text-xs font-medium">
            <Flag className="size-3.5" />
            প্রশ্ন রিপোর্ট ({toBnDigits(overview?.openReports ?? 0)})
          </TabsTrigger>
          <TabsTrigger value="announcements" className="gap-1.5 text-xs font-medium">
            <Megaphone className="size-3.5" />
            নোটিশ ও ঘোষণা
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: INSTITUTIONS ────────────────────────────────────────── */}
        <TabsContent value="institutions" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">প্ল্যাটফর্ম প্রতিষ্ঠান তালিকা</CardTitle>
                <CardDescription className="text-xs">
                  নিবন্ধিত সকল শিক্ষা প্রতিষ্ঠান ও তাদের সক্রিয় সাবস্ক্রিপশন প্ল্যান
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="প্রতিষ্ঠানের নাম বা ফোন..."
                    value={instKeyword}
                    onChange={(e) => setInstKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadInstitutions()}
                    className="pl-8 text-xs h-8"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={loadInstitutions} className="h-8 text-xs">
                  খুঁজুন
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingInstitutions ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : institutions.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">প্রতিষ্ঠানের নাম</TableHead>
                        <TableHead className="text-xs font-semibold">মালিক ও ফোন</TableHead>
                        <TableHead className="text-xs font-semibold">সদস্য</TableHead>
                        <TableHead className="text-xs font-semibold">সক্রিয় প্ল্যান</TableHead>
                        <TableHead className="text-xs font-semibold">তৈরির তারিখ</TableHead>
                        <TableHead className="text-right text-xs font-semibold">অ্যাকশন</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {institutions.map((inst) => (
                        <TableRow key={inst.id} className="hover:bg-muted/30 text-xs">
                          <TableCell className="font-semibold text-foreground">
                            {inst.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <p>{inst.ownerName || '—'}</p>
                            <p className="text-[11px]">{inst.ownerPhone ? toBnDigits(inst.ownerPhone) : inst.phone || ''}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[11px]">
                              {toBnDigits(inst.members)} জন
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={inst.activePlan ? 'default' : 'outline'} className="text-[10px]">
                              {inst.activePlan || 'ফ্রি ট্রায়াল'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatDateBn(inst.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                setGrantTargetInstId(inst.id)
                                setGrantModalOpen(true)
                              }}
                            >
                              <Crown className="size-3 text-amber-500" />
                              প্ল্যান দিন
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  কোনো প্রতিষ্ঠান পাওয়া যায়নি।
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 2: PAYMENTS ────────────────────────────────────────────── */}
        <TabsContent value="payments" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">পেমেন্ট ও সাবস্ক্রিপশন লেনদেন</CardTitle>
                <CardDescription className="text-xs">
                  bKash, Nagad এবং ম্যানুয়াল ট্রান্সফার পেমেন্ট হিস্ট্রি
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadPayments} className="h-8 gap-1.5 text-xs">
                <RefreshCw className="size-3.5" />
                রিফ্রেশ
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingPayments ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : payments.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">প্রতিষ্ঠান</TableHead>
                        <TableHead className="text-xs font-semibold">ট্রানজ্যাকশন আইডি (TrxID)</TableHead>
                        <TableHead className="text-xs font-semibold">মাধ্যম</TableHead>
                        <TableHead className="text-xs font-semibold">পরিমাণ</TableHead>
                        <TableHead className="text-xs font-semibold">স্ট্যাটাস</TableHead>
                        <TableHead className="text-xs font-semibold">তারিখ</TableHead>
                        <TableHead className="text-right text-xs font-semibold">অ্যাকশন</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => {
                        const isPending = p.payment?.status === 0
                        return (
                          <TableRow key={p.payment?.id || p.institutionId} className="hover:bg-muted/30 text-xs">
                            <TableCell className="font-semibold text-foreground">
                              {p.institutionName}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {p.payment?.tranId || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {p.payment?.gateway || 'Manual'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold text-foreground">
                              ৳ {toBnDigits(Math.round((p.payment?.amountPoisha || 0) / 100))}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={p.payment?.status === 1 ? 'default' : isPending ? 'secondary' : 'destructive'}
                                className="text-[10px]"
                              >
                                {p.payment?.status === 1 ? 'পরিশোধিত' : isPending ? 'অপেক্ষমাণ' : 'ব্যর্থ'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {p.payment?.createdAt ? formatDateBn(p.payment.createdAt) : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setGrantTargetInstId(p.institutionId)
                                  setGrantModalOpen(true)
                                }}
                              >
                                <Crown className="size-3 text-amber-500" />
                                প্ল্যান অনুমোদন
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  কোনো পেমেন্ট রেকর্ড পাওয়া যায়নি।
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 3: USERS & ROLES ───────────────────────────────────────── */}
        <TabsContent value="users" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">ব্যবহারকারী ও প্ল্যাটফর্ম ভূমিকা</CardTitle>
                <CardDescription className="text-xs">
                  নিবন্ধিত সদস্যবৃন্দের সুপারঅ্যাডমিন, কনটেন্টটিম ও সাপোর্ট রোল পরিচালনা
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="নাম, ফোন বা ইমেইল..."
                    value={userKeyword}
                    onChange={(e) => setUserKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                    className="pl-8 text-xs h-8"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={loadUsers} className="h-8 text-xs">
                  খুঁজুন
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : users.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">নাম</TableHead>
                        <TableHead className="text-xs font-semibold">যোগাযোগ</TableHead>
                        <TableHead className="text-xs font-semibold">প্ল্যাটফর্ম ভূমিকা</TableHead>
                        <TableHead className="text-xs font-semibold">যুক্ত প্রতিষ্ঠান</TableHead>
                        <TableHead className="text-xs font-semibold">লকড আউট</TableHead>
                        <TableHead className="text-right text-xs font-semibold">অ্যাকশন</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id} className="hover:bg-muted/30 text-xs">
                          <TableCell className="font-semibold text-foreground">
                            {u.fullName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <p>{u.phone ? toBnDigits(u.phone) : u.email || '—'}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              {u.roles && u.roles.length > 0 ? (
                                u.roles.map((r: string) => (
                                  <Badge key={r} variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                                    {r}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-[11px]">সাধারণ শিক্ষক</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {toBnDigits(u.institutions)} টি
                          </TableCell>
                          <TableCell>
                            {u.lockedOut ? (
                              <Badge variant="destructive" className="text-[10px]">
                                লকড
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                সক্রিয়
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {u.lockedOut && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700"
                                  onClick={() => handleUnlockUser(u.id, u.fullName)}
                                >
                                  <Unlock className="size-3" />
                                  আনলক
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  setEditingRoleUser(u)
                                  setSelectedRoles(u.roles || [])
                                }}
                              >
                                <Shield className="size-3" />
                                ভূমিকা
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  কোনো ব্যবহারকারী পাওয়া যায়নি।
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 4: QUESTION REPORTS ────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">শিক্ষকদের প্রশ্ন রিপোর্ট ও অসঙ্গতি</CardTitle>
                <CardDescription className="text-xs">
                  ভুল উত্তর, বানান ত্রুটি বা বিভ্রান্তিকর প্রশ্ন পর্যালোচনার তালিকা
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={loadReports} className="h-8 gap-1.5 text-xs">
                <RefreshCw className="size-3.5" />
                রিফ্রেশ
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingReports ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : reports.length > 0 ? (
                <div className="divide-y divide-border">
                  {reports.map((rep) => (
                    <div key={rep.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs hover:bg-muted/20 transition-colors">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-[10px]">
                            {rep.reason || 'অসঙ্গতি রিপোর্ট'}
                          </Badge>
                          <span className="text-muted-foreground text-[11px]">
                            তারিখ: {formatDateBn(rep.createdAt)}
                          </span>
                        </div>
                        <p className="font-semibold text-foreground text-sm line-clamp-2">
                          {rep.questionStem || 'প্রশ্নের মূলভাব...'}
                        </p>
                        {rep.details && (
                          <p className="text-muted-foreground bg-muted/40 p-2 rounded border border-border text-[11px]">
                            বিস্তারিত: {rep.details}
                          </p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        className="shrink-0 gap-1 text-xs font-semibold"
                        onClick={() => setResolvingReportId(rep.id)}
                      >
                        <Check className="size-3.5" />
                        সমাধান সম্পন্ন
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  বর্তমানে কোনো অনিষ্পন্ন প্রশ্ন রিপোর্ট নেই।
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 5: ANNOUNCEMENTS ───────────────────────────────────────── */}
        <TabsContent value="announcements" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">প্ল্যাটফর্ম ঘোষণা ও নোটিশবোর্ড</CardTitle>
                <CardDescription className="text-xs">
                  শিক্ষক ও প্রতিষ্ঠানের ড্যাশবোর্ডে প্রদর্শিত জরুরি নোটিশসমূহ
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs font-semibold"
                onClick={() => setAnnouncementModalOpen(true)}
              >
                <Plus className="size-3.5" />
                নতুন নোটিশ লিখুন
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAnnouncements ? (
                <div className="p-6 space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : announcements.length > 0 ? (
                <div className="divide-y divide-border">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="p-4 flex items-start justify-between gap-4 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-[10px]">
                            সক্রিয় ঘোষণা
                          </Badge>
                          <span className="text-muted-foreground text-[11px]">
                            {formatDateBn(ann.createdAt)}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground">{ann.titleBn}</h4>
                        <p className="text-muted-foreground leading-relaxed">{ann.bodyBn}</p>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  কোনো সক্রিয় প্ল্যাটফর্ম ঘোষণা নেই।
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Modal: Grant Subscription ───────────────────────────────────────── */}
      <Dialog open={grantModalOpen} onOpenChange={setGrantModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleGrantSubscription}>
            <DialogHeader>
              <div className="flex items-center gap-2 text-amber-600">
                <Crown className="size-5" />
                <DialogTitle>প্রতিষ্ঠানকে সাবস্ক্রিপশন মঞ্জুর করুন</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                অফলাইন পেমেন্ট ভেরিফিকেশন বা বিশেষ সহযোগিতার জন্য সাবস্ক্রিপশন প্ল্যান সক্রিয় করুন
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="grantInst" className="text-xs font-semibold">
                  টার্গেট প্রতিষ্ঠান আইডি *
                </Label>
                <Input
                  id="grantInst"
                  placeholder="প্রতিষ্ঠান আইডি লিখুন..."
                  value={grantTargetInstId}
                  onChange={(e) => setGrantTargetInstId(e.target.value)}
                  required
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">সাবস্ক্রিপশন প্ল্যান *</Label>
                <div className="space-y-2">
                  {availablePlans.map((p) => {
                    const planId = p.plan?.id || p.id
                    const planName = p.plan?.nameBn || p.nameBn || 'প্ল্যান'
                    const isSelected = selectedPlanId === planId
                    return (
                      <button
                        key={planId}
                        type="button"
                        onClick={() => setSelectedPlanId(planId)}
                        className={`w-full p-2.5 rounded-lg border text-left text-xs transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-input bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="font-semibold text-foreground">{planName}</span>
                        {isSelected && <Check className="size-4 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grantDays" className="text-xs font-semibold">
                  মেয়াদ (দিন) *
                </Label>
                <Input
                  id="grantDays"
                  type="number"
                  min={1}
                  max={1000}
                  value={grantDays}
                  onChange={(e) => setGrantDays(Number(e.target.value))}
                  required
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGrantModalOpen(false)}
                disabled={isGranting}
                className="text-xs"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                loading={isGranting}
                loadingText="সক্রিয় হচ্ছে..."
                className="gap-1.5 text-xs font-semibold"
              >
                <Crown className="size-3.5" />
                সাবস্ক্রিপশন চালু করুন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: User Roles Assignment ─────────────────────────────────────── */}
      <Dialog open={Boolean(editingRoleUser)} onOpenChange={(open) => !open && setEditingRoleUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Shield className="size-5" />
              <DialogTitle>প্ল্যাটফর্ম ভূমিকা নির্ধারণ</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              <strong className="text-foreground">{editingRoleUser?.fullName}</strong>-এর জন্য প্ল্যাটফর্ম অ্যাক্সেস রোল নির্ধারণ করুন
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {[
              { id: 'SuperAdmin', label: 'সুপার অ্যাডমিন (SuperAdmin)', desc: 'প্ল্যাটফর্মের সকল সেটিংস, পেমেন্ট ও ব্যাক-অফিস নিয়ন্ত্রণ' },
              { id: 'ContentTeam', label: 'কনটেন্ট টিম (ContentTeam)', desc: 'প্রশ্নভাণ্ডার তৈরি, সম্পাদনা ও সিলেবাস মডারেশন' },
              { id: 'Support', label: 'সাপোর্ট (Support)', desc: 'ব্যবহারকারী সহায়তা ও প্রশ্ন রিপোর্ট পর্যালোচনা' },
            ].map((r) => {
              const checked = selectedRoles.includes(r.id)
              return (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRoles((prev) => [...prev, r.id])
                      } else {
                        setSelectedRoles((prev) => prev.filter((role) => role !== r.id))
                      }
                    }}
                    className="rounded border-input text-primary focus:ring-primary mt-0.5"
                  />
                  <div className="space-y-0.5 text-xs">
                    <p className="font-semibold text-foreground">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground">{r.desc}</p>
                  </div>
                </label>
              )
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRoleUser(null)}
              disabled={isSavingRoles}
              className="text-xs"
            >
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={handleSaveRoles}
              loading={isSavingRoles}
              loadingText="সংরক্ষণ হচ্ছে..."
              className="text-xs font-semibold"
            >
              সংরক্ষণ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Create Announcement ───────────────────────────────────────── */}
      <Dialog open={announcementModalOpen} onOpenChange={setAnnouncementModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveAnnouncement}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">নতুন প্ল্যাটফর্ম ঘোষণা</DialogTitle>
              <DialogDescription className="text-xs">
                এই ঘোষণাটি ড্যাশবোর্ডে সকল শিক্ষক ও প্রতিষ্ঠানের সামনে প্রদর্শিত হবে
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="annT" className="text-xs font-semibold">
                  ঘোষণার শিরোনাম *
                </Label>
                <Input
                  id="annT"
                  placeholder="যেমন: আগামী শুক্রবার নির্ধারিত সিস্টেম মেইনটেন্যান্স..."
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="annB" className="text-xs font-semibold">
                  বিস্তারিত নোটিশ বার্তা *
                </Label>
                <textarea
                  id="annB"
                  rows={4}
                  placeholder="বিস্তারিত বার্তা এখানে লিখুন..."
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAnnouncementModalOpen(false)}
                disabled={isSavingAnnouncement}
                className="text-xs"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                loading={isSavingAnnouncement}
                loadingText="প্রকাশ হচ্ছে..."
                className="text-xs font-semibold"
              >
                ঘোষণা প্রকাশ করুন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation Modal: Resolve Question Report ─────────────────────── */}
      <ConfirmDialog
        open={Boolean(resolvingReportId)}
        onOpenChange={(open) => !open && setResolvingReportId(null)}
        title="প্রশ্ন রিপোর্ট সমাধানের নিশ্চিতকরণ"
        description="আপনি কি নিশ্চিতভাবে এই রিপোর্টটি 'সমাধান সম্পন্ন' হিসেবে চিহ্নিত করতে চান?"
        confirmText="সমাধান সম্পন্ন করুন"
        cancelText="বাতিল"
        onConfirm={handleResolveReport}
      />
    </div>
  )
}
