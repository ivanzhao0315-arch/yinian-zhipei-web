# 颐年智陪微信小程序

Taro + React + TypeScript 小程序工程。

## 常用命令

从仓库根目录运行：

```bash
npm run dev:mini-program
npm run build:mini-program
```

从当前目录运行：

```bash
npm run dev:weapp
npm run build:weapp
```

## 微信开发者工具打开方式

1. 先运行：

```bash
npm run dev:mini-program
```

2. 打开微信开发者工具。
3. 选择“导入项目”。
4. 项目目录选择：

```text
/Users/mac/ivan/web-frontend-app/apps/mini-program
```

5. 当前 `appid` 是 `touristappid`，后续有正式小程序 AppID 后再替换。

小程序实际编译产物在 `dist/`，配置见 `project.config.json` 的 `miniprogramRoot`。
