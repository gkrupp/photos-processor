
function Context (initiator, command) {
  return async function (pl) {
    const ctxClose = await initiator(pl)
    command(pl)
    await ctxClose(pl)
    return pl
  }
}

function Sync (commands = []) {
  return async function (pl) {
    commands.forEach(async (cmd) => await cmd(pl))
    return pl
  }
}

function Async (commands) {
  return async function (pl) {
    await Promise.all(commands.map(async (cmd) => cmd(pl)))
    return pl
  }
}

function Fields (descriptor, Executor = Async) {
  return async function (pl) {
    const commands = []
    for (const key in descriptor) {
      commands.push(async (pl) => {
        pl.result[key] = await descriptor[key](pl)
      })
    }
    const Pipe = Executor(commands)
    await Pipe(pl)
    return pl
  }
}

module.exports = {
  Context,
  Sync,
  Async,
  Fields
}
