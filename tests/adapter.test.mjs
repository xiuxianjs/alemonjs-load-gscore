import assert from 'node:assert/strict'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { GSCoreWebSocketAdapter } from '../lib/gscore/adapter.js'

function waitFor(check, timeout = 4_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() >= deadline) {
        clearInterval(timer)
        reject(new Error('等待条件超时'))
      }
    }, 20)
  })
}

async function createServer() {
  const server = new WebSocketServer({ port: 0 })
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  return { server, url: `ws://127.0.0.1:${address.port}/ws/AlemonJS` }
}

async function closeServer(server) {
  for (const client of server.clients) client.terminate()
  await new Promise(resolve => server.close(resolve))
}

test('sends MessageReceive as a binary frame and dispatches GsCore replies', async () => {
  const { server, url } = await createServer()
  let requestURL = ''
  let received
  let binary = false
  server.once('connection', (socket, request) => {
    requestURL = request.url
    socket.once('message', (data, isBinary) => {
      binary = isBinary
      received = JSON.parse(data.toString())
      socket.send(Buffer.from(JSON.stringify({
        msg_id: 'message-1', target_type: 'direct', target_id: 'user-1', content: [{ type: 'text', data: '收到' }]
      })))
    })
  })
  let reply
  const adapter = new GSCoreWebSocketAdapter({
    getURL: () => url,
    getToken: () => 'secret',
    onMessage: async (message, context) => { reply = { message, context } },
    onWarning: message => { throw new Error(message) }
  })
  try {
    adapter.start()
    await waitFor(() => adapter.state.connected)
    adapter.send({ bot_id: 'AlemonJS', bot_self_id: 'bot-1', msg_id: 'message-1', user_type: 'direct', group_id: '', user_id: 'user-1', user_pm: 6, content: [{ type: 'text', data: '你好' }], sender: { nickname: '', avatar: '' } }, { event: 'context' })
    await waitFor(() => Boolean(reply))
    assert.match(requestURL, /token=secret/)
    assert.equal(binary, true)
    assert.equal(received.msg_id, 'message-1')
    assert.equal(reply.message.target_id, 'user-1')
    assert.deepEqual(reply.context, { event: 'context' })
  } finally {
    adapter.stop()
    await closeServer(server)
  }
})

test('reconnects after the GsCore WebSocket closes', async () => {
  const { server, url } = await createServer()
  let connections = 0
  server.on('connection', socket => {
    connections++
    if (connections === 1) setTimeout(() => socket.close(1011, 'restart'), 30)
  })
  const adapter = new GSCoreWebSocketAdapter({
    getURL: () => url,
    getToken: () => 'secret',
    onMessage: async () => undefined,
    onWarning: () => undefined
  })
  try {
    adapter.start()
    await waitFor(() => connections >= 2 && adapter.state.connected)
    assert.ok(adapter.state.reconnectCount === 0)
  } finally {
    adapter.stop()
    await closeServer(server)
  }
})
