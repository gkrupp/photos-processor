/*

NODE_ENV=test node test.js

*/
const tStartup = Date.now()

const processor = require('../processor/PhotoProcessor.proc.js')

const tStart = Date.now()
processor({
  data: {
    id: 0,
    path: './test/dogs.JPG'
  }
}).then((meta) => {
	const tEnd = Date.now()
  console.log(meta.data)
	console.log('startup:', (tStart-tStartup)/1000)
	console.log('processing:', (tEnd-tStart)/1000)
	console.log('total:', (tEnd-tStartup)/1000)
})
