import * as React from 'react'
import { apiClient, setAccessToken } from '@/lib/api-client'
import type { InstitutionMembershipDto } from '@/lib/api/model/institutionMembershipDto'
import type { MeResponse } from '@/lib/api/model/meResponse'
import type { SessionResponse } from '@/lib/api/model/sessionResponse'

interface AuthContextType {
  user: MeResponse | null
  activeInstitution: InstitutionMembershipDto | null
  institutions: InstitutionMembershipDto[]
  isAuthenticated: boolean
  isLoading: boolean
  login: (body: { phoneOrEmail: string; password?: string; otp?: string }) => Promise<SessionResponse>
  logout: () => Promise<void>
  switchInstitution: (institutionId: string) => Promise<void>
  refetchUser: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<MeResponse | null>(null)
  const [isLoading, setIsLoading] = React.useState<boolean>(true)

  const fetchCurrentUser = React.useCallback(async () => {
    try {
      const res = await apiClient.get<MeResponse>('/api/v1/me')
      setUser(res.data)
      return res.data
    } catch {
      setUser(null)
      return null
    }
  }, [])

  React.useEffect(() => {
    let mounted = true
    async function initAuth() {
      setIsLoading(true)
      try {
        await fetchCurrentUser()
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    initAuth()
    return () => {
      mounted = false
    }
  }, [fetchCurrentUser])

  const login = async (body: { phoneOrEmail: string; password?: string; otp?: string }): Promise<SessionResponse> => {
    setIsLoading(true)
    try {
      const res = await apiClient.post<SessionResponse>('/api/v1/auth/login', body)
      if (res.data?.accessToken) {
        setAccessToken(res.data.accessToken)
      }
      if (res.data?.me) {
        setUser(res.data.me)
      } else {
        await fetchCurrentUser()
      }
      return res.data
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      await apiClient.post('/api/v1/auth/logout', {})
    } catch {
      // ignore logout network errors
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }

  const switchInstitution = async (institutionId: string) => {
    try {
      const res = await apiClient.post<SessionResponse>('/api/v1/auth/refresh', {
        switchToInstitutionId: institutionId,
      })
      if (res.data?.accessToken) {
        setAccessToken(res.data.accessToken)
      }
      if (res.data?.me) {
        setUser(res.data.me)
      } else {
        await fetchCurrentUser()
      }
    } catch (err) {
      console.error('Failed to switch institution:', err)
      throw err
    }
  }

  const activeInstitution = user?.activeInstitution ?? null
  const institutions = user?.institutions ?? []
  const isAuthenticated = Boolean(user)

  return (
    <AuthContext.Provider
      value={{
        user,
        activeInstitution,
        institutions,
        isAuthenticated,
        isLoading,
        login,
        logout,
        switchInstitution,
        refetchUser: async () => {
          await fetchCurrentUser()
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
