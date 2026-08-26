import { Format, useEvent, useMessage } from 'alemonjs'
import { backgroundActions, runGSCoreAction, runGSCoreActionInBackground, type GSCoreAction } from '../gscore/control'
import { manager } from '../gscore/manager'

const help = [
  '#gs 状态', '#gs 安装', '#gs 启动 / 停止 / 重启', '#gs 日志', '#gs 启用http',
  '#gs 安装插件 <Git 仓库>', '#gs 更新插件 <目录名>', '#gs 删除插件 <目录名>'
].join('\n')

export default async () => {
  const [event, next] = useEvent();
  if (!event.current.selects || !(event.current.IsMaster || event.current.isMaster)) {
    next()
    return
  }

  const [message] = useMessage()
  const command = event.current.MessageText.replace(/^(\/|#|＃)gs\s*/i, '').trim()
  const reply = (text: string) => message.send({ format: Format.create().addText(text) })
  let action: GSCoreAction = 'status'
  let payload: Record<string, unknown> = {}

  if (command === '状态') action = 'status'
  else if (command === '日志') action = 'logs'
  else if (command === '安装') action = 'install'
  else if (command === '启动') action = 'start'
  else if (command === '停止') action = 'stop'
  else if (command === '重启') action = 'restart'
  else if (/^启用\s*https?$/i.test(command)) action = 'enable-http'
  else if (command.startsWith('安装插件')) {
    action = 'install-plugin'
    payload = { repository: command.slice('安装插件'.length).trim() }
  } else if (command.startsWith('更新插件')) {
    action = 'update-plugin'
    payload = { name: command.slice('更新插件'.length).trim() }
  } else if (command.startsWith('删除插件')) {
    action = 'remove-plugin'
    payload = { name: command.slice('删除插件'.length).trim() }
  } else {
    await reply(help)
    return
  }

  try {
    if (backgroundActions.includes(action)) {
      if (manager.isBusy) throw new Error(`正在${manager.busyTask}，请等待完成`)
      runGSCoreActionInBackground(action, payload)
      await reply(`GsCore：已提交“${command || action}”任务，请稍后使用 #gs 状态或前端查看进度。`)
      return
    }
    const status = await runGSCoreAction(action, payload)
    await reply(action === 'logs' ? 'GsCore：日志已准备，可通过前端查看' : `GsCore：${status.message}`)
  } catch (error) {
    await reply(`GsCore 操作失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
