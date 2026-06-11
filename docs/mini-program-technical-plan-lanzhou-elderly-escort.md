# 颐年智陪 MVP 微信小程序技术实施方案

## 1. 技术路线决策

第一版采用：

> 微信小程序家属端 + 陪诊员小程序角色入口 + Web 运营后台 + 后端 API + 数据库。

不采用纯 H5 作为主入口。H5/网页只作为宣传落地页和扫码入口，不承接核心订单流程。

## 2. 端划分

### 2.1 微信小程序家属端

面向子女/家属。

核心功能：

- 微信手机号登录。
- 老人档案。
- 提交陪诊需求。
- 查看订单状态。
- 查看陪诊进度。
- 查看服务总结。
- 联系客服。

### 2.2 微信小程序陪诊员端

不单独做 App，首版建议在同一个小程序内通过角色区分进入陪诊员任务页。

核心功能：

- 查看被指派订单。
- 查看任务详情。
- 更新陪诊进度。
- 记录异常。
- 填写服务总结。
- 上传图片凭证。

### 2.3 Web 运营后台

面向客服/运营。

核心功能：

- 后台登录。
- 订单列表。
- 订单详情。
- 确认订单。
- 标记无法服务。
- 指派 4 名自营陪诊员。
- 查看进度。
- 处理异常。
- 审核服务总结。
- 管理陪诊员基础信息。

### 2.4 网页落地页

P1。用于宣传、投放、展示服务和引导扫码进入小程序。

首版可以暂缓，先用小程序二维码和线下转介绍验证。

## 3. 推荐技术栈

### 3.1 小程序端

推荐方案：Taro + React + TypeScript。

原因：

- 当前已有 React/Vite 原型，团队可以复用 React 思维和部分组件结构。
- Taro 可以构建微信小程序。
- TypeScript 对订单状态、表单字段、服务总结等结构化数据更稳。

备选方案：微信原生小程序。

适合情况：

- 团队更熟悉微信原生开发。
- 不希望引入跨端框架。

当前建议：使用 Taro。

### 3.2 运营后台

推荐方案：React + Vite + TypeScript。

原因：

- 当前仓库已经是 React/Vite。
- 可以继续承接运营后台开发。
- 后台不需要小程序框架。

### 3.3 后端 API

推荐方案：Node.js + Fastify 或 NestJS。

MVP 更推荐 Fastify：

- 轻量。
- 开发快。
- 适合小团队和简单业务。

如果团队希望更强工程规范，可选 NestJS。

### 3.4 数据库

推荐方案：PostgreSQL。

原因：

- 订单、进度、异常、服务总结都需要长期留存。
- 后续可能需要统计试点数据。
- 比 SQLite 更适合多人协作和线上部署。

MVP 也可以先用 SQLite，但如果已经准备做小程序上线，建议直接 PostgreSQL。

### 3.5 文件存储

首版需要支持图片：

- 就诊资料图片。
- 进度节点图片。
- 服务总结凭证图片。

推荐使用对象存储，例如腾讯云 COS。

图片必须通过鉴权访问，避免病历、检查单等敏感图片公开暴露。

### 3.6 登录与身份

家属端：

- 微信小程序登录。
- 获取 openid。
- 手机号授权。

陪诊员端：

- 由运营后台创建陪诊员账号。
- 首版可用手机号绑定微信 openid。
- 通过角色判断是否进入陪诊员入口。

运营后台：

- 账号密码登录。
- 首版可手动创建运营账号。

## 4. 建议仓库结构

如果继续使用当前仓库，建议调整为 monorepo：

```text
web-frontend-app/
  apps/
    mini-program/       # Taro 微信小程序：家属端 + 陪诊员端
    admin-web/          # React/Vite 运营后台
    api/                # Node.js 后端 API
  packages/
    shared/             # 共享类型、状态枚举、校验规则
  docs/
```

当前已有 React/Vite 原型可以保留为：

```text
apps/prototype/
```

或者继续放在根目录，等正式开发开始时再迁移。

## 5. 核心数据表

### 5.1 users

家属用户。

关键字段：

- id
- openid
- unionid
- phone
- name
- created_at
- updated_at

### 5.2 elder_profiles

老人档案。

关键字段：

- id
- user_id
- name
- gender
- age
- phone
- emergency_contact_name
- emergency_contact_phone
- mobility_level
- common_conditions
- allergy_history
- notes
- privacy_consent_at

### 5.3 escorts

陪诊员。

关键字段：

- id
- name
- phone
- openid
- avatar_url
- certification_note
- familiar_hospitals
- status
- service_count
- notes

### 5.4 orders

陪诊订单。

关键字段：

- id
- order_no
- user_id
- elder_profile_id
- hospital_name
- department_name
- visit_date
- visit_time_slot
- has_registration
- service_package
- estimated_price
- meeting_method
- urgency_type
- assistance_items
- special_notes
- contact_name
- contact_phone
- assigned_escort_id
- status
- payment_status
- customer_service_note

### 5.5 order_progress

陪诊进度节点。

关键字段：

- id
- order_id
- step_key
- step_label
- status
- note
- image_urls
- created_by
- created_at

### 5.6 order_exceptions

异常记录。

关键字段：

- id
- order_id
- exception_type
- description
- handled_by
- notified_family
- follow_up_status
- image_urls
- created_at

### 5.7 service_summaries

服务总结。

关键字段：

- id
- order_id
- escort_id
- visit_completed
- completed_items
- doctor_instructions
- medication_notes
- examination_notes
- next_steps
- escort_notes
- image_urls
- review_status
- reviewer_id
- review_note
- published_at

## 6. API 模块

### 6.1 Auth

- 小程序登录。
- 手机号绑定。
- 获取当前用户。
- 后台登录。

### 6.2 Elder Profiles

- 创建老人档案。
- 编辑老人档案。
- 获取老人档案列表。
- 获取老人档案详情。

### 6.3 Orders

- 家属创建订单。
- 家属获取订单列表。
- 家属获取订单详情。
- 运营获取订单列表。
- 运营获取订单详情。
- 运营确认订单。
- 运营标记无法服务。
- 运营指派陪诊员。
- 运营修改订单状态。

### 6.4 Progress

- 陪诊员新增进度节点。
- 家属查看进度。
- 运营查看进度。

### 6.5 Exceptions

- 陪诊员创建异常记录。
- 运营创建异常记录。
- 运营更新异常处理状态。
- 家属查看异常提示。

### 6.6 Service Summary

- 陪诊员提交服务总结。
- 运营审核服务总结。
- 家属查看已审核服务总结。

### 6.7 Upload

- 上传就诊资料。
- 上传进度图片。
- 上传总结凭证。

## 7. 开发阶段

### M0 项目初始化

- 确认 monorepo 结构。
- 初始化 Taro 小程序。
- 初始化 admin-web。
- 初始化 api。
- 配置共享 TypeScript 类型。
- 配置 lint、format、基础构建命令。

### M1 数据库与后端骨架

- 建表。
- 实现订单状态枚举。
- 实现用户、老人档案、订单基础 API。
- 实现后台登录。

### M2 家属端提交需求

- 小程序登录。
- 老人档案。
- 提交陪诊需求。
- 提交成功页。
- 我的订单。
- 订单详情。

### M3 运营后台确认与指派

- 订单列表。
- 订单详情。
- 确认可服务。
- 标记无法服务。
- 指派陪诊员。
- 录入客服备注。

### M4 陪诊员执行服务

- 陪诊员角色入口。
- 任务列表。
- 任务详情。
- 更新进度。
- 记录异常。

### M5 服务总结闭环

- 陪诊员填写服务总结。
- 运营审核服务总结。
- 家属查看服务总结。
- 订单完成。

### M6 试点上线准备

- 录入 4 名陪诊员。
- 录入重点医院配置。
- 配置价格：158 / 238 / 458。
- 配置客服联系方式。
- 准备用户协议和隐私政策。
- 小程序提审准备。

## 8. 首版暂不自动化

- 微信支付先不接，人工收款。
- 退款先人工处理。
- 改期/取消先人工处理。
- 非重点医院是否可服务先人工判断。
- 今日紧急单和上门接送先人工报价。
- 服务总结审核先人工完成。

## 9. 小程序提审注意事项

- 不能出现医疗诊断、治疗建议、报告解读等表达。
- 服务定位应表述为“就医流程陪同和事项记录”。
- 隐私政策必须说明老人信息、就诊资料、图片凭证的采集和用途。
- 上传病历、检查单等图片时需明确授权。
- 客服联系方式、服务规则、费用说明要清楚。
- 不应承诺一定能安排服务，应保留“客服确认后安排”。

## 10. 当前原型如何复用

当前 React/Vite 原型可作为：

- 产品演示原型。
- Taro 小程序页面结构参考。
- 视觉样式参考。
- 文案和流程参考。

不能直接作为微信小程序代码使用，需要迁移到 Taro 或微信原生组件。

## 11. 下一步执行建议

建议下一步先做 M0：

1. 创建 monorepo 目录结构。
2. 初始化 Taro 小程序项目。
3. 初始化后端 API 项目。
4. 初始化运营后台目录。
5. 抽取共享类型和状态枚举。

完成 M0 后，再按 M1-M6 开发。
