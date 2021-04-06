
const fs = require('fs')
const pathlib = require('path')
const exifr = require('exifr')
const xxh = require('xxhashjs')
const sharp = require('sharp')
const config = require('../config')
const CacheManager = require('../../photos-common/services/CacheService')

const VERSION = config.processor.version
const HASH_BUF_LEN = 4 * (128 * 1024) // 4 * (record_size)

const ThumbsCache = new CacheManager(config.caches.thumbnails)

function errorStacker (ref, stack, details = {}, defret = null) {
  return function (err) {
    console.error(ref, err, details)
    stack.push([ref, err.message])
    return defret
  }
}

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
    }).catch(errorStacker('getJpegDimensions', errors, data))
}

async function getJpegExif ({ data }) {
  return exifr.parse(data.path, {
    // Segments (JPEG APP Segment, PNG Chunks, HEIC Boxes, etc...)
    tiff: true,
    xmp: true,
    icc: true,
    iptc: true,
    jfif: true, // (jpeg only)
    ihdr: true, // (png only)
    // Sub-blocks inside TIFF segment
    ifd0: true, // aka image
    ifd1: true, // aka thumbnail
    exif: true,
    gps: true,
    interop: true,
    // Other TIFF tags
    makerNote: false,
    userComment: false,
    // Filters
    skip: ['makerNote', 'userComment'],
    // Formatters
    translateKeys: true,
    translateValues: true,
    reviveValues: true,
    sanitize: true,
    mergeOutput: true,
    silentErrors: true
  })
    .then((exif) => exif || {})
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
      await fd.close()
      return errorStacker('getHash', errors, data)(err)
    })
  }).catch(errorStacker('getHash/open', errors, data))
}

const resizers = require('./resizers')
async function getJpegThumbnails ({ data, errors }) {
  const thumbnails = {}
  for (const tnType in resizers) {
    const tnName = [data.id, '_', tnType, '.jpg']
    let tnPath = ''
    if (process.env.NODE_ENV === 'test') {
      tnPath = pathlib.join(process.cwd(), 'test', `${tnType}_${data.id}.jpg`)
    } else {
      tnPath = await ThumbsCache.locate(data.id, tnName)
    }
    // check existance
    const exists = await ThumbsCache.exists(tnName)
    // generate if not exists
    if (!exists) {
      await resizers[tnType](data.path, tnPath)
        .catch(errorStacker('getJpegThumbnails/gen/' + tnType, errors, data))
    }
    // meta
    thumbnails[tnType] = await sharp(tnPath)
      .metadata()
      .then(async (metadata) => {
        return {
          path: tnPath,
          width: metadata.width,
          height: metadata.height,
          size: await fs.promises.stat(tnPath)
            .then((stat) => stat.size)
            .catch(errorStacker('getJpegThumbnails/meta/stat/' + tnType, errors, data))
        }
      })
      .catch(errorStacker('getJpegThumbnails/meta/' + tnType, errors, data))
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
    errorStacker('$', pl.errors, data)
  }
  ret.error = pl.errors.length ? pl.errors : null
  //
  return ret
}
