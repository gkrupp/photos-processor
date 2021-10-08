
function findHighestDependencyVersion (dependencies, name) {
  let highestVersion = 0
  for (const name in dependencies) {
    for (const depname in dependencies[name]) {
      if (depname === name) {
        highestVersion = Math.max(highestVersion, dependencies[name][depname])
      }
    }
  }
  return highestVersion
}

function dependencyScheduler (pipes, processed) {
  // deep copy dependency tree
  const deps = {}
  for (const name in pipes) {
    deps[name] = {}
    for (const dep in pipes[name].dependencies) {
      deps[name][dep] = pipes[name].dependencies[dep]
    }
  }
  let depsLength = Object.keys(deps).length
  const schedule = []
  while (Object.keys(deps).length) {
    for (const name in deps) {
      // no deps
      if (Object.keys(deps[name]).length === 0) {
        // find max requiredVersion
        const highestVersion = Math.max(
          findHighestDependencyVersion(deps, name),
          pipes[name].requiredVersion
        )
        // needs upgrade
        if ((processed?.[name] || 0) < highestVersion) {
          schedule.push(name)
        }
        // remove from deps
        for (const depname in deps) {
          delete deps[depname][name]
        }
        // remove dep
        delete deps[name]
      }
    }
    // noop dep found in iteration
    if (Object.keys(deps).length === depsLength) {
      throw Error('Circular dependency error.')
    }
    //
    depsLength = Object.keys(deps).length
  }
  return schedule
}

function errorStacker (ref, stack, details = {}, defret = null) {
  return function (err) {
    console.error(ref, err, details)
    stack.push([ref, err.message])
    return defret
  }
}

function pipelineInit ({ version = 0, data = {} }) {
  const ret = {
    errors: [],
    version: version,
    data: {},
    convert: {}
  }
  return {
    data,
    ctx: {},
    result: ret.data,
    convert: ret.convert,
    errors: ret.errors,
    version: version,
    ret
  }
}

function pipeResultConverterCore (result, keys, cvrt) {
  const key = keys[0]
  if (keys.length === 1) {
    result[key] = cvrt(result[key])
  } else if (key in result) {
    pipeResultConverterCore(result[key], keys.slice(1), cvrt)
  }
}

function pipeResultConverter (result, convert) {
  for (const key in convert) {
    const keys = key.split('.')
    let cvt = (v) => v
    switch (convert[key]) {
      case 'Date':
        cvt = (v) => new Date(v)
        break
    }
    pipeResultConverterCore(result, keys, cvt)
  }
  return result
}

module.exports = {
  dependencyScheduler,
  errorStacker,
  pipelineInit,
  pipeResultConverter
}
