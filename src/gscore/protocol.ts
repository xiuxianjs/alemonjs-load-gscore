import type { MessageReceive } from './types'

type AlemonSegment = {
  type?: string
  data?: { qq?: string | number }
}

type AlemonEvent = {
  Platform?: string
  BotId?: string
  MessageId?: string
  MessageText?: string
  MessageMedia?: Array<{ Type?: string; Url?: string; FileName?: string }>
  UserId?: string
  UserName?: string
  UserAvatar?: string
  GuildId?: string
  ChannelId?: string
  IsMaster?: boolean
  value?: { message?: AlemonSegment[] }
}

function fileNameOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? ''
  const name = path.split('/').pop() ?? ''
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

// OneBot 适配器给的 MessageText 只拼了 text 段（at 段被显式跳过），@ 的目标只在
// 原始事件 value.message 里。这里把它取出来，交给 GsCore 的 at 段解析。
function atTargets(event: AlemonEvent): string[] {
  const segments = event.value?.message
  if (!Array.isArray(segments)) return []
  const targets: string[] = []
  for (const segment of segments) {
    if (segment?.type !== 'at') continue
    const qq = String(segment.data?.qq ?? '').trim()
    if (!qq || qq === 'all' || targets.includes(qq)) continue
    targets.push(qq)
  }
  return targets
}

export function toMessageReceive(event: AlemonEvent, botID: string): MessageReceive {
  const content: MessageReceive['content'] = []
  if (event.MessageText) content.push({ type: 'text', data: event.MessageText })
  for (const target of atTargets(event)) content.push({ type: 'at', data: target })
  for (const media of event.MessageMedia ?? []) {
    if (!media.Url) continue
    const type = media.Type?.toLowerCase()
    // GsCore 的 file 段按「文件名|链接」字符串解析，发对象会直接把入站处理打成
    // AttributeError（'dict' object has no attribute 'split'），整条消息被丢弃。
    if (type === 'file') {
      content.push({ type: 'file', data: `${media.FileName || fileNameOf(media.Url)}|${media.Url}` })
      continue
    }
    if (type === 'image' || type === 'audio' || type === 'record' || type === 'video') {
      content.push({
        type: type === 'record' ? 'audio' : type,
        data: { type: 'url', content: media.Url }
      })
    }
  }
  return {
    bot_id: botID,
    bot_self_id: String(event.BotId ?? ''),
    msg_id: String(event.MessageId ?? ''),
    // 频道事件通常同时带 GuildId 和 ChannelId。GsCore 当前命令权限筛选
    // 主要放行 group/direct，因此用 group 保证插件能执行，同时把 ChannelId
    // 放入 group_id，桥接层会将回复交给 AlemonJS 的 sendToChannel。
    user_type: event.ChannelId || event.GuildId ? 'group' : 'direct',
    group_id: String(event.ChannelId ?? event.GuildId ?? ''),
    user_id: String(event.UserId ?? ''),
    user_pm: event.IsMaster ? 1 : 6,
    content,
    sender: { nickname: String(event.UserName ?? ''), avatar: String(event.UserAvatar ?? '') }
  }
}
