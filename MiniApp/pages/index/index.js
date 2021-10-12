import { prevent } from '../../utils/index'

// index.js
const app = getApp()
Page({
  data: {
    headerHeight: app.globalData.headerHeight,
    statusBarHeight: app.globalData.statusBarHeight,
    entryInfos: [
      { icon: "../../assets/images/icon-groupcall.png", title: "点对点音视频通话", navigateTo: "../login/index" },
    ],
  },
  onLoad: function () {
  },
  handleEntry: prevent(function (e) {
    let url = this.data.entryInfos[e.currentTarget.id].navigateTo
    wx.navigateTo({ url })
  }, 2000),
})
