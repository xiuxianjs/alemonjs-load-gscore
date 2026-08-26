import { Format, logger, sendToChannel, sendToUser, useMessage } from 'alemonjs'
import type { Next } from 'alemonjs'
import { getBotID } from '../path'
import { manager } from './manager'
import { toMessageReceive } from './protocol'
import type { GSCoreMessage, MessageSend } from './types'

function append(format: InstanceType<typeof Format>, item: GSCoreMessage): void {
  if (item.type === 'text' || item.type === 'markdown') format.addText(String(item.data ?? ''))
  else if (item.type === 'at') format.addMention(String(item.data ?? ''))
  else if (item.type === 'image') {
    const image = item.data as { content?: string } | string
    format.addImage(typeof image === 'string' ? image : String(image?.content ?? ''))
  } else if (item.type === 'record') format.addAudio(String(item.data ?? ''))
  else if (item.type === 'video') format.addVideo(String(item.data ?? ''))
  else if (item.type === 'file') format.addText(`[文件] ${String((item.data as { content?: string } | string)?.content ?? item.data ?? '')}`)
  else if (item.type === 'node' && Array.isArray(item.data)) {
    for (const child of item.data as GSCoreMessage[]) append(format, child)
  } else if (item.type.startsWith('log_')) {
    const level = item.type.slice(4) as 'info' | 'warn' | 'error' | 'debug'
    logger[level]?.(`[GsCore] ${String(item.data ?? '')}`)
  } else if (item.type === 'buttons') {
    const values = Array.isArray(item.data) ? item.data : [item.data]
    format.addText(values.flat(Infinity).map(value => `[${String((value as { text?: string; label?: string })?.text ?? (value as { label?: string })?.label ?? '按钮')}]`).join(' '))
  }
}

function toFormat(content: GSCoreMessage[]): InstanceType<typeof Format> {
  const format = Format.create()
  for (const item of content) append(format, item)
  return format
}

async function deliver(event: Parameters<typeof useMessage>[0], reply: MessageSend): Promise<void> {
  const format = toFormat(reply.content ?? [])
  if (!format.value.length) return
  const targetID = String(reply.target_id ?? '')
  const targetType = String(reply.target_type ?? '')
  if ((targetType === 'direct' || targetType === 'private') && targetID) {
    await sendToUser(targetID, format.value)
    return
  }
  if (targetID && targetType) {
    await sendToChannel(targetID, format.value)
    return
  }
  const [message] = useMessage(event)
  await message.send({ format })
}

export default async (event: Parameters<typeof useMessage>[0], next: Next) => {
  if (!manager.isReady) {
    // 外部服务可能在 AlemonJS 之后启动；先等待一次探测，避免把服务刚启动后的第一条消息直接丢弃。
    if (!(await manager.refresh(true))) {
      next()
      return
    }
  }
  try {
    const reply = await manager.send(toMessageReceive(event, getBotID()))
    if (reply) await deliver(event, reply)
  } catch (error) {
    logger.warn(`[GsCore] 消息桥接失败：${error instanceof Error ? error.message : String(error)}`)
  }
  next()
}
