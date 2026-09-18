import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

const ACCESS_TOKEN_KEY = 'ep_access_token'

let inMemoryToken: string | null = null

export function getAccessToken(): string | null {
  if (inMemoryToken) return inMemoryToken
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null) {
  inMemoryToken = token
  try {
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
    }
  } catch {
    // ignore local storage errors in private/iframe modes
  }
}

export const apiClient = axios.create({
  withCredentials: true,
  headers: {
    'X-EP-Session': '1',
  },
})

// Attach authorization header if token exists
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (!config.headers['X-EP-Session']) {
    config.headers['X-EP-Session'] = '1'
  }
  return config
})

// Handle 401s with token refresh
let isRefreshing = false
let refreshSubscribers: ((token: string | null) => void)[] = []

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // If 401 and not already retried and not on auth endpoints
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/api/v1/auth/login') &&
      !originalRequest.url?.includes('/api/v1/auth/refresh') &&
      !originalRequest.url?.includes('/api/v1/auth/register')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              resolve(apiClient(originalRequest))
            } else {
              reject(error)
            }
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshResponse = await apiClient.post('/api/v1/auth/refresh', {})
        const newToken = refreshResponse.data?.accessToken
        if (newToken) {
          setAccessToken(newToken)
          onRefreshed(newToken)
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return apiClient(originalRequest)
        }
      } catch (refreshErr) {
        setAccessToken(null)
        onRefreshed(null)
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export const customInstance = <T>(
  url: string,
  options?: RequestInit
): Promise<T> => {
  const method = (options?.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {}

  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => {
        headers[k] = v
      })
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([k, v]) => {
        headers[k] = v
      })
    } else {
      Object.assign(headers, options.headers)
    }
  }

  let data: any = options?.body
  if (typeof data === 'string' && (data.startsWith('{') || data.startsWith('['))) {
    try {
      data = JSON.parse(data)
    } catch {
      // keep string
    }
  }

  return apiClient({
    url,
    method,
    headers,
    data,
    signal: options?.signal ?? undefined,
  }).then((res: AxiosResponse<T>) => res.data)
}
