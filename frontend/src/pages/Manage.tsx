import { useCallback, useEffect, useState } from 'react'
import { getStatus, runAction, subscribeStatus } from '../api/web-api'
import type { GSCoreStatus } from '../types'

export default function Manage() {
  const [status, setStatus] = useState<GSCoreStatus | null>(null)
  const [notice, setNotice] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [action, setAction] = useState('')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try { setStatus(await getStatus()); setNotice('') }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setRefreshing(false) }
  }, [])

  useEffect(() => subscribeStatus(setStatus, error => setNotice(error.message)), [])

  const execute = async (name: string) => {
    if (action) return
    setAction(name); setNotice('')
    try { setStatus(await runAction(name)) }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setAction('') }
  }

  const connected = status?.ready === true
  const localMode = status?.mode === 'local'
  const disabled = Boolean(action) || !localMode
  const statusLabel = !status ? '读取中' : status.busy ? '处理中' : status.running ? '运行中' : status.installed ? '已停止' : '未安装'

  return <div className="manage page-body">
    {notice && <div className="notice animate-fade-in">{notice}</div>}
    <section className="status-card card-hover">
      <div className={`status-icon ${connected ? 'running' : status?.installed ? 'stopped' : 'missing'}`}><span className={`dot ${connected ? 'online' : 'offline'}`} />⚡</div>
      <div className="status-copy"><div className="label">GSCORE RUNTIME</div><h2>GsCore</h2><p className="muted">{status?.message ?? '正在读取 GsCore 状态…'}</p></div>
      <span className={`badge status-badge ${connected ? 'status-online' : status?.installed ? 'status-idle' : 'status-offline'}`}>{statusLabel}</span>
    </section>
    {!status && <div className="loading-strip"><span className="spinner" />正在读取 GsCore 状态…</div>}
    <section className="card action-panel">
      <div className="section-title"><div><h2>服务操作</h2></div><div className="action-row top-actions"><button className="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? '刷新中…' : '刷新状态'}</button><button className="button primary" disabled={disabled || Boolean(status?.installed)} onClick={() => void execute('install')}>安装 GsCore</button><button className="button" disabled={disabled || !status?.installed || status.running} onClick={() => void execute('start')}>启动</button><button className="button" disabled={disabled || !status?.running} onClick={() => void execute('stop')}>停止</button><button className="button" disabled={disabled || !status?.installed} onClick={() => void execute('restart')}>重启</button><button className="button subtle" disabled={disabled || !status?.installed} onClick={() => void execute('enable-http')}>启用 HTTP</button></div></div>
      <p className="muted">{action ? `正在${action}…` : status?.busyTask ? `正在${status.busyTask}：${status.task?.phase ?? '处理中'}…` : `进程 PID：${status?.pid ?? '—'}；就绪：${status?.ready ? '是' : '否'}`}</p>
    </section>
    {status?.task?.status === 'running' && <div className="loading-strip"><span className="spinner" />{status.task.action}：{status.task.phase}，请等待完成。</div>}
    {status?.task?.status === 'interrupted' && <div className="notice">上一次管理任务因 AlemonJS 重启而中断：{status.task.action}。请确认目录状态后重新执行。</div>}
    {!status?.managementAuthEnabled && <div className="notice">当前管理 API 默认不限制。若 Web 面板可被局域网或公网访问，建议在配置中设置 api_token。</div>}
    <section className="grid two-column-grid">
      <article className="card console-entry"><h2>GsCore 控制台</h2><button className="button primary" type="button" onClick={() => { window.location.hash = '/console' }}>打开控制台</button></article>
      <article className="card"><div className="label">桥接能力</div><div className="metric"><strong>{connected ? '运行中' : '等待服务'}</strong><span>消息转发</span></div><div className="metric"><strong>{status?.plugins.length ?? 0}</strong><span>插件目录</span></div></article>
    </section>
    {status?.lastError && <section className="error-card"><strong>最近一次管理错误</strong><span>{status.lastError}</span></section>}
  </div>
}
