import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'
import { Loader2 } from 'lucide-react'

export function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl shadow">
            ইপ্র
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <Loader2 className="size-4 animate-spin text-primary" />
            লোড হচ্ছে...
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
