import ava, { TestInterface } from 'ava'
import amqp = require('amqplib')
import connect from './connect'
import { JobWithAction } from './types'

import send from './send'

interface AvaContext {
  channel: amqp.Channel
  consumerTag: string
}

// Setup

const test = ava as TestInterface<AvaContext>

const rabbitOptions = {
  hostname: 'localhost',
  port: 5672,
  // username: process.env.RABBITMQ_USERNAME || undefined,
  // password: process.env.RABBITMQ_PASSWORD || undefined,
}

async function subscribe(
  channel: amqp.Channel,
  queueName: string,
  cb: (msg: { content: Buffer } | null) => void
) {
  channel.assertQueue(queueName, { durable: true })
  const { consumerTag } = await channel.consume(queueName, cb, {
    noAck: true,
  })
  return consumerTag
}

test.before(async (t) => {
  const connection = await amqp.connect('amqp://localhost')
  t.context.channel = await connection.createChannel()
})

// test.after.always(async (t) => {
//   const { channel, consumerTag } = t.context
//   if (channel && consumerTag) {
//     channel.cancel(consumerTag)
//   }
// })

const wait = (ms: number) =>
  new Promise((resolve, _reject) => {
    setInterval(resolve, ms)
  })

const action = {
  type: 'SET',
  payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
  meta: {},
}

// Tests -- action

test('should send data and return status and data', async (t) => {
  const namespace = 'testSend1'
  const actionWithId = { ...action, meta: { ...action.meta, id: 'action1' } }
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const sub = await subscribe(t.context.channel, namespace, () => undefined)
  const before = Date.now()

  const connection = await connect(options, null, null)
  const ret = await send(actionWithId, connection)

  const after = Date.now()
  t.is(ret.status, 'ok', ret.error)
  t.truthy(ret.data)
  t.is(ret.data?.id, 'action1')
  t.is(ret.data?.namespace, namespace)
  t.true((ret.data?.timestamp as number) >= before)
  t.true((ret.data?.timestamp as number) <= after)

  await wait(500)
  t.context.channel.cancel(sub)
})

test('should push action to queue', async (t) => {
  t.plan(5)
  const namespace = 'testSend2'
  const actionWithId = { ...action, meta: { ...action.meta, id: 'action1' } }
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const before = Date.now()
  const cb = (message: { content: Buffer } | null) => {
    if (message) {
      const after = Date.now()
      const content = JSON.parse(message.content.toString()) as JobWithAction
      t.truthy(content)
      t.is(content.id, 'action1')
      t.deepEqual(content.action, actionWithId)
      t.true(content.timestamp >= before)
      t.true(content.timestamp <= after)
    } else {
      t.fail('Pushed with no content')
    }
  }
  const sub = await subscribe(t.context.channel, namespace, cb)

  const connection = await connect(options, null, null)
  await send(actionWithId, connection)

  await wait(500)
  t.context.channel.cancel(sub)
})

test('should set random id when action has no id', async (t) => {
  const namespace = 'testSend6'
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const sub = await subscribe(t.context.channel, namespace, () => undefined)

  const connection = await connect(options, null, null)
  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  t.is(typeof ret.data?.id, 'string', ret.data?.id)

  await wait(500)
  t.context.channel.cancel(sub)
})

test('should set random id on action', async (t) => {
  t.plan(1)
  const namespace = 'testSend7'
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const cb = (message: { content: Buffer } | null) => {
    if (message) {
      const content = JSON.parse(message.content.toString()) as JobWithAction
      t.is(typeof content.action.meta?.id, 'string')
    } else {
      t.fail('Pushed with no content')
    }
  }
  const sub = await subscribe(t.context.channel, namespace, cb)

  const connection = await connect(options, null, null)
  await send(action, connection)

  await wait(500)
  t.context.channel.cancel(sub)
})

test('should return error when no connection', async (t) => {
  const connection = null

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Cannot send action to queue. No connection')
})

test('should return error when no channel', async (t) => {
  const namespace = 'testSend4'
  const connection = { status: 'ok', namespace, exchName: 'great_testSend4' } // No channel

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(
    ret.error,
    'Cannot send action to queue. Missing queue, exchange name, or namespace'
  )
})

test('should return error when queue throws', async (t) => {
  const namespace = 'testSend5'
  const sub = await subscribe(t.context.channel, namespace, () => undefined)
  const channel = {} as amqp.Channel // Fake channel to force exception

  const connection = {
    status: 'ok',
    namespace,
    channel,
    exchName: 'great_testSend5',
  }
  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.true(
    ret.error?.startsWith('Sending to queue failed.'),
    `Value was '${ret.error}'`
  )

  await wait(500)
  t.context.channel.cancel(sub)
})
