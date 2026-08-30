import { Format, ResultCode, logger, sendToChannel, sendToUser, useMessage } from 'alemonjs'
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

function sent(results: unknown): boolean {
  return Array.isArray(results) && results.some(result =>
    result && typeof result === 'object' && (result as { code?: number }).code === ResultCode.Ok)
}

async function replyToSourceEvent(event: Parameters<typeof useMessage>[0], format: InstanceType<typeof Format>): Promise<void> {
  const [message] = useMessage(event)
  await message.send({ format })
}

export async function deliver(reply: MessageSend, event?: Parameters<typeof useMessage>[0]): Promise<void> {
  const format = toFormat(reply.content ?? [])
  if (!format.value.length) return
  const targetID = String(reply.target_id ?? '')
  const targetType = String(reply.target_type ?? '')
  if ((targetType === 'direct' || targetType === 'private') && targetID) {
    const results = await sendToUser(targetID, format.value)
    if (sent(results)) return
    // QQ C2C 主动发送要求带平台目标类型；有入站关联时使用原事件回复，
    // 由平台适配器自动选择正确的 C2C/私信通道。
    if (event) {
      logger.debug('[GsCore] 主动私聊发送未返回成功结果，已回退为关联事件回复')
      await replyToSourceEvent(event, format)
      return
    }
    logger.warn('[GsCore] 私聊主动消息未返回成功结果，缺少关联入站消息，无法安全回退')
    return
  }
  if (targetID && targetType) {
    const results = await sendToChannel(targetID, format.value)
    if (sent(results)) return
    if (event) {
      logger.debug('[GsCore] 主动频道发送未返回成功结果，已回退为关联事件回复')
      await replyToSourceEvent(event, format)
      return
    }
    logger.warn('[GsCore] 频道主动消息未返回成功结果，缺少关联入站消息，无法安全回退')
    return
  }
  if (!event) {
    logger.warn('[GsCore] 主动消息缺少 target_type/target_id，且未找到对应入站消息，已丢弃')
    return
  }
  await replyToSourceEvent(event, format)
}
