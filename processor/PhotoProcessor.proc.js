
const fs = require('fs')
const pathlib = require('path')
const exifr = require('exifr')
const xxh = require('xxhashjs')
const sharp = require('sharp')
const config = require('../config')

const VERSION = config.processor.version
const HASH_BUF_LEN = 4 * (128 * 1024) // 4 * (record_size)

// Getters

async function getJpegDimensions ({ data, errors }) {
  return sharp(data.path)
    .metadata()
    .then((metadata) => {
      const orientation = metadata.orientation || 1
      const width = orientation < 5 ? metadata.width : metadata.height
      const height = orientation < 5 ? metadata.height : metadata.width
      return {
        width: width,
        height: height,
        mpx: width * height / 1E6,
        aspectRatio: width / height,
        channels: metadata.channels,
        density: metadata.density || null,
        hasAlpha: metadata.hasAlpha
      }
    }).catch((err) => {
      console.error(err, data)
      errors.push(err.message)
      return null
    })
}

async function getJpegExif ({ data }) {
  return exifr.parse(data.path, true)
}

async function getHash ({ data, errors }) {
  return fs.promises.open(data.path, 'r').then((fd) => {
    const buffer = Buffer.alloc(HASH_BUF_LEN)
    return fd.read({
      buffer: buffer,
      offset: 0,
      length: buffer.length
    }).then(async (data) => {
      const filestat = await fd.stat()
      await fd.close()
      return {
        xxhHead: xxh.h64(data, filestat.size).toString()
      }
    }).catch(async (err) => {
      console.error(err, data)
      errors.push(err.message)
      await fd.close()
      return null
    })
  }).catch((err) => {
    console.error(err, data)
    errors.push(err.message)
    return null
  })
}

const resizers = require('./resizers')
async function getJpegThumbnails ({ data, errors }) {
  if (process.env.NODE_ENV === 'test') {
    console.info('[ info ] Thumbnail generation is omitted in test mode')
    return []
  }
  //
  const thumbnails = {}
  for (const tnType in resizers) {
    const tnPath = pathlib.join(config.content.thumbDir, tnType, data.id + '.jpg')
    // check existance
    const exists = await fs.promises.access(tnPath)
      .then(() => true)
      .catch(() => false)
    // generate if not exists
    if (!exists) {
      await resizers[tnType](data.path, tnPath)
        .catch((err) => {
          console.error(tnType, 'gen', err, data)
          errors.push(err.message)
          return null
        })
    }
    // meta
    thumbnails[tnType] = await sharp(tnPath)
      .metadata()
      .then((metadata) => {
        return {
          path: tnPath,
          width: metadata.width,
          height: metadata.height,
          size: metadata.size
        }
      })
      .catch((err) => {
        console.error(tnType, 'meta', err, data)
        errors.push(err.message)
        return null
      })
  }
  return thumbnails
}

// Pipelines

const { Fields } = require('./pipeline')

const PipeJPEG = Fields({
  dimensions: getJpegDimensions,
  exif: getJpegExif,
  hash: getHash,
  thumbnails: getJpegThumbnails
})

// Execution

module.exports = async function PhotoProcessor ({ data }) {
  const ret = {
    error: null,
    version: VERSION,
    data: {}
  }
  const pl = {
    data,
    result: ret.data,
    errors: []
  }
  try {
    await PipeJPEG(pl)
  } catch (err) {
    console.error(err, data)
    pl.errors.push(err.message)
  }
  ret.error = pl.errors.length ? pl.errors : null
  //
  return ret
}
