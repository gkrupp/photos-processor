
const fs = require('fs')
const pathlib = require('path')
const exifr = require('exifr')
const xxh = require('xxhashjs')
const sharp = require('sharp')
const config = require('../config')

const resizers = require('./resizers')

const VERSION = config.processor.version
const HASH_BUF_LEN = 4 * (128 * 1024) // 4 * (record_size)

module.exports = async function PhotoProcessor ({ data }) {
  const errors = []
  const ret = {
    error: null,
    version: VERSION,
    data: {}
  }
  try {
    const { id, path } = data

    // dimensions
    ret.data.dimensions = await sharp(path)
      .metadata()
      .then((metadata) => {
        const orientation = metadata.orientation || 1
        const width = orientation < 5 ? metadata.width : metadata.height
        const height = orientation < 5 ? metadata.height : metadata.width
        return {
          width: width,
          height: height,
          mpx: width * height / 1E6,
          aspectRatio: width / height,
          channels: metadata.channels,
          density: metadata.density || null,
          hasAlpha: metadata.hasAlpha
        }
      }).catch((err) => {
        console.error(err, data)
        errors.push(err.message)
        return null
      })

    // exif
    ret.data.exif = await exifr.parse(path, true)

    // hash
    ret.data.hash = await fs.promises.open(path, 'r').then((fd) => {
      const buffer = Buffer.alloc(HASH_BUF_LEN)
      return fd.read({
        buffer: buffer,
        offset: 0,
        length: buffer.length
      }).then(async (data) => {
        const filestat = await fd.stat()
        await fd.close()
        return {
          xxhHead: xxh.h64(data, filestat.size).toString()
        }
      }).catch(async (err) => {
        console.error(err, data)
        errors.push(err.message)
        await fd.close()
        return null
      })
    }).catch((err) => {
      console.error(err, data)
      errors.push(err.message)
      return null
    })

    ret.data.thumbnails = await (async () => {
      const thumbnails = {}
      for (const tnType in resizers) {
        const tnPath = pathlib.join(config.content.thumbDir, tnType, id + '.jpg')
        // check existance
        const exists = await fs.promises.access(tnPath)
          .then(() => true)
          .catch(() => false)
        // generate if not exists
        if (!exists) {
          await resizers[tnType](path, tnPath)
            .catch((err) => {
              console.error(tnType, 'gen', err, data)
              errors.push(err.message)
              return null
            })
        }
        // meta
        thumbnails[tnType] = await sharp(tnPath)
          .metadata()
          .then((metadata) => {
            return {
              path: tnPath,
              width: metadata.width,
              height: metadata.height,
              size: metadata.size
            }
          })
          .catch((err) => {
            console.error(tnType, 'meta', err, data)
            errors.push(err.message)
            return null
          })
      }
      return thumbnails
    })()

  // error
  } catch (err) {
    console.error(err, data)
    errors.push(err.message)
  }
  ret.error = errors.length ? errors : null
  //
  return ret
}
