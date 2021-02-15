const sharp = require('sharp')

const defaultInputOptions = {
  failOnError: false
}

module.exports = {

  icon: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 32, height: 32, fit: 'cover' })
      .sharpen()
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  largeicon: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 80, height: 80, fit: 'cover' })
      .sharpen()
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  tile: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 350, height: 260, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath),

  preview: async (inputPath, outputPath) =>
    sharp(inputPath, defaultInputOptions)
      .rotate()
      .resize({ width: 1200, height: 900, fit: 'outside' })
      .jpeg({ quality: 80, progressive: true })
      .toFile(outputPath)

}
