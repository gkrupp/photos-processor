require('dotenv')

module.exports = {
  processor: {
    version: Number(process.env.PROCESSOR_VERSION),
    startup: Boolean(process.env.PROCESSOR_STARTUP),
    requiredVersion: Number(process.env.PROCESSOR_REQUIRED_VERSION),
    mlVersion: Number(process.env.MLPROCESSOR_VERSION),
    mlStartup: Boolean(process.env.MLPROCESSOR_STARTUP),
    mlRequiredVersion: Number(process.env.MLPROCESSOR_REQUIRED_VERSION)
  },
  caches: {
    thumbnails: {
      root: process.env.CACHE_THUMBS_ROOT,
      levels: Number(process.env.CACHE_THUMBS_LEVELS)
    }
  },
  proc: {
    host: process.env.PROC_HOST,
    queuePrefix: process.env.PROC_QUEUE_PREFIX,
    processes: Number(process.env.PROC_NUMBER),
    logLevel: process.env.PROC_LOG_LEVEL
  },
  queues: {
    tracker: process.env.COMMON_Q_TRACKER,
    processor: process.env.COMMON_Q_PROCESSOR,
    mlprocessor: process.env.COMMON_Q_MLPROCESSOR
  },
  redis: {
    host: process.env.RD_HOST,
    password: process.env.RD_PWD
  },
  mongo: {
    uri: process.env.MONGO_URI,
    db: process.env.MONGO_DB,
    collections: {
      users: process.env.MONGO_COLL_USERS,
      albums: process.env.MONGO_COLL_ALBUMS,
      photos: process.env.MONGO_COLL_PHOTOS
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  }
}
