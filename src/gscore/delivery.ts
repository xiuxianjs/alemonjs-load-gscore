import { Format, logger, sendToChannel, sendToUser, useMessage } from 'alemonjs'
import type { GSCoreMessage, MessageSend } from './types'

function append(format: InstanceType<typeof Format>, item: GSCoreMessage): void {
  if (item.type === 'text' || item.type === 'markdown') format.addText(String(item.data ?? ''))
  else if (item.type === 'at') format.addMention(String(item.data ?? ''))
  else if (item.type === 'image') {
    const image = item.data as { content?: string } | string
    format.addImage(typeof image === 'string' ? image : String(image?.content ?? ''))
  } else if (item.type === 'record' || item.type === 'audio') format.addAudio(String((item.data as { content?: string } | string)?.content ?? item.data ?? ''))
  else if (item.type === 'video') format.addVideo(String((item.data as { content?: string } | string)?.content ?? item.data ?? ''))
  else if (item.type === 'file') format.addText(`[文件] ${String((item.data as { content?: string } | string)?.content ?? item.data ?? '')}`)
  else if (item.type === 'node' && Array.isArray(item.data)) {
    for (const child of item.data as GSCoreMessage[]) append(format, child)
  } else if (item.type.startsWith('log_')) {
    const level = item.type.slice(4) as 'info' | 'warn' | 'error' | 'debug'
    logger[level]?.(`[GsCore] ${String(item.data ?? '')}`)
  } else if (item.type === 'buttons') {
    const values = Array.isArray(item.data) ? item.data : [item.data]
    format.addText(values.flat(Infinity).map(value => `[${String((value as { text?: string; label?: string })?.text ?? (value as { label?: string })?.label ?? '按钮')}]`).join(' '))
  } else logger.debug(`[GsCore] 忽略不支持的消息类型：${item.type}`)
}

function toFormat(content: GSCoreMessage[]): InstanceType<typeof Format> {
  const format = Format.create()
  for (const item of content) append(format, item)
  return format
}

export async function deliver(reply: MessageSend, event?: Parameters<typeof useMessage>[0]): Promise<void> {
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
  if (!event) {
    logger.warn('[GsCore] 主动消息缺少 target_type/target_id，且未找到对应入站消息，已丢弃')
    return
  }
  const [message] = useMessage(event)
  await message.send({ format })
}
