
const fs = require('fs')
const pathlib = require('path')
const exifr = require('exifr')
const colorconvert = require('color-convert')
const colorthief = require('colorthief')
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
  return exifr.parse(data.path, true)
}

async function getJpegColors ({ data, errors }) {
  const rawpalettes = {
    dominant: await colorthief.getPalette(data.path)
      .catch(errorStacker('getJpegColors/palette', errors, data, [])),
    vibrant: await vibrant.from(data.path, {})
      .getPalette()
      .then((palette) => {
        const colors = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted', 'LightMuted']
        return colors.map((name) => palette[name].rgb)
      })
      .catch(errorStacker('getJpegColors/vibrant', errors, data, []))
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
  if (process.env.NODE_ENV === 'test') {
    console.info('[ info ] Thumbnail generation is omitted in test mode')
    return []
  }
  // gen
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

async function getJpegObjects ({ data, errors }) {
  try {
    const preds = yolo9000.detect(data.path)
    const labels = yolo9000.getLabels(preds)
    return {
      preds,
      labels
    }
  } catch (err) {
    return errorStacker('getJpegLabels', errors, data)
  }
}

// Pipelines

const { Fields } = require('./pipeline')

const PipeJPEG = Fields({
  dimensions: getJpegDimensions,
  exif: getJpegExif,
  colors: getJpegColors,
  hash: getHash,
  thumbnails: getJpegThumbnails,
  objects: getJpegObjects
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
