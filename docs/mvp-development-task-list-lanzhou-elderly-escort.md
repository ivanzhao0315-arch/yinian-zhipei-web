# 颐年智陪 MVP 开发任务清单

## 1. 开发目标

在兰州单城市、4 名自营陪诊员、人工确认订单的前提下，开发一个能支撑真实服务闭环的 MVP。

首版目标不是平台化和自动化，而是跑通：

> 家属提交需求 -> 客服确认 -> 指派陪诊员 -> 陪诊员更新进度 -> 家属查看进度 -> 服务总结 -> 运营复盘。

## 2. 版本边界

### 2.1 P0 必须开发

- 家属端提交陪诊需求。
- 老人档案。
- 订单状态流转。
- 运营后台订单管理。
- 运营后台指派陪诊员。
- 陪诊员查看任务。
- 陪诊员更新进度。
- 陪诊员填写服务总结。
- 异常记录。
- 家属查看订单、进度、总结。

### 2.2 P0 可人工处理

- 客服确认档期。
- 收款和退款。
- 改期/取消。
- 非重点医院服务判断。
- 今日紧急单报价。
- 上门接送报价。
- 服务总结审核。

### 2.3 P1 后置

- 微信支付。
- 自动派单。
- 优惠券。
- 会员体系。
- 自动报价。
- 数据看板高级分析。
- 陪诊员开放入驻。
- 多城市。
- 医院系统对接。
- AI 报告解读或医疗建议。

## 3. 角色与权限

### 3.1 家属用户

权限：

- 登录。
- 创建和编辑老人档案。
- 提交陪诊需求。
- 查看自己提交的订单。
- 查看订单进度和服务总结。
- 联系客服。

### 3.2 运营/客服

权限：

- 查看所有订单。
- 确认或拒绝订单。
- 修改订单状态。
- 指派陪诊员。
- 记录异常。
- 查看和审核服务总结。
- 管理陪诊员基础信息。

### 3.3 陪诊员

权限：

- 查看被指派给自己的订单。
- 查看服务所需的老人、医院、科室和注意事项。
- 更新陪诊进度。
- 记录异常。
- 填写服务总结。

## 4. 推荐技术范围

当前仓库已有 React + Vite 原型。真实 MVP 如要上线微信生态，建议拆成：

- 微信小程序家属端。
- 陪诊员端，可先复用小程序角色入口。
- Web 运营后台。
- 后端 API。
- 数据库。

若短期只做验证，也可以先用当前 Web 原型继续演化为 H5 表单 + 简单后台，但长期仍建议用微信小程序承接家属端。

## 5. 数据模型草案

### 5.1 users 家属用户

字段：

- id。
- openid/unionid。
- phone。
- name。
- created_at。
- updated_at。

### 5.2 elder_profiles 老人档案

字段：

- id。
- user_id。
- name。
- gender。
- age。
- phone。
- emergency_contact_name。
- emergency_contact_phone。
- mobility_level：independent / assisted / wheelchair / other。
- common_conditions。
- allergy_history。
- notes。
- privacy_consent_at。
- created_at。
- updated_at。

### 5.3 escorts 陪诊员

字段：

- id。
- name。
- phone。
- avatar_url。
- certification_note。
- familiar_hospitals。
- status：available / busy / off。
- service_count。
- notes。
- created_at。
- updated_at。

### 5.4 orders 陪诊订单

字段：

- id。
- order_no。
- user_id。
- elder_profile_id。
- hospital_name。
- department_name。
- visit_date。
- visit_time_slot：morning / afternoon / full_day / unknown。
- has_registration：yes / no / unknown。
- service_package：single_task / half_day / full_day。
- estimated_price。
- meeting_method：hospital_gate / department / home_pickup_pending / other。
- urgency_type：advance / tomorrow / today_urgent。
- assistance_items。
- mobility_level_snapshot。
- special_notes。
- contact_name。
- contact_phone。
- assigned_escort_id。
- status。
- payment_status：manual_pending / confirmed_offline / refunded / none。
- customer_service_note。
- created_at。
- updated_at。

### 5.5 order_progress 陪诊进度

字段：

- id。
- order_id。
- step_key。
- step_label。
- status：pending / completed / skipped。
- note。
- image_urls。
- created_by。
- created_at。

进度节点：

- contacted_family。
- departed。
- arrived_hospital。
- met_elder。
- checked_in。
- waiting。
- seeing_doctor。
- paying。
- checking。
- picking_medicine。
- service_finished。

### 5.6 order_exceptions 异常记录

字段：

- id。
- order_id。
- exception_type。
- description。
- handled_by。
- notified_family：true / false。
- follow_up_status。
- image_urls。
- created_at。
- updated_at。

异常类型：

- elder_no_show。
- cannot_reach_elder。
- cannot_reach_family。
- doctor_suspended。
- cannot_check_in。
- extra_test_or_payment。
- long_delay。
- elder_unwell。
- referral_or_transfer。
- family_change_request。
- escort_unavailable。
- other。

### 5.7 service_summaries 服务总结

字段：

- id。
- order_id。
- escort_id。
- visit_completed：true / false。
- completed_items。
- doctor_instructions。
- medication_notes。
- examination_notes。
- next_steps。
- escort_notes。
- image_urls。
- review_status：pending / approved / rejected。
- reviewer_id。
- review_note。
- published_at。
- created_at。
- updated_at。

### 5.8 service_reviews 服务评价 P1

字段：

- id。
- order_id。
- user_id。
- satisfaction_score。
- reassurance_score。
- transparency_score。
- willing_to_reuse。
- willing_to_recommend。
- comment。
- created_at。

## 6. 状态流转

### 6.1 订单状态

- pending_confirmation：待确认。
- confirmed：已确认。
- pending_assignment：待分配陪诊员。
- assigned：已分配陪诊员。
- waiting_start：服务待开始。
- in_service：服务中。
- completed：服务完成。
- cancelled：已取消。
- unavailable：无档期/无法服务。
- exception_handling：异常处理中。

### 6.2 推荐流转

1. 家属提交需求：pending_confirmation。
2. 客服确认可服务：confirmed。
3. 需要分配陪诊员：pending_assignment。
4. 运营指派陪诊员：assigned。
5. 服务当天开始前：waiting_start。
6. 陪诊员开始更新现场节点：in_service。
7. 陪诊员提交总结并通过审核：completed。

### 6.3 人工处理流转

- 无档期：pending_confirmation -> unavailable。
- 用户取消：pending_confirmation/confirmed/assigned -> cancelled。
- 现场异常：in_service -> exception_handling -> in_service/completed/cancelled。

## 7. P0 开发任务

## 7.1 家属端

### FE-F01 首页

任务：

- 实现服务介绍页。
- 展示兰州本地、自营团队、客服确认后安排。
- 展示试点价格入口或说明。
- 提供提交陪诊需求入口。
- 提供联系客服入口。

验收：

- 用户能从首页进入提交需求页。
- 页面不出现“立即下单成功”“马上安排”等过度承诺。

### FE-F02 登录/授权

任务：

- 接入微信手机号登录或临时手机号登录方案。
- 记录用户基础信息。
- 展示用户协议和隐私授权。

验收：

- 未登录用户提交需求前必须完成登录。
- 未同意协议时不能登录或提交。

### FE-F03 老人档案

任务：

- 新建老人档案。
- 编辑老人档案。
- 老人档案列表。
- 提交需求时选择老人档案。

验收：

- 至少支持姓名、年龄、性别、紧急联系人、行动能力、常见疾病/过敏史、备注。
- 老人档案可复用到订单。

### FE-F04 提交陪诊需求

任务：

- 创建预约表单。
- 支持填写医院、科室、日期、时间段、是否已有挂号。
- 支持选择服务套餐：单项代办、半日陪诊、全日陪诊。
- 展示价格：158 元起、238 元起、458 元起。
- 展示超时和医疗费用自理规则。
- 支持会合方式。
- 支持预约类型/紧急程度。
- 支持选择协助事项。
- 支持填写特殊注意事项和联系方式。
- 支持隐私授权和服务边界确认。

验收：

- 必填字段校验正确。
- 提交后生成订单，状态为待确认。
- 提交成功页明确提示客服确认前不代表预约成功。

### FE-F05 我的订单

任务：

- 展示订单列表。
- 支持按状态筛选，首版可简化。
- 进入订单详情。

验收：

- 家属只能看到自己的订单。
- 状态文案和后台状态一致。

### FE-F06 订单详情

任务：

- 展示订单基础信息。
- 展示老人信息摘要。
- 展示服务套餐、预估费用、支付/确认状态。
- 展示陪诊员信息，若已分配。
- 提供查看进度、查看总结、联系客服入口。
- 修改/取消走人工处理入口。

验收：

- 待确认订单展示“客服确认后安排”。
- 已分配订单展示陪诊员基础信息。
- 不直接鼓励绕开平台私下联系。

### FE-F07 陪诊进度

任务：

- 展示进度时间线。
- 展示节点时间、备注和图片。
- 展示异常记录。

验收：

- 至少支持 6 个关键节点展示。
- 陪诊员更新后家属端可见。

### FE-F08 服务总结

任务：

- 展示本次完成事项。
- 展示医生交代事项。
- 展示用药事项。
- 展示检查事项。
- 展示下一步安排。
- 展示陪诊员备注和图片凭证。
- 展示医疗免责声明。

验收：

- 服务总结通过审核后家属可见。
- 页面不出现诊断、治疗建议或报告解读性质的系统文案。

## 7.2 陪诊员端

### FE-E01 陪诊员任务列表

任务：

- 陪诊员登录后查看自己的任务。
- 按今日、待开始、服务中、已完成分组或筛选。

验收：

- 陪诊员只能看到分配给自己的订单。

### FE-E02 陪诊员任务详情

任务：

- 展示老人信息、医院、科室、就诊时间、服务要求。
- 展示客服备注。
- 提供更新进度、记录异常、填写总结入口。

验收：

- 陪诊员能看到执行服务所需信息。
- 敏感信息展示符合授权范围。

### FE-E03 更新进度

任务：

- 提供标准化进度节点。
- 支持填写备注和上传图片。
- 更新后同步到家属端。

验收：

- 进度节点可被创建并按时间展示。
- 关键节点更新后订单可进入服务中。

### FE-E04 异常记录

任务：

- 支持选择异常类型。
- 支持填写说明。
- 支持标记是否已联系家属。
- 支持图片上传。

验收：

- 异常记录在运营后台和家属端可见。
- 异常处理中状态可被后台处理。

### FE-E05 填写服务总结

任务：

- 支持填写结构化总结。
- 支持上传图片凭证。
- 提交后进入待审核。

验收：

- 未审核总结不直接展示给家属。
- 提交页提示不得填写诊断判断、治疗建议或报告解读。

## 7.3 运营后台

### FE-A01 后台登录

任务：

- 实现运营账号登录。
- 区分运营和陪诊员角色。

验收：

- 未登录无法访问后台。

### FE-A02 订单列表

任务：

- 展示所有订单。
- 支持按状态、日期、医院、陪诊员、关键词筛选。
- 支持进入订单详情。

验收：

- 运营能快速找到待确认、待分配、服务中订单。

### FE-A03 订单详情

任务：

- 展示订单完整信息。
- 支持确认可服务。
- 支持标记无法服务。
- 支持修改订单状态。
- 支持添加客服备注。
- 支持查看进度、异常和总结。

验收：

- 运营可完成订单从待确认到已确认的处理。

### FE-A04 指派陪诊员

任务：

- 展示 4 名自营陪诊员。
- 展示陪诊员状态、今日订单数、熟悉医院。
- 支持指派和更换陪诊员。

验收：

- 指派后订单状态变为已分配陪诊员。
- 家属端可看到陪诊员基础信息。

### FE-A05 异常处理

任务：

- 查看异常记录。
- 新增异常记录。
- 标记是否通知家属。
- 更新处理结果。

验收：

- 每条异常都有类型、时间、处理人、说明、通知状态。

### FE-A06 服务总结审核

任务：

- 查看陪诊员提交的总结。
- 审核通过。
- 退回修改。
- 记录审核备注。

验收：

- 只有审核通过的总结展示给家属。
- 审核可以拦截医疗诊断、治疗建议、报告解读类表述。

### FE-A07 陪诊员管理 P1

任务：

- 管理陪诊员基础信息。
- 设置服务状态。
- 设置熟悉医院。

验收：

- 指派陪诊员时可读取这些信息。

### FE-A08 试点数据看板 P1

任务：

- 展示咨询数、预约数、成单数、完成数、取消数、无档期数。
- 展示不同医院、服务类型分布。
- 展示陪诊员服务单量。

验收：

- 运营能判断 10-30 单试点闭环情况。

## 7.4 后端 API

### API-01 用户与登录

- 创建/更新用户。
- 获取当前用户。
- 权限校验。

### API-02 老人档案

- 创建老人档案。
- 更新老人档案。
- 获取老人档案列表。
- 删除老人档案，P1 可后置。

### API-03 订单

- 创建订单。
- 获取家属订单列表。
- 获取订单详情。
- 运营获取订单列表。
- 运营更新订单状态。
- 运营指派陪诊员。

### API-04 进度

- 陪诊员创建进度节点。
- 家属获取订单进度。
- 运营获取订单进度。

### API-05 异常

- 创建异常记录。
- 获取异常记录。
- 更新异常处理状态。

### API-06 服务总结

- 陪诊员提交服务总结。
- 运营审核服务总结。
- 家属查看已发布服务总结。

### API-07 图片上传

- 上传资料图片。
- 上传进度图片。
- 上传总结凭证。

首版可先使用对象存储或后端本地存储，必须避免把敏感图片公开暴露。

## 8. 人工运营任务

这些不需要首版系统自动化，但必须有明确 SOP：

- 客服接到待确认订单后联系家属。
- 确认医院、科室、时间、老人状态、会合方式。
- 判断是否有档期。
- 确认费用和收款方式。
- 指派陪诊员。
- 服务前提醒陪诊员。
- 服务中处理异常。
- 服务后审核总结。
- 记录用户反馈。

## 9. 首版里程碑

### M1 数据和后台骨架

- 数据库表。
- 后端 API 基础。
- 运营后台登录。
- 订单列表和订单详情。
- 陪诊员管理基础数据。

### M2 家属提交需求闭环

- 家属登录。
- 老人档案。
- 提交陪诊需求。
- 订单创建。
- 提交成功和订单详情。

### M3 运营确认和指派

- 运营确认订单。
- 标记无法服务。
- 指派陪诊员。
- 状态流转。

### M4 陪诊员执行服务

- 陪诊员任务列表。
- 任务详情。
- 更新进度。
- 记录异常。

### M5 服务总结和家属查看

- 陪诊员提交总结。
- 运营审核总结。
- 家属查看总结。
- 服务完成状态。

### M6 试点准备

- 重点医院配置。
- 4 名陪诊员数据录入。
- 价格配置。
- 客服 SOP。
- 10-30 单试点记录口径。

## 10. MVP 验收标准

### 10.1 产品验收

- 家属可以完整提交一笔陪诊需求。
- 提交后的订单状态为待确认。
- 运营可以确认订单并指派陪诊员。
- 陪诊员可以看到被指派订单。
- 陪诊员可以更新进度节点。
- 家属可以查看陪诊进度。
- 陪诊员可以提交服务总结。
- 运营可以审核服务总结。
- 家属可以查看审核通过的服务总结。
- 异常可以被记录，并能标记是否已通知家属。
- 全流程不出现医疗诊断、治疗建议、报告解读类系统文案。

### 10.2 业务验收

- 支持兰州单城市。
- 支持首批 3 家重点医院和 2 家备选医院。
- 支持 4 名自营陪诊员。
- 支持单项代办、半日陪诊、全日陪诊三类套餐。
- 支持 158 元起、238 元起、458 元起的试点价格展示或记录。
- 能完成 10-30 单真实服务闭环。
- 每单可追溯家属、老人、医院、陪诊员、状态、进度、异常和服务总结。

## 11. 明确不做

- 不做自动派单。
- 不做陪诊员抢单。
- 不做在线问诊。
- 不做医疗报告解读。
- 不做医保代办。
- 不做医院系统对接。
- 不做多城市。
- 不做复杂营销。
- 不做会员。
- 不做 AI 医疗建议。

## 12. 开发前待确认

- 技术形态：微信小程序 + Web 后台，还是先 H5 + Web 后台。
- 后端和数据库技术栈。
- 图片存储方案。
- 用户协议和隐私政策文本。
- 运营账号和陪诊员账号创建方式。
- 客服联系方式。
- 首批医院路线卡。
- 收款方式。
- 取消/改期/退款人工规则。
