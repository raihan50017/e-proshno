import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, LogIn, School, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from './auth-context'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const [phoneOrEmail, setPhoneOrEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneOrEmail.trim()) {
      toast.error('অনুগ্রহ করে মোবাইল নম্বর বা ইমেইল লিখুন')
      return
    }
    if (!password) {
      toast.error('অনুগ্রহ করে পাসওয়ার্ড লিখুন')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await login({ loginId: phoneOrEmail.trim(), password })
      if (result.otpRequired) {
        toast.info(`আপনার নম্বরে (${result.phone}) একটি ওটিপি কোড পাঠানো হয়েছে।`)
      } else {
        toast.success('সফলভাবে লগইন সম্পন্ন হয়েছে!')
        navigate(from, { replace: true })
      }
    } catch (err: any) {
      const data = err?.response?.data
      let errorMsg = ''
      if (data?.errors && typeof data.errors === 'object') {
        const errorEntries = Object.values(data.errors)
        if (errorEntries.length > 0) {
          const firstError = errorEntries[0]
          if (Array.isArray(firstError) && firstError.length > 0) {
            errorMsg = firstError[0]
          } else if (typeof firstError === 'string') {
            errorMsg = firstError
          }
        }
      }
      if (!errorMsg) {
        errorMsg =
          data?.title ||
          data?.detail ||
          data?.message ||
          'লগইন ব্যর্থ হয়েছে। মোবাইল নম্বর বা পাসওয়ার্ড সঠিক কিনা পরীক্ষা করুন।'
      }
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const fillDemo = (userType: 'teacher' | 'admin') => {
    if (userType === 'teacher') {
      setPhoneOrEmail('teacher@example.com')
      setPassword('Teacher12345')
    } else {
      setPhoneOrEmail('admin@example.com')
      setPassword('Admin12345')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <span className="text-xl font-bold tracking-tight">ইপ্র</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            ই-প্রশ্ন (e-proshno)
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            প্রশ্ন তৈরি, মূল্যায়ন এবং আধুনিক পরীক্ষা ব্যবস্থাপনা প্ল্যাটফর্ম
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-border shadow-md">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold">লগইন করুন</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              আপনার নিবন্ধিত মোবাইল নম্বর অথবা ইমেইল এবং পাসওয়ার্ড প্রদান করুন
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneOrEmail" className="text-sm font-medium">
                  মোবাইল নম্বর বা ইমেইল
                </Label>
                <Input
                  id="phoneOrEmail"
                  type="text"
                  placeholder="যেমন: teacher@example.com বা +8801700000002"
                  value={phoneOrEmail}
                  onChange={(e) => setPhoneOrEmail(e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    পাসওয়ার্ড
                  </Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="current-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full mt-2 font-medium"
                loading={isSubmitting}
                loadingText="যাচাই করা হচ্ছে..."
              >
                <LogIn className="size-4 mr-2" />
                লগইন করুন
              </Button>
            </CardContent>
          </form>

          {/* Quick Demo Access Bar */}
          <div className="px-6 py-3 bg-muted/50 border-t border-border/60 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground/80 flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-primary" />
              টেস্টিং ডেমো অ্যাকাউন্ট:
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto py-1.5 text-xs flex-1 flex-col items-start gap-0.5"
                onClick={() => fillDemo('teacher')}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <School className="size-3.5 text-primary" />
                  শিক্ষক (Teacher)
                </div>
                <span className="text-[10px] text-muted-foreground">teacher@example.com</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto py-1.5 text-xs flex-1 flex-col items-start gap-0.5"
                onClick={() => fillDemo('admin')}
              >
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <ShieldCheck className="size-3.5 text-primary" />
                  অ্যাডমিন (Admin)
                </div>
                <span className="text-[10px] text-muted-foreground">admin@example.com</span>
              </Button>
            </div>
          </div>

          <CardFooter className="pt-4 pb-4 border-t border-border flex justify-center text-xs text-muted-foreground">
            অ্যাকাউন্ট নেই?
            <Link to="/register" className="ml-1 text-primary font-medium hover:underline">
              নতুন অ্যাকাউন্ট নিবন্ধন করুন
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
