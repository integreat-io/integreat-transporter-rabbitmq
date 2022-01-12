import test from 'ava'
import amqp = require('amqplib')

import connect from './connect'

// Setup

const rabbitOptions = {
  hostname: 'localhost',
  port: 5672,
  // username: process.env.RABBITMQ_USERNAME || undefined,
  // password: process.env.RABBITMQ_PASSWORD || undefined,
}

// Tests

test('should return connection object', async (t) => {
  const options = {
    namespace: 'ns1',
    rabbitmq: rabbitOptions,
    maxConcurrency: 5,
  }
  // TODO: Should support authentication

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns1')
  t.is(conn?.exchName, 'ns1_exch')
  t.is(conn?.maxConcurrency, 5)
  t.truthy(conn?.channel)
  t.is(typeof conn?.channel?.publish, 'function')
  t.is(typeof conn?.channel?.consume, 'function')
})

test('should set defaults', async (t) => {
  const options = {
    rabbitmq: rabbitOptions,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'great')
  t.is(conn?.exchName, 'great_exch')
  t.is(conn?.maxConcurrency, 1)
})

test('should reuse a connection', async (t) => {
  const options = {
    namespace: 'ns1',
    rabbitmq: rabbitOptions,
    maxConcurrency: 5,
  }
  const connection = {
    status: 'ok',
    namespace: 'ns1',
    exchName: 'ns1_exch',
    maxConcurrency: 5,
    channel: {} as unknown as amqp.Channel,
  }

  const conn = await connect(options, null, connection)

  t.is(conn, connection)
})

test('should not reuse a connection with error', async (t) => {
  const options = {
    namespace: 'ns1',
    rabbitmq: rabbitOptions,
    maxConcurrency: 5,
  }
  const connection = {
    status: 'error',
    error: 'Could not connect',
    namespace: 'ns1',
    exchName: 'ns1_exch',
    maxConcurrency: 5,
  }

  const conn = await connect(options, null, connection)

  t.not(conn, connection)
  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns1')
  t.is(conn?.exchName, 'ns1_exch')
  t.is(conn?.maxConcurrency, 5)
  t.truthy(conn?.channel)
  t.is(typeof conn?.channel?.publish, 'function')
  t.is(typeof conn?.channel?.consume, 'function')
})

test('should return an error when rabbitmqOptions is missing', async (t) => {
  const options = {
    namespace: 'ns1',
    maxConcurrency: 5,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'error')
  t.is(conn?.error, 'Connection to RabbitMQ failed: Missing RabbitMQ options')
  t.is(conn?.namespace, 'ns1')
  t.is(conn?.exchName, 'ns1_exch')
  t.is(conn?.maxConcurrency, 5)
  t.falsy(conn?.channel)
})

test('should return an error when connection cannot be made', async (t) => {
  const rabbitOptions = {
    hostname: 'unknown.test', // Wrong hostame to trigger error
    port: 5672,
  }
  const options = {
    namespace: 'ns1',
    rabbitmq: rabbitOptions,
    maxConcurrency: 5,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'error')
  t.is(
    conn?.error,
    'Connection to RabbitMQ failed: getaddrinfo ENOTFOUND unknown.test'
  )
  t.is(conn?.namespace, 'ns1')
  t.is(conn?.exchName, 'ns1_exch')
  t.is(conn?.maxConcurrency, 5)
  t.falsy(conn?.channel)
})
