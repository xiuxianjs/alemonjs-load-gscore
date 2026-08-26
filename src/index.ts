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
    regular: /.*/,
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
        if ((await manager.status()).installed) {
          await manager.enableHTTP()
          await manager.start()
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
