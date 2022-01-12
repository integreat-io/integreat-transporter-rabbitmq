import ava, { TestInterface } from 'ava'
import sinon = require('sinon')
import amqp = require('amqplib')
import connect from './connect'
import send from './send'
import { Connection } from './types'

import listen from './listen'

// Setup

interface AvaContext {
  channel: amqp.Channel
}

const test = ava as TestInterface<AvaContext>

const action = {
  type: 'SET',
  payload: {
    type: 'entry',
    data: [{ id: 'ent1', $type: 'entry', title: 'Entry 1' }],
  },
  meta: { ident: { id: 'johnf' }, queue: true },
}

const rabbitOptions = {
  hostname: 'localhost',
  port: 5672,
}

test.before(async (t) => {
  const connection = await amqp.connect('amqp://localhost')
  t.context.channel = await connection.createChannel()
})

const wait = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

// Tests

test('should listen to queue and dispatch action', async (t) => {
  const namespace = 'testListen1'
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const actionWithId = { ...action, meta: { ...action.meta, id: 'action1' } }
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const connection = await connect(options, null, null)

  const ret = await listen(dispatch, connection)
  await send(actionWithId, connection)

  t.is(ret.status, 'ok', ret.error)
  await wait(200)
  t.truthy(ret.data)
  t.is(typeof (ret.data as { consumerTag: string }).consumerTag, 'string') // TODO: Return a subscription object or an updated connection?
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], actionWithId)
})

test('should skip messages with invalid JSON', async (t) => {
  const namespace = 'testListen2'
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const connection = await connect(options, null, null)

  const ret = await listen(dispatch, connection)
  await t.context.channel.assertQueue(namespace, { durable: true })
  t.context.channel.sendToQueue(namespace, Buffer.from('Invalid'))

  t.is(ret.status, 'ok', ret.error)
  await wait(200)
  t.is(dispatch.callCount, 0)
})

test.todo('should reject/fail job when action status is error')
test.todo('should not reject/fail job when action status is noaction')
test.todo('should not reject/fail job when action status is queued')

test('should return error when dispatch is not a function', async (t) => {
  const namespace = 'testListen3'
  const dispatch = null
  const actionWithId = { ...action, meta: { ...action.meta, id: 'action1' } }
  const options = {
    namespace: namespace,
    rabbitmq: rabbitOptions,
  }
  const connection = await connect(options, null, null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ret = await listen(dispatch as any, connection)
  await send(actionWithId, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Cannot listen to queue. dispatch is not a function')
})

test('should return error when no connection', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const connection = null

  const ret = await listen(dispatch, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Cannot listen to queue. No connection')
})

test('should return error when connection is missing channel etc', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const connection = {} as Connection

  const ret = await listen(dispatch, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(
    ret.error,
    'Cannot listen to queue. Missing queue, exchange name, or namespace'
  )
})
