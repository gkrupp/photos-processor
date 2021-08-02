
const fs = require('fs')
const exifr = require('exifr')
const xxh = require('xxhashjs')
const sharp = require('sharp')
const { Fields } = require('../pipeline')
const { errorStacker, pipelineInit } = require('../utils')

const VERSION = 1
const REQUIRED_VERSION = 1

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
        aspectRatio: Math.round((width / height + Number.EPSILON) * 1000) / 1000,
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
    skip: [
      'makerNote', 'userComment',
      'MediaWhitePoint', 'MediaBlackPoint',
      'RedMatrixColumn', 'GreenMatrixColumn', 'BlueMatrixColumn',
      'RedTRC', 'GreenTCR', 'BlueTCR',
      'ChromaticAdaptation'
    ],
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

// Pipelines

const PipeJPEG =
Fields({
  dimensions: getJpegDimensions,
  exif: getJpegExif,
  hash: getHash
})

// Execution

module.exports = async function MetaProcessorPipe ({ data }) {
  const { ret, pl } = pipelineInit({ version: VERSION, data })
  try {
    await PipeJPEG(pl)
  } catch (err) {
    errorStacker('$', pl.errors, data)
  }
  ret.errors = pl.errors.length ? pl.errors : null
  //
  return ret
}

module.exports.version = VERSION
module.exports.requiredVersion = REQUIRED_VERSION
