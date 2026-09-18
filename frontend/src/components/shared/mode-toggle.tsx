import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Theme = 'light' | 'dark' | 'system'

const ThemeContext = React.createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
} | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    try {
      return (localStorage.getItem('ep-theme') as Theme) || 'system'
    } catch {
      return 'system'
    }
  })

  React.useEffect(() => {
    const root = document.documentElement
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', isDark)
  }, [theme])

  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem('ep-theme', t)
    } catch {}
    setThemeState(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'আলো মোড' : 'অন্ধকার মোড'}
    >
      {isDark ? (
        <Sun className="size-4 transition-all" />
      ) : (
        <Moon className="size-4 transition-all" />
      )}
      <span className="sr-only">থিম পরিবর্তন</span>
    </Button>
  )
}
