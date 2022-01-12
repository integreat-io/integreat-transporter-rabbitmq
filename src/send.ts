import debug = require('debug')
import { nanoid } from 'nanoid'
import { isObject } from './utils/is'
import { Action, Response, Connection, Job } from './types'

const debugLog = debug('integreat:transporter:rabbitmq')

const publishOptions = {
  persistent: true,
  contentType: 'application/json',
}

export default async function send(
  action: Action,
  connection: Connection | null
): Promise<Response<Job>> {
  if (!connection) {
    debugLog(`Cannot send action to RabbitMQ queue: No connection`)
    return {
      status: 'error',
      error: 'Cannot send action to queue. No connection',
    }
  }

  const { channel, exchName, namespace } = connection
  if (!channel || !exchName || !namespace) {
    debugLog(
      `Cannot send action to RabbitMQ queue '${namespace}': Missing queue, exchange name, or namespace`
    )
    return {
      status: 'error',
      error:
        'Cannot send action to queue. Missing queue, exchange name, or namespace',
    }
  }

  if (isObject(action)) {
    const id = action.meta?.id || nanoid()
    const timestamp = Date.now()
    const data = JSON.stringify({
      id,
      timestamp,
      namespace,
      action: { ...action, meta: { ...action.meta, id } },
    })
    try {
      channel.publish(exchName, '', Buffer.from(data), publishOptions)
      debugLog(
        `Added job '${id}' to RabbitMQ queue ${namespace}': ${JSON.stringify(
          action
        )}`
      )
      return { status: 'ok', data: { id, timestamp, namespace } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debugLog(`Error sending to RabbitMQ queue ${namespace}'. ${message}`)
      return {
        status: 'error',
        error: `Sending to queue failed. ${message}`,
      }
    }
  } else {
    debugLog(`Error sending to RabbitMQ queue ${namespace}'. No valid action`)
    return { status: 'badrequest', error: 'No valid action' }
  }
}
