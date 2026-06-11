import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'
import {
  CUSTOMER_SERVICE_HOURS,
  CUSTOMER_SERVICE_PHONE,
  CUSTOMER_SERVICE_PHONE_DISPLAY,
  SERVICE_CITY,
} from '../../utils/support'

type AgreementSection = {
  title: string
  items: string[]
}

const sections: AgreementSection[] = [
  {
    title: '一、服务说明',
    items: [
      `颐年智陪为${SERVICE_CITY}本地陪诊服务平台，由自营陪诊团队按订单提供就诊陪同、院内引导、排队取号、取药协助、进度同步等非医疗服务。`,
      '本服务不属于医疗诊疗、护理、急救、处方建议、诊断建议或医院号源承诺服务。涉及诊疗判断、用药、检查、治疗方案等事项，应以医院和医生意见为准。',
      '预约提交后进入待电话确认状态，客服会核对医院、就诊时间、陪诊需求、人员档期和费用边界。客服确认前，不代表平台已承诺一定可以服务。'
    ]
  },
  {
    title: '二、下单与费用',
    items: [
      '用户应填写真实、准确、完整的联系人手机号、服务对象关系、就诊医院、就诊时间和服务类型。因信息错误、联系不上或临时变更导致无法服务的，平台可暂停或取消订单。',
      '小程序展示的套餐价格为服务费起价，实际服务费用以客服确认、订单展示和支付金额为准。超时、跨院、特殊需求等可能产生额外费用，需经客服确认。',
      '挂号费、检查费、治疗费、药费、交通费等医疗或第三方费用由用户或家属自行承担。陪诊员不代付、不垫付医疗费用。'
    ]
  },
  {
    title: '三、支付、取消与退款',
    items: [
      '订单经电话确认后，用户可通过微信支付完成服务费支付。支付成功不代表医院号源、检查项目或诊疗结果一定完成。',
      '如需取消或改期，请尽快联系客服。退款规则会结合服务阶段、陪诊员是否已出发、医院现场等待成本和双方沟通结果处理。',
      '发生无法服务、重复支付、异常扣款等情况，用户可通过客服电话申请处理，平台会核对订单和支付记录后协助退款或补偿。'
    ]
  },
  {
    title: '四、用户责任',
    items: [
      '用户应确保已取得服务对象本人或其合法监护人、近亲属的授权，允许平台为完成陪诊服务处理必要的就诊信息和联系方式。',
      '用户不得要求陪诊员代替家属作出医疗决策、签署高风险医疗文件、保管大额现金、处理与陪诊无关的事务，或从事违法违规行为。',
      '如服务对象出现突发危重症、意外伤害或其他紧急情况，应第一时间联系医院急诊、120 或现场医务人员，平台陪诊员会在能力范围内协助沟通。'
    ]
  },
  {
    title: '五、服务变更与免责',
    items: [
      '医院排队、医生停诊、检查延期、药品缺货、交通拥堵、天气、公共卫生事件等非平台可控因素，可能影响服务时长和结果。',
      '平台会尽力安排自营陪诊员并同步服务进度，但不保证就诊时长、医生诊疗结论、检查结果、药品供应或医院流程完全符合用户预期。',
      '因用户隐瞒重要信息、临时失联、拒绝配合医院规则或现场不可抗力导致的损失，平台在法律允许范围内不承担相应责任。'
    ]
  },
  {
    title: '六、联系客服',
    items: [
      `客服电话：${CUSTOMER_SERVICE_PHONE_DISPLAY}`,
      `人工服务时间：${CUSTOMER_SERVICE_HOURS}`,
      '如您对订单、费用、退款、服务质量或协议内容有疑问，可通过小程序“我的”页面联系客服。'
    ]
  }
]

export default function Agreement () {
  const callSupport = () => Taro.makePhoneCall({ phoneNumber: CUSTOMER_SERVICE_PHONE })

  return (
    <View className='page legal-page'>
      <View className='legal-head'>
        <Text className='legal-kicker'>颐年智陪</Text>
        <Text className='legal-title'>用户协议</Text>
        <Text className='legal-copy'>请在提交预约前阅读并确认。继续使用本小程序，即表示您理解并同意以下服务规则。</Text>
      </View>

      {sections.map((section) => (
        <View className='legal-card card' key={section.title}>
          <Text className='legal-section-title'>{section.title}</Text>
          {section.items.map((item) => (
            <Text className='legal-item' key={item}>{item}</Text>
          ))}
        </View>
      ))}

      <View className='legal-contact card' onClick={callSupport}>
        <View>
          <Text className='contact-title'>客服电话</Text>
          <Text className='contact-copy'>{CUSTOMER_SERVICE_PHONE_DISPLAY} · {CUSTOMER_SERVICE_HOURS}</Text>
        </View>
        <Text className='contact-action'>拨打</Text>
      </View>
    </View>
  )
}
