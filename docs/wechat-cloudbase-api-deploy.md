# 颐年智陪 API 微信云托管部署说明

## 部署目标

把 `apps/api` 部署到微信云托管，得到公网 HTTPS API 地址，用于：

- 小程序请求后端 API。
- 微信支付 `notify_url` 回调。
- 运营后台访问订单和陪诊员数据。

## 云托管服务建议

- 服务名：`yinian-zhipei-api`
- 部署方式：Dockerfile
- Dockerfile：项目根目录 `Dockerfile.cloudbase-api`
- 监听端口：`5175`
- 健康检查路径：`/health`

## 必填环境变量

云托管服务环境变量中配置：

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=5175

WECHAT_PAY_MODE=live
WECHAT_LOGIN_MODE=live
WECHAT_PAY_APPID=wx75520fafc22173f5
WECHAT_PAY_APPIDS=wx75520fafc22173f5
WECHAT_MINI_APP_SECRETS=wx75520fafc22173f5:小程序AppSecret

WECHAT_PAY_MCH_ID=1112812285
WECHAT_PAY_SERIAL_NO=2E6FA2830A854ACE39C47C500CCAA7EE284CB2F3
WECHAT_PAY_API_V3_KEY=APIv3密钥
WECHAT_PAY_PRIVATE_KEY=商户API私钥内容

WECHAT_PAY_NOTIFY_URL=https://云托管公网域名/api/payments/wechat/notify
```

`WECHAT_PAY_PRIVATE_KEY` 推荐把 `apiclient_key.pem` 内容放入环境变量。换行可以写成 `\n`。

本机生成一行私钥内容的命令：

```bash
awk 'NF { gsub(/\r/, ""); printf "%s\\n", $0 }' /Users/mac/cert/1112812285_20260604_cert/apiclient_key.pem
```

不要把这行内容提交到代码仓库。

## 当前代码已支持

- 本地用 `WECHAT_PAY_PRIVATE_KEY_PATH` 读取私钥文件。
- 云托管用 `WECHAT_PAY_PRIVATE_KEY` 读取私钥内容。
- `HOST=0.0.0.0` 支持容器公网流量进入。
- `/api/payments/wechat/notify` 支持微信支付 API v3 加密回调解密。

## 部署后要替换的前端 API 地址

云托管部署成功后，会得到一个公网 HTTPS 地址，例如：

```text
https://xxxx.service.tcloudbase.com
```

小程序构建时设置：

```bash
TARO_APP_API_BASE=https://xxxx.service.tcloudbase.com npm run build:mini-program
```

运营后台构建时设置：

```bash
VITE_API_BASE=https://xxxx.service.tcloudbase.com npm run build:admin
```

## 支付回调地址

把 `WECHAT_PAY_NOTIFY_URL` 设置为：

```text
https://xxxx.service.tcloudbase.com/api/payments/wechat/notify
```

这个地址必须是微信支付服务器能访问的公网 HTTPS 地址。

## 重要风险

当前 API 仍使用 SQLite。云托管容器重启后，本地文件型数据库可能丢失或不稳定，不适合长期生产。

小范围真实支付联调可以先跑通；试运营建议尽快迁移到云数据库或 PostgreSQL。
