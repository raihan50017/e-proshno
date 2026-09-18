import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Building2,
  CreditCard,
  Database,
  Files,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Search,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Video,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

interface CommandNavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string[]
}

const navItems: CommandNavItem[] = [
  { label: 'ড্যাশবোর্ড', href: '/dashboard', icon: LayoutDashboard, keywords: ['dashboard', 'home'] },
  { label: '১ ক্লিকে প্রশ্ন তৈরি', href: '/generate', icon: Sparkles, keywords: ['generate', 'quick', 'create'] },
  { label: 'স্মার্টবোর্ড ও প্রজেক্টর মোড', href: '/smartboard', icon: MonitorPlay, keywords: ['smartboard', 'projector', 'classroom', 'presenter'] },
  { label: 'প্রশ্নব্যাংক ব্রাউজ', href: '/question-bank', icon: BookOpen, keywords: ['bank', 'browse', 'question'] },
  { label: 'আমার প্রশ্নসেট', href: '/sets', icon: Files, keywords: ['sets', 'paper'] },
  { label: 'আমার প্রশ্নব্যাংক', href: '/my-banks', icon: Database, keywords: ['my bank', 'custom'] },
  { label: 'প্রশ্ন ইমপোর্ট', href: '/imports', icon: UploadCloud, keywords: ['import', 'upload', 'excel'] },
  { label: 'শিক্ষার্থী তালিকা', href: '/students', icon: GraduationCap, keywords: ['students', 'list'] },
  { label: 'আমার প্রতিষ্ঠান', href: '/institution', icon: Building2, keywords: ['institution', 'school'] },
  { label: 'সাবস্ক্রিপশন ও বিলিং', href: '/billing', icon: CreditCard, keywords: ['billing', 'subscription'] },
  { label: 'টিউটোরিয়াল', href: '/tutorials', icon: Video, keywords: ['tutorial', 'help', 'video'] },
  { label: 'যোগাযোগ ও সাপোর্ট', href: '/support', icon: HelpCircle, keywords: ['support', 'contact'] },
  { label: 'ব্যাক-অফিস অ্যাডমিন প্যানেল', href: '/admin', icon: ShieldAlert, keywords: ['admin', 'superadmin', 'backoffice', 'staff'] },
]

interface CommandMenuProps {
  onLogout?: () => void
}

export function CommandMenu({ onLogout }: CommandMenuProps) {
  const [open, setOpen] = React.useState(false)
  const navigate = useNavigate()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSelect = (href: string) => {
    setOpen(false)
    navigate(href)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="কমান্ড মেনু খুলুন"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">দ্রুত নেভিগেট করুন...</span>
        <kbd className="pointer-events-none ml-auto hidden select-none rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] opacity-60 sm:inline-flex">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="যেকোনো পৃষ্ঠা খুঁজুন..." />
        <CommandList>
          <CommandEmpty>কোনো ফলাফল পাওয়া যায়নি।</CommandEmpty>
          <CommandGroup heading="নেভিগেশন">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                  onSelect={() => handleSelect(item.href)}
                >
                  <Icon className="mr-2 size-4" />
                  <span>{item.label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="দ্রুত অ্যাকশন">
            <CommandItem
              value="নতুন প্রশ্ন তৈরি করুন generate new question"
              onSelect={() => handleSelect('/generate')}
            >
              <Sparkles className="mr-2 size-4 text-primary" />
              <span>নতুন প্রশ্নপত্র তৈরি করুন</span>
              <CommandShortcut>১-ক্লিক</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="প্রশ্ন ইমপোর্ট import question upload"
              onSelect={() => handleSelect('/imports')}
            >
              <UploadCloud className="mr-2 size-4" />
              <span>প্রশ্ন আমদানি করুন</span>
            </CommandItem>
            {onLogout && (
              <CommandItem
                value="logout sign out লগআউট"
                onSelect={() => {
                  setOpen(false)
                  onLogout()
                }}
                className="text-destructive data-[selected=true]:bg-destructive/10 data-[selected=true]:text-destructive"
              >
                <LogOut className="mr-2 size-4" />
                <span>লগআউট করুন</span>
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}

