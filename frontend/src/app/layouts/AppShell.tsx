import * as React from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Files,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Video,
  Database,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'সার্বিক চিত্র',
    items: [
      { title: 'ড্যাশবোর্ড', href: '/dashboard', icon: LayoutDashboard },
      { title: '১ ক্লিকে প্রশ্ন তৈরি', href: '/generate', icon: Sparkles, badge: 'নতুন' },
      { title: 'প্রশ্নব্যাংক ব্রাউজ', href: '/question-bank', icon: BookOpen },
    ],
  },
  {
    label: 'ব্যবস্থাপনা',
    items: [
      { title: 'আমার প্রশ্নসেট', href: '/sets', icon: Files },
      { title: 'আমার প্রশ্নব্যাংক', href: '/my-banks', icon: Database },
      { title: 'প্রশ্ন ইমপোর্ট', href: '/imports', icon: UploadCloud },
      { title: 'শিক্ষার্থী তালিকা', href: '/students', icon: GraduationCap },
    ],
  },
  {
    label: 'প্রতিষ্ঠান',
    items: [
      { title: 'আমার প্রতিষ্ঠান', href: '/institution', icon: Building2 },
      { title: 'সাবস্ক্রিপশন ও বিলিং', href: '/billing', icon: CreditCard },
    ],
  },
  {
    label: 'সহায়তা ও টিউটোরিয়াল',
    items: [
      { title: 'টিউটোরিয়াল', href: '/tutorials', icon: Video },
      { title: 'যোগাযোগ ও সাপোর্ট', href: '/support', icon: HelpCircle },
    ],
  },
]

export function AppShell() {
  const { user, activeInstitution, institutions, switchInstitution, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Get user initials
  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
    : 'শিক্ষক'

  const isAdmin = user?.platformRoles?.some((r) =>
    ['SuperAdmin', 'ContentTeam'].includes(r)
  )

  const renderNavGroup = (group: NavGroup, isMobile = false) => (
    <div key={group.label} className="py-2">
      <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
        {group.label}
      </h3>
      <div className="mt-1.5 space-y-1">
        {group.items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 shrink-0" />
                <span>{item.title}</span>
              </div>
              {item.badge && (
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] px-1.5 py-0 uppercase"
                >
                  {item.badge}
                </Badge>
              )}
            </NavLink>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-2.5 px-6 border-b border-border">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow">
            ইপ্র
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-foreground">
              ই-প্রশ্ন
            </span>
            <span className="text-[11px] text-muted-foreground">
              প্রশ্নপত্র ও পরীক্ষা সিস্টেম
            </span>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {navGroups.map((group) => renderNavGroup(group))}

          {isAdmin && (
            <div className="py-2 border-t border-border mt-2">
              <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                অ্যাডমিন
              </h3>
              <div className="mt-1.5 space-y-1">
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-destructive text-destructive-foreground'
                        : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                    )
                  }
                >
                  <ShieldAlert className="size-4 shrink-0" />
                  <span>ব্যাক-অফিস প্যানেল</span>
                </NavLink>
              </div>
            </div>
          )}
        </div>

        {/* Bottom User / Institution Info */}
        <div className="p-3 border-t border-border bg-muted/20">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Avatar className="size-8 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-xs font-medium truncate text-foreground">
                {user?.fullName || 'শিক্ষক'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {activeInstitution?.name || 'ব্যক্তিগত অ্যাকাউন্ট'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          {/* Left: Mobile Menu Trigger + Active Institution Selector */}
          <div className="flex items-center gap-3">
            {/* Mobile Sheet Drawer */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="size-5" />
                  <span className="sr-only">মেনু খুলুন</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b border-border text-left">
                  <SheetTitle className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                      ইপ্র
                    </div>
                    <span>ই-প্রশ্ন</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto px-3 py-3 max-h-[calc(100vh-5rem)]">
                  {navGroups.map((group) => renderNavGroup(group, true))}
                  {isAdmin && (
                    <div className="py-2 border-t border-border mt-2">
                      <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        অ্যাডমিন
                      </h3>
                      <div className="mt-1.5 space-y-1">
                        <NavLink
                          to="/admin"
                          onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                        >
                          <ShieldAlert className="size-4 shrink-0" />
                          <span>ব্যাক-অফিস প্যানেল</span>
                        </NavLink>
                      </div>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            {/* Institution Switcher Dropdown */}
            {institutions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs font-medium border-border max-w-[220px] sm:max-w-xs"
                  >
                    <School className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">
                      {activeInstitution?.name || 'প্রতিষ্ঠান নির্বাচন করুন'}
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    আপনার প্রতিষ্ঠানসমূহ
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {institutions.map((inst) => {
                    const isCurrent = inst.institutionId === activeInstitution?.institutionId
                    return (
                      <DropdownMenuItem
                        key={inst.institutionId}
                        onClick={() => switchInstitution(inst.institutionId)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate text-xs font-medium">{inst.name}</span>
                        {isCurrent && <Check className="size-3.5 text-primary shrink-0" />}
                      </DropdownMenuItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      to="/institution"
                      className="text-xs text-primary font-medium cursor-pointer"
                    >
                      + নতুন প্রতিষ্ঠান যুক্ত করুন
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Right: Quick Action & User Profile Dropdown */}
          <div className="flex items-center gap-3">
            <Link to="/generate" className="hidden sm:inline-flex">
              <Button size="sm" className="gap-1.5 text-xs font-medium shadow-sm">
                <Sparkles className="size-3.5" />
                প্রশ্ন তৈরি করুন
              </Button>
            </Link>

            {/* User Profile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative size-9 rounded-full p-0">
                  <Avatar className="size-9 border border-border">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none">{user?.fullName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user?.phone || user?.email}
                    </p>
                    {activeInstitution?.role && (
                      <Badge variant="outline" className="mt-1 w-fit text-[10px] py-0">
                        {activeInstitution.role}
                      </Badge>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/institution" className="cursor-pointer gap-2">
                    <School className="size-4" />
                    প্রতিষ্ঠান সেটিংস
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/billing" className="cursor-pointer gap-2">
                    <CreditCard className="size-4" />
                    সাবস্ক্রিপশন ও বিলিং
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive gap-2"
                >
                  <LogOut className="size-4" />
                  লগআউট করুন
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Routed Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in-50 duration-200">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
