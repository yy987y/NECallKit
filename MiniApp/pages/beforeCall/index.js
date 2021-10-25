import { uuid, formatTime } from '../../utils/index'

Page({
  data: {
    type: 2, //
    userId: "",
    showCallComp: false,
    invited: false,
    rtcConfig: {
      appkey: '',
      uid: uuid(),
      imToken: '', //im 登录token
      account: '',
      nickName: '',
      openCamera: true,
      openMicrophone: true,
      resolution: 'HD',
      audioQuality: 'high',
      videoWidth: 360,
      videoHeight: 640,
      minBitrate: 600,
      maxBitrate: 900,
      whitenessLevel: 4,
      beautyLevel: 4,
      checkSum: true, //默认安全模式
      debug: false,
    },
    callTypeArr: [
      { value: 2, title: '视频通话' },
      { value: 1, title: '语音通话' },
    ]
  },
  /**
   * 生命周期函数--监听页面加载
   * @param {*} options 配置项
   */
  onLoad: function () {
    this.nertcComponent = this.selectComponent('#nertc-component')
    const nickName = this.options.account || `用户${Math.ceil(Math.random() * 1000000)}`
    const queryParams = {
      ...this.data.rtcConfig,
      account: this.options.account,
      imToken: this.options.imToken,
      appkey: this.options.appkey,
      nickName,
      appkey: this.options.appkey
    };
    this.setData({
      rtcConfig: queryParams,
    })
    this.bindEvent()
    console.log('sdkVersion: v4.4.1')
    console.log('IMVersion: v8.4.0')
  },

  onUnload() {

  },

  startCall() {
    if (!this.data.userId) {
      wx.showToast({
        title: '请输入被呼叫人id',
        icon: 'error',
        duration: 2000
      })
      return
    }
    // 语音通话，默认关闭摄像头
    if (this.data.type == 1) {
      this.setData({
        'rtcConfig.openCamera': false
      })
    } else {
      this.setData({
        'rtcConfig.openCamera': true
      })
    }
    this.nertcComponent.call({
      userId: this.data.userId,
      type: this.data.type,
      attachment: JSON.stringify({ call: "testValue" }),
      success: (res) => {
        console.log("==call 成功回调", res)
        this.setData({
          showCallComp: true
        })
      },
      fail: (err) => {
        console.log("==call 失败回调", err)
      }
    })
  },
  changeHandler(e) {
    this.setData({
      userId: e.detail.value
    })
  },
  changeCallType(e) {
    this.setData({
      type: e.detail.value
    })
  },
  onAccept() {
    // 语音通话，默认关闭摄像头
    if (this.data.type == 1) {
      this.setData({
        'rtcConfig.openCamera': false
      })
    } else {
      this.setData({
        'rtcConfig.openCamera': true
      })
    }
    this.nertcComponent.accept({
      ...this.data.inviteData,
      success: (data) => {
        this.setData({ showCallComp: true, invited: false, })
        console.log("接受呼叫:成功回调", data)
      },
      fail: (err) => {
        console.log("接受呼叫:失败回调", err)
        this.resetUI()
      }
    })

  },
  onReject() {
    this.nertcComponent.reject({
      ...this.data.inviteData, success: (data) => {
        console.log("拒绝呼叫:成功回调", data)
      },
      fail: (err) => {
        console.log("拒绝呼叫:失败回调", err)
      }
    })
    this.resetUI()
  },
  resetUI() {
    this.setData({
      invited: false,
      showCallComp: false
    })
  },

  bindEvent() {
    const nertcComponentEvent = this.nertcComponent.EVENT
    console.log("this.nertcComponent", this.nertcComponent)
    //收到邀请
    this.nertcComponent.on(nertcComponentEvent.INVITED, (data) => {
      console.log("be invite", data)
      this.setData({
        invited: true,
        inviteData: data.data,
        type: data.data.type
      })
    })
    //自主设置呼叫|被呼的超时时间
    this.nertcComponent.setCallTimeout(30000)
    //被呼叫用户接受
    this.nertcComponent.on(nertcComponentEvent.USER_ACCEPT, (data) => {
      console.log("user accept", data)
    })
    //被呼叫用户拒绝
    this.nertcComponent.on(nertcComponentEvent.USER_REJECT, (data) => {
      console.log("user reject", data)
      this.resetUI()
    })
    //被呼叫用户超时
    this.nertcComponent.on(nertcComponentEvent.USER_BUSY, () => {
      console.log("user busy")
      this.resetUI()
    })
    //呼叫超时
    this.nertcComponent.on(nertcComponentEvent.CALLING_TIMEOUT, () => {
      console.log("call timeout")
      this.resetUI()
    })
    //取消呼叫
    this.nertcComponent.on(nertcComponentEvent.USER_CANCEL, (data) => {
      console.log("user cancel===", data)
      this.resetUI()
    })
    //通话结束
    this.nertcComponent.on(nertcComponentEvent.CALL_END, () => {
      console.log("====onCallEnd======")
      this.resetUI()
    })
    //disconnect
    this.nertcComponent.on("onDisconnect", () => {
      console.log("====onDisconnect======")
      this.resetUI()
    })
    // 获取rtc信息
    this.nertcComponent.on("onJoinChannel", (data) => {
      console.log("====onJoinChannel======", data)
    })
    this.nertcComponent.on(nertcComponentEvent.OTHER_CLIENT_REJECT, () => {
      this.resetUI()
    })
    this.nertcComponent.on(nertcComponentEvent.OTHER_CLIENT_ACCEPT, () => {
      this.resetUI()
    })
    this.nertcComponent.on(nertcComponentEvent.MESSAGE_SENT, (data) => {
      console.log("===on message send ,", data)
      const { status, to, type, durations = [] } = data.data
      const isBeCaller = to === this.data.rtcConfig.account
      const statusMap = {
        1: "已完成",
        2: isBeCaller ? "对方已取消" : "已取消",
        3: isBeCaller ? "已拒绝" : '对方已拒绝',
        4: isBeCaller ? "未接听" : '未接听',//对方超时未接听
        5: isBeCaller ? "未接听" : "对方忙线",
      };
      let duration = durations[0] ? durations[0].duration : 0
      let text = status === 1 && duration > 0 ? formatTime(duration) : ''
      this.setData({
        statusText: statusMap[status] + text
      })
      this.resetUI()
    })
    this.nertcComponent.on(nertcComponentEvent.AUDIO_AVAILABLE, () => {
      //your code
    })
    this.nertcComponent.on(nertcComponentEvent.VIDEO_AVAILABLE, () => {
      //your code
    })
    this.nertcComponent.on(nertcComponentEvent.CALL_TYPE_CHANGE, () => {
      //your code
    })
  },

})
