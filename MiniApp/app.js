//app.js
App({
  onLaunch: function() {
    const { model, system, statusBarHeight, windowWidth, windowHeight } = wx.getSystemInfoSync()
    let headHeight
    if (/iphone\s{0,}x/i.test(model)) {
      headHeight = 88
    } else if (system.indexOf('Android') !== -1) {
      headHeight = 68
    } else {
      headHeight = 64
    }
    this.globalData.videoContainerSize = {
      width: windowWidth,
      height: windowHeight - 40
    }
    this.globalData.headerHeight = headHeight
    this.globalData.statusBarHeight = statusBarHeight
  },
  globalData: {
    headerHeight: 0,
    statusBarHeight: 0,
    channelInfo: {},
    imInfo: {}, // 会话配置信息
  },
})
/**
 * 房间信息
 * channelInfo: {
 *  cid,
 *  config:{
 *    audio:[{rate:13000,op:'upper',net:'2g'}],
 *    video:[{rate:13000,op:'upper',net:'2g'}],
 *    net:{audio_fec_rate,dtunnel,fec,p2p,pacing,qos,record,tunnel},
 *    quality_level_limit,
 *    sdk:{gpl}
 *  },
 * ips,token}
 * 通话配置信息
 * imInfo:{
 *  cid,uid,liveEnable,rtmpUrl
 * }
 */