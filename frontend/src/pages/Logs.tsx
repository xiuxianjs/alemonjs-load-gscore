import { useEffect, useRef, useState } from 'react'
import { deleteLog, getLogs } from '../api/web-api'
import type { GSCoreLogs } from '../types'

const LOG_ROW_HEIGHT = 24
const LOG_OVERSCAN = 20

function VirtualLog({ content, followTail, onLeaveTail }: { content: string; followTail: boolean; onLeaveTail: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(360)
  const lines = content ? content.split('\n') : []
  const firstIndex = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - LOG_OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight / LOG_ROW_HEIGHT) + LOG_OVERSCAN * 2
  const lastIndex = Math.min(lines.length, firstIndex + visibleCount)

  useEffect(() => {
    if (followTail && viewportRef.current) viewportRef.current.scrollTop = viewportRef.current.scrollHeight
  }, [content, followTail])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const update = () => setViewportHeight(element.clientHeight || 360)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div ref={viewportRef} className="log-scroll" onScroll={event => {
    const target = event.currentTarget
    setScrollTop(target.scrollTop)
    if (followTail && target.scrollHeight - target.scrollTop - target.clientHeight > 24) onLeaveTail()
  }}>
    <div className="virtual-log" style={{ height: Math.max(1, lines.length * LOG_ROW_HEIGHT) }}>
      {lines.slice(firstIndex, lastIndex).map((line, offset) => <div className="virtual-log-row" key={`${firstIndex + offset}-${line.slice(0, 20)}`} style={{ top: (firstIndex + offset) * LOG_ROW_HEIGHT }}>{line || ' '}</div>)}
      {!lines.length && <div className="virtual-log-empty">暂无日志内容</div>}
    </div>
  </div>
}

export default function Logs() {
  const [viewer, setViewer] = useState<GSCoreLogs>({ files: [], activeFile: '', content: '', truncated: false })
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [followTail, setFollowTail] = useState(true)
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState('')
  const loadingRef = useRef(false)
  const load = async (file = viewer.activeFile) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try { setViewer(await getLogs(file)); setNotice('') }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { loadingRef.current = false }
  }
  const remove = async (file: string) => {
    if (!window.confirm(`确定删除日志“${file}”吗？此操作无法恢复。`)) return
    setDeleting(file)
    try {
      setViewer(await deleteLog(file))
      setNotice(`已删除 ${file}`)
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
    finally { setDeleting('') }
  }
  useEffect(() => { void load(); if (!autoRefresh) return; const timer = window.setInterval(() => void load(), 2500); return () => window.clearInterval(timer) }, [viewer.activeFile, autoRefresh])
  return <div className="page-body">{notice && <div className="notice">{notice}</div>}<section className="log-viewer card-hover"><aside className="log-files"><div className="section-title"><div><h2>日志文件</h2><span className="muted">{viewer.files.length} 个文件</span></div></div>{viewer.files.map(file => <div key={file.name} className={`log-file${file.name === viewer.activeFile ? ' selected' : ''}`}><button className="log-file-select" onClick={() => setViewer(prev => ({ ...prev, activeFile: file.name }))}><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB</span></button><button className="button log-delete" disabled={Boolean(deleting)} onClick={() => void remove(file.name)}>{deleting === file.name ? '删除中…' : '删除'}</button></div>)}{!viewer.files.length && <div className="empty">暂无日志文件</div>}</aside><div className="log-content"><div className="section-title"><div><h2>日志查看</h2><span className="muted">{viewer.activeFile || '当前没有可显示的日志'}</span></div><div className="action-row"><span className="badge">{autoRefresh ? '自动刷新中' : '已暂停刷新'}</span><button className="button" onClick={() => void load()}>刷新</button><button className="button" onClick={() => setAutoRefresh(value => !value)}>{autoRefresh ? '暂停刷新' : '自动刷新'}</button><button className="button" onClick={() => setFollowTail(value => !value)}>{followTail ? '取消跟随' : '跟随到底'}</button></div></div>{viewer.truncated && <div className="log-meta">当前仅展示最新日志</div>}<div className="log-terminal"><div className="terminal-bar"><i /><i /><i /><span>{viewer.activeFile || 'log-output'}</span></div><VirtualLog content={viewer.content} followTail={followTail} onLeaveTail={() => setFollowTail(false)} /></div></div></section></div>
}
