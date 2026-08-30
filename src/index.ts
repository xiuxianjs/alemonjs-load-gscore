import { defineChildren, defineRouter, lazy, logger, useMessage } from 'alemonjs'
import apiRouter from './api-router'
import { deliver } from './gscore/delivery'
import { manager } from './gscore/manager'
import { getAutoStart, getRuntimeMode } from './path'

const responseRouter = defineRouter([
  {
    regular: /^(\/|#|＃)gs/i,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./response/admin'))
  },
  {
    regular: /^\/我是主人\s*$/,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./response/owner-claim'))
  },
  {
    // 管理命令由上面的 #gs 路由独占，避免非主人消息在 next() 后又被转发给 GsCore。
    regular: /^(?!(?:\/|#|＃)gs\b).*/i,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./gscore/bridge'))
  }
])

manager.setMessageHandler(async (reply, context) => {
  await deliver(reply, context as Parameters<typeof useMessage>[0] | undefined)
})

export default defineChildren({
  register() {
    return { responseRouter, koaRouter: apiRouter }
  },
  onCreated() {
    // GsCore 首次启动可能需要拉起 Python、加载插件并建立 WebSocket；不能阻塞
    // AlemonJS 的 app_ready，否则宿主会把正常的后台初始化误判为模块加载缓慢。
    void (async () => {
      if (getRuntimeMode() === 'local' && getAutoStart()) {
        try {
          const status = await manager.status()
          if (status.installed && !status.running) {
            await manager.start()
          } else if (status.running) {
            logger.info('[alemonjs-load-gscore] 已连接正在运行的本地 GsCore，不重复启动')
          }
        } catch (error) {
          logger.error(`[alemonjs-load-gscore] GsCore 自动启动失败：${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        const running = await manager.refresh()
        logger.info(running
          ? `[alemonjs-load-gscore] 已连接 GsCore ${manager.transport === 'websocket' ? 'WebSocket' : 'HTTP'} 服务`
          : '[alemonjs-load-gscore] GsCore 未连接；请执行 #gs安装 或检查 GsCore 配置')
      }
    })()
  }
})

export { GSCoreManager, manager } from './gscore/manager'
