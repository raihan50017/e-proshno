import * as React from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Database,
  Files,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  School,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Video,
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { CommandMenu } from '@/components/shared/command-menu'
import { ModeToggle } from '@/components/shared/mode-toggle'
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
      { title: 'স্মার্টবোর্ড', href: '/smartboard', icon: MonitorPlay, badge: 'প্রজেক্টর' },
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
    label: 'সহায়তা',
    items: [
      { title: 'টিউটোরিয়াল', href: '/tutorials', icon: Video },
      { title: 'সাপোর্ট ও যোগাযোগ', href: '/support', icon: HelpCircle },
    ],
  },
]

// Inner component so useSidebar can be used inside SidebarProvider
function AppShellInner() {
  const { user, activeInstitution, institutions, switchInstitution, logout } = useAuth()
  const { state: sidebarState } = useSidebar()
  const navigate = useNavigate()
  const isCollapsed = sidebarState === 'collapsed'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
    : 'শি'

  const isAdmin = user?.platformRoles?.some((r) => ['SuperAdmin', 'ContentTeam'].includes(r))

  return (
    <>
      {/* ── Sidebar ── */}
      <Sidebar collapsible="icon">
        {/* Brand Header */}
        <SidebarHeader className="px-2 py-2">
          <Link
            to="/dashboard"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent',
              isCollapsed && 'justify-center px-0'
            )}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm">
              ইপ্র
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-tight text-sidebar-foreground leading-tight">
                  ই-প্রশ্ন
                </span>
                <span className="text-[10px] text-sidebar-foreground/60 leading-tight">
                  প্রশ্নপত্র সিস্টেম
                </span>
              </div>
            )}
          </Link>
        </SidebarHeader>

        {/* Institution Switcher (only when expanded) */}
        {!isCollapsed && institutions.length > 0 && (
          <>
            <div className="px-3 pb-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                    <School className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate flex-1 text-left">
                      {activeInstitution?.name || 'প্রতিষ্ঠান নির্বাচন করুন'}
                    </span>
                    <ChevronDown className="size-3 shrink-0 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" className="w-56">
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
                        <span className="truncate text-xs">{inst.name}</span>
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
            </div>
            <SidebarSeparator className="mb-0" />
          </>
        )}

        {/* Nav Groups */}
        <SidebarContent className="px-1.5">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                        >
                          <NavLink
                            to={item.href}
                            className={({ isActive }) =>
                              cn(
                                isActive &&
                                  'bg-primary/10 text-primary font-semibold hover:bg-primary/15 hover:text-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary'
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                <Icon
                                  className={cn(
                                    'size-4 shrink-0',
                                    isActive ? 'text-primary' : 'text-sidebar-foreground/70'
                                  )}
                                />
                                <span>{item.title}</span>
                                {item.badge && (
                                  <SidebarMenuBadge>
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] px-1 py-0 h-4 bg-primary/15 text-primary border-0"
                                    >
                                      {item.badge}
                                    </Badge>
                                  </SidebarMenuBadge>
                                )}
                              </>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {/* Admin Section */}
          {isAdmin && (
            <>
              <SidebarSeparator />
              <SidebarGroup className="py-1">
                <SidebarGroupLabel className="text-destructive/70">অ্যাডমিন</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="ব্যাক-অফিস প্যানেল">
                        <NavLink
                          to="/admin"
                          className={({ isActive }) =>
                            cn(
                              isActive
                                ? 'text-destructive bg-destructive/10'
                                : 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
                            )
                          }
                        >
                          <ShieldAlert className="size-4 shrink-0" />
                          <span>ব্যাক-অফিস প্যানেল</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        {/* Footer: User Info */}
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  isCollapsed && 'justify-center px-0'
                )}
              >
                <Avatar className="size-7 border border-sidebar-border shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-[10px]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex flex-col min-w-0 flex-1 text-left">
                    <span className="truncate text-xs font-medium text-sidebar-foreground leading-tight">
                      {user?.fullName || 'শিক্ষক'}
                    </span>
                    <span className="truncate text-[10px] text-sidebar-foreground/60 leading-tight">
                      {activeInstitution?.name || user?.email || 'ব্যক্তিগত'}
                    </span>
                  </div>
                )}
                {!isCollapsed && <ChevronDown className="size-3 shrink-0 opacity-50" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56 mb-1">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground">{user?.phone || user?.email}</p>
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
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* ── Main Content ── */}
      <SidebarInset>
        {/* Sticky Navbar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
          {/* Left: Sidebar Trigger */}
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

          <div className="h-4 w-px bg-border" />

          {/* Center: Brand tagline (desktop) */}
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground/70">
            <span className="font-semibold text-foreground">ই-প্রশ্ন</span>
            <span>·</span>
            <span>প্রশ্নপত্র ও পরীক্ষা ব্যবস্থাপনা</span>
          </div>

          {/* Right: CommandMenu + Quick create + Theme toggle + User */}
          <div className="ml-auto flex items-center gap-2">
            <CommandMenu onLogout={handleLogout} />

            <Link to="/generate" className="hidden sm:inline-flex">
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs font-medium shadow-sm bg-primary hover:bg-primary/90"
              >
                <Sparkles className="size-3.5" />
                প্রশ্ন তৈরি
              </Button>
            </Link>

            <ModeToggle />

            {/* User Avatar (compact) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative size-8 rounded-full p-0">
                  <Avatar className="size-8 border border-border">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold">{user?.fullName}</p>
                    <p className="text-xs text-muted-foreground">{user?.phone || user?.email}</p>
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

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in-50 duration-200">
          <Outlet />
        </main>
      </SidebarInset>
    </>
  )
}

export function AppShell() {
  return (
    <SidebarProvider>
      <AppShellInner />
    </SidebarProvider>
  )
}
