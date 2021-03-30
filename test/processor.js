/*

NODE_ENV=test node test.js

*/

const processor = require('../processor/PhotoProcessor.proc.js')

processor({
  data: {
    id: 0,
    path: './test/dogs.JPG'
  }
}).then((meta) => {
  console.log(meta.data)
})
