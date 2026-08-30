import type { CoreCommandPrefix, GSCoreLogs, GSCoreStatus, OwnerClaimState } from '../types'

type ApiResponse<T> = { code?: number; message?: string; data?: T }

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { 'x-gscore-token': getApiToken() } })
  const body = await response.json().catch(() => ({})) as ApiResponse<T>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `请求失败 (${response.status})`)
  return body.data as T
}

export function getStatus(): Promise<GSCoreStatus> {
  return request<GSCoreStatus>('./api/gscore/status')
}

let apiToken = ''

export function getApiToken(): string { return apiToken }
export function setApiToken(value: string): void { apiToken = value }

export async function runAction(action: string, payload: Record<string, unknown> = {}): Promise<GSCoreStatus> {
  const response = await fetch('./api/gscore/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gscore-token': getApiToken() },
    body: JSON.stringify({ action, ...payload })
  })
  const body = await response.json().catch(() => ({})) as ApiResponse<GSCoreStatus>
  if (!response.ok && response.status !== 202) throw new Error(body.message || `请求失败 (${response.status})`)
  if (response.status !== 202) return body.data as GSCoreStatus
  const deadline = Date.now() + 30 * 60_000
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 1500))
    const status = await getStatus()
    if (!status.busy) {
      if (status.task?.status === 'failed' || status.task?.status === 'interrupted') throw new Error(status.task.error || '管理任务失败')
      return status
    }
  }
  throw new Error('管理任务等待超时，请查看日志和最近一次任务状态')
}

export function getLogs(file?: string): Promise<GSCoreLogs> {
  const params = new URLSearchParams()
  if (file) params.set('file', file)
  return request<GSCoreLogs>(`./api/gscore/logs${params.toString() ? `?${params}` : ''}`)
}

export async function deleteLog(file: string): Promise<GSCoreLogs> {
  const response = await fetch(`./api/gscore/logs/${encodeURIComponent(file)}`, {
    method: 'DELETE', headers: { 'x-gscore-token': getApiToken() }
  })
  const body = await response.json().catch(() => ({})) as ApiResponse<GSCoreLogs>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `删除失败 (${response.status})`)
  return body.data as GSCoreLogs
}

export async function getConfig(): Promise<Record<string, unknown>> {
  const response = await fetch('./api/gscore/config', { headers: { 'x-gscore-token': getApiToken() } })
  const body = await response.json().catch(() => ({})) as ApiResponse<Record<string, unknown>>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `请求失败 (${response.status})`)
  return body.data ?? {}
}

export async function getCoreCommandPrefix(): Promise<CoreCommandPrefix> {
  const response = await fetch('./api/gscore/core-command-prefix', { headers: { 'x-gscore-token': getApiToken() } })
  const body = await response.json().catch(() => ({})) as ApiResponse<CoreCommandPrefix>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `请求失败 (${response.status})`)
  return body.data ?? { available: false, prefix: '', required: false }
}

export async function saveConfig(config: Record<string, unknown>): Promise<GSCoreStatus> {
  const response = await fetch('./api/gscore/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gscore-token': getApiToken() },
    body: JSON.stringify({ config })
  })
  const body = await response.json().catch(() => ({})) as ApiResponse<GSCoreStatus>
  if (!response.ok && response.status !== 202) throw new Error(body.message || `请求失败 (${response.status})`)
  if (response.status !== 202) return body.data as GSCoreStatus
  const deadline = Date.now() + 30 * 60_000
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 1500))
    const status = await getStatus()
    if (!status.busy) return status
  }
  throw new Error('配置保存等待超时，请查看任务状态')
}

export async function setTransport(transport: 'websocket' | 'http'): Promise<GSCoreStatus> {
  const response = await fetch('./api/gscore/transport', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gscore-token': getApiToken() },
    body: JSON.stringify({ transport })
  })
  const body = await response.json().catch(() => ({})) as ApiResponse<GSCoreStatus>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `请求失败 (${response.status})`)
  return body.data as GSCoreStatus
}

export async function getOwnerClaims(): Promise<OwnerClaimState> {
  const response = await fetch('./api/gscore/owner-claims', { headers: { 'x-gscore-token': getApiToken() } })
  const body = await response.json().catch(() => ({})) as ApiResponse<OwnerClaimState>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `请求失败 (${response.status})`)
  return body.data ?? { claims: [], activeUntil: null }
}

export async function startOwnerClaim(): Promise<number> {
  const response = await fetch('./api/gscore/owner-claims/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gscore-token': getApiToken() }
  })
  const body = await response.json().catch(() => ({})) as ApiResponse<{ activeUntil: number }>
  if (!response.ok || body.code !== 200 || !body.data?.activeUntil) throw new Error(body.message || `请求失败 (${response.status})`)
  return body.data.activeUntil
}

export async function addOwnerClaim(userId: string): Promise<void> {
  const response = await fetch('./api/gscore/owner-claims/add', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gscore-token': getApiToken() },
    body: JSON.stringify({ userId })
  })
  const body = await response.json().catch(() => ({})) as ApiResponse<Record<string, unknown>>
  if (!response.ok || body.code !== 200) throw new Error(body.message || `请求失败 (${response.status})`)
}

export type StatusListener = (status: GSCoreStatus) => void

export function subscribeStatus(onStatus: StatusListener, onError: (error: Error) => void): () => void {
  let disposed = false
  let inFlight = false
  let timer: number | null = null

  const schedule = (delay: number) => {
    if (disposed) return
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => void fetchStatus(), delay)
  }

  const fetchStatus = async () => {
    if (disposed || inFlight) return
    inFlight = true
    try { onStatus(await getStatus()) }
    catch (error) { if (!disposed) onError(error instanceof Error ? error : new Error(String(error))) }
    finally { inFlight = false; schedule(document.visibilityState === 'hidden' ? 15000 : 5000) }
  }

  const onVisibilityChange = () => schedule(document.visibilityState === 'hidden' ? 15000 : 0)
  document.addEventListener('visibilitychange', onVisibilityChange)
  void fetchStatus()

  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (timer !== null) window.clearTimeout(timer)
  }
}
