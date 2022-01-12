import connect from './connect'
import send from './send'
import listen from './listen'
import { EndpointOptions, Transporter } from './types'

/**
 * Bull Queue Transporter for Integreat
 */
const rabbitmqTransporter: Transporter = {
  authentication: 'asObject',

  prepareOptions: (options: EndpointOptions, _serviceId: string) => options,

  connect,

  send,

  listen,

  // TODO: Implement disconnect
  disconnect: async (_connection) => undefined,
}

export default rabbitmqTransporter
