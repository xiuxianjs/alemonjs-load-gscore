import { useCallback, useEffect, useState } from 'react'
import { getStatus, runAction, subscribeStatus } from '../api/web-api'
import type { GSCoreStatus } from '../types'

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /[\\/]/.test(message) ? '操作失败，请查看日志。' : message
}

function runtimeLabel(status: GSCoreStatus | null) {
  if (!status) return '读取中'
  if (status.busy || status.task?.status === 'running' || (status.running && !status.ready)) return '启动中'
  if (status.ready) return '运行中'
  if (status.installed) return '已停止'
  return '未安装'
}

export default function Manage() {
  const [status, setStatus] = useState<GSCoreStatus | null>(null)
  const [notice, setNotice] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [action, setAction] = useState('')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try { setStatus(await getStatus()); setNotice('') }
    catch (error) { setNotice(errorText(error)) }
    finally { setRefreshing(false) }
  }, [])

  useEffect(() => subscribeStatus(setStatus, error => setNotice(errorText(error))), [])

  const execute = async (name: string) => {
    if (action) return
    setAction(name); setNotice('')
    try { setStatus(await runAction(name)) }
    catch (error) { setNotice(errorText(error)) }
    finally { setAction('') }
  }

  const ready = status?.ready === true
  const localMode = status?.mode === 'local'
  const externalProcess = status?.processOwner === 'external'
  const locked = Boolean(action) || !localMode || externalProcess
  const label = runtimeLabel(status)

  return <div className="manage page-body">
    {notice && <div className="error-notice" role="alert">{notice}</div>}

    <section className="status-card card-hover">
      <div className={`status-icon ${ready ? 'running' : status?.installed ? 'stopped' : 'missing'}`}><span className={`dot ${ready ? 'online' : 'offline'}`} />⚡</div>
      <div className="status-copy"><div className="label">GSCORE RUNTIME</div><h2>GsCore</h2><p className="muted">{status?.message ?? '正在读取运行状态…'}</p></div>
      <span className={`badge status-badge ${ready ? 'status-online' : status?.installed ? 'status-idle' : 'status-offline'}`}>{label}</span>
    </section>

    {!status && <div className="loading-strip"><span className="spinner" />正在读取运行状态…</div>}
    {externalProcess && <div className="inline-warning">GsCore 由外部进程运行，启动、停止和重启请回到原运行环境操作。</div>}

    <section className="card action-panel">
      <div className="section-title"><h2>服务操作</h2><div className="action-row top-actions">
        <button className="button" type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? '刷新中…' : '刷新'}</button>
        {!status?.installed && <button className="button primary" type="button" disabled={locked} onClick={() => void execute('install')}>安装</button>}
        {status?.installed && !status.running && <button className="button primary" type="button" disabled={locked} onClick={() => void execute('start')}>启动</button>}
        {status?.running && <button className="button" type="button" disabled={locked} onClick={() => void execute('stop')}>停止</button>}
        {status?.installed && <button className="button" type="button" disabled={locked} onClick={() => void execute('restart')}>重启</button>}
      </div></div>
      <div className="operation-status">{action ? `正在${action}…` : status?.busyTask ? `正在${status.busyTask}：${status.task?.phase ?? '处理中'}…` : `PID ${status?.pid ?? '—'} · ${status?.processOwner === 'plugin' ? '插件托管' : externalProcess ? '外部托管' : '未运行'}`}</div>
    </section>

    <section className="card">
      <div className="section-title"><div><h2>连接</h2><p className="muted">面板与 GsCore 的消息通道</p></div><span className={`badge ${status?.transportReady ? 'status-online' : 'status-offline'}`}>{status?.transport === 'http' ? 'HTTP' : 'WebSocket'} · {status?.transportReady ? '已连接' : '未连接'}</span></div>
      <div className="bridge-metrics"><div><span>传输方式</span><strong>{status?.transport === 'http' ? 'HTTP' : 'WebSocket'}</strong></div><div><span>插件目录</span><strong>{status?.plugins.length ?? '—'}</strong></div><div><span>重连次数</span><strong>{status?.transport === 'websocket' ? status.wsReconnectCount : '—'}</strong></div></div>
      {status?.wsLastError && <p className="muted">最近连接失败，系统会自动重试。</p>}
    </section>

    {status?.task?.status === 'running' && <div className="loading-strip"><span className="spinner" />{status.task.action}：{status.task.phase}</div>}
    {status?.task?.status === 'interrupted' && <div className="inline-warning">上一次操作被重启中断，请确认状态后重新执行。</div>}

    <section className="grid two-column-grid">
      <article className="card console-entry"><div><h2>GsCore 控制台</h2><p className="muted">管理 GsCore 自带功能</p></div><button className="button primary" type="button" onClick={() => { window.location.hash = '/console' }}>打开控制台</button></article>
      <article className="card"><div className="label">消息桥接</div><div className="metric"><strong>{ready ? '正常' : '等待连接'}</strong><span>AlemonJS ↔ GsCore</span></div></article>
    </section>
  </div>
}
