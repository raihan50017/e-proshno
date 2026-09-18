import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiClient } from '@/lib/api-client'

export function RegisterPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [institutionName, setInstitutionName] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('আপনার পূর্ণ নাম লিখুন')
      return
    }
    if (!phone.trim()) {
      toast.error('মোবাইল নম্বর লিখুন')
      return
    }
    if (!password || password.length < 8) {
      toast.error('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং বর্ণ ও সংখ্যা থাকতে হবে')
      return
    }

    setIsSubmitting(true)
    try {
      await apiClient.post('/api/v1/auth/register', {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        password,
      })

      toast.success('নিবন্ধন সফল হয়েছে! অনুগ্রহ করে লগইন করুন।')
      navigate('/login')
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
          'নিবন্ধন ব্যর্থ হয়েছে। সঠিক তথ্য প্রদান করুন।'
      }
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <span className="text-xl font-bold tracking-tight">ইপ্র</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            নতুন শিক্ষক অ্যাকাউন্ট খুলুন
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            বিনামূল্যে নিবন্ধন করে প্রশ্নব্যাংক এবং প্রশ্নপত্র তৈরি শুরু করুন
          </p>
        </div>

        <Card className="border-border shadow-md">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold">নিবন্ধন ফর্ম</CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              আপনার ব্যক্তিগত ও প্রাতিষ্ঠানিক তথ্য পূরণ করুন
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">
                  পূর্ণ নাম *
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="যেমন: মোঃ রফিকুল ইসলাম"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  মোবাইল নম্বর *
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="যেমন: 01712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  ইমেইল (ঐচ্ছিক)
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="teacher@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="institutionName" className="text-sm font-medium">
                  প্রতিষ্ঠান বা কোচিং সেন্টারের নাম (ঐচ্ছিক)
                </Label>
                <Input
                  id="institutionName"
                  type="text"
                  placeholder="যেমন: উদ্দীপন বিজ্ঞান একাডেমি"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  পাসওয়ার্ড *
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full mt-2 font-medium"
                loading={isSubmitting}
                loadingText="নিবন্ধন হচ্ছে..."
              >
                <UserPlus className="size-4 mr-2" />
                অ্যাকাউন্ট তৈরি করুন
              </Button>
            </CardContent>
          </form>

          <CardFooter className="pt-4 pb-4 border-t border-border flex justify-center text-xs text-muted-foreground">
            ইতিমধ্যে অ্যাকাউন্ট আছে?
            <Link to="/login" className="ml-1 text-primary font-medium hover:underline">
              লগইন করুন
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
