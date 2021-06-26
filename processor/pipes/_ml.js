
const yolo9000 = require('../../photos-common/ml/yolo')
const { Fields } = require('./pipeline')
const { errorStacker, pipelineInit } = require('../utils')

const VERSION = 0
const REQUIRED_VERSION = 0

// Getters

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

const PipeJPEG =
Fields({
  objects: getJpegObjects
})

// Execution

module.exports = async function MLProcessorPipe ({ data }) {
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
