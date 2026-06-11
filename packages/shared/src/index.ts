export const servicePackages = {
  singleTask: {
    key: 'single_task',
    label: '单项代办/陪同',
    duration: '2 小时内',
    priceFrom: 158,
  },
  halfDay: {
    key: 'half_day',
    label: '半日陪诊',
    duration: '4 小时内',
    priceFrom: 238,
  },
  fullDay: {
    key: 'full_day',
    label: '全日陪诊',
    duration: '8 小时内',
    priceFrom: 458,
  },
} as const

export const overtimePricePerHour = 60

export const orderStatuses = {
  pendingConfirmation: 'pending_confirmation',
  confirmed: 'confirmed',
  assigned: 'assigned',
  waitingStart: 'waiting_start',
  inService: 'in_service',
  completed: 'completed',
  cancelled: 'cancelled',
  unavailable: 'unavailable',
  exceptionHandling: 'exception_handling',
} as const

export const orderStatusLabels = {
  [orderStatuses.pendingConfirmation]: '待电话确认',
  [orderStatuses.confirmed]: '已确认',
  [orderStatuses.assigned]: '已派单',
  [orderStatuses.waitingStart]: '等待服务开始',
  [orderStatuses.inService]: '陪诊中',
  [orderStatuses.completed]: '已完成',
  [orderStatuses.cancelled]: '已取消',
  [orderStatuses.unavailable]: '暂无法服务',
  [orderStatuses.exceptionHandling]: '异常处理中',
} as const

export const orderStatusTransitions = {
  [orderStatuses.pendingConfirmation]: [
    orderStatuses.confirmed,
    orderStatuses.unavailable,
    orderStatuses.cancelled,
  ],
  [orderStatuses.confirmed]: [orderStatuses.assigned, orderStatuses.cancelled],
  [orderStatuses.assigned]: [
    orderStatuses.waitingStart,
    orderStatuses.inService,
    orderStatuses.cancelled,
  ],
  [orderStatuses.waitingStart]: [
    orderStatuses.inService,
    orderStatuses.exceptionHandling,
    orderStatuses.cancelled,
  ],
  [orderStatuses.inService]: [
    orderStatuses.completed,
    orderStatuses.exceptionHandling,
  ],
  [orderStatuses.exceptionHandling]: [
    orderStatuses.inService,
    orderStatuses.completed,
    orderStatuses.cancelled,
  ],
  [orderStatuses.completed]: [],
  [orderStatuses.cancelled]: [],
  [orderStatuses.unavailable]: [],
} as const

export const progressSteps = {
  contactedFamily: 'contacted_family',
  departed: 'departed',
  arrivedHospital: 'arrived_hospital',
  metElder: 'met_elder',
  checkedIn: 'checked_in',
  waiting: 'waiting',
  seeingDoctor: 'seeing_doctor',
  paying: 'paying',
  checking: 'checking',
  pickingMedicine: 'picking_medicine',
  serviceFinished: 'service_finished',
} as const

export const progressStepList = [
  { key: progressSteps.contactedFamily, label: '已联系家属', visibleToFamily: true },
  { key: progressSteps.departed, label: '已出发', visibleToFamily: false },
  { key: progressSteps.arrivedHospital, label: '已到医院', visibleToFamily: true },
  { key: progressSteps.metElder, label: '已见到老人', visibleToFamily: true },
  { key: progressSteps.checkedIn, label: '已取号/签到', visibleToFamily: true },
  { key: progressSteps.waiting, label: '候诊中', visibleToFamily: true },
  { key: progressSteps.seeingDoctor, label: '陪同就诊', visibleToFamily: true },
  { key: progressSteps.checking, label: '缴费/检查', visibleToFamily: true },
  { key: progressSteps.pickingMedicine, label: '取药', visibleToFamily: true },
  { key: progressSteps.serviceFinished, label: '服务结束', visibleToFamily: true },
] as const

export type ServicePackageKey =
  (typeof servicePackages)[keyof typeof servicePackages]['key']

export type OrderStatus = (typeof orderStatuses)[keyof typeof orderStatuses]

export type ProgressStep = (typeof progressSteps)[keyof typeof progressSteps]

export type ProgressStepKey = ProgressStep
