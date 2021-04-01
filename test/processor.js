/*

NODE_ENV=test node test.js

*/

async function processor (procfile, data) {
  const tStartup = Date.now()
  const processor = require(procfile)
  const tStart = Date.now()
  return await processor({ data }).then((meta) => {
    const tEnd = Date.now()
    console.log(meta.data)
    console.log('startup:', (tStart - tStartup) / 1000)
    console.log('processing:', (tEnd - tStart) / 1000)
    console.log('total:', (tEnd - tStartup) / 1000)
    return meta
  })
}

async function main () {
  const data = {
    id: 0,
    path: './test/dogs.JPG'
  }
  const res1 = await processor('../processor/PhotoProcessor.proc.js', data)
  data.path = res1.data.thumbnails.h960.path
  await processor('../processor/MLProcessor.proc.js', data)
}

main()
