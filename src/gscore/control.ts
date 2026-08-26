import { manager } from './manager'
import { type GSCoreAction } from './actions'

export type { GSCoreAction } from './actions'

export const backgroundActions: GSCoreAction[] = [
  'install', 'save-config', 'start', 'stop', 'restart', 'enable-http',
  'install-plugin', 'update-plugin', 'remove-plugin'
]

export async function runGSCoreAction(action: GSCoreAction, payload: Record<string, unknown> = {}) {
  switch (action) {
    case 'status': return manager.status()
    case 'logs': return manager.logs(typeof payload.file === 'string' ? payload.file : undefined, Number(payload.lines ?? 400))
    case 'get-config': return manager.getConfig()
    case 'save-config': await manager.saveConfig(payload.config as Record<string, unknown>); return manager.status()
    case 'install': await manager.install(); return manager.status()
    case 'start': await manager.start(); return manager.status()
    case 'stop': await manager.stop(); return manager.status()
    case 'restart': await manager.restart(); return manager.status()
    case 'enable-http': await manager.enableHTTP(); return manager.status()
    case 'install-plugin':
      await manager.installPlugin(String(payload.repository ?? ''))
      return manager.status()
    case 'update-plugin':
      await manager.updatePlugin(String(payload.name ?? ''))
      return manager.status()
    case 'remove-plugin':
      await manager.removePlugin(String(payload.name ?? ''))
      return manager.status()
  }
}

export function runGSCoreActionInBackground(action: GSCoreAction, payload: Record<string, unknown> = {}): void {
  void runGSCoreAction(action, payload).catch(() => {
    // 错误已经写入 manager 的任务状态和 lastError。
  })
}
