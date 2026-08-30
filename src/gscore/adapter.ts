import WebSocket, { type RawData } from 'ws'
import type { MessageReceive, MessageSend } from './types'

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]
const MAX_QUEUE_SIZE = 1_000
const PENDING_TTL = 5 * 60_000

export type AdapterState = {
  connected: boolean
  lastError: string | null
  reconnectCount: number
  queued: number
}

export type PendingContext = unknown

type AdapterOptions = {
  getURL: () => string
  getToken: () => string
  onMessage: (message: MessageSend, context?: PendingContext) => Promise<void>
  onWarning: (message: string) => void
}

type QueuedMessage = { message: MessageReceive; context?: PendingContext }
type PendingMessage = { context?: PendingContext; expiresAt: number }

function asText(data: RawData): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data).toString('utf8')
}

export class GSCoreWebSocketAdapter {
  private socket: WebSocket | null = null
  private connectTask: Promise<boolean> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private enabled = false
  private connected = false
  private lastError: string | null = null
  private reconnectCount = 0
  private queue: QueuedMessage[] = []
  private pending = new Map<string, PendingMessage>()

  constructor(private readonly options: AdapterOptions) {}

  get state(): AdapterState {
    return {
      connected: this.connected,
      lastError: this.lastError,
      reconnectCount: this.reconnectCount,
      queued: this.queue.length
    }
  }

  start(): void {
    this.enabled = true
    void this.connect()
  }

  stop(clearQueue = false): void {
    this.enabled = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.connectTask = null
    const socket = this.socket
    this.socket = null
    this.connected = false
    if (clearQueue) {
      this.queue = []
      this.pending.clear()
    }
    if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, 'AlemonJS adapter stopped')
    else socket?.terminate()
  }

  async connect(): Promise<boolean> {
    this.enabled = true
    if (this.connected && this.socket?.readyState === WebSocket.OPEN) return true
    if (this.connectTask) return this.connectTask
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.connectTask = new Promise<boolean>(resolve => {
      let settled = false
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      let socket: WebSocket
      try {
        const url = new URL(this.options.getURL())
        const token = this.options.getToken().trim()
        if (!token) throw new Error('未配置 WS_TOKEN；请配置 ws_token，或在本地/容器模式下启用一次桥接配置')
        url.searchParams.set('token', token)
        socket = new WebSocket(url, { handshakeTimeout: 10_000 })
      } catch (error) {
        this.recordError(error)
        this.scheduleReconnect()
        settle(false)
        return
      }
      this.socket = socket
      socket.binaryType = 'arraybuffer'

      socket.once('open', () => {
        if (this.socket !== socket) return
        this.connected = true
        this.lastError = null
        this.reconnectCount = 0
        this.flush()
        settle(true)
      })
      socket.on('message', data => { void this.handleMessage(data) })
      socket.on('error', error => {
        this.recordError(error)
        settle(false)
      })
      socket.on('close', (code, reason) => {
        if (this.socket !== socket) return
        this.socket = null
        this.connected = false
        if (code !== 1000 && !this.lastError) {
          this.lastError = `WebSocket 已关闭（${code}${reason.length ? `：${reason.toString('utf8')}` : ''}）`
        }
        this.scheduleReconnect()
        settle(false)
      })
    }).finally(() => { this.connectTask = null })
    return this.connectTask
  }

  send(message: MessageReceive, context?: PendingContext): void {
    this.prunePending()
    if (message.msg_id) this.pending.set(message.msg_id, { context, expiresAt: Date.now() + PENDING_TTL })
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const dropped = this.queue.shift()
      if (dropped?.message.msg_id) this.pending.delete(dropped.message.msg_id)
      this.options.onWarning(`GsCore WebSocket 发送队列已满，已丢弃最早的一条消息（上限 ${MAX_QUEUE_SIZE}）`)
    }
    this.queue.push({ message, context })
    this.start()
    this.flush()
  }

  private flush(): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    while (this.queue.length) {
      const item = this.queue.shift()
      if (!item) return
      try {
        socket.send(Buffer.from(JSON.stringify(item.message)), { binary: true })
      } catch (error) {
        this.queue.unshift(item)
        this.recordError(error)
        socket.terminate()
        return
      }
    }
  }

  private async handleMessage(data: RawData): Promise<void> {
    let message: MessageSend
    try {
      const parsed = JSON.parse(asText(data)) as unknown
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as MessageSend).content))
        throw new Error('消息不是有效的 MessageSend')
      message = parsed as MessageSend
    } catch (error) {
      this.options.onWarning(`收到无效的 GsCore WebSocket 消息：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    this.prunePending()
    const context = message.msg_id ? this.pending.get(message.msg_id)?.context : undefined
    try {
      await this.options.onMessage(message, context)
    } catch (error) {
      this.options.onWarning(`GsCore WebSocket 消息分发失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private recordError(error: unknown): void {
    this.connected = false
    this.lastError = error instanceof Error ? error.message : String(error)
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer || this.connected) return
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectCount, RECONNECT_DELAYS.length - 1)]
    this.reconnectCount++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private prunePending(): void {
    const now = Date.now()
    for (const [id, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(id)
    }
  }
}
