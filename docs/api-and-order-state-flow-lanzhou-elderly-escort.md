# 颐年智陪 MVP 接口与订单状态流转说明

## 1. 文档目标

本说明用于在决定后端技术方案前，先统一业务接口、订单状态机和多端同步规则。

当前 MVP 的核心闭环是：

```text
家属小程序提交预约
-> 运营后台出现新订单
-> 客服电话确认
-> 运营指派陪诊员
-> 陪诊员更新进度
-> 家属小程序查看状态和进度
-> 服务完成与运营复盘
```

首版不追求自动派单、自动报价、微信支付和医院系统对接。人工客服确认仍是核心控制点。

## 2. 端与角色

### 2.1 家属小程序

面向子女或家属。

主要能力：

- 提交陪诊预约。
- 查看订单状态。
- 查看陪诊员信息。
- 查看服务进度。
- 联系客服。

### 2.2 运营后台

面向客服和运营人员。

主要能力：

- 查看订单池。
- 电话确认订单。
- 拒绝或标记无法服务。
- 指派陪诊员。
- 查看和更新订单状态。
- 处理异常。

### 2.3 陪诊员入口

首版建议先做在同一个小程序内，通过角色进入陪诊员任务页。

主要能力：

- 查看被指派任务。
- 更新服务进度。
- 记录异常。
- 填写服务总结。

## 3. 核心资源模型

### 3.1 User 家属用户

```ts
type User = {
  id: string
  openid: string
  phone: string
  name?: string
  createdAt: string
}
```

### 3.2 ElderProfile 老人档案

```ts
type ElderProfile = {
  id: string
  userId: string
  name: string
  relation: string
  mobilityLevel: 'independent' | 'assisted' | 'wheelchair' | 'other'
  commonConditions?: string
  notes?: string
}
```

### 3.3 Escort 陪诊员

```ts
type Escort = {
  id: string
  name: string
  phone: string
  familiarHospitals: string[]
  status: 'available' | 'busy' | 'off'
}
```

### 3.4 Order 陪诊订单

```ts
type Order = {
  id: string
  orderNo: string
  userId: string
  elderProfileId?: string
  hospitalName: string
  departmentName?: string
  visitDate: string
  visitTime: string
  servicePackage: 'single_task' | 'half_day' | 'full_day'
  estimatedPrice: number
  contactName: string
  contactPhone: string
  specialNotes?: string
  status: OrderStatus
  assignedEscortId?: string
  customerServiceNote?: string
  createdAt: string
  updatedAt: string
}
```

### 3.5 OrderProgress 陪诊进度

```ts
type OrderProgress = {
  id: string
  orderId: string
  stepKey: ProgressStepKey
  stepLabel: string
  status: 'completed' | 'skipped'
  note?: string
  imageUrls?: string[]
  createdBy: string
  createdAt: string
}
```

## 4. 订单状态机

### 4.1 状态定义

| 状态 | 说明 | 对家属展示 | 主要操作人 |
|---|---|---|---|
| `pending_confirmation` | 新预约，等待客服电话确认 | 待电话确认 | 运营/客服 |
| `confirmed` | 已电话确认，订单信息有效 | 已确认 | 运营/客服 |
| `unavailable` | 无法服务，例如人员不足、医院不支持 | 暂无法服务 | 运营/客服 |
| `assigned` | 已指派陪诊员 | 已派单 | 运营 |
| `waiting_start` | 陪诊员已接单，等待服务开始 | 等待服务开始 | 陪诊员/运营 |
| `in_service` | 陪诊服务进行中 | 陪诊中 | 陪诊员 |
| `completed` | 服务完成 | 已完成 | 陪诊员/运营 |
| `cancelled` | 用户取消或运营取消 | 已取消 | 家属/运营 |
| `exception_handling` | 服务中出现异常，需运营介入 | 异常处理中 | 陪诊员/运营 |

### 4.2 推荐状态流转

```text
pending_confirmation
  -> confirmed
  -> assigned
  -> waiting_start
  -> in_service
  -> completed
```

异常分支：

```text
pending_confirmation -> unavailable
pending_confirmation -> cancelled
confirmed -> cancelled
assigned -> cancelled
waiting_start -> exception_handling
in_service -> exception_handling
exception_handling -> in_service
exception_handling -> completed
exception_handling -> cancelled
```

### 4.3 状态流转规则

- 家属提交预约后，订单默认进入 `pending_confirmation`。
- 只有运营/客服可以把订单从 `pending_confirmation` 改为 `confirmed` 或 `unavailable`。
- 只有 `confirmed` 状态的订单允许派单。
- 派单成功后状态进入 `assigned`。
- 陪诊员确认接单或运营确认后，可进入 `waiting_start`。
- 陪诊员到达医院或开始服务后，进入 `in_service`。
- 陪诊员提交服务完成后，进入 `completed`。
- 任意未完成订单都可以进入 `exception_handling`，但必须记录异常原因。
- 已完成订单原则上不允许回退，只能追加服务总结或运营备注。

## 5. 进度节点

首版建议保留固定进度节点，方便家属理解，也方便运营复盘。

| 节点 | key | 触发角色 | 是否展示给家属 |
|---|---|---|---|
| 已联系家属 | `contacted_family` | 运营/陪诊员 | 是 |
| 已出发 | `departed` | 陪诊员 | 可选 |
| 已到医院 | `arrived_hospital` | 陪诊员 | 是 |
| 已见到老人 | `met_elder` | 陪诊员 | 是 |
| 已取号/签到 | `checked_in` | 陪诊员 | 是 |
| 候诊中 | `waiting` | 陪诊员 | 是 |
| 陪同就诊 | `seeing_doctor` | 陪诊员 | 是 |
| 缴费/检查 | `checking` | 陪诊员 | 是 |
| 取药 | `picking_medicine` | 陪诊员 | 是 |
| 服务结束 | `service_finished` | 陪诊员 | 是 |

首版可以不要求每个节点都上传图片。涉及病历、检查单、缴费单等敏感图片时，必须限制访问权限。

## 6. MVP 接口清单

接口路径先用 REST 风格描述。后续不管使用 Fastify、NestJS、云开发或其他方案，都可以按这份资源边界实现。

### 6.1 家属端接口

#### 创建预约订单

```http
POST /api/orders
```

请求体：

```json
{
  "hospitalName": "兰州大学第一医院",
  "departmentName": "心内科",
  "visitDate": "2026-06-04",
  "visitTime": "08:30",
  "servicePackage": "half_day",
  "elderProfileId": "elder_001",
  "contactName": "张女士",
  "contactPhone": "13800138000",
  "specialNotes": "老人行动较慢，可能需要轮椅"
}
```

响应：

```json
{
  "orderId": "ord_001",
  "orderNo": "LZ202606040001",
  "status": "pending_confirmation"
}
```

业务规则：

- 创建时只做基础校验，不直接承诺可服务。
- 默认状态为 `pending_confirmation`。
- 返回订单号供家属查询和客服沟通。

#### 获取我的订单列表

```http
GET /api/my/orders
```

查询参数：

- `status` 可选。
- `page` 可选。
- `pageSize` 可选。

#### 获取我的订单详情

```http
GET /api/my/orders/{orderId}
```

返回内容应包含：

- 订单基础信息。
- 当前状态。
- 陪诊员信息，如果已派单。
- 进度节点列表。
- 客服电话。
- 费用说明。

#### 取消订单

```http
POST /api/my/orders/{orderId}/cancel
```

业务规则：

- 首版取消后由客服人工处理退款或费用问题。
- `in_service` 状态原则上不允许家属直接取消，只能联系客服。

### 6.2 运营后台接口

#### 获取订单池

```http
GET /api/admin/orders
```

查询参数：

- `status`
- `hospitalName`
- `visitDate`
- `assignedEscortId`
- `keyword`

#### 获取订单详情

```http
GET /api/admin/orders/{orderId}
```

后台详情比家属端更完整，应包含：

- 联系人手机号。
- 老人注意事项。
- 客服备注。
- 异常记录。
- 操作日志。

#### 电话确认订单

```http
POST /api/admin/orders/{orderId}/confirm
```

请求体：

```json
{
  "confirmedHospitalName": "兰州大学第一医院",
  "confirmedVisitTime": "2026-06-04 08:30",
  "customerServiceNote": "已说明医疗费用不垫付，老人需要轮椅协助",
  "estimatedPrice": 238
}
```

业务规则：

- 只允许 `pending_confirmation` 订单确认。
- 确认后状态变为 `confirmed`。
- 写入客服备注和最终确认价格。

#### 标记无法服务

```http
POST /api/admin/orders/{orderId}/unavailable
```

请求体：

```json
{
  "reason": "指定时间 4 名陪诊员均不可用"
}
```

业务规则：

- 状态变为 `unavailable`。
- 家属端展示“暂无法服务，客服将联系说明”。

#### 指派陪诊员

```http
POST /api/admin/orders/{orderId}/assign
```

请求体：

```json
{
  "escortId": "esc_003"
}
```

业务规则：

- 只允许 `confirmed` 或 `assigned` 订单派单。
- 指派后状态变为 `assigned`。
- 如果更换陪诊员，需要记录操作日志。

#### 运营更新订单状态

```http
POST /api/admin/orders/{orderId}/status
```

请求体：

```json
{
  "status": "waiting_start",
  "note": "陪诊员已与家属确认明早见面地点"
}
```

业务规则：

- 仅后台有权限做人工纠偏。
- 每次状态变更都必须写操作日志。

### 6.3 陪诊员接口

#### 获取我的任务

```http
GET /api/escort/tasks
```

返回当前陪诊员被指派的未完成订单。

#### 获取任务详情

```http
GET /api/escort/tasks/{orderId}
```

返回内容：

- 医院、科室、时间。
- 老人情况。
- 家属联系方式。
- 服务注意事项。
- 当前进度。

#### 更新服务进度

```http
POST /api/escort/tasks/{orderId}/progress
```

请求体：

```json
{
  "stepKey": "arrived_hospital",
  "note": "已到达兰大一院门诊楼一层",
  "imageUrls": []
}
```

业务规则：

- 更新第一个服务节点时，可自动把订单置为 `in_service`。
- `service_finished` 节点完成后，可自动把订单置为 `completed`，或进入运营审核后再完成。

#### 记录异常

```http
POST /api/escort/tasks/{orderId}/exceptions
```

请求体：

```json
{
  "exceptionType": "cannot_reach_elder",
  "description": "到达约定地点后无法联系老人，已联系家属",
  "imageUrls": []
}
```

业务规则：

- 创建异常后订单状态进入 `exception_handling`。
- 后台必须能看到并处理。

## 7. 通知触发点

首版可以先不用复杂消息系统，但需要预留通知事件。

| 事件 | 触发时机 | 通知对象 | 通知方式 |
|---|---|---|---|
| `order_created` | 家属提交预约 | 运营 | 后台新单提示 |
| `order_confirmed` | 客服确认订单 | 家属 | 小程序状态更新，后续可加订阅消息 |
| `order_unavailable` | 标记无法服务 | 家属 | 电话/小程序状态 |
| `order_assigned` | 指派陪诊员 | 家属、陪诊员 | 小程序状态/任务提醒 |
| `progress_updated` | 陪诊员更新进度 | 家属、运营 | 小程序进度 |
| `exception_created` | 陪诊员记录异常 | 运营 | 后台高亮 |
| `order_completed` | 服务完成 | 家属、运营 | 小程序状态 |

## 8. 权限边界

### 8.1 家属

- 只能查看和操作自己的订单。
- 不能直接修改订单状态。
- 不能查看陪诊员手机号以外的内部信息。

### 8.2 运营

- 可以查看所有订单。
- 可以确认、取消、派单、修改状态。
- 关键操作必须写操作日志。

### 8.3 陪诊员

- 只能查看被指派给自己的订单。
- 只能更新进度、异常和服务总结。
- 不能修改价格和派单信息。

## 9. 操作日志

建议所有关键动作都记录 `order_logs`。

```ts
type OrderLog = {
  id: string
  orderId: string
  actorType: 'user' | 'admin' | 'escort' | 'system'
  actorId: string
  action: string
  fromStatus?: OrderStatus
  toStatus?: OrderStatus
  note?: string
  createdAt: string
}
```

必须记录的动作：

- 创建订单。
- 电话确认。
- 标记无法服务。
- 派单和更换陪诊员。
- 状态变更。
- 进度更新。
- 异常创建和处理。
- 服务完成。

## 10. 后端选型前的实现建议

### 10.1 本地 API 阶段

适合继续验证原型。

实现方式：

- 前端内置模拟数据。
- 或用 Vite dev server/mock server。
- 重点演示两端状态流转，不处理真实登录和数据库。

### 10.2 最小真实后端阶段

适合准备小规模真实试单。

建议能力：

- REST API。
- PostgreSQL 或 SQLite。
- 管理员账号。
- 微信 openid 登录。
- 基础操作日志。
- 文件上传可先后置。

### 10.3 推荐首版后端路线

如果目标是尽快真实试单，推荐：

```text
Node.js + Fastify + PostgreSQL
```

理由：

- 接口开发快。
- 结构比纯云函数清晰。
- 后续运营后台和小程序都能统一调用。
- PostgreSQL 便于订单、进度、日志和复盘数据沉淀。

如果团队更熟悉微信生态，也可以考虑微信云开发，但要注意后续迁移、后台权限和数据分析能力。

## 11. 下一步开发顺序

建议按以下顺序推进：

1. 把本说明中的 `OrderStatus`、`ProgressStepKey` 放入 `packages/shared`。
2. 在 `apps/api` 建立本地持久化 API 或最小 Fastify API。
3. 小程序预约提交改为调用 `POST /api/orders`。
4. 运营后台订单池改为调用 `GET /api/admin/orders`。
5. 运营后台确认和派单调用真实接口。
6. 小程序订单页读取真实订单详情和进度。
7. 陪诊员任务入口再接入任务和进度接口。
