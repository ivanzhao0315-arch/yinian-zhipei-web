export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/appointment/index',
    'pages/confirm/index',
    'pages/orders/index',
    'pages/escort/index',
    'pages/profile/index',
    'pages/agreement/index',
    'pages/privacy/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f7fbf8',
    navigationBarTitleText: '颐年智陪',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f4f7f5'
  },
  tabBar: {
    color: '#647067',
    selectedColor: '#226a4b',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页'
      },
      {
        pagePath: 'pages/appointment/index',
        text: '预约'
      },
      {
        pagePath: 'pages/orders/index',
        text: '订单'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的'
      }
    ]
  }
})
