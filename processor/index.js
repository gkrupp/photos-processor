
const pathlib = require('path')

const Photo = require('../../photos-common/models/photo')

let Q = null
let HOST = '*'
const PIPES = {
  meta: null,
  feature: null
}

const VERSIONS = {}
for (const name in PIPES) {
  const module = require(pathlib.join(__dirname, `./pipes/${name}`))
  VERSIONS[name] = {
    version: module.version,
    requiredVersion: module.requiredVersion
  }
}

let photoDB = null

async function piper (job, done) {
  const data = job.data
  let _pipes = data?._pipes
  if (!(_pipes instanceof Array)) {
    if (typeof _pipes === 'string') {
      _pipes = [_pipes]
    } else {
      _pipes = Object.keys(PIPES)
    }
  }
  await photoDB.pushProcessingFlags(data.id, _pipes.map((name) => `@processing/${name}`))
  await Promise.all(_pipes.map(name => {
    if (name in PIPES) return PIPES[name].add(HOST, data)
    else return photoDB.pushProcessingFlags(data.id, `Err: pipe not exists: '${name}'`)
  }))
  return done(null, data)
}

const pipeResultHandlerFactory = (name) => async (job, res) => {
  const { id, path } = job.data
  if (res.errors === null) console.log(name, id.substr(0, 16) + '..')
  else console.log(name, id.substr(0, 16) + '..', res.errors)
  // flags
  await photoDB.popProcessingFlags(id, `@processing/${name}`)
  if (res.errors) await photoDB.pushProcessingFlags(id, res.errors)
  // update
  await photoDB.updateOne({ id, path }, {
    $set: {
      ...res.data,
      [`processed.${name}`]: {
        version: VERSIONS[name].version,
        date: new Date()
      }
    }
  })
}

async function init ({ queue, pipes, colls, host = '*', processes = 1 }) {
  // roots
  HOST = host
  // DBs
  photoDB = new Photo(colls.photos)
  // pipes init
  for (const name of Object.keys(PIPES)) {
    const P = pipes[name]
    P.process(HOST, processes, pathlib.join(__dirname, `./pipes/${name}`))
    P.on('completed', pipeResultHandlerFactory(name))
    await P.resume()
    PIPES[name] = P
  }
  // processor queue
  Q = queue
  Q.process(HOST, piper)
  await Q.resume()
}

async function stop () {
  await Q.pause()
  for (const pipe of PIPES) {
    await PIPES[pipe].pause()
  }
}

async function process (id, path, _pipes = null) {
  if (_pipes === null) _pipes = Object.keys(PIPES)
  if (!id || !path) throw new Error('\'id\' or \'path\' is not defined for processing')
  await Q.add(HOST, { id, path, _pipes })
  return true
}

async function _startUpProcessing (query, _pipes) {
  if (_pipes === null) _pipes = Object.keys(PIPES)
  const photos = await photoDB.find(query, Photo.projections.processor())
  await Promise.all(photos.map(photo => process(photo.id, photo.path, _pipes)))
  return photos.length
}
async function processMissing (_pipes = null) {
  if (_pipes === null) _pipes = Object.keys(PIPES)
  let totalLength = 0
  for (const name of _pipes) {
    const photosLength = await _startUpProcessing(Photo.canProcess(name), [name])
    totalLength += photosLength
    console.log(`Processor.processMissing(${name}, ${photosLength})`)
  }
  return totalLength
}
async function versionUpgrade (_pipes = null) {
  if (_pipes === null) _pipes = Object.keys(PIPES)
  let totalLength = 0
  for (const name of _pipes) {
    const query = {
      [`processed.${name}.version`]: { $not: { $gte: VERSIONS[name].requiredVersion } },
      ...Photo.canProcess()
    }
    const photosLength = await _startUpProcessing(query, [name])
    totalLength += photosLength
    console.log(`Processor.versionUpgrade(${name}, ${photosLength})`)
  }
  return totalLength
}

module.exports = {
  init,
  stop,
  process,
  processMissing,
  versionUpgrade,
  pipesNames: Object.keys(PIPES)
}
