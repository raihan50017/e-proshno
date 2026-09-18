import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  LogIn,
  School,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { apiClient } from '@/lib/api-client'

interface InvitationDetails {
  institutionName: string
  role: number // 1 = Admin, 2 = Teacher
  invitedName?: string | null
  isValid: boolean
}

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const { user, isAuthenticated, switchInstitution } = useAuth()
  const navigate = useNavigate()

  const [invitation, setInvitation] = React.useState<InvitationDetails | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isAccepting, setIsAccepting] = React.useState(false)

  React.useEffect(() => {
    let active = true

    async function loadInvitation() {
      if (!token) {
        setError('আমন্ত্রণ লিঙ্কটি সঠিক নয়')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const res = await apiClient.get<InvitationDetails>(`/api/v1/invitations/${token}`)
        if (active) {
          setInvitation(res.data)
          if (!res.data.isValid) {
            setError('এই আমন্ত্রণটির মেয়াদ শেষ হয়ে গেছে বা এটি আর কার্যকর নয়।')
          }
        }
      } catch (err: any) {
        if (active) {
          const message = err?.response?.data?.detail || 'আমন্ত্রণ তথ্য লোড করা যায়নি'
          setError(message)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    loadInvitation()
    return () => {
      active = false
    }
  }, [token])

  const handleAccept = async () => {
    if (!token) return

    setIsAccepting(true)
    try {
      const res = await apiClient.post<{ institutionId: string }>(`/api/v1/invitations/${token}/accept`)
      toast.success('আমন্ত্রণ সফলভাবে গৃহীত হয়েছে!')

      if (res.data?.institutionId) {
        try {
          await switchInstitution(res.data.institutionId)
        } catch {
          // ignore switch failure, navigate anyway
        }
      }

      navigate('/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'আমন্ত্রণ গ্রহণ করতে সমস্যা হয়েছে'
      toast.error(msg)
    } finally {
      setIsAccepting(false)
    }
  }

  const roleLabel = (role?: number) => {
    switch (role) {
      case 1:
        return 'অ্যাডমিন'
      case 2:
      default:
        return 'শিক্ষক'
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 font-sans antialiased">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-md mb-2">
            ইপ্র
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">ই-প্রশ্ন</h1>
          <p className="text-xs text-muted-foreground">প্রশ্নপত্র ও পরীক্ষা ম্যানেজমেন্ট প্ল্যাটফর্ম</p>
        </div>

        {/* Invitation Card */}
        <Card className="border-border shadow-lg">
          {isLoading ? (
            <CardContent className="p-8 space-y-4">
              <Skeleton className="h-6 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
              <div className="pt-4 space-y-2">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          ) : error || !invitation ? (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                  <AlertCircle className="size-6" />
                </div>
                <CardTitle className="text-lg">আমন্ত্রণটি কার্যকর নয়</CardTitle>
                <CardDescription className="text-xs">
                  {error || 'আমন্ত্রণ লিঙ্কটির মেয়াদ উত্তীর্ণ বা পূর্বে ব্যবহৃত হয়েছে।'}
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-4 flex flex-col gap-2">
                <Link to="/login" className="w-full">
                  <Button variant="outline" className="w-full text-xs">
                    লগইন পেজে যান
                  </Button>
                </Link>
                <Link to="/dashboard" className="w-full">
                  <Button variant="ghost" className="w-full text-xs">
                    ড্যাশবোর্ডে ফিরে যান
                  </Button>
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader className="text-center pb-3">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2 shadow-inner">
                  <School className="size-7" />
                </div>
                <CardTitle className="text-xl font-bold text-foreground">
                  {invitation.institutionName}
                </CardTitle>
                <CardDescription className="text-xs pt-1">
                  আপনাকে প্রতিষ্ঠানে যোগদানের জন্য আমন্ত্রণ জানানো হয়েছে
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-2">
                <div className="rounded-lg border border-border bg-card p-4 space-y-2.5 text-xs">
                  {invitation.invitedName && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>আমন্ত্রিত শিক্ষক:</span>
                      <span className="font-semibold text-foreground">{invitation.invitedName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>ভূমিকা / রোল:</span>
                    <Badge variant="secondary" className="font-medium text-xs">
                      {roleLabel(invitation.role)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>স্ট্যাটাস:</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-3.5" /> বৈধ আমন্ত্রণ
                    </span>
                  </div>
                </div>

                {isAuthenticated ? (
                  <div className="rounded-md bg-muted/60 p-3 text-center text-xs text-muted-foreground">
                    আপনি <strong className="text-foreground">{user?.fullName}</strong> হিসেবে লগইন আছেন।
                  </div>
                ) : (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <Sparkles className="size-4 shrink-0 mt-0.5" />
                    <span>
                      আমন্ত্রণ গ্রহণ করতে অনুগ্রহ করে প্রথমে লগইন করুন অথবা একটি নতুন শিক্ষক অ্যাকাউন্ট তৈরি করুন।
                    </span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-2 pt-2">
                {isAuthenticated ? (
                  <Button
                    className="w-full gap-2 shadow-sm font-semibold"
                    onClick={handleAccept}
                    loading={isAccepting}
                    loadingText="যুক্ত হওয়া হচ্ছে..."
                  >
                    <UserCheck className="size-4" />
                    আমন্ত্রণ গ্রহণ করুন ও প্রবেশ করুন
                  </Button>
                ) : (
                  <>
                    <Link to={`/login?redirect=/invite/${token}`} className="w-full">
                      <Button className="w-full gap-2 shadow-sm">
                        <LogIn className="size-4" />
                        লগইন করে যুক্ত হন
                      </Button>
                    </Link>
                    <Link to={`/register?redirect=/invite/${token}`} className="w-full">
                      <Button variant="outline" className="w-full gap-2 text-xs">
                        নতুন একাউন্ট খুলুন
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </Link>
                  </>
                )}
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
