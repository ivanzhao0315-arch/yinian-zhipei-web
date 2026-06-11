import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import {
  CUSTOMER_SERVICE_HOURS,
  CUSTOMER_SERVICE_PHONE,
  CUSTOMER_SERVICE_PHONE_DISPLAY,
  SERVICE_CITY,
} from '../../utils/support'

type PrivacySection = {
  title: string
  items: string[]
}

const sections: PrivacySection[] = [
  {
    title: '一、我们收集的信息',
    items: [
      '账号与身份信息：微信登录产生的 openid、用户角色、陪诊员绑定信息等，用于识别订单归属和工作人员权限。',
      '预约与联系信息：联系人手机号、服务对象关系、就诊医院、就诊日期、服务类型、订单状态、客服确认记录等，用于创建订单、电话确认和安排陪诊。',
      '服务过程信息：陪诊员进度更新、异常记录、服务总结、实际服务时长、后续建议等，用于向家属同步服务情况和处理售后。',
      '支付与交易信息：订单号、支付状态、微信支付交易号、金额和退款状态等，用于完成支付、对账和退款处理。',
      '运行与安全信息：接口请求记录、错误日志、设备网络环境的必要信息等，用于保障系统安全、排查故障和防止异常操作。'
    ]
  },
  {
    title: '二、敏感个人信息说明',
    items: [
      `陪诊服务可能涉及老人身份关系、就诊医院、科室、检查取药需求、行动能力、特殊注意事项等敏感个人信息。我们仅在完成${SERVICE_CITY}陪诊预约、客服确认、派单和服务进度同步所必需的范围内处理。`,
      '提交他人信息前，您应确保已取得服务对象本人或其合法授权人的同意。若您不同意提供必要信息，可能无法完成预约或服务安排。',
      '陪诊员不得将服务对象信息用于私下营销、转介绍或与本次订单无关的用途。'
    ]
  },
  {
    title: '三、我们如何使用信息',
    items: [
      '用于预约提交、电话确认、档期判断、订单派单、陪诊服务执行、进度通知、异常处理、支付退款、售后回访和运营复盘。',
      '用于向用户和陪诊员发送订单待确认、预约成功、支付成功、派单结果、服务进度、异常提醒等订阅消息。订阅消息会在用户主动授权后发送。',
      '用于改进服务流程、统计订单量和团队服务质量。统计分析会尽量采用去标识化或汇总形式，不用于与陪诊无关的商业推广。'
    ]
  },
  {
    title: '四、共享与委托处理',
    items: [
      '为完成订单，我们会向负责该订单的自营陪诊员提供必要的医院、时间、联系人和服务注意事项。',
      '为完成支付与退款，我们会通过微信支付处理必要交易信息。',
      '为运行小程序、接口服务和数据存储，我们会使用微信云托管、腾讯云数据库等基础云服务。相关服务提供方仅按系统运行和安全保障目的处理数据。',
      '除法律法规要求、用户授权或完成服务所必需的情形外，我们不会出售或非法向第三方提供用户个人信息。'
    ]
  },
  {
    title: '五、存储与安全',
    items: [
      '我们会采取账号权限、接口鉴权、访问控制、日志审计和数据备份等措施保护个人信息安全。',
      '订单、支付、服务进度和售后记录会在实现服务目的、处理争议、满足财务和合规要求所需期限内保存。超出必要期限后，我们会删除或匿名化处理。',
      '如发生个人信息安全事件，我们会按法律法规要求采取补救措施，并在必要时通过小程序、电话或其他合理方式告知用户。'
    ]
  },
  {
    title: '六、您的权利',
    items: [
      '您可以通过客服电话查询、更正或补充订单中的联系方式和预约信息。',
      '在不影响依法留存、财务对账、争议处理和服务安全的前提下，您可以申请删除个人信息或注销相关服务记录。',
      '您可以在微信中管理订阅消息授权。关闭授权后，可能无法及时收到订单进度或异常提醒。'
    ]
  },
  {
    title: '七、未成年人和老人信息',
    items: [
      '本服务主要面向具备完全民事行为能力的成年人。若订单涉及未成年人、老人或其他需要监护协助的人群，提交人应确认具备相应授权。',
      '我们会按照必要、最小化原则处理老人相关信息，并优先用于本次陪诊服务和售后处理。'
    ]
  },
  {
    title: '八、联系我们',
    items: [
      `客服电话：${CUSTOMER_SERVICE_PHONE_DISPLAY}`,
      `人工服务时间：${CUSTOMER_SERVICE_HOURS}`,
      '如您对个人信息处理、隐私政策或权限使用有疑问，可通过小程序“我的”页面联系客服。'
    ]
  }
]

export default function Privacy () {
  const callSupport = () => Taro.makePhoneCall({ phoneNumber: CUSTOMER_SERVICE_PHONE })

  return (
    <View className='page privacy-page'>
      <View className='privacy-head'>
        <Text className='privacy-kicker'>颐年智陪</Text>
        <Text className='privacy-title'>隐私政策</Text>
        <Text className='privacy-copy'>请了解我们如何收集、使用、存储和保护陪诊预约相关信息。</Text>
      </View>

      {sections.map((section) => (
        <View className='privacy-card card' key={section.title}>
          <Text className='privacy-section-title'>{section.title}</Text>
          {section.items.map((item) => (
            <Text className='privacy-item' key={item}>{item}</Text>
          ))}
        </View>
      ))}

      <View className='privacy-contact card' onClick={callSupport}>
        <View>
          <Text className='contact-title'>隐私问题咨询</Text>
          <Text className='contact-copy'>{CUSTOMER_SERVICE_PHONE_DISPLAY} · {CUSTOMER_SERVICE_HOURS}</Text>
        </View>
        <Text className='contact-action'>拨打</Text>
      </View>
    </View>
  )
}
