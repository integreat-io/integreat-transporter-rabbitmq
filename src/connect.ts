import amqp = require('amqplib')
import { Connection, EndpointOptions, Authentication } from './types'

export default async function (
  { rabbitmq, namespace = 'great', maxConcurrency = 1 }: EndpointOptions,
  _authentication: Authentication | null,
  connection: Connection | null
): Promise<Connection | null> {
  if (connection && connection.status === 'ok') {
    return connection
  }
  const exchName = `${namespace}_exch`
  const connectionFields = {
    namespace,
    exchName,
    maxConcurrency,
  }

  if (!rabbitmq) {
    return {
      status: 'error',
      error: 'Connection to RabbitMQ failed: Missing RabbitMQ options',
      ...connectionFields,
    }
  }

  try {
    // Connect to RabbitMQ and return connection
    const rabbitConnection = await amqp.connect(rabbitmq)
    const channel = await rabbitConnection.createChannel()

    await channel.assertExchange(exchName, 'direct', { durable: true })
    await channel.assertQueue(namespace, { durable: true })
    channel.bindQueue(namespace, exchName, '')
    channel.prefetch(maxConcurrency ?? 1)

    return {
      status: 'ok',
      channel,
      ...connectionFields,
    }
  } catch (error) {
    // Connection failed - return connection with error
    return {
      status: 'error',
      error: `Connection to RabbitMQ failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      ...connectionFields,
    }
  }
}
