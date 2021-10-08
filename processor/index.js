
const pathlib = require('path')
const QueueService = require('../../photos-common/services/QueueService')
const config = require('../config')

const { dependencyScheduler, pipeResultConverter } = require('./utils')

let Photo = null

const PIPES = {
  meta: null,
  feature: null
}
for (const name in PIPES) {
  const { version, requiredVersion, dependencies } = require(pathlib.join(__dirname, `./pipes/${name}`))
  PIPES[name] = { version, requiredVersion, dependencies, Q: null }
}

async function pipeScheduler (job, done) {
  const data = job.data
  const processed = data.processed || {}
  delete data.processed
  // determine schedule
  for (const name in processed) {
    processed[name] = processed[name]?.version || 0
  }
  const schedule = dependencyScheduler(PIPES, processed)
  data.__schedule = schedule
  // feed
  await pipeFeeder(data)
  return done(null, data)
}

async function pipeFeeder (data) {
  const nextPipe = (data?.__schedule || []).shift() || null
  if (nextPipe) {
    await Photo.pushProcessingFlags(data.id, `@processing/${nextPipe}`)
    await PIPES[nextPipe].Q.add(Photo.host, data)
  } else {
    await Photo.popProcessingFlags(data.id, '@processing')
  }
  return nextPipe
}

function pipeResultHandlerFactory (name) {
  return async function (job, res) {
    const { id, path } = job.data
    res.data = pipeResultConverter(res.data, res.convert)
    console.log(name, id.substr(0, 16) + '..', res.errors)
    // flags
    await Photo.popProcessingFlags(id, `@processing/${name}`)
    if (res.errors) await Photo.pushProcessingFlags(id, res.errors)
    // DB update
    const update = {
      ...res.data
    }
    if (!res.errors) {
      update[`processed.${name}`] = {
        version: PIPES[name].version,
        date: new Date()
      }
    }
    await Photo.updateOne({ id, path }, {
      $set: update
    })
    // Local update
    const data = job.data
    for (const key in res.data) {
      data[key] = res.data[key]
    }
    // feed next pipe (if no error)
    if (!res.errors) {
      pipeFeeder(data)
    }
    return data
  }
}

async function init ({ photo, processes = 1 }) {
  Photo = photo
  await QueueService.init({ redis: config.redis })
  // Pipes init
  for (const name of Object.keys(PIPES)) {
    const Q = QueueService.create([config.proc.queuePrefix, config.queues.processor, '/', name].join(''))
    Q.process(Photo.host, processes, pathlib.join(__dirname, `./pipes/${name}`))
    Q.on('completed', pipeResultHandlerFactory(name))
    await Q.resume()
    PIPES[name].Q = Q
  }
  // processor queue
  Photo.processorQueue.process(Photo.host, pipeScheduler)
  await Photo.processorQueue.resume()
}

async function stop () {
  await Photo.processorQueue.pause()
  for (const pipe of PIPES) {
    await PIPES[pipe].pause()
  }
}

async function process (id, path, processed) {
  if (!id || !path) throw new Error('\'id\' or \'path\' is not defined for processing')
  await Photo.pushProcessingFlags(id, '@processing')
  return await Photo.processorQueue.add(Photo.host, { id, path, processed })
}

module.exports = {
  init,
  stop,
  process,
  pipes: PIPES,
  pipeNames: Object.keys(PIPES),
  pipeVersions: Object.keys(PIPES)
    .reduce((acc, pipe) => {
      acc[pipe] = PIPES[pipe].requiredVersion
      return acc
    }, {})
}
