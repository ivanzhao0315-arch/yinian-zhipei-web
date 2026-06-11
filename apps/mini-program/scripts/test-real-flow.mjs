import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const automator = require('miniprogram-automator')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectPath = path.resolve(__dirname, '..')
const repoRoot = path.resolve(projectPath, '../..')
const cliPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const port = Number(process.env.WECHAT_DEVTOOLS_PORT || 3801)
const wsEndpoint = process.env.WECHAT_DEVTOOLS_WS || `ws://127.0.0.1:${port}`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const required = async (page, selector) => {
  const element = await page.$(selector)
  if (!element) {
    throw new Error(`页面上没有找到元素：${selector}`)
  }
  return element
}

const printDatabaseSnapshot = () => {
  const dbPath = path.join(repoRoot, 'apps/api/.data/dev.db')
  const queries = [
    [
      '最近用户',
      "select id, open_id, nickname, created_at from users order by created_at desc limit 5;"
    ],
    [
      '最近订单',
      "select id, order_no, user_id, hospital_name, visit_date, visit_time, service_package, estimated_price, contact_phone, status, created_at from orders order by created_at desc limit 5;"
    ],
    [
      '最近支付',
      "select id, order_id, out_trade_no, payer_open_id, amount_fen, status, created_at from payments order by created_at desc limit 5;"
    ]
  ]

  for (const [title, query] of queries) {
    console.log(`\n${title}`)
    console.log(
      execFileSync('sqlite3', ['-header', '-column', dbPath, query], {
        encoding: 'utf8'
      }).trim() || '暂无数据'
    )
  }
}

let miniProgram

try {
  try {
    miniProgram = await automator.connect({ wsEndpoint })
  } catch {
    miniProgram = await automator.launch({
      cliPath,
      projectPath,
      port,
      trustProject: true,
      timeout: 120000
    })
  }

  let page = await miniProgram.reLaunch('/pages/index/index')
  await page.waitFor(1000)
  await miniProgram.callWxMethod('removeStorageSync', 'yinianAuth')

  const homeActions = await page.$$('.quick-actions .primary-button')
  if (!homeActions.length) {
    throw new Error('首页没有找到“立即预约”按钮')
  }
  await homeActions[0].tap()
  await wait(1200)

  page = await miniProgram.currentPage()
  console.log(`进入页面：${page.path}`)

  const phoneInput = await required(page, '.text-input')
  await phoneInput.input('13800138001')

  const noteInput = await required(page, '.textarea')
  await noteInput.input('自动化真实登录流程测试')

  const submitButton = await required(page, '.submit-button')
  await submitButton.tap()
  await wait(1200)

  page = await miniProgram.currentPage()
  console.log(`进入页面：${page.path}`)

  const confirmButtons = await page.$$('.confirm-actions .primary-button')
  if (!confirmButtons.length) {
    throw new Error('确认页没有找到“确认提交”按钮')
  }
  await confirmButtons[0].tap()
  await wait(2500)

  page = await miniProgram.currentPage()
  console.log(`进入页面：${page.path}`)

  printDatabaseSnapshot()
} finally {
  if (miniProgram) {
    miniProgram.disconnect()
  }
}
