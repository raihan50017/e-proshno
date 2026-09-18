import * as React from 'react'
import {
  Mail,
  MapPin,
  Phone,
  School,
  UserPlus,
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
import { PageHeader } from '@/components/shared/page-header'
import { useAuth } from '@/features/auth/auth-context'
import { useGetInstitution, useListMembers } from '@/lib/api/generated/institution/institution'
import { apiClient } from '@/lib/api-client'
import { formatDateBn, toBnDigits } from '@/lib/bn'

export function InstitutionPage() {
  const { activeInstitution } = useAuth()

  const { data: instData } = useGetInstitution()
  const institution = instData?.data

  const { data: membersData, isLoading: membersLoading, refetch: refetchMembers } = useListMembers()
  const members = membersData?.data || []

  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false)
  const [inviteEmailOrPhone, setInviteEmailOrPhone] = React.useState('')
  const [inviteRole, setInviteRole] = React.useState<number>(2) // 2 = Teacher
  const [isInviting, setIsInviting] = React.useState(false)

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmailOrPhone.trim()) {
      toast.error('শিক্ষকের মোবাইল নম্বর বা ইমেইল লিখুন')
      return
    }

    setIsInviting(true)
    try {
      await apiClient.post('/api/v1/institution/invitations', {
        target: inviteEmailOrPhone.trim(),
        role: inviteRole,
      })
      toast.success('আমন্ত্রণ লিঙ্ক সফলভাবে তৈরি হয়েছে!')
      setInviteDialogOpen(false)
      setInviteEmailOrPhone('')
      refetchMembers()
    } catch {
      toast.error('আমন্ত্রণ পাঠাতে সমস্যা হয়েছে')
    } finally {
      setIsInviting(false)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="আমার প্রতিষ্ঠান"
        description="প্রতিষ্ঠানের পরিচিতি, লোগো এবং শিক্ষক সদস্যদের পরিচালনা করুন"
        breadcrumbs={[
          { label: 'ড্যাশবোর্ড', href: '/dashboard' },
          { label: 'প্রতিষ্ঠান' },
        ]}
        actions={
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-sm">
                <UserPlus className="size-4" />
                শিক্ষক আমন্ত্রণ জানান
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleSendInvite}>
                <DialogHeader>
                  <DialogTitle>প্রতিষ্ঠানে শিক্ষক যুক্ত করুন</DialogTitle>
                  <DialogDescription className="text-xs">
                    শিক্ষকের মোবাইল নম্বর বা ইমেইল এবং রোল নির্বাচন করুন
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="inviteTarget">মোবাইল নম্বর বা ইমেইল *</Label>
                    <Input
                      id="inviteTarget"
                      placeholder="017xxxxxxxx বা teacher@example.com"
                      value={inviteEmailOrPhone}
                      onChange={(e) => setInviteEmailOrPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>ভূমিকা (Role)</Label>
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
                        <span className="opacity-75 mt-0.5 block">প্রশ্নপত্র তৈরি ও শিক্ষার্থী পরিচালনা</span>
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
                        <span className="opacity-75 mt-0.5 block">বিলিং, সেটিংস ও শিক্ষক নিয়ন্ত্রণ</span>
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
                  >
                    বাতিল
                  </Button>
                  <Button
                    type="submit"
                    loading={isInviting}
                    loadingText="আমন্ত্রণ পাঠানো হচ্ছে..."
                  >
                    আমন্ত্রণ পাঠান
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Institution Info Card */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg mb-2">
              <School className="size-6" />
            </div>
            <CardTitle className="text-lg font-bold">
              {institution?.name || activeInstitution?.name || 'প্রতিষ্ঠান'}
            </CardTitle>
            <CardDescription className="text-xs">
              প্রতিষ্ঠানের আইডি: {institution?.id?.slice(0, 8) || '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground border-t border-border/60 pt-4">
            {institution?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-primary shrink-0" />
                <span>{institution.address}</span>
              </div>
            )}
            {institution?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-primary shrink-0" />
                <span>{toBnDigits(institution.phone)}</span>
              </div>
            )}
            {institution?.email && (
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-primary shrink-0" />
                <span>{institution.email}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Members List (2 cols) */}
        <div className="lg:col-span-2">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="size-4 text-primary" />
                যুক্ত শিক্ষক ও সদস্যবৃন্দ ({toBnDigits(members.length)})
              </CardTitle>
              <CardDescription className="text-xs">
                যারা আপনার প্রতিষ্ঠানে প্রশ্ন তৈরি ও পরীক্ষা পরিচালনায় যুক্ত আছেন
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {membersLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-10 rounded bg-muted/60 animate-pulse" />
                  ))}
                </div>
              ) : members.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>নাম ও যোগাযোগ</TableHead>
                      <TableHead>ভূমিকা</TableHead>
                      <TableHead>যুক্ত হওয়ার তারিখ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.userId}>
                        <TableCell>
                          <p className="font-semibold text-foreground text-xs">{m.fullName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.phone ? toBnDigits(m.phone) : m.email}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={m.role === 0 ? 'default' : m.role === 1 ? 'info' : 'secondary'}
                            className="text-[10px]"
                          >
                            {roleLabel(m.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateBn(m.joinedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  কোনো অতিরিক্ত সদস্য যুক্ত নেই। উপরের বোতাম থেকে শিক্ষকদের যুক্ত করতে পারেন।
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
