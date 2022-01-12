import debug = require('debug')
import amqp = require('amqplib')
import {
  Connection,
  Response,
  JobWithAction,
  DispatchWithProgress,
} from './types'

const debugLog = debug('integreat:transporter:rabbitmq')

function parseJSON(json: string) {
  try {
    return JSON.parse(json) as JobWithAction
  } catch {
    return null
  }
}

const callHandler = (dispatch: DispatchWithProgress, channel: amqp.Channel) =>
  async function (message: amqp.Message | null) {
    if (message) {
      const content = message.content.toString()
      const job = parseJSON(content)
      if (job?.action) {
        try {
          await dispatch(job.action)
          channel.ack(message)
        } catch {
          // TODO: Is retrying the correct behavior?
          channel.reject(message, true) // requeue
        }
      } else {
        channel.reject(message, false) // don't requeue job with invalid JSON
        debugLog('Queue: Rejected job with invalid JSON.', content)
      }
    }
  }

export default async function listen(
  dispatch: DispatchWithProgress,
  connection: Connection | null
): Promise<Response> {
  if (!connection) {
    debugLog(`Cannot listen to RabbitMQ queue: No connection`)
    return {
      status: 'error',
      error: 'Cannot listen to queue. No connection',
    }
  }

  const { channel, exchName, namespace } = connection
  if (!channel || !exchName || !namespace) {
    debugLog(
      `Cannot listen to RabbitMQ queue '${namespace}': Missing queue, exchange name, or namespace`
    )
    return {
      status: 'error',
      error:
        'Cannot listen to queue. Missing queue, exchange name, or namespace',
    }
  }

  if (typeof dispatch !== 'function') {
    debugLog(
      `Cannot listen to RabbitMQ queue '${namespace}'. dispatch is not a function`
    )
    return {
      status: 'error',
      error: 'Cannot listen to queue. dispatch is not a function',
    }
  }

  const { consumerTag } = await channel.consume(
    namespace,
    callHandler(dispatch, channel),
    { noAck: false }
  )
  debugLog(`Listening to RabbitMQ queue '${namespace}'`)
  // return consumerTag

  return { status: 'ok', data: { consumerTag } }
}
