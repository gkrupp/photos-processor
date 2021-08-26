
const fs = require('fs')
const exifr = require('exifr')
const xxh = require('xxhashjs')
const sharp = require('sharp')
const { Sync, Fields } = require('../pipeline')
const { errorStacker, pipelineInit } = require('../utils')

const VERSION = 2
const REQUIRED_VERSION = 2

const HASH_BUF_LEN = 2 * (128 * 1024) // 4 * (record_size)

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
        hasAlpha: metadata.hasAlpha,
        density: metadata.density || null
      }
    }).catch(errorStacker('getJpegDimensions', errors, data))
}

async function getJpegExif ({ data }) {
  return exifr.parse(data.path, {
    // Filters
    skip: [
      'MediaWhitePoint', 'MediaBlackPoint',
      'RedMatrixColumn', 'GreenMatrixColumn', 'BlueMatrixColumn',
      'RedTRC', 'GreenTCR', 'BlueTCR',
      'ChromaticAdaptation',
      'ComponentsConfiguration'
    ],
    pick: [
      'ExifVersion',
      'ExifImageWidth',
      'ExifImageHeight',

      'Make',
      'Model',
      'Software',

      'Orientation',

      'CreateDate',
      'ModifyDate',
      'OffsetTime',

      'Flash',

      'ExposureTime',
      'ExposureProgram',
      'ExposureCompensation',
      'RecommendedExposureIndex',

      'ISO',
      'FNumber',
      'SensingMethod',
      'SensitivityType',
      'ShutterSpeedValue',
      'ApertureValue',

      'ColorSpace',

      'LensInfo',
      'LensModel',
      'LensSerialNumber',
      'FocalLength',
      'FocalLengthIn35mmFormat',
      'DigitalZoomRatio',

      'MeteringMode',
      'ExposureMode',
      'CustomRendered',
      'WhiteBalance',
      'SceneCaptureType',
      'BrightnessValue',
      'SceneType',

      'GPSLatitudeRef',
      'GPSLatitude',
      'GPSLongitudeRef',
      'GPSLongitude',
      'GPSAltitudeRef',
      'GPSAltitude'
    ],
    // Formatters
    sanitize: true,
    reviveValues: true,
    translateKeys: true,
    translateValues: true,
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

function postProcessing (pl) {
  // dates
  const created = pl.result?.exif?.CreateDate
  const modified = pl.result?.exif?.ModifyDate || created
  if (created) {
    pl.result.created = new Date(created)
  }
  if (modified) {
    pl.result.modified = new Date(modified)
  }
  // GPS
  const latitude = pl.result?.exif?.latitude || null
  const longitude = pl.result?.exif?.longitude || null
  const sealvl = (pl.result?.exif?.GPSAltitudeRef instanceof Array) ? pl.result.exif.GPSAltitudeRef[0] : pl.result?.exif?.GPSAltitudeRef || 0
  const altitude = (pl.result?.exif?.altitude || pl.result?.exif?.GPSAltitude || 0) * (2 * (1 - sealvl) - 1)
  if (latitude !== null && longitude !== null) {
    pl.result.location = {
      type: 'Point',
      coordinates: [latitude, longitude, altitude]
    }
  } else {
    pl.result.location = null
  }
  return pl
}

// Pipelines

const PipeJPEG =
  Sync([
    Fields({
      dimensions: getJpegDimensions,
      exif: getJpegExif,
      hash: getHash
    }),
    postProcessing
  ])

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
