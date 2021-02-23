const dotenv = require('dotenv')
dotenv.config({ path: './config/.env' })
const config = require('./config')

const MongoDBService = require(config.common('./services/MongoDBService'))
const QueueService = require(config.common('./services/QueueService'))
const Processor = require('./processor')

async function init () {
  // DB init
  await MongoDBService.init(config.mongo)
  // Queue init
  await QueueService.init({ redis: config.redis })
  const processorQueue = QueueService.create([config.proc.queuePrefix, config.queues.processor].join(''))
  // Processor init
  await Processor.init({
    colls: MongoDBService.colls,
    queue: processorQueue,
    host: config.proc.host,
    processes: config.proc.processes
  })

  // Process start signal
  process.send = process.send || (() => {})
  process.send('ready')

  // (Startup) ProcessMissing and VersionUpgrade
  if (config.processor.startup) {
    await Processor.processMissing()
    await Processor.versionUpgrade(config.processor.requiredVersion)
  }
}

async function stop () {
  console.log('Shutting down..')
  try {
    await Processor.stop()
    await QueueService.stop()
    await MongoDBService.stop()
  } catch (err) {
    return process.exit(1)
  }
  return process.exit(0)
}

init()

process.on('SIGINT', () => {
  stop()
})
