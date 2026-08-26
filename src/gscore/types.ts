export type GSCoreMessage = { type: string; data: unknown }

export type MessageReceive = {
  bot_id: string
  bot_self_id: string
  msg_id: string
  user_type: 'group' | 'direct' | 'channel' | 'sub_channel'
  group_id: string
  user_id: string
  user_pm: number
  content: GSCoreMessage[]
  sender: { nickname: string; avatar: string }
}

export type MessageSend = {
  bot_id?: string
  bot_self_id?: string
  msg_id?: string
  target_type?: 'group' | 'direct' | 'channel' | 'sub_channel' | null
  target_id?: string | null
  content: GSCoreMessage[]
}
