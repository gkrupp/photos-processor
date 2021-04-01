const pathlib = require('path')
const config = require('../config')

const Photo = require('../../photos-common/models/photo')

let Q = null
let MLQ = null
let HOST = '*'

let photoDB = null

async function handleCompleted (job, res) {
  const { id, path } = job.data
  console.log('Q', job.data.path, res.error)
  // flag
  await photoDB._processingFlags(id, {
    processing: false,
    processingError: res.error,
    version: config.processor.version
  })
  // update
  await photoDB.updateOne({ id, path }, {
    $set: {
      ...res.data,
      processed: new Date()
    }
  })
  passToML(job, res)
}

async function passToML (job, res) {
  const { id, path, mlproc = true } = job.data
  const tnType = 'h960'
  let dataPath = path
  if (res.data.thumbnails && res.thumbnails[tnType]) {
    dataPath = res.data.thumbnails[tnType].path || path
  }
  if (mlproc) {
    await photoDB._processingFlags(id, { mlprocessing: true })
    await MLQ.add(HOST, { id, path: dataPath })
  }
}

async function handleMLCompleted (job, res) {
  const { id, path } = job.data
  console.log('MLQ', job.data.path, res.error)
  // flag
  await photoDB._processingFlags(id, {
    mlprocessing: false,
    mlprocessingError: res.error,
    mlversion: config.processor.mlversion
  })
  // update
  await photoDB.updateOne({ id, path }, {
    $set: {
      ...res.data,
      mlprocessed: new Date()
    }
  })
}

async function init ({ colls, queue, mlqueue, host = '*', processes = 1 }) {
  // queue
  Q = queue
  Q.process(HOST, processes, pathlib.join(__dirname, './PhotoProcessor.proc.js'))
  // mlqueue
  MLQ = queue
  MLQ.process(HOST, processes, pathlib.join(__dirname, './MLProcessor.proc.js'))
  // roots
  HOST = host
  // DBs
  photoDB = new Photo(colls.photos)

  Q.on('completed', handleCompleted)
  Q.on('drained', () => console.log('Q drained'))

  MLQ.on('completed', handleMLCompleted)
  MLQ.on('drained', () => console.log('MLQ drained'))

  await Q.resume()
  await MLQ.resume()
}

async function stop () {
  await Q.pause()
  await MLQ.pause()
}

async function process (id, path, mlproc = true) {
  if (!id && !path) throw new Error('\'id\' or \'path\' is not defined for processing')
  console.log(`Processor.process(id:'${id}', path:'${path}')`)
  await Q.add(HOST, { id, path, mlproc })
  await photoDB._processingFlags(id, { processing: true })
  return 1
}

async function processMissing (mlproc = true) {
  const query = { processed: null, ...Photo.canProcess }
  const photos = await photoDB.find(query, Photo.projections.processor)
  await Promise.all(photos.map(photo => Q.add(HOST, { ...photo, mlproc })))
  const flags = { processing: true }
  if (mlproc) flags.mlprocessing = true
  await photoDB._processingFlags(query, flags)
  console.log(`Processor.processMissing(${photos.length})`)
  return photos.length
}
async function mlProcessMissing () {
  const query = { mlprocessed: null, ...Photo.canProcess }
  const photos = await photoDB.find(query, Photo.projections.processor)
  await Promise.all(photos.map(photo => MLQ.add(HOST, photo)))
  await photoDB._processingFlags(query, { mlprocessing: true })
  console.log(`Processor.mlProcessMissing(${photos.length})`)
  return photos.length
}

async function versionUpgrade (requiredVersion, mlproc = false) {
  const query = { '_processingFlags.version': { $not: { $gte: requiredVersion } }, ...Photo.canProcess }
  const photos = await photoDB.find(query, Photo.projections.processor)
  await Promise.all(photos.map(photo => Q.add(HOST, { ...photo, mlproc })))
  const flags = { processing: true }
  if (mlproc) flags.mlprocessing = true
  await photoDB._processingFlags(query, flags)
  console.log(`Processor.versionUpgrade(${photos.length})`)
  return photos.length
}
async function mlVersionUpgrade (requiredVersion) {
  const query = { '_processingFlags.mlversion': { $not: { $gte: requiredVersion } }, ...Photo.canProcess }
  const photos = await photoDB.find(query, Photo.projections.processor)
  await Promise.all(photos.map(photo => MLQ.add(HOST, photo)))
  await photoDB._processingFlags(query, { mlprocessing: true })
  console.log(`Processor.mlVersionUpgrade(${photos.length})`)
  return photos.length
}

module.exports = {
  init,
  stop,
  process,
  processMissing,
  mlProcessMissing,
  versionUpgrade,
  mlVersionUpgrade
}
