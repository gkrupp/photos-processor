
const sharp = require('sharp')
const colorconvert = require('color-convert')
const colorthief = require('../color-thief.js')
const vibrant = require('node-vibrant')
const { Context, Fields } = require('../pipeline')
const { errorStacker, pipelineInit } = require('../utils')

const VERSION = 6
const REQUIRED_VERSION = 6
const DEPENDENCIES = {}

// Getters

async function downsampleCtx ({ data, ctx, errors }) {
  ctx.downsampledBuff = await sharp(data.path, { failOnError: false })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer()
    .catch(errorStacker('downsampleCtx/sharp', errors, data, null))
  return async function ({ ctx }) {
    if (ctx.downsampledBuff) {
      delete ctx.downsampledBuff
    }
  }
}

async function getJpegColors ({ data, ctx, errors }) {
  const quality = 2
  const promiseResults = await Promise.all([
    colorthief.getPalette(ctx.downsampledBuff, 10, quality)
      .catch(errorStacker('getJpegColors/palette', errors, data, [])),
    vibrant.from(ctx.downsampledBuff, { quality })
      .getPalette()
      .then((palette) => {
        const colors = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted', 'LightMuted']
        return colors.map((name) => palette[name].rgb)
      })
      .catch(errorStacker('getJpegColors/vibrant', errors, data, []))
  ])
  const rawpalettes = {
    dominant: promiseResults[0],
    prominent: promiseResults[1]
  }
  return {
    dominant: {
      hex: rawpalettes.dominant.map((raw) => colorconvert.rgb.hex(raw.map(Math.round))),
      lhc: rawpalettes.dominant.map(colorconvert.rgb.lch)
    },
    prominent: {
      hex: rawpalettes.prominent.map((raw) => colorconvert.rgb.hex(raw.map(Math.round))),
      lhc: rawpalettes.prominent.map(colorconvert.rgb.lch)
    }
  }
}

// Pipelines

const PipeJPEG =
Context(downsampleCtx,
  Fields({
    colors: getJpegColors
  })
)

// Execution

module.exports = async function FeatureProcessorPipe ({ data }) {
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
module.exports.dependencies = DEPENDENCIES
