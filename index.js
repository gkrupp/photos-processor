const dotenv = require('dotenv')
dotenv.config({ path: './config/.env' })
const config = require('./config')

const MongoDBService = require('../photos-common/services/MongoDBService')
const QueueService = require('../photos-common/services/QueueService')
const Processor = require('./processor')

async function init () {
  // DB init
  await MongoDBService.init(config.mongo)
  // Queue init
  await QueueService.init({ redis: config.redis })
  const queue = QueueService.create([config.proc.queuePrefix, config.queues.processor].join(''))
  // Pipes init
  const pipes = {}
  for (const name of Processor.pipesNames) {
    pipes[name] = QueueService.create([config.proc.queuePrefix, config.queues.processor, '/', name].join(''))
  }
  // Processor init
  await Processor.init({
    queue,
    pipes,
    colls: MongoDBService.colls,
    host: config.proc.host,
    processes: config.proc.processes
  })

  // Process start signal
  process.send = process.send || (() => {})
  process.send('ready')

  // ProcessMissing and VersionUpgrade
  if (config.processor.processMissing) {
    await Processor.processMissing()
  }
  if (config.processor.versionUpgrade) {
    await Processor.versionUpgrade()
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
