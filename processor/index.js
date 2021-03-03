const pathlib = require('path')
const config = require('../config')

const Photo = require('../../photos-common/models/photo')

let Q = null
let HOST = '*'

let photoDB = null

async function handleCompleted (job, res) {
  const { id, path } = job.data
  console.log(job.data.path, res.error)
  // flag
  await photoDB._processingFlags({
    processing: false,
    processingError: res.error,
    version: config.processor.version
  }, { id })
  // update
  await photoDB.updateOne({ id, path }, {
    $set: {
      ...res.data,
      processed: new Date()
    }
  })
}

async function init ({ colls, queue, host = '*', processes = 1 }) {
  // queue
  Q = queue
  Q.process(HOST, processes, pathlib.join(__dirname, './PhotoProcessor.proc.js'))
  // roots
  HOST = host
  // DBs
  photoDB = new Photo(colls.photos)

  Q.on('completed', handleCompleted)

  Q.on('drained', () => console.log('drained'))

  await Q.resume()
}

async function stop () {
  await Q.pause()
}

async function process (id, path) {
  if (!id && !path) throw new Error('\'id\' or \'path\' is not defined for processing')
  console.log(`Processor.process(id:'${id}', path:'${path}')`)
  await Q.add(HOST, { id, path })
  await photoDB._processingFlags({ processing: true }, { id })
  return 1
}

async function processMissing () {
  const query = { processed: null, ...Photo.canProcess }
  const photos = await photoDB.find(query, Photo.projections.processor)
  await Promise.all(photos.map(photo => Q.add(HOST, photo)))
  await photoDB._processingFlags({ processing: true }, query)
  console.log(`Processor.processMissing(${photos.length})`)
  return photos.length
}

async function versionUpgrade (requiredVersion) {
  const query = { '_processingFlags.version': { $not: { $gte: requiredVersion } }, ...Photo.canProcess }
  const photos = await photoDB.find(query, Photo.projections.processor)
  await Promise.all(photos.map(photo => Q.add(HOST, photo)))
  await photoDB._processingFlags({ processing: true }, query)
  console.log(`Processor.versionUpgrade(${photos.length})`)
  return photos.length
}

module.exports = {
  init,
  stop,
  process,
  processMissing,
  versionUpgrade
}
