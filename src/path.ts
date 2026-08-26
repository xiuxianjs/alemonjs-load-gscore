import { getConfigValue } from 'alemonjs'
import { join } from 'node:path'

export type RuntimeMode = 'local' | 'external' | 'docker'

type GSCoreConfig = {
  runtime_mode?: RuntimeMode
  gscore_url?: string
  gscore_repo?: string
  bot_id?: string
  ws_token?: string
  api_token?: string
  gscore_dir?: string
  docker_image?: string
  python_command?: string
  auto_start?: boolean
  startup_timeout?: number
}

const defaultURL = 'http://127.0.0.1:8765'
const defaultRepo = 'https://github.com/Genshin-bots/gsuid_core.git'
const defaultImage = 'docker.cnb.cool/gscore-mirror/gsuid_core:latest'

function getConfig(): GSCoreConfig {
  const values = getConfigValue() ?? {}
  return (values['alemonjs-load-gscore'] as GSCoreConfig | undefined) ?? {}
}

export function getRuntimeMode(): RuntimeMode {
  const mode = getConfig().runtime_mode
  return mode === 'external' || mode === 'docker' ? mode : 'local'
}

export function getGSCoreURL(): string {
  return (getConfig().gscore_url ?? defaultURL).replace(/\/$/, '')
}

export function getGSCoreRepo(): string {
  return getConfig().gscore_repo?.trim() || defaultRepo
}

export function getBotID(): string {
  return getConfig().bot_id?.trim() || 'AlemonJS'
}

export function getWSToken(): string {
  return getConfig().ws_token?.trim() ?? ''
}

export function getApiToken(): string {
  return getConfig().api_token?.trim() ?? ''
}

export function getGSCoreDir(): string {
  const configured = getConfig().gscore_dir?.trim() || 'GsCore'
  return join(process.cwd(), configured)
}

export function getGSCoreCoreDir(): string {
  return join(getGSCoreDir(), 'core')
}

export function getGSCoreLogsDir(): string {
  return join(getGSCoreDir(), 'logs')
}

export function getGSCoreVenvDir(): string {
  return join(getGSCoreDir(), '.venv')
}

export function getGSCoreVenvPython(): string {
  return process.platform === 'win32'
    ? join(getGSCoreVenvDir(), 'Scripts', 'python.exe')
    : join(getGSCoreVenvDir(), 'bin', 'python')
}

export function getPythonCommand(): string {
  return getConfig().python_command?.trim() || 'python3'
}

export function getAutoStart(): boolean {
  return getConfig().auto_start !== false
}

export function getStartupTimeout(): number {
  const value = Number(getConfig().startup_timeout ?? 60_000)
  return Number.isFinite(value) ? Math.min(300_000, Math.max(10_000, Math.floor(value))) : 60_000
}

export function getDataDir(): string {
  return getRuntimeMode() === 'local' ? join(getGSCoreCoreDir(), 'data') : join(getGSCoreDir(), 'data')
}

export function getPluginsDir(): string {
  return getRuntimeMode() === 'local'
    ? join(getGSCoreCoreDir(), 'gsuid_core', 'plugins')
    : join(getGSCoreDir(), 'plugins')
}

export function getDockerImage(): string {
  return getConfig().docker_image?.trim() || defaultImage
}

export function getContainerName(): string {
  return `alemonjs-gscore-${getBotID().replace(/[^a-zA-Z0-9_.-]+/g, '-').toLowerCase()}`
}

export function getPort(): number {
  const url = new URL(getGSCoreURL())
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('gscore_url 端口无效')
  return port
}
