import './console.css'
import { useState } from 'react'

export default function Console() {
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className="console-webview">
    {!loaded && !failed && <div className="console-state">正在打开控制台…</div>}
    {failed && <div className="console-state" role="alert">控制台暂时无法打开。<button className="button" type="button" onClick={() => { setFailed(false); setLoaded(false); setReloadKey(value => value + 1) }}>重试</button></div>}
    <iframe key={reloadKey} title="GsCore 控制台" src="./api/gscore/console/" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
  </div>
}
