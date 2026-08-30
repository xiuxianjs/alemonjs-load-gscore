import { useEffect, useState } from 'react'
import { getCoreCommandPrefix } from '../api/web-api'
import type { CoreCommandPrefix } from '../types'

const managementCommands = [
  ['#gs 状态', '查看安装、运行和连接状态'],
  ['#gs 安装', '安装本机 GsCore'],
  ['#gs 启动', '启动 GsCore'],
  ['#gs 停止', '停止 GsCore'],
  ['#gs 重启', '重启 GsCore'],
  ['#gs 日志', '提示到日志页查看最新日志'],
  ['#gs 启用HTTP', '启用 HTTP 兼容模式'],
  ['#gs 安装插件 <Git 仓库>', '从 Git 仓库安装插件'],
  ['#gs 更新插件 <目录名>', '更新指定插件'],
  ['#gs 删除插件 <目录名>', '删除指定插件']
]

function CommandList({ commands, onCopy }: { commands: string[][]; onCopy: (command: string) => void }) {
  return <div className="command-list">{commands.map(([command, result]) => <div className="command-row" key={command}><div><code>{command}</code><span>{result}</span></div><button className="button" type="button" onClick={() => void onCopy(command)}>复制</button></div>)}</div>
}

export default function Commands() {
  const [notice, setNotice] = useState('')
  const [corePrefix, setCorePrefix] = useState<CoreCommandPrefix | null>(null)
  useEffect(() => {
    void getCoreCommandPrefix()
      .then(setCorePrefix)
      .catch(error => setNotice(error instanceof Error ? error.message : String(error)))
  }, [])
  const copy = async (command: string) => {
    try { await navigator.clipboard.writeText(command); setNotice('已复制') }
    catch { setNotice('复制失败，请手动复制') }
  }
  const coreCommands = corePrefix?.available
    ? [[`${corePrefix.prefix}重置网页控制台密码`, `重置 WebConsole 管理员密码；${corePrefix.required ? `当前 core_command 强制前缀为“${corePrefix.prefix}”。` : '当前未启用强制前缀。'}收到确认码后须在 15 秒内发送确认码`]]
    : []

  return <div className="page-body commands-page">
    {notice && <div className="error-notice" role="status">{notice}</div>}
    <section className="card command-card"><div className="section-title"><div><h2>管理指令</h2><p className="field-hint">发送给机器人；仅 AlemonJS 主人可用</p></div></div><CommandList commands={managementCommands} onCopy={copy} /></section>
    <section className="card command-card"><div className="section-title"><div><h2>GsCore 指令</h2><p className="field-hint">私聊机器人；需是 GsCore 主人</p></div></div>{corePrefix === null ? <p className="field-hint">正在读取 core_command 指令前缀…</p> : corePrefix.available ? <CommandList commands={coreCommands} onCopy={copy} /> : <p className="field-hint">无法读取 core_command 插件配置，因此不展示可能不正确的指令。</p>}</section>
  </div>
}
