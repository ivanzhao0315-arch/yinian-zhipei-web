import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import './index.scss'
import {
  bindEscortWechat,
  getStoredEscortSession,
  verifyAndBindEscort,
  verifyEscortAccessCode,
} from '../../utils/escort-auth'
import {
  preloadNotificationTemplates,
} from '../../utils/notifications'
import { apiRequest } from '../../utils/request'

type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'assigned'
  | 'waiting_start'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'unavailable'
  | 'exception_handling'

type ServicePackageKey = 'single_task' | 'half_day' | 'full_day'

type OrderProgress = {
  id: string
  stepKey: string
  stepLabel: string
  note?: string
}

type OrderException = {
  id: string
  exceptionType: string
  description: string
  handled: boolean
}

type ServiceSummary = {
  actualDurationMinutes: number
  visitResult: string
  followUpAdvice: string
  overtimeMinutes: number
  operatorNote: string
}

type TaskItem = {
  id: string
  orderNo: string
  hospitalName: string
  departmentName?: string
  visitDate: string
  visitTime: string
  servicePackage: ServicePackageKey
  contactName: string
  contactPhone: string
  elderRelation: string
  specialNotes?: string
  status: OrderStatus
  progress: OrderProgress[]
  exceptions: OrderException[]
  serviceSummary?: ServiceSummary
}

type SummaryFormState = {
  actualDurationMinutes: string
  visitResult: string
  followUpAdvice: string
  overtimeMinutes: string
  operatorNote: string
}

const serviceText: Record<ServicePackageKey, string> = {
  single_task: '单项代办/陪同',
  half_day: '半日陪诊',
  full_day: '全日陪诊'
}

const statusText: Record<OrderStatus, string> = {
  pending_confirmation: '待电话确认',
  confirmed: '已确认',
  assigned: '已派单',
  waiting_start: '等待服务开始',
  in_service: '陪诊中',
  completed: '已完成',
  cancelled: '已取消',
  unavailable: '暂无法服务',
  exception_handling: '异常处理中'
}

const progressSteps = [
  { key: 'contacted_family', label: '已联系家属' },
  { key: 'departed', label: '已出发' },
  { key: 'arrived_hospital', label: '已到医院' },
  { key: 'met_elder', label: '已见到老人' },
  { key: 'checked_in', label: '已取号/签到' },
  { key: 'waiting', label: '候诊中' },
  { key: 'seeing_doctor', label: '陪同就诊' },
  { key: 'checking', label: '缴费/检查' },
  { key: 'picking_medicine', label: '取药' },
  { key: 'service_finished', label: '服务结束' }
]

function nextStep(task: TaskItem) {
  return progressSteps.find((step) => !task.progress.some((item) => item.stepKey === step.key))
}

function progressPercent(task: TaskItem) {
  if (task.status === 'completed') return 100
  const finished = new Set(task.progress.map((item) => item.stepKey))
  return Math.round((progressSteps.filter((step) => finished.has(step.key)).length / progressSteps.length) * 100)
}

function taskToSummaryForm(task?: TaskItem): SummaryFormState {
  const defaultDuration = task?.servicePackage === 'full_day' ? 480 : task?.servicePackage === 'half_day' ? 240 : 90
  return {
    actualDurationMinutes: String(task?.serviceSummary?.actualDurationMinutes ?? defaultDuration),
    visitResult: task?.serviceSummary?.visitResult ?? '',
    followUpAdvice: task?.serviceSummary?.followUpAdvice ?? '',
    overtimeMinutes: String(task?.serviceSummary?.overtimeMinutes ?? 0),
    operatorNote: task?.serviceSummary?.operatorNote ?? '',
  }
}

export default function Escort () {
  const [authorized, setAuthorized] = useState(false)
  const [checkingRole, setCheckingRole] = useState(true)
  const [escortId, setEscortId] = useState('')
  const [escortPhone, setEscortPhone] = useState('')
  const [escortName, setEscortName] = useState('')
  const [escortAccessCode, setEscortAccessCode] = useState('')
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskFilter, setTaskFilter] = useState<'active' | 'exception' | 'completed' | 'all'>('active')
  const [showManualSteps, setShowManualSteps] = useState(false)
  const [summaryForm, setSummaryForm] = useState<SummaryFormState>(() => taskToSummaryForm())
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [binding, setBinding] = useState(false)

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return tasks
    if (taskFilter === 'completed') return tasks.filter((task) => task.status === 'completed')
    if (taskFilter === 'exception') {
      return tasks.filter((task) => task.status === 'exception_handling' || task.exceptions.some((item) => !item.handled))
    }

    return tasks.filter((task) => !['completed', 'cancelled', 'unavailable'].includes(task.status))
  }, [taskFilter, tasks])

  const selectedTask = useMemo(() => {
    return filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? tasks.find((task) => task.id === selectedTaskId) ?? tasks[0]
  }, [filteredTasks, selectedTaskId, tasks])

  const selectedNextStep = selectedTask ? nextStep(selectedTask) : undefined

  useEffect(() => {
    setSummaryForm(taskToSummaryForm(selectedTask))
  }, [selectedTask?.id])

  const taskStats = useMemo(() => {
    const activeCount = tasks.filter((task) => !['completed', 'cancelled', 'unavailable'].includes(task.status)).length
    const exceptionCount = tasks.filter((task) => task.status === 'exception_handling' || task.exceptions.some((item) => !item.handled)).length

    return {
      activeCount,
      exceptionCount,
      completedCount: tasks.filter((task) => task.status === 'completed').length
    }
  }, [tasks])

  const loadTasks = async (targetEscortId = escortId) => {
    if (!targetEscortId) return
    setLoading(true)
    try {
      const response = await apiRequest<{ tasks: TaskItem[] }>({
        path: '/api/escort/tasks',
        method: 'GET',
      })
      if (response.statusCode >= 400) {
        throw new Error('escort_tasks_forbidden')
      }
      setTasks(response.data.tasks.map((task) => ({
        ...task,
        progress: task.progress || [],
        exceptions: task.exceptions || []
      })))
      setSelectedTaskId((current) => current || response.data.tasks[0]?.id || '')
      setShowManualSteps(false)
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '任务同步失败',
        icon: 'none'
      })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    const checkRole = async () => {
      setCheckingRole(true)
      try {
        const storedSession = getStoredEscortSession()
        setEscortId(storedSession?.escortId ?? '')
        setEscortPhone(storedSession?.escortPhone ?? '')
        setEscortName(storedSession?.escortName ?? '')
        setEscortAccessCode(storedSession?.accessCode ?? '')
        setAuthorized(Boolean(storedSession?.escortId))
        if (storedSession?.escortId) {
          void preloadNotificationTemplates('escort')
          setLoading(true)
          apiRequest<{ tasks: TaskItem[] }>({
            path: '/api/escort/tasks',
            method: 'GET',
          }).then((response) => {
            if (response.statusCode >= 400) {
              throw new Error('escort_tasks_forbidden')
            }
            setTasks(response.data.tasks.map((task) => ({
              ...task,
              progress: task.progress || [],
              exceptions: task.exceptions || []
            })))
            setSelectedTaskId((current) => current || response.data.tasks[0]?.id || '')
          }).catch((error) => {
            console.error(error)
            Taro.showToast({
              title: '任务同步失败',
              icon: 'none'
            })
          }).finally(() => {
            setLoading(false)
          })
        }
      } catch {
        setAuthorized(false)
      } finally {
        setCheckingRole(false)
      }
    }

    void checkRole()
  })

  const unlockEscortEntry = async () => {
    const input = await Taro.showModal({
      title: '陪诊员身份验证',
      editable: true,
      placeholderText: '请输入个人口令',
      confirmText: '验证'
    })

    if (!input.confirm) return

    try {
      const session = await verifyAndBindEscort(input.content || '')

      setEscortId(session.escortId)
      setEscortPhone(session.escortPhone)
      setEscortName(session.escortName)
      setEscortAccessCode(session.accessCode ?? '')
      setAuthorized(true)
      void preloadNotificationTemplates('escort')
      await loadTasks(session.escortId)
    } catch (error) {
      console.error(error)
      const title = error instanceof Error && error.message === 'escort_wechat_bind_failed'
        ? '微信绑定失败，请稍后重试'
        : '口令不正确'
      Taro.showToast({
        title,
        icon: 'none'
      })
    }
  }

  const bindWechat = async () => {
    if (binding) return
    if (!escortId) {
      Taro.showToast({
        title: '请先验证陪诊员口令',
        icon: 'none'
      })
      return
    }
    setBinding(true)
    try {
      const session = escortAccessCode
        ? {
            escortId,
            escortName,
            escortPhone,
            accessCode: escortAccessCode,
          }
        : await verifyEscortAccessCode(
            (
              await Taro.showModal({
                title: '重新验证口令',
                editable: true,
                placeholderText: '请输入个人口令',
                confirmText: '验证',
              })
            ).content || '',
          )
      setEscortAccessCode(session.accessCode ?? '')
      await bindEscortWechat(session)
      Taro.showToast({
        title: '陪诊员微信已绑定',
        icon: 'success'
      })
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '绑定失败',
        icon: 'none'
      })
    } finally {
      setBinding(false)
    }
  }

  const updateProgress = async (forceStepKey?: string) => {
    if (!selectedTask || updating) return
    const step = forceStepKey
      ? progressSteps.find((item) => item.key === forceStepKey)
      : nextStep(selectedTask)

    if (!step) {
      Taro.showToast({
        title: '进度已完成',
        icon: 'none'
      })
      return
    }

    if (step.key === 'service_finished') {
      await submitServiceSummary()
      return
    }

    setUpdating(true)
    try {
      const response = await apiRequest({
        path: `/api/escort/tasks/${selectedTask.id}/progress`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
        },
        data: {
          stepKey: step.key,
          note: `${step.label}，陪诊员端更新`
        }
      })
      if (response.statusCode >= 400) {
        throw new Error('escort_progress_update_failed')
      }
      Taro.showToast({
        title: '已更新进度',
        icon: 'success'
      })
      setShowManualSteps(false)
      await loadTasks()
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '更新失败',
        icon: 'none'
      })
    } finally {
      setUpdating(false)
    }
  }

  const submitServiceSummary = async () => {
    if (!selectedTask || updating) return
    const actualDurationMinutes = Number(summaryForm.actualDurationMinutes)
    const overtimeMinutes = Number(summaryForm.overtimeMinutes || '0')
    if (!Number.isFinite(actualDurationMinutes) || actualDurationMinutes <= 0) {
      Taro.showToast({ title: '请填写服务时长', icon: 'none' })
      return
    }
    if (!Number.isFinite(overtimeMinutes) || overtimeMinutes < 0) {
      Taro.showToast({ title: '请填写有效加时', icon: 'none' })
      return
    }
    if (!summaryForm.visitResult.trim() || !summaryForm.followUpAdvice.trim() || !summaryForm.operatorNote.trim()) {
      Taro.showToast({ title: '请补齐服务总结', icon: 'none' })
      return
    }

    const modalResult = await Taro.showModal({
      title: '提交服务总结',
      content: '提交后订单会进入已完成，家属可在订单页查看服务总结。',
    })
    if (!modalResult.confirm) return

    setUpdating(true)
    try {
      const response = await apiRequest({
        path: `/api/escort/tasks/${selectedTask.id}/summary`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
        },
        data: {
          actualDurationMinutes,
          visitResult: summaryForm.visitResult,
          followUpAdvice: summaryForm.followUpAdvice,
          overtimeMinutes,
          operatorNote: summaryForm.operatorNote,
        },
      })
      if (response.statusCode >= 400) {
        throw new Error('escort_summary_submit_failed')
      }
      Taro.showToast({
        title: '服务总结已提交',
        icon: 'success',
      })
      setTaskFilter('completed')
      setShowManualSteps(false)
      await loadTasks()
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '总结提交失败',
        icon: 'none',
      })
    } finally {
      setUpdating(false)
    }
  }

  const reportException = async () => {
    if (!selectedTask || updating) return
    const modalResult = await Taro.showModal({
      title: '记录异常',
      content: '提交后订单会进入异常处理中，运营后台会看到待处理风险。'
    })
    if (!modalResult.confirm) return

    setUpdating(true)
    try {
      const response = await apiRequest({
        path: `/api/escort/tasks/${selectedTask.id}/exceptions`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
        },
        data: {
          exceptionType: 'cannot_reach_elder',
          description: '陪诊员端演示异常：暂时联系不上老人，已通知运营介入。'
        }
      })
      if (response.statusCode >= 400) {
        throw new Error('escort_exception_create_failed')
      }
      Taro.showToast({
        title: '异常已提交',
        icon: 'success'
      })
      await loadTasks()
    } catch (error) {
      console.error(error)
      Taro.showToast({
        title: '异常提交失败',
        icon: 'none'
      })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <View className='page escort-page'>
      {!authorized && (
        <View className='access-card card'>
          <Text className='access-title'>{checkingRole ? '正在验证身份' : '内部陪诊员入口'}</Text>
          <Text className='access-copy'>该页面仅供颐年智陪自营陪诊员使用。家属用户请返回首页预约或在订单页查看服务进度。</Text>
          <Button className='primary-button' loading={checkingRole} onClick={unlockEscortEntry}>
            输入个人口令
          </Button>
          <Button className='secondary-button access-back' onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
            返回用户首页
          </Button>
        </View>
      )}

      {authorized && (
      <>
      <View className='escort-head'>
        <Text className='escort-title'>我的陪诊任务</Text>
        <Text className='escort-copy'>{escortName || '陪诊员'} · 查看任务、同步进度、完成服务。</Text>
      </View>

      <Button className='secondary-button refresh-button' loading={loading} onClick={loadTasks}>
        {loading ? '同步中' : '刷新任务'}
      </Button>
      <Button className='secondary-button bind-button' loading={binding} onClick={bindWechat}>
        {binding ? '绑定中' : '绑定陪诊员微信'}
      </Button>

      <View className='stats-grid'>
        <View className='stat-card card'>
          <Text>今日任务</Text>
          <Text>{tasks.length}</Text>
        </View>
        <View className='stat-card card'>
          <Text>进行中</Text>
          <Text>{taskStats.activeCount}</Text>
        </View>
        <View className='stat-card card'>
          <Text>异常</Text>
          <Text>{taskStats.exceptionCount}</Text>
        </View>
      </View>

      <View className='task-filter'>
        {[
          { key: 'active', label: '进行中', count: taskStats.activeCount },
          { key: 'exception', label: '异常', count: taskStats.exceptionCount },
          { key: 'completed', label: '已完成', count: taskStats.completedCount },
          { key: 'all', label: '全部', count: tasks.length }
        ].map((item) => (
          <Button
            className={taskFilter === item.key ? 'filter-button active' : 'filter-button'}
            key={item.key}
            onClick={() => {
              setTaskFilter(item.key as 'active' | 'exception' | 'completed' | 'all')
              setShowManualSteps(false)
            }}
          >
            {item.label} {item.count}
          </Button>
        ))}
      </View>

      <View className='task-list'>
        {filteredTasks.map((task) => {
          const upcoming = nextStep(task)
          return (
          <View
            className={selectedTask?.id === task.id ? 'task-card card active' : 'task-card card'}
            key={task.id}
            onClick={() => {
              setSelectedTaskId(task.id)
              setShowManualSteps(false)
            }}
          >
            <View className='task-top'>
              <Text className='task-id'>{task.orderNo}</Text>
              <Text className={task.status === 'completed' ? 'task-status done' : 'task-status'}>
                {statusText[task.status]}
              </Text>
            </View>
            <Text className='task-hospital'>{task.hospitalName}</Text>
            <Text className='task-meta'>{serviceText[task.servicePackage]} · {task.visitDate} {task.visitTime}</Text>
            <View className='task-next-row'>
              <Text>当前：{task.progress.length ? task.progress[task.progress.length - 1].stepLabel : '未开始'}</Text>
              <Text>{upcoming ? `下一步：${upcoming.label}` : '已完成全部节点'}</Text>
            </View>
          </View>
          )
        })}
      </View>

      {!filteredTasks.length && !loading && (
        <View className='empty-card card'>
          <Text className='empty-title'>当前筛选暂无任务</Text>
          <Text className='empty-copy'>可以切换上方筛选，或请运营后台派单。</Text>
        </View>
      )}

      {selectedTask && (
        <View className='detail-card card'>
          <Text className='detail-title'>任务详情</Text>
          <View className='task-progress-summary'>
            <View>
              <Text>当前进度</Text>
              <Text>{progressPercent(selectedTask)}%</Text>
            </View>
            <View className='task-progress-bar'>
              <View style={{ width: `${progressPercent(selectedTask)}%` }} />
            </View>
          </View>
          <View className='detail-row'>
            <Text className='detail-label'>就诊人</Text>
            <Text className='detail-value'>{selectedTask.elderRelation}</Text>
          </View>
          <View className='detail-row'>
            <Text className='detail-label'>联系人</Text>
            <Text className='detail-value'>{selectedTask.contactName} · {selectedTask.contactPhone}</Text>
          </View>
          <View className='detail-row'>
            <Text className='detail-label'>科室</Text>
            <Text className='detail-value'>{selectedTask.departmentName || '待客服确认'}</Text>
          </View>
          <View className='note-box'>
            <Text>{selectedTask.specialNotes || '暂无特殊注意事项'}</Text>
          </View>

          {selectedTask.exceptions.length > 0 && (
            <View className='exception-box'>
              <Text className='exception-title'>异常记录</Text>
              {selectedTask.exceptions.map((item) => (
                <Text className='exception-copy' key={item.id}>
                  {item.handled ? '已处理' : '待处理'} · {item.description}
                </Text>
              ))}
            </View>
          )}

          <Text className='detail-title progress-title'>服务进度</Text>
          <View className='progress-list'>
            {progressSteps.map((step) => {
              const done = selectedTask.progress.some((item) => item.stepKey === step.key)
              const current = selectedNextStep?.key === step.key
              return (
              <View className={done ? 'progress-item done' : current ? 'progress-item current' : 'progress-item'} key={step.key}>
                <View className={done ? 'progress-dot done' : current ? 'progress-dot current' : 'progress-dot'} />
                <Text>{step.label}</Text>
              </View>
              )
            })}
          </View>

          {!['cancelled', 'unavailable', 'exception_handling'].includes(selectedTask.status) && (
            <View className='summary-editor'>
              <Text className='summary-editor-title'>服务总结</Text>
              <Text className='summary-editor-copy'>服务结束前填写，提交后家属可在订单页查看。</Text>
              <View className='summary-field-row'>
                <View className='summary-field half'>
                  <Text>服务分钟</Text>
                  <Input
                    type='number'
                    value={summaryForm.actualDurationMinutes}
                    onInput={(event) => setSummaryForm((current) => ({ ...current, actualDurationMinutes: event.detail.value }))}
                  />
                </View>
                <View className='summary-field half'>
                  <Text>加时分钟</Text>
                  <Input
                    type='number'
                    value={summaryForm.overtimeMinutes}
                    onInput={(event) => setSummaryForm((current) => ({ ...current, overtimeMinutes: event.detail.value }))}
                  />
                </View>
              </View>
              <View className='summary-field'>
                <Text>就诊结果</Text>
                <Textarea
                  value={summaryForm.visitResult}
                  placeholder='例如：已完成复诊、缴费和取药。'
                  onInput={(event) => setSummaryForm((current) => ({ ...current, visitResult: event.detail.value }))}
                />
              </View>
              <View className='summary-field'>
                <Text>后续建议</Text>
                <Textarea
                  value={summaryForm.followUpAdvice}
                  placeholder='例如：两周后复诊，按医嘱服药。'
                  onInput={(event) => setSummaryForm((current) => ({ ...current, followUpAdvice: event.detail.value }))}
                />
              </View>
              <View className='summary-field'>
                <Text>内部备注</Text>
                <Textarea
                  value={summaryForm.operatorNote}
                  placeholder='例如：已同步家属，无额外售后事项。'
                  onInput={(event) => setSummaryForm((current) => ({ ...current, operatorNote: event.detail.value }))}
                />
              </View>
              <Button className='primary-button summary-submit-button' loading={updating} onClick={submitServiceSummary}>
                保存总结并完成订单
              </Button>
            </View>
          )}

          <View className='escort-actions'>
            <Button
              className='primary-button'
              disabled={!selectedNextStep || updating}
              loading={updating}
              onClick={() => updateProgress()}
            >
              {selectedNextStep ? `更新：${selectedNextStep.label}` : '进度已完成'}
            </Button>
            <Button
              className='secondary-button'
              onClick={() => setShowManualSteps((current) => !current)}
            >
              {showManualSteps ? '收起节点' : '选择其他节点'}
            </Button>
          </View>

          {showManualSteps && (
            <View className='step-action-list'>
              {progressSteps.map((step) => {
                const done = selectedTask.progress.some((item) => item.stepKey === step.key)
                return (
                  <Button
                    className={done ? 'step-action done' : 'step-action'}
                    disabled={done || updating}
                    key={step.key}
                    onClick={() => updateProgress(step.key)}
                  >
                    {done ? `${step.label} · 已完成` : step.label}
                  </Button>
                )
              })}
            </View>
          )}

          <Button className='warning-button' loading={updating} onClick={reportException}>记录异常并通知运营</Button>
        </View>
      )}

      {selectedTask && (
        <View className='bottom-action-bar'>
          <Button className='bottom-primary' disabled={!selectedNextStep || updating} loading={updating} onClick={() => updateProgress()}>
            {selectedNextStep ? `更新：${selectedNextStep.label}` : '服务已完成'}
          </Button>
          <Button className='bottom-warning' loading={updating} onClick={reportException}>异常</Button>
        </View>
      )}
      </>
      )}
    </View>
  )
}
