export type GSCoreAction =
  | 'status'
  | 'logs'
  | 'get-config'
  | 'save-config'
  | 'install'
  | 'start'
  | 'stop'
  | 'restart'
  | 'enable-http'
  | 'install-plugin'
  | 'update-plugin'
  | 'remove-plugin'

const actions = new Set<GSCoreAction>([
  'status', 'logs', 'get-config', 'save-config', 'install', 'start', 'stop', 'restart', 'enable-http',
  'install-plugin', 'update-plugin', 'remove-plugin'
])

export function isGSCoreAction(value: unknown): value is GSCoreAction {
  return typeof value === 'string' && actions.has(value as GSCoreAction)
}
