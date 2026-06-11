# API

后端 API 目录，承载小程序、陪诊员端和运营后台的数据接口。

## 当前本地 API

```bash
npm run dev:api
npm run build:api
```

默认地址：

```text
http://127.0.0.1:5175
```

当前使用 SQLite 做开发期持久化，数据文件位于：

```text
apps/api/.data/dev.db
```

这个文件会在首次启动时自动创建，并且已经通过根目录 `.gitignore` 排除。它适合本地联调和小范围产品验证，不等同于生产数据库集群。

支持：

- `GET /health`
- `GET /api/meta`
- `POST /api/auth/demo/wechat-login`
- `POST /api/admin/auth/demo-login`
- `POST /api/escort/auth/demo-bind`
- `POST /api/payments/wechat/prepay`
- `POST /api/payments/wechat/notify`
- `POST /api/dev/payments/wechat/mock-success`
- `POST /api/orders`
- `GET /api/my/orders`
- `GET /api/admin/orders`
- `POST /api/admin/orders/:orderId/confirm`
- `POST /api/admin/orders/:orderId/unavailable`
- `POST /api/admin/orders/:orderId/assign`
- `GET /api/admin/escorts`
- `GET /api/escort/tasks`
- `POST /api/escort/tasks/:orderId/progress`
- `POST /api/escort/tasks/:orderId/exceptions`
- `POST /api/admin/orders/:orderId/exceptions/resolve`
- `POST /api/dev/reset`

## 数据持久化说明

- API 启动时会优先读取 `apps/api/.data/dev.db`。
- 数据库文件不存在或数据为空时，会自动生成兰州陪诊演示数据。
- 订单创建、电话确认、派单、进度更新、异常记录和异常处理后都会写入 SQLite。
- 点击运营后台“重置演示数据”会重置 SQLite 表并恢复初始数据。

下一阶段如果接入真实服务，建议把当前 SQLite 表结构迁移到 PostgreSQL，保留现有接口路径，减少小程序和运营后台改动。

## 演示身份与权限

当前还没有接入真实微信登录或后台账号密码，但 API 已经有最小权限边界。开发期通过请求头模拟身份：

```text
x-demo-role: family | admin | escort
x-demo-user-id: user_demo
x-demo-escort-id: esc_003
```

默认身份：

- 未传 `x-demo-role` 时按家属处理。
- 未传 `x-demo-user-id` 时使用 `user_demo`。
- 陪诊员演示身份默认使用 `esc_003`。

当前权限规则：

- 家属只能创建和查看自己的订单。
- 运营后台接口需要 `x-demo-role: admin`。
- 陪诊员任务接口需要 `x-demo-role: escort`。
- 陪诊员只能查看和更新分配给自己的任务。

## 微信支付

当前已接入微信支付 API v3 的后端骨架：

- 创建微信支付预支付单。
- 生成小程序 `requestPayment` 所需参数。
- 保存支付记录。
- 接收微信支付通知。
- 使用 APIv3 密钥解密通知 `resource`。
- 支付成功后把支付记录标记为 `paid`。

本地默认是 mock 模式，不会请求微信支付：

```text
WECHAT_PAY_MODE=mock
```

要切到真实微信支付，需要在本机环境变量里配置：

```text
WECHAT_PAY_MODE=live
WECHAT_PAY_APPID=小程序 AppID
# 如果一个商户号绑定多个小程序，用英文逗号配置多个 AppID
WECHAT_PAY_APPIDS=小程序A AppID,小程序B AppID
WECHAT_MINI_APP_SECRET=小程序 AppSecret
# 多小程序 AppSecret，格式：appid1:secret1,appid2:secret2
WECHAT_MINI_APP_SECRETS=小程序A AppID:小程序A AppSecret,小程序B AppID:小程序B AppSecret
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_SERIAL_NO=商户 API 证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=商户 API 私钥文件绝对路径
# 云托管可改用 WECHAT_PAY_PRIVATE_KEY=商户 API 私钥内容，换行写成 \n
WECHAT_PAY_API_V3_KEY=APIv3 密钥
WECHAT_PAY_NOTIFY_URL=https://你的公网域名/api/payments/wechat/notify
```

不要把商户私钥、APIv3 密钥或证书内容提交到代码仓库。
小程序 AppSecret 也只能放服务端环境变量，不能写进小程序前端代码。

本地真实联调步骤：

1. 在 `apps/api/.env.local` 填写微信配置。
2. 设置 `WECHAT_PAY_MODE=live`。
3. 确认商户号已经关联小程序 AppID。
4. 确认 `WECHAT_PAY_NOTIFY_URL` 是公网 HTTPS 地址。
5. 运行配置检查：

```bash
npm run check:wechat-config -w @yinian-zhipei/api
```

检查脚本只显示是否已配置，不会打印 AppSecret、APIv3 密钥或私钥内容。

开发期预支付示例：

```bash
curl -X POST http://127.0.0.1:5175/api/payments/wechat/prepay \
  -H 'Content-Type: application/json' \
  -H 'x-demo-user-id: user_demo' \
  -d '{"orderId":"ord_001","appId":"小程序 AppID","payerOpenId":"wx_family_demo"}'
```

返回的 `payParams` 可直接映射到小程序 `Taro.requestPayment` / `wx.requestPayment`。

本地模拟支付成功：

```bash
curl -X POST http://127.0.0.1:5175/api/dev/payments/wechat/mock-success \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_001"}'
```

这个接口只用于开发期模拟微信支付成功通知。真实环境必须依赖 `/api/payments/wechat/notify` 接收微信支付服务器回调。

多小程序说明：

- 只有一个小程序时，可只配 `WECHAT_PAY_APPID`，预支付接口可以不传 `appId`。
- 一个商户号绑定两个小程序时，建议配置 `WECHAT_PAY_APPIDS`。
- 预支付接口传入的 `appId` 必须在 `WECHAT_PAY_APPIDS` 列表里，否则返回 `wechat_appid_not_allowed`。
- 返回给小程序的 `payParams.appId` 会使用本次请求选择的 AppID。

同时已经预留真实登录所需的数据表和开发期接口：

- `users`：保存家属微信 `open_id`、昵称、手机号。
- `admin_users`：保存后台账号，当前初始化 `admin / admin123` 演示账号。
- `escort_openid_bindings`：保存陪诊员微信 `open_id` 与自营陪诊员 ID 的绑定关系。

开发期接口示例：

```bash
curl -X POST http://127.0.0.1:5175/api/auth/demo/wechat-login \
  -H 'Content-Type: application/json' \
  -d '{"appId":"小程序 AppID","code":"wx.login 返回的 code","nickname":"张女士","phone":"13800138000"}'

curl -X POST http://127.0.0.1:5175/api/admin/auth/demo-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'

curl -X POST http://127.0.0.1:5175/api/escort/auth/demo-bind \
  -H 'Content-Type: application/json' \
  -d '{"openId":"wx_escort_003","escortId":"esc_003"}'
```

微信登录说明：

- 小程序端调用 `wx.login` / `Taro.login` 获取 `code`。
- 后端调用微信 `jscode2session`，用 `appid + appSecret + code` 换取 `openid`。
- 本地 `WECHAT_PAY_MODE=mock` 时，后端会基于 `appId + code` 生成稳定的 mock openId。
- 真实支付时，`/api/payments/wechat/prepay` 必须使用真实 openId 作为 `payerOpenId`。

## 测试

```bash
npm run test:persistence -w @yinian-zhipei/api
```

当前测试覆盖：

- SQLite 数据库自动建表。
- 创建订单。
- 关闭 store 后重新打开数据库。
- 从新 store 读取刚创建的订单。
- 家属订单隔离。
- 陪诊员任务隔离。
- 家属微信 openId 复用同一个 userId。
- 后台演示账号登录。
- 陪诊员 openId 绑定。
- 微信支付记录创建与支付成功落库。
- 微信支付 API v3 通知 resource 解密。
