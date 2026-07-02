# 颐年智陪 交接文档（Handoff）

更新时间：2026-07-02

## 一、项目是什么

面向兰州老年人陪诊服务的微信小程序 + 运营后台 + API，monorepo 结构：

| 目录 | 说明 | 技术栈 |
|------|------|--------|
| `apps/mini-program` | 家属端微信小程序（预约/支付/订单进度/陪诊员入口） | Taro + React |
| `apps/admin-web` | 运营后台（订单确认/派单/进度/退款/陪诊员管理） | React + Vite |
| `apps/api` | 后端 API（订单状态机/微信支付/通知） | Fastify + node:sqlite |
| `packages/shared` | 共享类型与常量（订单状态、服务套餐、进度步骤） | TypeScript |

- GitHub：`ivanzhao0315-arch/yinian-zhipei-web`（默认分支 `main`）
- 本地工作副本：`/Users/mac/ivan/yinianzhipei`
- 文档目录：`docs/`（PRD、API 状态流转、云托管部署、CLI 发布、审核清单）

## 二、线上环境

| 项 | 值 |
|----|-----|
| 小程序 AppID | `wx75520fafc22173f5` |
| 云托管环境 | `prod-d8gut2f8g6bae46bb`（上海） |
| 云托管服务 | `express-pahl`，当前版本 **035**（2026-07-02 发布） |
| 线上 API | `https://express-pahl-266268-8-1440105299.sh.run.tcloudbase.com` |
| 健康检查 | `GET /health` → `{"ok":true,"persistence":"mysql_snapshot"}` |
| 持久化 | SQLite 内存库 + MySQL 快照（`app_snapshots` 表，每次写操作后序列化持久化） |
| 微信支付 | 商户号 `1112812285`，live 模式，密钥在云托管环境变量里 |
| 小程序版本 | **0.1.2** 已上传（待公众平台提交审核） |
| 运营后台入口 | 线上 API 根路径 `/` 直接服务 admin-web 构建产物 |

密钥统一放在 `/Users/mac/ivan/secrets/`（有 README 索引），勿提交 Git：
- 小程序上传密钥：`weapp-upload-wx75520fafc22173f5-2026-06-03.key`
- 云托管 CLI 登录态：`~/.wxcloudconfig`（过期后到云托管控制台 → 设置 → 全局设置 → CLI 密钥重新生成）

## 三、发布流程（已验证可全自动执行）

### 后端（云托管）
```bash
# 1. 打干净的部署目录（不含 node_modules）
# 2. wxcloud run:deploy . --envId prod-d8gut2f8g6bae46bb --serviceName express-pahl \
#      --dockerfile Dockerfile.cloudbase-api --containerPort 5175 --releaseType FULL --override --noConfirm
# 3. 轮询 wxcloud version:list 直到新版本 normal（约 3-5 分钟）
# 4. 冒烟：/health 200；带伪造 x-demo-user-id 访问 /api/my/orders 应 401；/api/debug/wechat-config 应 404
```
注意：CLI 有交互提示（部署方式选"手动上传代码包"+ 版本备注），且日志组件偶尔崩溃退出——**崩溃不代表部署失败**，以 `version:list` 为准。环境变量配置在云托管服务设置里，`--override` 会沿用。

### 小程序
```bash
TARO_APP_API_BASE=<线上API> npm run build:mini-program
cd apps/mini-program && WECHAT_MINI_UPLOAD_KEY_PATH=/Users/mac/ivan/secrets/weapp-upload-wx75520fafc22173f5-2026-06-03.key \
  node scripts/upload-weapp.mjs --version=X.Y.Z --desc="说明" --robot=1
```
robot=1 是正式通道，robot=2 留作链路测试。上传后需在微信公众平台人工：版本管理 → 提交审核 → 发布。报 `invalid ip` 就把报错里的 IP 加进"小程序代码上传 IP 白名单"。

### 测试
```bash
cd apps/api && npx tsc --noEmit && npx tsx --test src/*.test.ts   # 26 个单测
npm run build:mini-program                                         # 小程序以 Taro 构建为准（独立 tsc 历史上就不干净，勿以它为门禁）
```

## 四、已修复的问题（2026-06 ~ 07，均已上线）

| 类别 | 问题 | 修复 |
|------|------|------|
| 安全·高危 | 家属身份完全信任客户端 `x-demo-user-id` header，生产可读任意用户订单 | `requireFamilyActor`：生产用网关注入的 `x-wx-openid` 解析身份，demo header 仅限非生产 |
| 安全 | `/api/debug/wechat-config` 生产可访问，泄露 appId/商户序列号后缀 | 加 `runtimeAllowsDevEndpoints` 守卫 |
| 安全 | prepay 的 `payerOpenId` 信任请求体 | 优先取可信云身份，body 仅限非生产 |
| 状态机 | 已取消订单可被陪诊员推进度"复活"成进行中/已完成 | `updateProgress`/`createException` 加终态守卫（409 `invalid_status_transition`） |
| 支付 | 微信回调重试/管理员重复同步导致重复推送"已支付"通知 | `markWechatPaymentPaid` 返回 `justPaid` 跃迁标志，通知只在首次跃迁发 |
| 支付 | 未报价订单可生成 0 元支付单 | 金额非正整数抛 `invalid_payment_amount` |
| 数据 | 所有订单联系人硬编码"家属用户" | 预约页采集联系人姓名（必填），确认页展示透传 |
| 杂项 | 单号 `Math.random`、预约页硬编码过期日期、demo header 死代码 | 分别改 `crypto.randomBytes`、动态当天日期、删冗余分支 |

## 五、已知风险与待办（按优先级）

1. **持久化架构是权宜方案**：SQLite 全库序列化到 MySQL 单行 LONGBLOB，数据量大后每次写操作的快照开销会不可接受，且多实例部署会互相覆盖。试运营后应迁移真正的云数据库（`docs/wechat-cloudbase-api-deploy.md` 也有此提示）。云托管请保持**单实例**。
2. **小程序 0.1.2 待提交审核**（公众平台人工操作）。
3. **管理员会话密钥**：`ADMIN_SESSION_SECRET` 未设置时会回退到 `WECHAT_PAY_API_V3_KEY`，建议在云托管环境变量里独立设置。
4. **小程序工程独立 tsc 不通过**（config 目录历史遗留），不影响构建，但想上类型门禁需先清理。
5. 陪诊员任务列表会返回已取消订单（服务端已有守卫兜底，操作会被 409 拒绝），体验上可考虑过滤或标灰。

## 六、常用排查

- 线上接口不通：先 `curl /health`；再查云托管控制台服务日志
- 支付回调不到账：管理后台"同步微信支付"按钮手动拉取；检查 `WECHAT_PAY_NOTIFY_URL`
- 小程序请求被拦：公众平台"服务器域名"需含线上 API 域名
- 部署后行为没变：确认 `version:list` 里新版本已 normal 且流量 100%
