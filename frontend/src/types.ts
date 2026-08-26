export type GSCoreStatus = {
  mode: string
  installed: boolean
  running: boolean
  ready: boolean
  pid: number | null
  logFile: string | null
  busy: boolean
  busyTask: string | null
  lastError: string | null
  address: string
  console: string
  plugins: string[]
  message: string
  managementAuthEnabled: boolean
  processOwner: 'plugin' | 'external' | 'none'
  restartRequired: boolean
  task: {
    id: string
    action: string
    phase: string
    status: 'running' | 'completed' | 'failed' | 'interrupted'
    startedAt: number
    finishedAt?: number
    error?: string
  } | null
}

export type GSCoreLogs = {
  files: Array<{ name: string; size: number; updatedAt: number }>
  activeFile: string
  content: string
  truncated: boolean
}
