const dotenv = require('dotenv')
dotenv.config({ path: './config/.env' })
const config = require('./config')

const MongoDBService = require('../photos-common/services/MongoDBService')
const QueueService = require('../photos-common/services/QueueService')
const Processor = require('./processor')
const Daemon = require('./daemon')

const Photo = require('../photos-common/models/photo2')

async function init () {
  // DB init
  await MongoDBService.init(config.mongo)
  // Queue init
  await QueueService.init({ redis: config.redis })
  const queue = QueueService.create([config.proc.queuePrefix, config.queues.processor].join(''))
  // Models init
  await Photo.init({
    coll: MongoDBService.colls.photos,
    host: config.proc.host,
    processorQueue: queue,
    convertedCacheOpts: config.caches.converted
  })
  // Processor init
  await Processor.init({
    photo: Photo,
    processes: config.proc.processes
  })

  // Process start signal
  process.send = process.send || (() => {})
  process.send('ready')

  // Daemon init
  Daemon.init({
    photo: Photo,
    photoProcessor: Processor
  })
}

async function stop () {
  console.log('Shutting down..')
  try {
    await Daemon.stop()
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
