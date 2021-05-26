
const colorconvert = require('color-convert')
const colorthief = require('color-thief-node')
const vibrant = require('node-vibrant')
const yolo9000 = require('../../photos-common/ml/yolo')

const VERSION = 0
const REQUIRED_VERSION = 0

function errorStacker (ref, stack, details = {}, defret = null) {
  return function (err) {
    console.error(ref, err, details)
    stack.push([ref, err.message])
    return defret
  }
}

// Getters

async function getJpegColors ({ data, result, errors }) {
  const promiseResults = await Promise.all([
    colorthief.getPaletteFromURL(data.path, 10, 5)
      .catch(errorStacker('getJpegColors/palette', errors, data, [])),
    vibrant.from(data.path, { quality: 5 })
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
    palette: {
      rgb: rawpalettes.dominant.map((raw) => raw.map(Math.round)),
      lhc: rawpalettes.dominant.map(colorconvert.rgb.lch)
    },
    prominent: {
      rgb: rawpalettes.vibrant.map((raw) => raw.map(Math.round)),
      lhc: rawpalettes.vibrant.map(colorconvert.rgb.lch)
    }
  }
}

async function getJpegObjects ({ data, result, errors }) {
  try {
    const preds = yolo9000.detect(data.path)
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

const { Fields } = require('./pipeline')

const PipeJPEG = Fields({
  colors: getJpegColors,
  objects: getJpegObjects
})

// Execution

module.exports = async function MLProcessorPipe ({ data }) {
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

module.exports.version = VERSION
module.exports.requiredVersion = REQUIRED_VERSION
