import type { MessageReceive } from './types'

type AlemonEvent = {
  Platform?: string
  BotId?: string
  MessageId?: string
  MessageText?: string
  MessageMedia?: Array<{ Type?: string; Url?: string }>
  UserId?: string
  UserName?: string
  UserAvatar?: string
  GuildId?: string
  ChannelId?: string
  IsMaster?: boolean
}

export function toMessageReceive(event: AlemonEvent, botID: string): MessageReceive {
  const content: MessageReceive['content'] = []
  if (event.MessageText) content.push({ type: 'text', data: event.MessageText })
  for (const media of event.MessageMedia ?? []) {
    if (!media.Url) continue
    const type = media.Type?.toLowerCase()
    if (type === 'image' || type === 'audio' || type === 'record' || type === 'video' || type === 'file') {
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
