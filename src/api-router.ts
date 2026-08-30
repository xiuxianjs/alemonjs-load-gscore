import bodyParser from 'koa-bodyparser'
import KoaRouter from 'koa-router'
import { backgroundActions, runGSCoreAction, runGSCoreActionInBackground } from './gscore/control'
import { isGSCoreAction } from './gscore/actions'
import { getApiToken, getGSCoreURL, setTransport, type TransportMode } from './path'
import { manager } from './gscore/manager'
import { getOwnerClaimState, startOwnerClaimWindow } from './gscore/owner-claim'

const apiRouter = new KoaRouter({ prefix: '/api/gscore' })
apiRouter.use(bodyParser())

async function proxyConsole(ctx: KoaRouter.RouterContext, targetPath: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const headers: Record<string, string> = {}
    const contentType = ctx.get('content-type')
    const cookie = ctx.get('cookie')
    const authorization = ctx.get('authorization')
    if (contentType) headers['content-type'] = contentType
    if (cookie) headers.cookie = cookie
    if (authorization) headers.authorization = authorization
    let body: BodyInit | undefined
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      const requestBody = (ctx.request as { body?: unknown }).body
      body = requestBody === undefined ? undefined : contentType?.includes('application/json') ? JSON.stringify(requestBody) : String(requestBody)
    }
    const upstream = await fetch(`${getGSCoreURL()}${targetPath}${ctx.search}`, { method: ctx.method, headers, body, signal: controller.signal, redirect: 'manual' })
    ctx.status = upstream.status
    const upstreamContentType = upstream.headers.get('content-type')
    if (upstreamContentType) ctx.set('content-type', upstreamContentType)
    const location = upstream.headers.get('location')
    if (location) ctx.set('location', location.replace(getGSCoreURL(), '').replace('/app', '/api/gscore/console'))
    const setCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
    if (setCookie.length) ctx.set('set-cookie', setCookie.map(value => value.replace(/Path=\/app\b/gi, 'Path=/api/gscore/console').replace(/Path=\/\b/gi, 'Path=/api/gscore/console')))
    const data = Buffer.from(await upstream.arrayBuffer())
    if (upstreamContentType?.includes('text/html') || upstreamContentType?.includes('javascript') || upstreamContentType?.includes('text/css')) {
      const rewritten = data.toString('utf8')
        .replaceAll('/app/', '__GSCORE_APP_PATH__')
        .replaceAll('/api/', '__GSCORE_API_PATH__')
        .replaceAll('__GSCORE_APP_PATH__', './')
        .replaceAll('__GSCORE_API_PATH__', '../console-api/')
      ctx.body = rewritten
    } else {
      ctx.body = data
    }
  } catch (error) {
    ctx.status = 502
    ctx.body = { code: 502, message: error instanceof Error ? `GsCore 控制台不可用：${error.message}` : 'GsCore 控制台不可用' }
  } finally {
    clearTimeout(timer)
  }
}

apiRouter.all('/console', async ctx => {
  if (ctx.path.endsWith('/')) { await proxyConsole(ctx, '/app/'); return }
  ctx.status = 301
  ctx.set('location', '/api/gscore/console/')
  ctx.body = ''
})
apiRouter.all('/console/*path', async ctx => { const path = Array.isArray(ctx.params.path) ? ctx.params.path.join('/') : ctx.params.path ?? ''; await proxyConsole(ctx, `/app/${path}`) })
apiRouter.all('/console-api', async ctx => { await proxyConsole(ctx, '/api/') })
apiRouter.all('/console-api/*path', async ctx => { const path = Array.isArray(ctx.params.path) ? ctx.params.path.join('/') : ctx.params.path ?? ''; await proxyConsole(ctx, `/api/${path}`) })

apiRouter.get('/status', async ctx => {
  ctx.status = 200
  ctx.body = { code: 200, message: 'ok', data: await runGSCoreAction('status') }
})

apiRouter.get('/logs', async ctx => {
  const file = typeof ctx.query.file === 'string' ? ctx.query.file : undefined
  const lines = typeof ctx.query.lines === 'string' ? Number(ctx.query.lines) || 400 : 400
  ctx.status = 200
  ctx.body = { code: 200, message: 'ok', data: await runGSCoreAction('logs', { file, lines }) }
})

apiRouter.delete('/logs/:file', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  try {
    const file = Array.isArray(ctx.params.file) ? ctx.params.file.join('') : ctx.params.file ?? ''
    ctx.status = 200
    ctx.body = { code: 200, message: '日志已删除', data: manager.deleteLog(file) }
  } catch (error) {
    ctx.status = 400
    ctx.body = { code: 400, message: error instanceof Error ? error.message : String(error), data: null }
  }
})

apiRouter.get('/config', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  ctx.status = 200
  ctx.body = { code: 200, message: 'ok', data: await runGSCoreAction('get-config') }
})

apiRouter.get('/core-command-prefix', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  ctx.status = 200
  ctx.body = { code: 200, message: 'ok', data: manager.getCoreCommandPrefix() }
})

apiRouter.post('/config', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  try {
    if (manager.isBusy) {
      ctx.status = 409
      ctx.body = { code: 409, message: `正在${manager.busyTask}，请等待完成`, data: null }
      return
    }
    const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
    runGSCoreActionInBackground('save-config', { config: body.config })
    ctx.status = 202
    ctx.body = { code: 202, message: '配置保存任务已开始，请通过状态接口查看进度', data: await runGSCoreAction('status') }
  } catch (error) {
    ctx.status = 400
    ctx.body = { code: 400, message: error instanceof Error ? error.message : String(error), data: null }
  }
})

apiRouter.post('/transport', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const transport = body.transport
  if (transport !== 'websocket' && transport !== 'http') {
    ctx.status = 400
    ctx.body = { code: 400, message: 'transport 必须是 websocket 或 http', data: null }
    return
  }
  try {
    setTransport(transport as TransportMode)
    await manager.updateTransport()
    ctx.status = 200
    ctx.body = { code: 200, message: '传输方式已更新', data: await manager.status() }
  } catch (error) {
    ctx.status = 400
    ctx.body = { code: 400, message: error instanceof Error ? error.message : String(error), data: null }
  }
})

apiRouter.get('/owner-claims', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  ctx.status = 200
  ctx.body = { code: 200, message: 'ok', data: getOwnerClaimState() }
})

apiRouter.post('/owner-claims/start', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  ctx.status = 200
  ctx.body = { code: 200, message: '主人认领已开启', data: { activeUntil: startOwnerClaimWindow() } }
})

apiRouter.post('/owner-claims/add', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '需要有效的 x-gscore-token', data: null }
    return
  }
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const userId = typeof body.userId === 'string' ? body.userId : ''
  try {
    await manager.addMaster(userId)
    ctx.status = 200
    // 认领写入不应为了回传运行状态而等待离线 GsCore 的 WebSocket 探测。
    ctx.body = { code: 200, message: '已添加 GsCore 主人', data: { userId, restartDeferred: manager.isBusy } }
  } catch (error) {
    ctx.status = 400
    ctx.body = { code: 400, message: error instanceof Error ? error.message : String(error), data: null }
  }
})

apiRouter.post('/action', async ctx => {
  const token = getApiToken()
  if (token && ctx.get('x-gscore-token') !== token) {
    ctx.status = 401
    ctx.body = { code: 401, message: '管理 API 令牌无效', data: null }
    return
  }
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const action = body.action
  if (!isGSCoreAction(action)) {
    ctx.status = 400
    ctx.body = { code: 400, message: 'action 无效', data: null }
    return
  }
  try {
    if (manager.isBusy) {
      ctx.status = 409
      ctx.body = { code: 409, message: `正在${manager.busyTask}，请等待完成`, data: null }
      return
    }
    if (backgroundActions.includes(action)) {
      runGSCoreActionInBackground(action, body)
      ctx.status = 202
      ctx.body = { code: 202, message: '任务已开始，请通过状态接口查看进度', data: await runGSCoreAction('status') }
      return
    }
    ctx.status = 200
    ctx.body = { code: 200, message: '操作完成', data: await runGSCoreAction(action, body) }
  } catch (error) {
    ctx.status = 400
    ctx.body = { code: 400, message: error instanceof Error ? error.message : String(error), data: null }
  }
})

export default apiRouter
