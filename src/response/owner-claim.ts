import { Format, useEvent, useMessage } from 'alemonjs'
import { recordOwnerClaim } from '../gscore/owner-claim'

export default async () => {
  const [event] = useEvent()
  const current = event.current
  const [message] = useMessage()
  const reply = (text: string) => message.send({ format: Format.create().addText(text) })
  if (current.GuildId || current.ChannelId) {
    return
  }
  const userId = String(current.UserId ?? '').trim()
  if (!userId) {
    await reply('未读取到平台 UserId，无法登记。')
    return
  }
  const claim = recordOwnerClaim(userId, String(current.UserName ?? '').trim())
  if (!claim) {
    return
  }
  await reply('已登记你的平台 UserId。管理员仍需在 GsCore 配置页手动点击“添加为主人”，不会自动授权。')
}
