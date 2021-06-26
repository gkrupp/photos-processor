
function errorStacker (ref, stack, details = {}, defret = null) {
  return function (err) {
    console.error(ref, err, details)
    stack.push([ref, err.message])
    return defret
  }
}

function pipelineInit ({ version, data }) {
  const ret = {
    errors: null,
    version: version,
    data: {}
  }
  const pl = {
    data,
    result: ret.data,
    ctx: {},
    errors: []
  }
  return { ret, pl }
}

module.exports = {
  errorStacker,
  pipelineInit
}
