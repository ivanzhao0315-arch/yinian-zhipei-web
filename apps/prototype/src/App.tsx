import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  Headphones,
  HeartPulse,
  Home,
  Hospital,
  MapPin,
  Phone,
  ShieldCheck,
  Siren,
  Star,
  UserRound,
  UsersRound,
} from 'lucide-react'
import './App.css'

type Screen =
  | 'home'
  | 'booking'
  | 'success'
  | 'orders'
  | 'detail'
  | 'progress'
  | 'summary'

const progressSteps = [
  { label: '需求已提交', time: '06-01 10:30', note: '客服将在工作时间内联系确认档期。' },
  { label: '客服已确认', time: '06-01 10:45', note: '已了解需求，正在为您安排陪诊员。' },
  { label: '陪诊员已安排', time: '06-01 11:20', note: '陪诊员：李娜，服务经验：3 年。' },
  { label: '陪诊中', time: '06-02 08:55', note: '陪诊员已到达医院，正在陪诊中。' },
  { label: '服务即将完成', time: '预计 06-02 12:30', note: '等待陪诊员提交服务总结。' },
]

const assistItems = ['取号', '候诊', '缴费', '检查', '取药', '拿报告']
const tabs: Array<{ key: Screen; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'booking', label: '提交需求' },
  { key: 'detail', label: '订单详情' },
  { key: 'progress', label: '陪诊进度' },
  { key: 'summary', label: '服务总结' },
]

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedItems, setSelectedItems] = useState(['取号', '候诊', '检查'])
  const contentRef = useRef<HTMLDivElement>(null)
  const activeIndex = useMemo(
    () => tabs.findIndex((item) => item.key === screen),
    [screen],
  )

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [screen])

  const go = (target: Screen) => setScreen(target)

  return (
    <main className="prototype-shell">
      <aside className="prototype-sidebar" aria-label="原型导航">
        <div>
          <p className="eyebrow">兰州试点 MVP</p>
          <h1>颐年智陪小程序原型</h1>
          <p className="sidebar-copy">
            面向子女/家属下单，4 名自营陪诊员人工确认档期。当前原型覆盖预约、订单、进度和服务总结主流程。
          </p>
        </div>

        <nav className="screen-nav">
          {tabs.map((item, index) => (
            <button
              className={screen === item.key ? 'nav-item active' : 'nav-item'}
              key={item.key}
              onClick={() => go(item.key)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="prototype-note">
          <ShieldCheck size={18} />
          <span>文案已避免承诺即时接单和医疗诊断建议。</span>
        </div>
      </aside>

      <section className="phone-stage" aria-label="手机原型">
        <div className="phone-frame">
          <StatusBar />
          <MiniHeader
            screen={screen}
            onBack={() => go(activeIndex > 0 ? tabs[activeIndex - 1].key : 'home')}
          />
          <div className="phone-content" ref={contentRef}>
            {screen === 'home' && <HomeScreen go={go} />}
            {screen === 'booking' && (
              <BookingScreen
                go={go}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
              />
            )}
            {screen === 'success' && <SuccessScreen go={go} />}
            {screen === 'orders' && <OrdersScreen go={go} />}
            {screen === 'detail' && <DetailScreen go={go} />}
            {screen === 'progress' && <ProgressScreen go={go} />}
            {screen === 'summary' && <SummaryScreen />}
          </div>
          <TabBar screen={screen} go={go} />
        </div>
      </section>
    </main>
  )
}

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span>9:41</span>
      <span className="status-icons">5G  ▰</span>
    </div>
  )
}

function MiniHeader({
  screen,
  onBack,
}: {
  screen: Screen
  onBack: () => void
}) {
  const titles: Record<Screen, string> = {
    home: '颐年智陪',
    booking: '提交陪诊需求',
    success: '需求已提交',
    orders: '我的订单',
    detail: '订单详情',
    progress: '陪诊进度',
    summary: '服务总结',
  }

  return (
    <header className="mini-header">
      {screen !== 'home' ? (
        <button className="icon-button" onClick={onBack} aria-label="返回" type="button">
          <ChevronLeft size={22} />
        </button>
      ) : (
        <span className="header-spacer" />
      )}
      <strong>{titles[screen]}</strong>
      <button className="wechat-more" aria-label="更多" type="button">
        <span />
        <span />
        <span />
      </button>
    </header>
  )
}

function HomeScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <div className="screen home-screen">
      <div className="location-row">
        <MapPin size={16} />
        <span>兰州市</span>
      </div>

      <section className="hero-panel">
        <div className="hero-copy">
          <h2>为父母预约兰州本地陪诊</h2>
          <p>自营团队，客服确认后安排陪诊员。</p>
          <ul>
            <li>
              <Check size={14} />
              熟悉医院流程
            </li>
            <li>
              <Check size={14} />
              过程节点同步
            </li>
            <li>
              <Check size={14} />
              服务总结可追溯
            </li>
          </ul>
        </div>
        <div className="hero-figure">
          <div className="elder-avatar">爸</div>
          <div className="escort-avatar">陪</div>
        </div>
      </section>

      <div className="trust-strip">
        <ShieldCheck size={18} />
        我们是兰州本地自营陪诊团队，服务更可控、更放心
      </div>

      <button className="primary-action" onClick={() => go('booking')} type="button">
        <ClipboardList size={24} />
        <span>
          提交陪诊需求
          <small>客服确认后为您安排陪诊员</small>
        </span>
        <ChevronRight size={22} />
      </button>

      <div className="feature-grid">
        <Feature icon={<Hospital size={20} />} title="医院覆盖" text="兰州重点医院" />
        <Feature icon={<UsersRound size={20} />} title="自营团队" text="严格培训" />
        <Feature icon={<ShieldCheck size={20} />} title="透明收费" text="确认后报价" />
        <Feature icon={<Headphones size={20} />} title="专人服务" text="全程陪同" />
      </div>

      <section className="card trust-card">
        <SectionTitle title="为什么可信" />
        <div className="trust-list">
          <TrustItem title="实名自营陪诊员" text="服务人员由平台统一管理和培训" />
          <TrustItem title="服务前电话确认" text="客服确认医院、时间、老人情况和档期" />
          <TrustItem title="过程节点同步" text="家属可查看到院、候诊、就诊、取药等进度" />
          <TrustItem title="异常及时联系" text="现场变更、临时检查、身体不适会通知家属" />
        </div>
      </section>

      <section className="card">
        <SectionTitle title="服务流程" action="查看全部" />
        <div className="flow-row">
          {['提交需求', '客服确认', '安排陪诊', '陪诊服务', '服务总结'].map((item) => (
            <div className="flow-step" key={item}>
              <span>
                <Check size={14} />
              </span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <SectionTitle title="服务保障" />
        <div className="guarantee-row">
          <MiniGuarantee title="实名陪诊" text="自营人员" />
          <MiniGuarantee title="信息安全" text="授权使用" />
          <MiniGuarantee title="服务监督" text="可评价反馈" />
        </div>
      </section>
    </div>
  )
}

function BookingScreen({
  go,
  selectedItems,
  setSelectedItems,
}: {
  go: (screen: Screen) => void
  selectedItems: string[]
  setSelectedItems: (items: string[]) => void
}) {
  const toggle = (item: string) => {
    setSelectedItems(
      selectedItems.includes(item)
        ? selectedItems.filter((selected) => selected !== item)
        : [...selectedItems, item],
    )
  }

  return (
    <div className="screen booking-screen">
      <section className="profile-card">
        <div className="portrait">张</div>
        <div>
          <h3>张爷爷 <span>本人</span></h3>
          <p>男 · 72 岁</p>
          <div className="tags">
            <span>高血压</span>
            <span>冠心病</span>
            <span>行动不便</span>
          </div>
        </div>
        <ChevronRight size={18} />
      </section>

      <section className="form-card">
        <h3>就诊信息</h3>
        <FormRow label="就诊医院" value="兰州大学第二医院" />
        <FormRow label="就诊科室" value="心血管内科" />
        <FormRow label="就诊日期" value="2026-06-02 上午" />
        <FormRow label="是否挂号" value="已挂号" />
      </section>

      <section className="form-card">
        <h3>服务安排</h3>
        <FormRow label="预约类型" value="明日就诊" />
        <FormRow label="会合方式" value="医院门口会合" />
        <FormRow label="服务套餐" value="半日陪诊 · ¥238 起" />
        <div className="hint-line">
          <Siren size={15} />
          今日紧急单和上门接送需客服人工确认是否可安排。
        </div>
      </section>

      <section className="form-card">
        <h3>费用说明</h3>
        <div className="price-options">
          <PriceOption title="单项代办" time="2 小时内" price="¥158 起" />
          <PriceOption title="半日陪诊" time="4 小时内" price="¥238 起" active />
          <PriceOption title="全日陪诊" time="8 小时内" price="¥458 起" />
        </div>
        <p className="fee-note">
          超时按 ¥60/小时计算。挂号费、检查费、药费等医疗费用由用户自理，陪诊员不垫付医疗费用。
        </p>
      </section>

      <section className="form-card">
        <h3>需要协助的事项</h3>
        <div className="chip-grid">
          {assistItems.map((item) => (
            <button
              className={selectedItems.includes(item) ? 'chip selected' : 'chip'}
              key={item}
              onClick={() => toggle(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="form-card">
        <h3>需求说明</h3>
        <div className="textarea-preview">
          复诊开药，需要协助排队、检查、取药。老人走路较慢，请耐心陪同。
          <span>42/200</span>
        </div>
      </section>

      <section className="upload-card">
        <div>
          <h3>上传就诊资料</h3>
          <p>病历、检查单、预约凭证，最多 9 张</p>
        </div>
        <button className="upload-box" type="button">
          <Camera size={24} />
          上传图片
        </button>
      </section>

      <div className="bottom-quote">
        <div>
          <small>预估费用</small>
          <strong>¥238 起</strong>
        </div>
        <button onClick={() => go('success')} type="button">
          提交需求
        </button>
      </div>
    </div>
  )
}

function SuccessScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <div className="screen success-screen">
      <div className="success-mark">
        <Check size={44} />
      </div>
      <h2>陪诊需求已提交</h2>
      <p>客服将联系您确认医院、时间和陪诊员档期。确认前不代表预约成功。</p>
      <div className="notice-card">
        <Clock3 size={20} />
        工作时间内将尽快联系您。如比较紧急，请直接联系客服。
      </div>
      <button className="wide-button" onClick={() => go('detail')} type="button">
        查看订单详情
      </button>
      <button className="ghost-button" onClick={() => go('home')} type="button">
        返回首页
      </button>
    </div>
  )
}

function OrdersScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <div className="screen">
      <div className="segmented">
        <button className="active" type="button">全部</button>
        <button type="button">待确认</button>
        <button type="button">服务中</button>
        <button type="button">已完成</button>
      </div>
      <button className="order-card" onClick={() => go('detail')} type="button">
        <div>
          <strong>兰州大学第二医院</strong>
          <span>心血管内科 · 2026-06-02 上午</span>
          <small>张爷爷 · 半日陪诊 ¥238 起</small>
        </div>
        <em>服务中</em>
      </button>
      <button className="order-card muted" type="button">
        <div>
          <strong>甘肃省人民医院</strong>
          <span>骨科 · 2026-05-18 下午</span>
          <small>李奶奶 · 检查陪同</small>
        </div>
        <em>已完成</em>
      </button>
    </div>
  )
}

function DetailScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <div className="screen detail-screen">
      <section className="status-card">
        <div>
          <p>进行中</p>
          <span>陪诊员已到达医院，正在陪诊中</span>
        </div>
        <button type="button">联系客服</button>
      </section>

      <section className="profile-card compact">
        <div className="portrait">张</div>
        <div>
          <h3>张爷爷</h3>
          <p>男 · 72 岁</p>
        </div>
        <button className="call-button" aria-label="平台联系陪诊员" type="button">
          <Phone size={18} />
        </button>
      </section>

      <section className="card info-list">
        <InfoLine icon={<Hospital size={18} />} label="兰州大学第二医院" />
        <InfoLine icon={<HeartPulse size={18} />} label="心血管内科" />
        <InfoLine icon={<CalendarDays size={18} />} label="2026-06-02 上午" />
        <FormRow label="订单号" value="DD202606020001" />
        <FormRow label="服务类型" value="半日陪诊（4 小时）" />
        <FormRow label="预估费用" value="¥238 起" />
      </section>

      <section className="card">
        <SectionTitle title="陪诊进度" action="查看全部" onAction={() => go('progress')} />
        <CompactTimeline />
      </section>

      <div className="detail-actions">
        <button onClick={() => go('progress')} type="button">
          查看进度
        </button>
        <button className="outline-danger" type="button">
          申请改期/取消
        </button>
      </div>
    </div>
  )
}

function ProgressScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <div className="screen progress-screen">
      <section className="progress-hero">
        <p>进行中</p>
        <h2>陪诊员正在陪诊</h2>
        <span>已到达医院并接到老人</span>
      </section>
      <section className="card timeline-card">
        {progressSteps.map((step, index) => (
          <div
            className={index === 3 ? 'timeline-step current' : 'timeline-step'}
            key={step.label}
          >
            <span className="dot">
              {index < 4 ? <Check size={13} /> : null}
            </span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.note}</p>
            </div>
            <time>{step.time}</time>
          </div>
        ))}
      </section>
      <div className="detail-actions">
        <button type="button">
          联系陪诊员
        </button>
        <button onClick={() => go('summary')} type="button">
          查看总结
        </button>
      </div>
    </div>
  )
}

function SummaryScreen() {
  return (
    <div className="screen summary-screen">
      <section className="summary-hero">
        <div className="big-check">
          <Check size={42} />
        </div>
        <h2>本次服务已完成</h2>
        <p>感谢您的信任，期待再次为您服务</p>
      </section>

      <section className="card rating-card">
        <h3>服务评价</h3>
        <div className="stars">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star fill="currentColor" key={index} size={27} />
          ))}
          <span>非常满意</span>
        </div>
        <div className="tags">
          <span>专业负责</span>
          <span>耐心细致</span>
          <span>沟通顺畅</span>
          <span>值得推荐</span>
        </div>
      </section>

      <section className="card summary-card">
        <SectionTitle title="服务总结" />
        <div className="escort-line">
          <div className="escort-mini">李</div>
          <div>
            <strong>李娜 · 陪诊员</strong>
            <p>服务时长：3 小时 35 分钟</p>
          </div>
        </div>
        <ul className="check-list">
          <li>挂号成功（心血管内科）</li>
          <li>医生就诊完成</li>
          <li>心电图检查已完成</li>
          <li>取药完成，已交接给患者</li>
        </ul>
      </section>

      <section className="card summary-card">
        <SectionTitle title="医生交代事项" />
        <p className="summary-copy">
          医生交代按原方案服药，若出现胸闷加重、头晕或明显不适，需要及时复诊。以上为陪诊员现场记录。
        </p>
      </section>

      <section className="card summary-card">
        <SectionTitle title="下一步安排" />
        <p className="summary-copy">
          医生交代按原方案服药，两周后如仍有胸闷情况，建议按医生要求复诊。以上为陪诊员现场记录，不构成医疗诊断或治疗建议。
        </p>
      </section>
    </div>
  )
}

function TabBar({
  screen,
  go,
}: {
  screen: Screen
  go: (screen: Screen) => void
}) {
  return (
    <nav className="tab-bar" aria-label="小程序底部导航">
      <TabButton active={screen === 'home'} icon={<Home size={20} />} label="首页" onClick={() => go('home')} />
      <TabButton active={screen === 'orders' || screen === 'detail' || screen === 'progress' || screen === 'summary'} icon={<FileCheck2 size={20} />} label="订单" onClick={() => go('orders')} />
      <TabButton active={screen === 'booking'} icon={<UserRound size={20} />} label="老人" onClick={() => go('booking')} />
      <TabButton active={false} icon={<UserRound size={20} />} label="我的" onClick={() => undefined} />
    </nav>
  )
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button className={active ? 'tab active' : 'tab'} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div className="feature">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function MiniGuarantee({ title, text }: { title: string; text: string }) {
  return (
    <div className="mini-guarantee">
      <ShieldCheck size={17} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function PriceOption({
  title,
  time,
  price,
  active,
}: {
  title: string
  time: string
  price: string
  active?: boolean
}) {
  return (
    <div className={active ? 'price-option active' : 'price-option'}>
      <strong>{title}</strong>
      <span>{time}</span>
      <em>{price}</em>
    </div>
  )
}

function TrustItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="trust-item">
      <ShieldCheck size={18} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  )
}

function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      {action ? (
        <button onClick={onAction} type="button">
          {action}
          <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  )
}

function FormRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <ChevronRight size={16} />
    </div>
  )
}

function InfoLine({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="info-line">
      {icon}
      <strong>{label}</strong>
    </div>
  )
}

function CompactTimeline() {
  return (
    <div className="compact-timeline">
      {progressSteps.slice(0, 4).map((step, index) => (
        <div className={index === 3 ? 'compact-step active' : 'compact-step'} key={step.label}>
          <span />
          <p>{step.label}</p>
          <time>{step.time}</time>
        </div>
      ))}
    </div>
  )
}

export default App
