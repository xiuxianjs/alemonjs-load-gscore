import assert from 'node:assert/strict'
import test from 'node:test'
import { toMessageReceive } from '../lib/gscore/protocol.js'

test('converts an AlemonJS group message to GsCore MessageReceive', () => {
  const result = toMessageReceive({
    BotId: '10001', MessageId: 'm-1', UserId: '20002', GuildId: '30003',
    MessageText: '你好', IsMaster: false,
    MessageMedia: [{ Type: 'image', Url: 'https://example.com/a.png' }], UserName: '测试用户'
  }, 'AlemonJS')

  assert.equal(result.bot_id, 'AlemonJS')
  assert.equal(result.user_type, 'group')
  assert.equal(result.group_id, '30003')
  assert.deepEqual(result.content, [
    { type: 'text', data: '你好' },
    { type: 'image', data: { type: 'url', content: 'https://example.com/a.png' } }
  ])
})

test('converts supported media types and ignores unsupported media', () => {
  const result = toMessageReceive({
    MessageMedia: [
      { Type: 'record', Url: 'https://example.com/a.mp3' },
      { Type: 'video', Url: 'https://example.com/a.mp4' },
      { Type: 'file', Url: 'https://example.com/a.zip' },
      { Type: 'sticker', Url: 'https://example.com/a.webp' }
    ]
  }, 'AlemonJS')

  assert.deepEqual(result.content, [
    { type: 'audio', data: { type: 'url', content: 'https://example.com/a.mp3' } },
    { type: 'video', data: { type: 'url', content: 'https://example.com/a.mp4' } },
    { type: 'file', data: 'a.zip|https://example.com/a.zip' }
  ])
})

test('preserves AlemonJS channel id for GsCore channel replies', () => {
  const result = toMessageReceive({
    GuildId: 'guild-1', ChannelId: 'channel-9', UserId: 'user-1', MessageText: '你好'
  }, 'AlemonJS')

  assert.equal(result.user_type, 'group')
  assert.equal(result.group_id, 'channel-9')
})

test('flattens file media into the name|url form GsCore parses', () => {
  const result = toMessageReceive({
    MessageMedia: [{ Type: 'file', Url: 'https://example.com/dir/%E6%B5%8B%E8%AF%95.zip?sign=abc' }]
  }, 'AlemonJS')

  assert.deepEqual(result.content, [
    { type: 'file', data: '测试.zip|https://example.com/dir/%E6%B5%8B%E8%AF%95.zip?sign=abc' }
  ])
})

test('forwards at targets from the raw OneBot segments', () => {
  const result = toMessageReceive({
    MessageText: 'ww心面板',
    value: {
      message: [
        { type: 'at', data: { qq: 'Dao Xiang' } },
        { type: 'at', data: { qq: '123456' } },
        { type: 'at', data: { qq: 'all' } },
        { type: 'text', data: { text: 'ww心面板' } }
      ]
    }
  }, 'AlemonJS')

  assert.deepEqual(result.content, [
    { type: 'text', data: 'ww心面板' },
    { type: 'at', data: 'Dao Xiang' },
    { type: 'at', data: '123456' }
  ])
})

test('keeps media handling intact when no raw segments are present', () => {
  const result = toMessageReceive({
    MessageMedia: [{ Type: 'image', Url: 'https://example.com/a.png' }]
  }, 'AlemonJS')

  assert.deepEqual(result.content, [
    { type: 'image', data: { type: 'url', content: 'https://example.com/a.png' } }
  ])
})
