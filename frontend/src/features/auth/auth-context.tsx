import * as React from 'react'
import { apiClient, getAccessToken, setAccessToken } from '@/lib/api-client'
import type { AuthStepResponse } from '@/lib/api/model/authStepResponse'
import type { InstitutionMembershipDto } from '@/lib/api/model/institutionMembershipDto'
import type { MeResponse } from '@/lib/api/model/meResponse'
import type { SessionResponse } from '@/lib/api/model/sessionResponse'

interface AuthContextType {
  user: MeResponse | null
  activeInstitution: InstitutionMembershipDto | null
  institutions: InstitutionMembershipDto[]
  isAuthenticated: boolean
  isLoading: boolean
  login: (body: { loginId?: string; phoneOrEmail?: string; password: string }) => Promise<AuthStepResponse>
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
      const token = getAccessToken()
      if (!token) {
        // Try refreshing with existing session cookie if token not in storage
        try {
          const refreshRes = await apiClient.post<SessionResponse>('/api/v1/auth/refresh', {})
          if (refreshRes.data?.accessToken) {
            setAccessToken(refreshRes.data.accessToken)
            if (refreshRes.data.me) {
              setUser(refreshRes.data.me)
              return refreshRes.data.me
            }
          }
        } catch {
          setUser(null)
          return null
        }
      }

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

  const login = async (body: { loginId?: string; phoneOrEmail?: string; password: string }): Promise<AuthStepResponse> => {
    setIsLoading(true)
    try {
      const loginId = (body.loginId || body.phoneOrEmail || '').trim()
      const res = await apiClient.post<AuthStepResponse>('/api/v1/auth/login', {
        loginId,
        password: body.password,
      })

      const session = res.data?.session
      if (session?.accessToken) {
        setAccessToken(session.accessToken)
      }
      if (session?.me) {
        setUser(session.me)
      } else if (session?.accessToken) {
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
        institutionId,
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
