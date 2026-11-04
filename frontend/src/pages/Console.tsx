import './console.css'
import { useEffect, useState } from 'react'
import { getStatus } from '../api/web-api'

export default function Console() {
  const [address, setAddress] = useState('')
  // 默认直连：GsCore 的 /app/ 没有 X-Frame-Options，可以跨源嵌入。
  // 走面板的 ./api/gscore/console/ 代理时，代理要改写 JS 里的 /api/ 路径与存储键，
  // 登录类接口一旦被拼错地址就会 401 且难排查，所以直连优先、代理仅作兜底。
  const [direct, setDirect] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void getStatus().then(status => setAddress(status.address)).catch(() => setDirect(false))
  }, [])

  const directUrl = address ? `${address.replace(/\/$/, '')}/app/` : ''
  const useDirect = direct && Boolean(directUrl)
  const src = useDirect ? directUrl : './api/gscore/console/'

  const retry = () => {
    setFailed(false)
    setLoaded(false)
    setReloadKey(value => value + 1)
  }

  return <div className="console-webview">
    {!loaded && !failed && <div className="console-state">正在打开控制台…</div>}
    {failed && <div className="console-state" role="alert">
      <span>控制台暂时无法打开。</span>
      <span className="console-actions">
        <button className="button" type="button" onClick={retry}>重试</button>
        <button className="button" type="button" onClick={() => { setDirect(value => !value); retry() }}>{useDirect ? '改用代理' : '改用直连'}</button>
      </span>
    </div>}
    <iframe
      key={`${src}-${reloadKey}`}
      title="GsCore 控制台"
      src={src}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
    <div className="console-bar">
      <span className="console-bar-text" title={src}>{useDirect ? `直连 ${directUrl}` : '面板代理 · ./api/gscore/console/'}</span>
      {useDirect && <a className="button" href={src} target="_blank" rel="noreferrer">新标签页打开</a>}
      <button className="button" type="button" onClick={() => { setDirect(value => !value); retry() }}>{useDirect ? '改用代理' : '改用直连'}</button>
    </div>
  </div>
}
