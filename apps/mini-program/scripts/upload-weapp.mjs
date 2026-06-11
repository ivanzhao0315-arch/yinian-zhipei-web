import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ci = require('miniprogram-ci')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectPath = path.resolve(__dirname, '..')
const distPath = path.join(projectPath, 'dist')
const packageJson = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf8'))

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [rawKey, ...rawValue] = arg.replace(/^--/, '').split('=')
    return [rawKey, rawValue.join('=') || 'true']
  })
)

const appid = process.env.WECHAT_MINI_APPID || 'wx75520fafc22173f5'
const privateKeyPath =
  process.env.WECHAT_MINI_UPLOAD_KEY_PATH || '/Users/mac/Downloads/private.wx75520fafc22173f5.key'
const version = args.version || process.env.WECHAT_UPLOAD_VERSION || packageJson.version
const desc = args.desc || process.env.WECHAT_UPLOAD_DESC || '颐年智陪开发版上传'
const robot = Number(args.robot || process.env.WECHAT_UPLOAD_ROBOT || 1)

if (!existsSync(distPath)) {
  throw new Error(`未找到构建产物：${distPath}。请先运行 npm run build:mini-program。`)
}

if (!existsSync(privateKeyPath)) {
  throw new Error(`未找到微信上传私钥：${privateKeyPath}`)
}

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath,
  privateKeyPath,
  ignores: ['node_modules/**/*', 'src/**/*', 'config/**/*', 'scripts/**/*']
})

console.log(`Uploading 颐年智陪 mini program ${version} with robot ${robot}...`)

try {
  await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: {
      es6: true,
      minify: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true,
      uploadWithSourceMap: true
    },
    onProgressUpdate: console.log
  })

  console.log('Mini program upload finished.')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('invalid ip')) {
    console.error(
      '微信代码上传失败：当前外网 IP 不在小程序后台的代码上传 IP 白名单中。请到微信小程序后台添加报错里的 IP 后重试。'
    )
  }
  throw error
}
