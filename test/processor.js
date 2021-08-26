/*

NODE_ENV=test node test.js

*/

async function processor (procfile, data, N = 5) {
  const tStartup = Date.now()
  const processor = require(procfile)
  const tStart = Date.now()
  await processor({ data }).then((res) => {
    console.log(res.data)
  })
  for (let i = 0; i < N - 1; ++i) {
    await processor({ data })
  }
  const tEnd = Date.now()
  console.log('startup:', (tStart - tStartup) / 1000 / N)
  console.log('processing:', (tEnd - tStart) / 1000 / N)
  console.log('total:', (tEnd - tStartup) / 1000)
}

async function main () {
  const data = {
    id: 0,
    path: './test/climb.jpg'
  }
  await processor('../processor/pipes/meta.js', data)
}

main()
