# 颐年智陪 MVP

这是颐年智陪项目的 monorepo 工作区。

## 目录结构

```text
apps/
  prototype/      # React/Vite 页面原型
  mini-program/   # Taro 微信小程序：家属端 + 陪诊员端演示入口
  admin-web/      # React/Vite 运营后台
    api/            # Fastify 本地 API
packages/
  shared/         # 共享类型、状态枚举、价格配置
docs/             # PRD、页面清单、开发任务和技术方案
```

## 当前可用命令

```bash
npm run dev:prototype
npm run build:prototype
npm run lint:prototype
npm run dev:mini-program
npm run build:mini-program
npm run dev:admin
npm run build:admin
npm run dev:api
npm run build:api
```

## 本地服务

- 运营后台：http://127.0.0.1:5174
- 本地 API：http://127.0.0.1:5175
- 微信小程序：用微信开发者工具打开 `apps/mini-program`

## 当前状态

当前 MVP 已跑通：

```text
家属预约 -> 运营确认 -> 运营派单 -> 陪诊员更新进度 -> 异常处理 -> 服务完成 -> 服务总结
```

详见：

```text
docs/current-mvp-status-and-next-plan.md
```
