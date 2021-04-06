const sharp = require('sharp')

const defaultInputOptions = {
  failOnError: false
}

module.exports = {

  /*
  'i32': async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 32, height: 32, fit: 'cover' })
      .sharpen()
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),
  */

  /*
  i80: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 80, height: 80, fit: 'cover' })
      .sharpen()
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),
  */

  h240: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 320, height: 240, fit: 'outside' })
      .sharpen()
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  h360: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 480, height: 360, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  h480: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 640, height: 480, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  h720: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 960, height: 720, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  h1200: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 1600, height: 1200, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath)

}
