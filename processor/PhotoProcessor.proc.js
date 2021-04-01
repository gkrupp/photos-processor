
const fs = require('fs')
const pathlib = require('path')
const exifr = require('exifr')
const colorconvert = require('color-convert')
const colorthief = require('color-thief-node')
const vibrant = require('node-vibrant')
const xxh = require('xxhashjs')
const sharp = require('sharp')
const yolo9000 = require('../../photos-common/ml/yolo')
const config = require('../config')

const VERSION = config.processor.version
const HASH_BUF_LEN = 4 * (128 * 1024) // 4 * (record_size)

function errorStacker (ref, stack, details = {}, defret = null) {
  return function (err) {
    console.error(ref, err, details)
    stack.push([ref, err.message])
    return defret
  }
}

function pickTnToProcess (result, fallback) {
  const tnType = 'h960'
  if (result.thumbnails && result.thumbnails[tnType]) {
    return result.thumbnails[tnType].path || fallback
  } else {
    return fallback
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
    let tnPath = ''
    if (process.env.NODE_ENV === 'test') {
      tnPath = pathlib.join(process.cwd(), 'test', `${tnType}_${data.id}.jpg`)
    } else {
      tnPath = pathlib.join(config.content.thumbDir, tnType, data.id + '.jpg')
    }
    // check existance
    const exists = await fs.promises.access(tnPath)
      .then(() => true)
      .catch(() => false)
    // generate if not exists
    if (!exists) {
      await resizers[tnType](data.path, tnPath)
        .catch(errorStacker('getJpegThumbnails/gen/' + tnType, errors, data))
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
      .catch(errorStacker('getJpegThumbnails/meta/' + tnType, errors, data))
  }
  return thumbnails
}

async function getJpegColors ({ data, result, errors }) {
  const dataPath = pickTnToProcess(result, data.path)
  const promiseResults = await Promise.all([
    colorthief.getPaletteFromURL(dataPath, 10, 5)
      .catch(errorStacker('getJpegColors/palette', errors, data, [])),
    vibrant.from(dataPath, { quality: 5 })
      .getPalette()
      .then((palette) => {
        const colors = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted', 'LightMuted']
        return colors.map((name) => palette[name].rgb)
      })
      .catch(errorStacker('getJpegColors/vibrant', errors, data, []))
  ])
  const rawpalettes = {
    dominant: promiseResults[0],
    vibrant: promiseResults[1]
  }
  return {
    dominant: {
      rgb: rawpalettes.dominant.map((raw) => raw.map(Math.round)),
      lhc: rawpalettes.dominant.map(colorconvert.rgb.lch)
    },
    vibrant: {
      rgb: rawpalettes.vibrant.map((raw) => raw.map(Math.round)),
      lhc: rawpalettes.vibrant.map(colorconvert.rgb.lch)
    }
  }
}

async function getJpegObjects ({ data, result, errors }) {
  const dataPath = pickTnToProcess(result, data.path)
  try {
    const preds = yolo9000.detect(dataPath)
    const labels = yolo9000.getLabels(preds).join(', ')
    return {
      preds,
      labels
    }
  } catch (err) {
    return errorStacker('getJpegLabels', errors, data)
  }
}

// Pipelines

const { Sync, Async, Fields } = require('./pipeline')

const PipeJPEG = Async([
  Fields({
    dimensions: getJpegDimensions,
    exif: getJpegExif,
    hash: getHash
  }),
  Sync([
    Fields({
      thumbnails: getJpegThumbnails
    }),
    Async([
      Fields({
        colors: getJpegColors,
        objects: getJpegObjects
      })
    ])
  ])
])

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
