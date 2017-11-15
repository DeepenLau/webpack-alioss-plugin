const co = require('co')
const oss = require('ali-oss')
const chalk = require('chalk')
const _ = require('lodash')
const red = chalk.red
const green = chalk.bold.green

const config = {
  ossOptions: {
    // accessKeyId: '',
    // accessKeySecret: '',
    // bucket: '',
    // region: ''
  },
  prefix: '',
  exclude: /.*/,
  enableLog: '',
  ignoreError: false,
  removeMode: true
}
let store = null

const logInfo = (str) => {
  !config.enableLog || console.log(str)
}

module.exports = class WebpackAliOSSPlugin {
  constructor (cfg) {
    config.ossOptions = cfg.ossOptions
    // config.ossOptions.accessKeyId = cfg.accessKeyId
    // config.ossOptions.accessKeySecret = cfg.accessKeySecret
    // config.ossOptions.bucket = cfg.bucket
    // config.ossOptions.region = cfg.region
    // config.ossOptions.internal = !!cfg.internal
    config.prefix = cfg.prefix.endsWith('/') ? cfg.prefix : `${cfg.prefix}/`
    config.exclude = cfg.exclude && cfg.exclude !== '' ? cfg.exclude : config.exclude
    config.ignoreError = cfg.ignoreError ? cfg.ignoreError : false
    config.enableLog = cfg.enableLog === false ? cfg.enableLog : true
    config.removeMode = cfg.deleteMode === false ? cfg.deleteMode : true
  }

  apply (compiler) {
    store = oss(config.ossOptions)
    compiler.plugin('emit', (compilation, cb) => {
      uploadFiles(compilation)
        .then(() => {
          cb()
        })
        .catch((err) => {
          console.log('\n')
          console.log(`${red('OSS 上传出错')}:::: ${red(err.name)}-${red(err.code)}: ${red(err.message)}`)
          if (config.ignoreError) {
            cb()
          } else {
            cb(err)
          }
        })
    })
  }
}

let uploadIndex = 0
const uploadFiles = (compilation) => {
  const files = getAssetsFiles(compilation)
  return Promise.all(files.map((file, index, arr) => {
    return uploadFile(file.name, file)
      .then((result) => {
        if (uploadIndex++ === 0) {
          logInfo(green('\n\n OSS 上传中......'))
        }
        logInfo(`上传成功: ${file.name}`)
        if (files.length === uploadIndex) {
          logInfo(green('OSS 上传完成\n'))
        }
        !config.removeMode || delete compilation.assets[file.name]
        // Promise.resolve('上传成功')
      }, (e) => {
        return Promise.reject(e)
      })
  }))
}

// const uploadFile = (name, assetObj) => {
//   return co(function *() {
//     const uploadName = `${config.prefix}${name}`
//     return yield store.put(uploadName, Buffer.from(assetObj.content))
//   })
// }

const uploadFile = (name, assetObj) => {
  let retryTimes = 2
  const uploadStore = () => {
    return co(function *() {
      const uploadName = `${config.prefix}${name}`
      return yield store.put(uploadName, Buffer.from(assetObj.content))
    }).catch(e => {
      if (retryTimes <= 0) {
        return Promise.reject(e)
      }
      retryTimes--
      return uploadStore()
    })
  }
  return uploadStore()
}

const getAssetsFiles = ({assets}) => {
  var items = _.map(assets, (value, name) => {
    if (!config.exclude.test(name)) {
      return {name, path: value.existsAt, content: value.source()}
    }
  })
  const newItems = []
  for (const item of items) {
    if (item && item.name) {
      newItems.push(item)
    }
  }
  return newItems
}
