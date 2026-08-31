import { logger, EventsEnum } from 'alemonjs'
import type { Next } from 'alemonjs'
import { getBotID } from '../path'
import { deliver } from './delivery'
import { manager } from './manager'
import { toMessageReceive } from './protocol'

export default async (event: EventsEnum, next: Next) => {
  try {
    const message = toMessageReceive(event, getBotID())
    if (manager.transport === 'websocket') {
      await manager.send(message, event)
    } else {
      if (!manager.isReady && !(await manager.refresh(true))) {
        next()
        return
      }
      const reply = await manager.send(message, event)
      if (reply) await deliver(reply, event)
    }
  } catch (error) {
    logger.warn(`[GsCore] 消息桥接失败：${error instanceof Error ? error.message : String(error)}`)
  }
  next()
}
