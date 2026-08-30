import { useEffect, useState } from 'react'
import { addOwnerClaim, getApiToken, getConfig, getOwnerClaims, getStatus, saveConfig, setApiToken, setTransport, startOwnerClaim } from '../api/web-api'
import type { OwnerClaim } from '../types'

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /[\\/]/.test(message) ? '操作失败，请查看日志。' : message
}

export default function Config() {
  const [token, setToken] = useState(getApiToken())
  const [text, setText] = useState('')
  const [registerCode, setRegisterCode] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState('')
  const [authEnabled, setAuthEnabled] = useState(false)
  const [transport, setTransportState] = useState<'websocket' | 'http'>('websocket')
  const [ownerClaims, setOwnerClaims] = useState<OwnerClaim[]>([])
  const [ownerClaimUntil, setOwnerClaimUntil] = useState<number | null>(null)
  const [registerCopied, setRegisterCopied] = useState(false)

  const applyConfig = (config: Record<string, unknown>) => {
    setText(JSON.stringify(config, null, 2))
    setRegisterCode(typeof config.REGISTER_CODE === 'string' ? config.REGISTER_CODE : '')
  }

  const handleTextChange = (value: string) => {
    setText(value)
    try {
      const config = JSON.parse(value) as Record<string, unknown>
      if (config && typeof config === 'object' && !Array.isArray(config)) setRegisterCode(typeof config.REGISTER_CODE === 'string' ? config.REGISTER_CODE : '')
    } catch { /* 保存时提示 JSON 错误 */ }
  }

  const updateRegisterCode = (value: string) => {
    setRegisterCode(value)
    try {
      const config = JSON.parse(text) as Record<string, unknown>
      if (!config || typeof config !== 'object' || Array.isArray(config)) return
      config.REGISTER_CODE = value
      setText(JSON.stringify(config, null, 2))
    } catch { /* JSON 暂时无效时保留独立输入 */ }
  }

  const copyRegisterCode = async () => {
    if (!registerCode) return
    try { await navigator.clipboard.writeText(registerCode); setRegisterCopied(true) }
    catch { setNotice('复制失败，请手动复制') }
  }

  useEffect(() => {
    let disposed = false
    setLoading('load')
    void getConfig().then(config => { if (!disposed) { applyConfig(config); setNotice('') } }).catch(error => { if (!disposed) setNotice(errorText(error)) }).finally(() => { if (!disposed) setLoading('') })
    return () => { disposed = true }
  }, [])

  useEffect(() => { void getStatus().then(status => { setAuthEnabled(status.managementAuthEnabled); setTransportState(status.transport) }).catch(() => undefined) }, [])

  useEffect(() => {
    let disposed = false
    const loadClaims = () => void getOwnerClaims().then(state => { if (!disposed) { setOwnerClaims(state.claims); setOwnerClaimUntil(state.activeUntil) } }).catch(error => { if (!disposed) setNotice(errorText(error)) })
    loadClaims()
    if (!ownerClaimUntil) return () => { disposed = true }
    const timer = window.setInterval(loadClaims, 2000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [ownerClaimUntil])

  const run = async (kind: 'load' | 'save') => {
    setLoading(kind)
    try {
      if (kind === 'load') applyConfig(await getConfig())
      else {
        const config = JSON.parse(text) as unknown
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('配置必须是 JSON 对象')
        const status = await saveConfig(config as Record<string, unknown>)
        setNotice(status.restartRequired ? '已保存，重启 GsCore 后生效。' : '已保存')
      }
    } catch (error) { setNotice(errorText(error)) } finally { setLoading('') }
  }

  const updateTransport = async (value: 'websocket' | 'http') => {
    setLoading('transport')
    try { setTransportState((await setTransport(value)).transport); setNotice(value === 'websocket' ? '已切换为 WebSocket' : '已切换为 HTTP') }
    catch (error) { setNotice(errorText(error)) }
    finally { setLoading('') }
  }

  const addMaster = async (claim: OwnerClaim) => {
    setLoading(`master:${claim.userId}`)
    try { await addOwnerClaim(claim.userId); applyConfig(await getConfig()); setOwnerClaims(current => current.filter(item => item.userId !== claim.userId)); setNotice('已添加为 GsCore 主人') }
    catch (error) { setNotice(errorText(error)) }
    finally { setLoading('') }
  }

  const beginOwnerClaim = async () => {
    setLoading('owner-claim')
    try { setOwnerClaims([]); setOwnerClaimUntil(await startOwnerClaim()); setNotice('认领已开启，请让用户私聊机器人发送“/我是主人”') }
    catch (error) { setNotice(errorText(error)) }
    finally { setLoading('') }
  }

  return <div className="page-body config-page">
    {notice && <div className="error-notice" role="status">{notice}</div>}

    <section className="card config-card">
      <div className="section-title"><div><h2>连接</h2><p className="muted">面板使用的消息通道</p></div><span className="badge status-online">{transport === 'websocket' ? 'WebSocket' : 'HTTP'}</span></div>
      <select aria-label="桥接传输" value={transport} disabled={Boolean(loading)} onChange={event => void updateTransport(event.target.value as 'websocket' | 'http')}><option value="websocket">WebSocket（推荐）</option><option value="http">HTTP（兼容）</option></select>
    </section>

    <section className="card register-code-card"><div><h2>REGISTER_CODE</h2><p className="field-hint">首次注册 WebConsole 管理员时使用</p></div><div className="register-code-input"><input aria-label="REGISTER_CODE" type="password" value={registerCode} onChange={event => { setRegisterCopied(false); updateRegisterCode(event.target.value) }} placeholder="未设置" /><button className="button" type="button" disabled={!registerCode} onClick={() => void copyRegisterCode()}>{registerCopied ? '已复制' : '复制'}</button></div></section>

    <section className="card owner-card"><div className="section-title"><div><h2>GsCore 主人</h2><p className="field-hint">用于执行受保护的管理指令</p></div><button className="button primary" type="button" disabled={Boolean(loading)} onClick={() => void beginOwnerClaim()}>{loading === 'owner-claim' ? '开启中…' : ownerClaimUntil ? '认领中' : '开启认领'}</button></div>
      {ownerClaimUntil && <div className="claim-row"><span className="muted">等待私聊“/我是主人” · 截止 {new Date(ownerClaimUntil).toLocaleTimeString()}</span></div>}
      {ownerClaims.map(claim => <div className="claim-row" key={claim.userId}><span>{claim.userName || claim.userId}</span><button className="button" type="button" disabled={Boolean(loading)} onClick={() => void addMaster(claim)}>{loading === `master:${claim.userId}` ? '添加中…' : '添加'}</button></div>)}
    </section>

    <section className="card token"><div className="section-title"><div><h2>管理 API Token</h2><p className="field-hint">{authEnabled ? '已启用 Token 校验' : '未启用 Token 校验'}</p></div><span className={`badge ${authEnabled ? 'status-online' : 'status-idle'}`}>{authEnabled ? '已启用' : '可选'}</span></div><input aria-label="管理 API Token" type="password" value={token} onChange={event => { setToken(event.target.value); setApiToken(event.target.value) }} placeholder="输入 Token" /></section>

    <details className="advanced-config"><summary>高级配置</summary><section className="card config-card"><div className="section-title"><h2>GsCore 配置 JSON</h2><div className="action-row top-actions"><button className="button" type="button" disabled={Boolean(loading)} onClick={() => void run('load')}>{loading === 'load' ? '读取中…' : '重新读取'}</button><button className="button primary" type="button" disabled={!text.trim() || Boolean(loading)} onClick={() => void run('save')}>{loading === 'save' ? '保存中…' : '保存'}</button></div></div><textarea aria-label="GsCore 配置 JSON" value={text} onChange={event => handleTextChange(event.target.value)} placeholder="暂无配置内容" /></section></details>
  </div>
}
