import * as React from 'react'
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  MapPin,
  School,
  Settings2,
  Trash2,
  UserCog,
  UserPlus,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PageHeader } from '@/components/shared/page-header'
import { useAuth } from '@/features/auth/auth-context'
import {
  useGetInstitution,
  useListInvitations,
  useListMembers,
} from '@/lib/api/generated/institution/institution'
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'

export function InstitutionPage() {
  const { activeInstitution } = useAuth()

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: instData, refetch: refetchInstitution } = useGetInstitution()
  const institution = instData?.data

  const { data: membersData, isLoading: membersLoading, refetch: refetchMembers } = useListMembers()
  const members = membersData?.data || []

  const { data: invitesData, isLoading: invitesLoading, refetch: refetchInvites } = useListInvitations()
  const invitations = invitesData?.data || []

  // ── Tab State ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState('members')

  // ── Invite Dialog State ─────────────────────────────────────────────────
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false)
  const [inviteName, setInviteName] = React.useState('')
  const [invitePhone, setInvitePhone] = React.useState('')
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteRole, setInviteRole] = React.useState<number>(2) // 2 = Teacher, 1 = Admin
  const [isInviting, setIsInviting] = React.useState(false)

  // ── Created Invite Link Modal ───────────────────────────────────────────
  const [createdLinkModalOpen, setCreatedLinkModalOpen] = React.useState(false)
  const [createdInviteLink, setCreatedInviteLink] = React.useState('')
  const [copiedLink, setCopiedLink] = React.useState(false)

  // ── Revoke Invite State ─────────────────────────────────────────────────
  const [revokeTargetId, setRevokeTargetId] = React.useState<string | null>(null)
  const [isRevoking, setIsRevoking] = React.useState(false)

  // ── Change Role State ───────────────────────────────────────────────────
  const [roleChangeTarget, setRoleChangeTarget] = React.useState<{ userId: string; fullName: string; role: number } | null>(null)
  const [newSelectedRole, setNewSelectedRole] = React.useState<number>(2)
  const [isChangingRole, setIsChangingRole] = React.useState(false)

  // ── Remove Member State ─────────────────────────────────────────────────
  const [removeMemberTarget, setRemoveMemberTarget] = React.useState<{ userId: string; fullName: string } | null>(null)
  const [isRemovingMember, setIsRemovingMember] = React.useState(false)

  // ── Paper Defaults State ────────────────────────────────────────────────
  const [watermark, setWatermark] = React.useState('')
  const [instructions, setInstructions] = React.useState('')
  const [columns, setColumns] = React.useState<number>(2)
  const [fontFamily, setFontFamily] = React.useState<number>(0) // 0 = NotoSerifBengali, 1 = HindSiliguri
  const [fontSizePt, setFontSizePt] = React.useState<number>(11)
  const [headerInstitution, setHeaderInstitution] = React.useState(true)
  const [headerLevel, setHeaderLevel] = React.useState(true)
  const [headerSubject, setHeaderSubject] = React.useState(true)
  const [headerChapter, setHeaderChapter] = React.useState(true)
  const [headerStudentInfo, setHeaderStudentInfo] = React.useState(false)
  const [headerSetCode, setHeaderSetCode] = React.useState(false)
  const [pageNumbers, setPageNumbers] = React.useState(true)
  const [isSavingDefaults, setIsSavingDefaults] = React.useState(false)

  // Populate Paper Defaults when institution loads
  React.useEffect(() => {
    if (institution?.paperDefaults) {
      const pd = institution.paperDefaults as any
      setWatermark(pd.watermark || '')
      setInstructions(pd.header?.instructions || '')
      setColumns(pd.columns ?? 2)
      setFontFamily(pd.fontFamily ?? 0)
      setFontSizePt(pd.fontSizePt ?? 11)
      setHeaderInstitution(pd.header?.institution ?? true)
      setHeaderLevel(pd.header?.level ?? true)
      setHeaderSubject(pd.header?.subject ?? true)
      setHeaderChapter(pd.header?.chapter ?? true)
      setHeaderStudentInfo(pd.header?.studentInfoBox ?? false)
      setHeaderSetCode(pd.header?.setCodeBox ?? false)
      setPageNumbers(pd.pageNumbers ?? true)
    }
  }, [institution])

  // ── Profile Settings State ──────────────────────────────────────────────
  const [profileName, setProfileName] = React.useState('')
  const [profileNameEn, setProfileNameEn] = React.useState('')
  const [profileType, setProfileType] = React.useState<number>(0)
  const [profileAddress, setProfileAddress] = React.useState('')
  const [profilePhone, setProfilePhone] = React.useState('')
  const [profileEmail, setProfileEmail] = React.useState('')
  const [isSavingProfile, setIsSavingProfile] = React.useState(false)

  // Populate Profile when institution loads
  React.useEffect(() => {
    if (institution) {
      setProfileName(institution.name || '')
      setProfileNameEn(institution.nameEn || '')
      setProfileType(institution.type ?? 0)
      setProfileAddress(institution.address || '')
      setProfilePhone(institution.phone || '')
      setProfileEmail(institution.email || '')
    }
  }, [institution])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invitePhone.trim() && !inviteEmail.trim()) {
      toast.error('শিক্ষকের মোবাইল নম্বর অথবা ইমেইল দিন')
      return
    }

    setIsInviting(true)
    try {
      const res = await apiClient.post<{ id: string; token: string; link: string; smsSent: boolean }>(
        '/api/v1/institution/invitations',
        {
          name: inviteName.trim() || undefined,
          phone: invitePhone.trim() || undefined,
          email: inviteEmail.trim() || undefined,
          role: inviteRole,
        }
      )

      toast.success('আমন্ত্রণ লিঙ্ক সফলভাবে তৈরি হয়েছে!')
      setInviteDialogOpen(false)
      setInviteName('')
      setInvitePhone('')
      setInviteEmail('')

      const inviteUrl =
        res.data?.link || `${window.location.origin}/invite/${res.data?.token}`
      setCreatedInviteLink(inviteUrl)
      setCreatedLinkModalOpen(true)
      setCopiedLink(false)

      refetchInvites()
      refetchMembers()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'আমন্ত্রণ তৈরি করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsInviting(false)
    }
  }

  const handleCopyInviteLink = (linkToCopy?: string) => {
    const target = linkToCopy || createdInviteLink
    if (!target) return
    navigator.clipboard.writeText(target)
    setCopiedLink(true)
    toast.success('আমন্ত্রণ লিঙ্ক ক্লিপবোর্ডে কপি করা হয়েছে!')
    setTimeout(() => setCopiedLink(false), 3000)
  }

  const handleRevokeInvite = async () => {
    if (!revokeTargetId) return
    setIsRevoking(true)
    try {
      await apiClient.delete(`/api/v1/institution/invitations/${revokeTargetId}`)
      toast.success('আমন্ত্রণটি বাতিল করা হয়েছে')
      setRevokeTargetId(null)
      refetchInvites()
    } catch {
      toast.error('আমন্ত্রণ বাতিল করতে সমস্যা হয়েছে')
    } finally {
      setIsRevoking(false)
    }
  }

  const handleChangeRole = async () => {
    if (!roleChangeTarget) return
    setIsChangingRole(true)
    try {
      await apiClient.put(`/api/v1/institution/members/${roleChangeTarget.userId}`, {
        role: newSelectedRole,
      })
      toast.success(`${roleChangeTarget.fullName}-এর ভূমিকা পরিবর্তিত হয়েছে`)
      setRoleChangeTarget(null)
      refetchMembers()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'ভূমিকা পরিবর্তন করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsChangingRole(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!removeMemberTarget) return
    setIsRemovingMember(true)
    try {
      await apiClient.delete(`/api/v1/institution/members/${removeMemberTarget.userId}`)
      toast.success(`${removeMemberTarget.fullName}-কে প্রতিষ্ঠান থেকে অপসারণ করা হয়েছে`)
      setRemoveMemberTarget(null)
      refetchMembers()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'সদস্য অপসারণ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsRemovingMember(false)
    }
  }

  const handleSavePaperDefaults = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingDefaults(true)
    try {
      await apiClient.put('/api/v1/institution/paper-defaults', {
        settings: {
          watermark: watermark.trim() || undefined,
          columns,
          fontFamily,
          fontSizePt,
          pageNumbers,
          header: {
            institution: headerInstitution,
            level: headerLevel,
            subject: headerSubject,
            chapter: headerChapter,
            studentInfoBox: headerStudentInfo,
            setCodeBox: headerSetCode,
            instructions: instructions.trim() || undefined,
          },
        },
      })
      toast.success('প্রশ্নপত্রের ডিফল্ট সেটিংস সফলভাবে সংরক্ষিত হয়েছে!')
      refetchInstitution()
    } catch {
      toast.error('সেটিংস সংরক্ষণ করতে সমস্যা হয়েছে')
    } finally {
      setIsSavingDefaults(false)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileName.trim()) {
      toast.error('প্রতিষ্ঠানের নাম বাধ্যতামূলক')
      return
    }

    setIsSavingProfile(true)
    try {
      await apiClient.put('/api/v1/institution', {
        name: profileName.trim(),
        nameEn: profileNameEn.trim() || undefined,
        type: profileType,
        address: profileAddress.trim() || undefined,
        phone: profilePhone.trim() || undefined,
        email: profileEmail.trim() || undefined,
      })
      toast.success('প্রতিষ্ঠানের প্রোফাইল তথ্য হালনাগাদ করা হয়েছে!')
      refetchInstitution()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'প্রোফাইল সংরক্ষণ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsSavingProfile(false)
    }
  }

  const roleLabel = (role: number) => {
    switch (role) {
      case 0:
        return 'মালিক (Owner)'
      case 1:
        return 'অ্যাডমিন'
      default:
        return 'শিক্ষক'
    }
  }

  const isOwnerOrAdmin = activeInstitution?.role === 0 || activeInstitution?.role === 1

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <PageHeader
        title="প্রতিষ্ঠান ও সেটিংস"
        description="প্রতিষ্ঠানের পরিচিতি, প্রশ্নপত্রের ডিফল্ট ফরম্যাট এবং শিক্ষক ও কর্মী ব্যবস্থাপনা"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'প্রতিষ্ঠান' },
        ]}
        actions={
          isOwnerOrAdmin ? (
            <Button
              className="gap-2 shadow-sm font-semibold"
              onClick={() => setInviteDialogOpen(true)}
            >
              <UserPlus className="size-4" />
              শিক্ষক আমন্ত্রণ জানান
            </Button>
          ) : undefined
        }
      />

      {/* Overview Stat Header Banner */}
      <Card className="border-border bg-gradient-to-r from-primary/5 via-card to-background">
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-md">
              <School className="size-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {institution?.name || activeInstitution?.name || 'আমার প্রতিষ্ঠান'}
                </h2>
                {activeInstitution?.role !== undefined && (
                  <Badge variant="outline" className="text-[10px] bg-background">
                    {roleLabel(activeInstitution.role)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {institution?.address ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3 text-primary inline" /> {institution.address}
                  </span>
                ) : (
                  'প্রতিষ্ঠানের ডিফল্ট প্রোফাইল'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="rounded-lg border border-border bg-card/60 px-3.5 py-2 text-center">
              <p className="text-muted-foreground">মোট সদস্য</p>
              <p className="text-base font-bold text-foreground">{toBnDigits(members.length)} জন</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 px-3.5 py-2 text-center">
              <p className="text-muted-foreground">পেন্ডিং আমন্ত্রণ</p>
              <p className="text-base font-bold text-amber-600 dark:text-amber-400">
                {toBnDigits(invitations.length)} টি
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/80 p-1 border border-border">
          <TabsTrigger value="members" className="gap-2 text-xs font-medium">
            <Users className="size-3.5" />
            শিক্ষক ও সদস্যবৃন্দ ({toBnDigits(members.length)})
          </TabsTrigger>
          <TabsTrigger value="paper-defaults" className="gap-2 text-xs font-medium">
            <FileText className="size-3.5" />
            প্রশ্নপত্রের ডিফল্ট সেটিংস
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2 text-xs font-medium">
            <Building2 className="size-3.5" />
            প্রতিষ্ঠান পরিচিতি
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: MEMBERS & INVITATIONS ──────────────────────────────────── */}
        <TabsContent value="members" className="space-y-6">
          {/* Active Members Card */}
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  বর্তমান সদস্যবৃন্দ ({toBnDigits(members.length)})
                </CardTitle>
                <CardDescription className="text-xs">
                  আপনার প্রতিষ্ঠানের প্রশ্নপত্র তৈরি, শিক্ষার্থী ও পরীক্ষা পরিচালনায় যুক্ত শিক্ষকগণ
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {membersLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : members.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">সদস্যের নাম</TableHead>
                        <TableHead className="text-xs font-semibold">যোগাযোগ</TableHead>
                        <TableHead className="text-xs font-semibold">ভূমিকা / পদবি</TableHead>
                        <TableHead className="text-xs font-semibold">যুক্ত হওয়ার তারিখ</TableHead>
                        {isOwnerOrAdmin && (
                          <TableHead className="text-right text-xs font-semibold">অ্যাকশন</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.userId} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-semibold text-foreground text-xs">
                            <div className="flex items-center gap-2">
                              <span>{m.fullName}</span>
                              {m.isMe && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                  আপনি
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.phone ? toBnDigits(m.phone) : m.email || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={m.role === 0 ? 'default' : m.role === 1 ? 'info' : 'secondary'}
                              className="text-[11px]"
                            >
                              {roleLabel(m.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateBn(m.joinedAt)}
                          </TableCell>
                          {isOwnerOrAdmin && (
                            <TableCell className="text-right">
                              {!m.isMe && m.role !== 0 && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] gap-1 px-2"
                                    onClick={() => {
                                      setRoleChangeTarget({ userId: m.userId, fullName: m.fullName, role: m.role })
                                      setNewSelectedRole(m.role === 1 ? 2 : 1)
                                    }}
                                  >
                                    <UserCog className="size-3" />
                                    রোল
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      setRemoveMemberTarget({ userId: m.userId, fullName: m.fullName })
                                    }
                                    title="অপসারণ করুন"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  কোনো সদস্য পাওয়া যায়নি।
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Invitations Section */}
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="size-4 text-amber-500" />
                  পেন্ডিং আমন্ত্রণসমূহ ({toBnDigits(invitations.length)})
                </CardTitle>
                <CardDescription className="text-xs">
                  যাদের আমন্ত্রণ লিঙ্ক পাঠানো হয়েছে কিন্তু এখনও গ্রহণ করেননি
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invitesLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : invitations.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">নাম / যোগাযোগ</TableHead>
                        <TableHead className="text-xs font-semibold">ভূমিকা</TableHead>
                        <TableHead className="text-xs font-semibold">মেয়াদ উত্তীর্ণের তারিখ</TableHead>
                        <TableHead className="text-right text-xs font-semibold">অ্যাকশন</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((inv) => (
                        <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-xs">
                            <p className="font-semibold text-foreground">{inv.name || 'শিক্ষক'}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {inv.phone ? toBnDigits(inv.phone) : inv.email || 'সরাসরি লিঙ্ক'}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {roleLabel(inv.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateBn(inv.expiresAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2"
                              onClick={() => setRevokeTargetId(inv.id)}
                            >
                              <Trash2 className="size-3" />
                              বাতিল
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  বর্তমানে কোনো পেন্ডিং আমন্ত্রণ নেই। &ldquo;শিক্ষক আমন্ত্রণ জানান&rdquo; বোতাম ব্যবহার করে নতুন শিক্ষক যোগ করুন।
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB 2: EXAM PAPER DEFAULTS ────────────────────────────────────── */}
        <TabsContent value="paper-defaults">
          <form onSubmit={handleSavePaperDefaults}>
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Settings2 className="size-4 text-primary" />
                  প্রশ্নপত্রের ডিফল্ট ফরম্যাট সেটিংস
                </CardTitle>
                <CardDescription className="text-xs">
                  এই প্রতিষ্ঠানে তৈরি করা সকল নতুন প্রশ্নপত্রের হেডার, জলছাপ এবং সাধারণ নির্দেশনা এই সেটিংস থেকে স্বয়ংক্রিয়ভাবে কার্যকর হবে।
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Watermark */}
                <div className="space-y-2">
                  <Label htmlFor="instWatermark" className="text-xs font-semibold">
                    প্রশ্নপত্রের ব্যাকগ্রাউন্ড জলছাপ (Watermark Text)
                  </Label>
                  <Input
                    id="instWatermark"
                    placeholder="যেমন: আনোয়ারা হাই স্কুল অ্যান্ড কলেজ"
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value)}
                    className="text-xs h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    মুদ্রিত প্রশ্নপত্রের মাঝে হালকা জলছাপ হিসেবে এই লেখাটি প্রদর্শিত হবে। খালি রাখলে কোনো জলছাপ থাকবে না।
                  </p>
                </div>

                {/* Instructions */}
                <div className="space-y-2">
                  <Label htmlFor="instInstructions" className="text-xs font-semibold">
                    পরীক্ষার্থীদের সাধারণ নির্দেশনা (General Instructions)
                  </Label>
                  <textarea
                    id="instInstructions"
                    rows={3}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="যেমন: প্রতিটি প্রশ্নের মান সমান। সকল প্রশ্নের উত্তর দেওয়া বাধ্যতামূলক।"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    প্রশ্নপত্রের হেডারের ঠিক নিচে পরীক্ষার্থীদের জন্য এই সাধারণ নির্দেশনাগুলো প্রিন্ট হবে।
                  </p>
                </div>

                {/* Columns & Font Settings */}
                <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-border/60">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">ডিফল্ট কলাম বিন্যাস</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={columns === 1 ? 'default' : 'outline'}
                        className="text-xs flex-1"
                        onClick={() => setColumns(1)}
                      >
                        ১ কলাম
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={columns === 2 ? 'default' : 'outline'}
                        className="text-xs flex-1"
                        onClick={() => setColumns(2)}
                      >
                        ২ কলাম (স্ট্যান্ডার্ড)
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">ডিফল্ট ফন্ট ফ্যামিলি</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={fontFamily === 0 ? 'default' : 'outline'}
                        className="text-xs flex-1"
                        onClick={() => setFontFamily(0)}
                      >
                        নোটো সেরিফ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={fontFamily === 1 ? 'default' : 'outline'}
                        className="text-xs flex-1"
                        onClick={() => setFontFamily(1)}
                      >
                        হিন্দ শিলিগুড়ি
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">ডিফল্ট ফন্ট সাইজ (Pt)</Label>
                    <Input
                      type="number"
                      min={9}
                      max={16}
                      step={0.5}
                      value={fontSizePt}
                      onChange={(e) => setFontSizePt(Number(e.target.value))}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                {/* Header Toggles */}
                <div className="pt-2 border-t border-border/60 space-y-3">
                  <Label className="text-xs font-semibold block">হেডারে যা প্রদর্শিত হবে</Label>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={headerInstitution}
                        onChange={(e) => setHeaderInstitution(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>প্রতিষ্ঠানের নাম</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={headerLevel}
                        onChange={(e) => setHeaderLevel(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>শ্রেণি ও বিভাগ</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={headerSubject}
                        onChange={(e) => setHeaderSubject(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>বিষয় ও কোড</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={headerChapter}
                        onChange={(e) => setHeaderChapter(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>অধ্যায় বা পাঠ শিরোনাম</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={headerStudentInfo}
                        onChange={(e) => setHeaderStudentInfo(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>শিক্ষার্থীর তথ্য বক্স (রোল/নাম)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-md border border-border p-2.5 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={headerSetCode}
                        onChange={(e) => setHeaderSetCode(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span>সেট কোড বক্স (সেট ক/খ/গ)</span>
                    </label>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="border-t border-border/60 justify-end pt-4">
                <Button
                  type="submit"
                  loading={isSavingDefaults}
                  loadingText="সংরক্ষণ হচ্ছে..."
                  className="gap-2 shadow-sm font-semibold"
                >
                  <Check className="size-4" />
                  ডিফল্ট সেটিংস সংরক্ষণ করুন
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        {/* ─── TAB 3: INSTITUTION PROFILE ───────────────────────────────────── */}
        <TabsContent value="profile">
          <form onSubmit={handleSaveProfile}>
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  প্রতিষ্ঠানের পরিচিতি ও যোগাযোগের তথ্য
                </CardTitle>
                <CardDescription className="text-xs">
                  প্রতিষ্ঠানের নাম, যোগাযোগের মোবাইল নম্বর এবং ঠিকানা হালনাগাদ করুন
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profName" className="text-xs font-semibold">
                      প্রতিষ্ঠানের নাম (বাংলায়) *
                    </Label>
                    <Input
                      id="profName"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="যেমন: আনোয়ারা মডেল একাডেমি"
                      required
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profNameEn" className="text-xs font-semibold">
                      প্রতিষ্ঠানের নাম (ইংরেজি)
                    </Label>
                    <Input
                      id="profNameEn"
                      value={profileNameEn}
                      onChange={(e) => setProfileNameEn(e.target.value)}
                      placeholder="e.g. Anowara Model Academy"
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profAddress" className="text-xs font-semibold">
                    প্রতিষ্ঠানের পূর্ণ ঠিকানা
                  </Label>
                  <Input
                    id="profAddress"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    placeholder="যেমন: বাড়ি ১২, রোড ৫, মিরপুর-১০, ঢাকা-১২১৬"
                    className="text-xs h-9"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profPhone" className="text-xs font-semibold">
                      অফিশিয়াল মোবাইল নম্বর
                    </Label>
                    <Input
                      id="profPhone"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="017xxxxxxxx"
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profEmail" className="text-xs font-semibold">
                      অফিশিয়াল ইমেইল
                    </Label>
                    <Input
                      id="profEmail"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="info@institution.edu.bd"
                      className="text-xs h-9"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="border-t border-border/60 justify-end pt-4">
                <Button
                  type="submit"
                  loading={isSavingProfile}
                  loadingText="সংরক্ষণ হচ্ছে..."
                  className="gap-2 shadow-sm font-semibold"
                >
                  <Check className="size-4" />
                  প্রোফাইল সংরক্ষণ করুন
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>
      </Tabs>

      {/* ── Modal 1: Create Invitation Dialog ───────────────────────────────── */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSendInvite}>
            <DialogHeader>
              <DialogTitle>শিক্ষক / সদস্য আমন্ত্রণ জানান</DialogTitle>
              <DialogDescription className="text-xs">
                নতুন শিক্ষকের তথ্য প্রদান করুন। একটি গোপন লিঙ্ক তৈরি হবে যা আপনি শেয়ার করতে পারবেন।
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="invName" className="text-xs">
                  শিক্ষকের নাম (ঐচ্ছিক)
                </Label>
                <Input
                  id="invName"
                  placeholder="যেমন: মোহাম্মদ রফিকুল ইসলাম"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invPhone" className="text-xs">
                    মোবাইল নম্বর
                  </Label>
                  <Input
                    id="invPhone"
                    placeholder="017xxxxxxxx"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invEmail" className="text-xs">
                    ইমেইল ঠিকানা
                  </Label>
                  <Input
                    id="invEmail"
                    type="email"
                    placeholder="teacher@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">ভূমিকা / রোল নির্বাচন করুন</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteRole(2)}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      inviteRole === 2
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                        : 'border-input bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="font-semibold block">শিক্ষক (Teacher)</span>
                    <span className="opacity-75 text-[11px] mt-0.5 block">প্রশ্নপত্র তৈরি ও প্রশ্নব্যাংক পরিচালনা</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole(1)}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      inviteRole === 1
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                        : 'border-input bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="font-semibold block">অ্যাডমিন (Admin)</span>
                    <span className="opacity-75 text-[11px] mt-0.5 block">বিলিং, শিক্ষক নিয়ন্ত্রণ ও সার্বিক সেটিংস</span>
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                disabled={isInviting}
                className="text-xs"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                loading={isInviting}
                loadingText="তৈরি হচ্ছে..."
                className="text-xs font-semibold"
              >
                আমন্ত্রণ লিঙ্ক তৈরি করুন
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal 2: Created Invite Link Showcase ────────────────────────────── */}
      <Dialog open={createdLinkModalOpen} onOpenChange={setCreatedLinkModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
              <DialogTitle>আমন্ত্রণ লিঙ্ক সফলভাবে তৈরি হয়েছে</DialogTitle>
            </div>
            <DialogDescription className="text-xs pt-1">
              এই লিঙ্কটি কপি করে মেসেঞ্জার, হোয়াটসঅ্যাপ, এসএমএস বা ইমেইলের মাধ্যমে শিক্ষকের সাথে শেয়ার করুন।
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdInviteLink}
                className="font-mono text-xs h-10 bg-muted/60"
              />
              <Button
                type="button"
                onClick={() => handleCopyInviteLink()}
                className="shrink-0 gap-1.5 h-10 text-xs font-semibold"
              >
                {copiedLink ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
                {copiedLink ? 'কপি হয়েছে' : 'কপি লিঙ্ক'}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">গুরুত্বপূর্ণ তথ্য:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>এই লিঙ্কটির মেয়াদ আগামী ৭ দিন থাকবে।</li>
                <li>আমন্ত্রিত শিক্ষক এই লিঙ্কে ক্লিক করে সরাসরি প্রতিষ্ঠানে যোগ দিতে পারবেন।</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreatedLinkModalOpen(false)}
              className="text-xs"
            >
              বন্ধ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal 3: Change Member Role Dialog ──────────────────────────────── */}
      <Dialog open={Boolean(roleChangeTarget)} onOpenChange={(o) => !o && setRoleChangeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>সদস্যের ভূমিকা পরিবর্তন</DialogTitle>
            <DialogDescription className="text-xs">
              <strong className="text-foreground">{roleChangeTarget?.fullName}</strong>-এর জন্য নতুন ভূমিকা নির্বাচন করুন
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <button
              type="button"
              onClick={() => setNewSelectedRole(2)}
              className={`p-3 rounded-lg border text-left text-xs transition-all w-full flex items-center justify-between ${
                newSelectedRole === 2
                  ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                  : 'border-input bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <div>
                <span className="font-semibold block">শিক্ষক (Teacher)</span>
                <span className="opacity-75 text-[11px] mt-0.5 block">প্রশ্নপত্র তৈরি ও প্রশ্নব্যাংক পরিচালনা</span>
              </div>
              {newSelectedRole === 2 && <Check className="size-4 text-primary" />}
            </button>

            <button
              type="button"
              onClick={() => setNewSelectedRole(1)}
              className={`p-3 rounded-lg border text-left text-xs transition-all w-full flex items-center justify-between ${
                newSelectedRole === 1
                  ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                  : 'border-input bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <div>
                <span className="font-semibold block">অ্যাডমিন (Admin)</span>
                <span className="opacity-75 text-[11px] mt-0.5 block">বিলিং, শিক্ষক নিয়ন্ত্রণ ও সার্বিক সেটিংস</span>
              </div>
              {newSelectedRole === 1 && <Check className="size-4 text-primary" />}
            </button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRoleChangeTarget(null)}
              disabled={isChangingRole}
              className="text-xs"
            >
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={handleChangeRole}
              loading={isChangingRole}
              loadingText="পরিবর্তন হচ্ছে..."
              className="text-xs font-semibold"
            >
              সংরক্ষণ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation Modal: Revoke Invitation ────────────────────────────── */}
      <ConfirmDialog
        open={Boolean(revokeTargetId)}
        onOpenChange={(o) => !o && setRevokeTargetId(null)}
        title="আমন্ত্রণ বাতিল করার নিশ্চিতকরণ"
        description="আপনি কি নিশ্চিতভাবে এই আমন্ত্রণ লিঙ্কটি বাতিল করতে চান? বাতিল করলে শিক্ষক এই লিঙ্ক ব্যবহার করে আর প্রতিষ্ঠানে যুক্ত হতে পারবেন না।"
        confirmText="আমন্ত্রণ বাতিল করুন"
        cancelText="না, ফিরে যান"
        confirmVariant="destructive"
        loading={isRevoking}
        onConfirm={handleRevokeInvite}
      />

      {/* ── Confirmation Modal: Remove Member ─────────────────────────────────── */}
      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        onOpenChange={(o) => !o && setRemoveMemberTarget(null)}
        title="শিক্ষককে অপসারণের নিশ্চিতকরণ"
        description={`আপনি কি নিশ্চিতভাবে ${removeMemberTarget?.fullName}-কে প্রতিষ্ঠান থেকে অপসারণ করতে চান? তার তৈরি করা প্রশ্নপত্রসমূহ প্রতিষ্ঠানে সংরক্ষিত থাকবে।`}
        confirmText="অপসারণ করুন"
        cancelText="বাতিল"
        confirmVariant="destructive"
        loading={isRemovingMember}
        onConfirm={handleRemoveMember}
      />
    </div>
  )
}
