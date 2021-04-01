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
  'i80': async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 80, height: 80, fit: 'cover' })
      .sharpen()
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),
  */

  h260: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 350, height: 260, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  h340: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 450, height: 340, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  h960: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 1280, height: 960, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath)

}
