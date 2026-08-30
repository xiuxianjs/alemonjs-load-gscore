import { HeaderDiv, SecondaryDiv, SidebarDiv } from '@alemonjs/react-ui'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'

const Manage = lazy(() => import('./Manage'))
const Logs = lazy(() => import('./Logs'))
const Config = lazy(() => import('./Config'))
const Console = lazy(() => import('./Console'))
const Commands = lazy(() => import('./Commands'))

const THEME_KEY = 'alemonjs-load-gscore:theme'
const SIDEBAR_KEY = 'alemonjs-load-gscore:sidebar-collapsed'

type PageKey = 'manage' | 'logs' | 'config' | 'commands' | 'console'

function currentPage(): PageKey {
  const page = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  return page === 'logs' || page === 'config' || page === 'commands' || page === 'console' ? page : 'manage'
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button className={`nav-item${active ? ' active' : ''}`} type="button" onClick={onClick} aria-current={active ? 'page' : undefined} title={label}><span className="nav-icon" aria-hidden="true">{icon}</span><span className="nav-label">{label}</span></button>
}

export default function App() {
  const [page, setPage] = useState<PageKey>(currentPage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const onHashChange = () => setPage(currentPage())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const go = (next: PageKey) => {
    window.location.hash = `/${next}`
    setPage(next)
  }
  const title = useMemo(() => ({ manage: '管理', logs: '日志', config: '配置', commands: '指令', console: 'GsCore 控制台' })[page], [page])

  return <SecondaryDiv className="app-shell">
    <SidebarDiv className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      <div className="brand-row">
        <button className="brand-badge" type="button" onClick={() => setDark(value => !value)} title="切换主题">⚡</button>
        <div className="brand-copy"><div className="brand-name">GsCore</div><div className="brand-subtitle">AlemonJS</div></div>
        <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'} title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}>{sidebarCollapsed ? '›' : '‹'}</button>
      </div>
      <div className="nav-group-label">运行管理</div>
      <NavItem active={page === 'manage'} onClick={() => go('manage')} icon="⚡" label="管理" />
      <NavItem active={page === 'logs'} onClick={() => go('logs')} icon="📜" label="日志" />
      <NavItem active={page === 'config'} onClick={() => go('config')} icon="⚙️" label="配置" />
      <NavItem active={page === 'commands'} onClick={() => go('commands')} icon="⌘" label="指令" />
      <NavItem active={page === 'console'} onClick={() => go('console')} icon="🖥️" label="控制台" />
    </SidebarDiv>
    <div className="main-shell">
      <div className="mobile-header">
        <HeaderDiv className="mobile-brand"><button className="brand-badge" type="button" onClick={() => setDark(value => !value)} aria-label="切换主题" title="切换主题">⚡</button><strong>GsCore</strong><span>控制台</span></HeaderDiv>
        <div className="mobile-tabs" role="tablist">{(['manage', 'logs', 'config', 'commands', 'console'] as PageKey[]).map(key => <button key={key} type="button" role="tab" aria-selected={page === key} className={`tab${page === key ? ' active' : ''}`} onClick={() => go(key)}>{{ manage: '管理', logs: '日志', config: '配置', commands: '指令', console: '控制台' }[key]}</button>)}</div>
      </div>
      <main className={`content${page === 'console' ? ' console-content' : ''}`}>{page !== 'console' && <div className="page-heading"><h1>{title}</h1></div>}<Suspense fallback={<div className="page-loading"><span className="spinner" />正在打开页面…</div>}>{page === 'manage' && <Manage />}{page === 'logs' && <Logs />}{page === 'config' && <Config />}{page === 'commands' && <Commands />}{page === 'console' && <Console />}</Suspense></main>
    </div>
  </SecondaryDiv>
}
