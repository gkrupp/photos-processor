const dotenv = require('dotenv')
dotenv.config({ path: './config/.env' })
const config = require('./config')

const MongoDBService = require('../photos-common/services/MongoDBService')
const QueueService = require('../photos-common/services/QueueService')
const Processors = require('./processors')

async function init () {
  // DB init
  await MongoDBService.init(config.mongo)
  // Queue init
  await QueueService.init({ redis: config.redis })
  const processorQueue = QueueService.create([config.proc.queuePrefix, config.queues.processor].join(''))
  const mlprocessorQueue = QueueService.create([config.proc.queuePrefix, config.queues.mlprocessor].join(''))
  // Processor init
  await Processors.init({
    colls: MongoDBService.colls,
    queue: processorQueue,
    mlqueue: mlprocessorQueue,
    host: config.proc.host,
    processes: config.proc.processes
  })

  // Process start signal
  process.send = process.send || (() => {})
  process.send('ready')

  // (Startup) ProcessMissing and VersionUpgrade
  if (config.processor.startup) {
    await Processors.processMissing()
    await Processors.versionUpgrade(config.processor.requiredVersion)
  }
  if (config.processor.mlStartup) {
    await Processors.mlProcessMissing()
    await Processors.mlVersionUpgrade(config.processor.mlRequiredVersion)
  }
}

async function stop () {
  console.log('Shutting down..')
  try {
    await Processors.stop()
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
