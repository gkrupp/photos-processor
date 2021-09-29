
let Photo = null
let PhotoProcessor = null
let photoIntervalId = null

async function photoDaemons (photoChunkSize) {
  // await processMissing(photoChunkSize)
  await versionUpgrade(photoChunkSize)
}

async function init ({
  photo, photoProcessor, photoInterval = 60 * 1000, photoChunkSize = 600
}) {
  Photo = photo
  PhotoProcessor = photoProcessor
  // Photo daemon start
  await photoDaemons(photoChunkSize)
  photoIntervalId = setInterval(async () => await photoDaemons(photoChunkSize), photoInterval)
}

async function stop () {
  clearInterval(photoIntervalId)
}

/*
async function processMissing (limit) {
  const photos = await Photo.find(Photo.queries.processMissing(PhotoProcessor.pipeNames), Photo.projections.processor(), { limit })
  await Promise.all(photos.map(photo => PhotoProcessor.process(photo.id, photo.path, photo.processed)))
  if (photos.length) {
    console.log(`Processor.processMissing(${photos.length})`)
  }
  return photos.length
}
*/

async function versionUpgrade (limit) {
  const photos = await Photo.find(Photo.queries.versionUpgrade(PhotoProcessor.pipeVersions), Photo.projections.processor(), { limit })
  await Promise.all(photos.map(photo => PhotoProcessor.process(photo.id, photo.path, photo.processed)))
  if (photos.length) {
    console.log(`Processor.versionUpgrade(${photos.length})`)
  }
  return photos.length
}

module.exports = {
  init,
  stop
}
