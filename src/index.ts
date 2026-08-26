import { defineChildren, defineRouter, lazy, logger } from 'alemonjs'
import apiRouter from './api-router'
import { manager } from './gscore/manager'
import { getAutoStart, getRuntimeMode } from './path'

const responseRouter = defineRouter([
  {
    regular: /^(\/|#|＃)gs/i,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./response/admin'))
  },
  {
    // 管理命令由上面的 #gs 路由独占，避免非主人消息在 next() 后又被转发给 GsCore。
    regular: /^(?!(?:\/|#|＃)gs\b).*/i,
    selects: ['message.create', 'private.message.create'],
    handler: lazy(() => import('./gscore/bridge'))
  }
])

export default defineChildren({
  register() {
    return { responseRouter, koaRouter: apiRouter }
  },
  async onCreated() {
    if (getRuntimeMode() === 'local' && getAutoStart()) {
      try {
        const status = await manager.status()
        if (status.installed && !status.running) {
          await manager.enableHTTP()
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
        ? '[alemonjs-load-gscore] 已连接 GsCore HTTP 服务'
        : '[alemonjs-load-gscore] GsCore 未连接；请执行 #gs安装 或检查 GsCore 配置')
    }
  }
})

export { GSCoreManager, manager } from './gscore/manager'
