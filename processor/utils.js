
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
  dependencyScheduler,
  errorStacker,
  pipelineInit
}
