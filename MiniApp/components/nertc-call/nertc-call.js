import YunXinMiniappSDK from './resources/sdk/NERTC_Miniapp_SDK_for_WeChat_v4.4.1'
import SDK from "./resources/sdk/NIM_Web_SDK_miniapp_v8.4.0"
import UserController from './controllers/user-controller.js'
import Pusher from './model/pusher.js'
import { CLIENT_EVENT, EVENT, DEFAULT_COMPONENT_CONFIG, CallingStatus } from './common/constants.js'
import { SIGNAL_NULL, CHANNELINFO_NULL, DURATIONS_EMPTY, CALLTYPE_NULL, CALL_BUSY, INVITOR_CHANNELINFO_NULL, BE_CALL_BUSY } from './common/errors'
import Event from './utils/event.js'
import * as ENV from './utils/env'
import { prevent } from './utils/index.js'
import { logger } from './utils/logger.js'
import { requestId, toast, parseAttachExt, compareVersion } from './utils/index'
import version from './utils/version'


const TAG_NAME = 'call-component'

Component({
  properties: {
    config: {
      type: Object,
      value: {
        appkey: '',
        account: '',//用户账号
        channelName: '', // 服务端返回的channelName
        imToken: '',
        securityToken: '',
        uid: null,
        openCamera: false,
        openMicrophone: false,
        resolution: null,
        audioQuality: null,
        videoWidth: null,
        videoHeight: null,
        minBitrate: null,
        maxBitrate: null,
        whitenessLevel: 0,
        beautyLevel: 0,
        checkSum: true,
        debug: false,
      },
      observer: function (newVal, oldVal) {
        this._propertyObserver({
          name: 'config',
          newVal,
          oldVal,
        })
      },
    },
  },
  data: {
    pusher: null,
    userList: [],
    debug: false,
    cameraPosition: '', // 摄像头位置，用于debug
    statusVisible: false, // 数据弹窗是否显示
    nickName: '', // 本端用户昵称
    playerVideoBitrate: null,
    playerAudioBitrate: null,
    callType: 2, // 通话类型1：语音，2：视频
  },

  lifetimes: {
    created: function () {
      // 在组件实例刚刚被创建时执行
      logger.log(TAG_NAME, 'created', ENV)
    },
    attached: function () {
      // 在组件实例进入页面节点树时执行
      logger.log(TAG_NAME, 'attached')
      this._init()
      //channel保活
      this._keepChannelOn()
    },
    ready: function () {
      // 在组件在视图层布局完成后执行
      logger.log(TAG_NAME, 'ready')
      logger.log("======ready", this.data)
    },
    detached: function () {
      // 在组件实例被从页面节点树移除时执行
      logger.log(TAG_NAME, 'detached')
      // 停止所有拉流，并重置数据
      this._hangUp()
      this._clearChannelTimer()
      //取消监听
      this._removeListener()
      setTimeout(() => {
        this.logout()
      }, 500)
    },
    error: function (error) {
      // 每当组件方法抛出错误时执行
      logger.log(TAG_NAME, 'error', error)
    },
  },
  pageLifetimes: {
    show: function () {
      // 组件所在的页面被展示时执行
      logger.log(TAG_NAME, 'show status:', this.status)
      if (this.status.isPending) {
        // 经历了 5000 挂起事件
        this.status.isPending = false
        if (this.status.isPush) {
          this.exitRoom()
        }
      }
      this.status.pageLife = 'show'
    },
    hide: function () {
      // 组件所在的页面被隐藏时执行
      logger.log(TAG_NAME, 'hide')
      this.status.pageLife = 'hide'
    },
    resize: function (size) {
      // 组件所在的页面尺寸变化时执行
      logger.log(TAG_NAME, 'resize', size)
    },
  },
  methods: {
    /**
    * 监听组件属性变更，外部变更组件属性时触发该监听
    * @param {Object} data newVal，oldVal
    */
    _propertyObserver(data) {
      logger.log(TAG_NAME, '_propertyObserver', data, this.data.config)
      if (data.name === 'config') {
        const config = Object.assign({}, DEFAULT_COMPONENT_CONFIG, data.newVal)
        if (!config.appkey || !config.account) {
          return
        }

        // 初始化sdk
        this.setupAppKey({
          debug: config.debug,
          appkey: config.appkey,
        })
        // 初始化信令
        this.login({ account: config.account, token: config.imToken })
        // 独立设置与音视频无关的参数
        this.setData({
          debug: config.debug,
          nickName: config.nickName,
        })
        this._setPusherConfig({
          enableCamera: config.openCamera,
          enableMic: config.openMicrophone,
          audioQuality: config.audioQuality,
          minBitrate: config.minBitrate,
          maxBitrate: config.maxBitrate,
          videoWidth: config.videoWidth,
          videoHeight: config.videoHeight,
          whitenessLevel: config.whitenessLevel,
          beautyLevel: config.beautyLevel,
        })
      }
    },
    //初始化
    _init() {
      logger.log(TAG_NAME, '_init')
      this.userController = new UserController(this)
      this.requestId = requestId()
      this.callStatus = CallingStatus.idle//呼叫状态
      this.callTimeout = undefined; // 主叫方呼叫超时时间
      this.rejectTimeout = undefined; // 被叫方超时拒绝时间
      this.callTimer = null
      this.rejectTimer = null
      this.channelTimer = null
      this._emitter = new Event()
      this.EVENT = EVENT
      this.callType = 2;  // 1:音频;2:视频;3:其他
      this.channelInfo = null;
      this.durations = [];
      this.mutiChannelId = ''
      this.mutiClientOp = false
      this._initStatus()
      this._keepScreenOn()
    },
    _keepChannelOn() {
      this._clearChannelTimer()
      this.channelTimer = setInterval(() => {
        if (this.channelInfo?.channelId) {
          logger.warn("===signalingDelay", this.channelInfo)
          this.NIM.signalingDelay({
            channelId: this.channelInfo.channelId,
          });
        }
      }, 120000)
    },
    _clearChannelTimer() {
      clearInterval(this.channelTimer)
      this.channelTimer = null
    },
    _initStatus() {
      this.status = {
        hasExit: false, // 标记是否已经退出
        isPush: false, // 推流状态
        isPending: false, // 挂起状态，触发5000事件标记为true，onShow后标记为false
        pageLife: '', // 页面生命周期 hide, show
        isOnHideAddStream: false, // onHide后有新增Stream
      }
      this._isFullScreen = false // 是否全屏模式

    },
    /**
    * 初始化G2
    * @param params
    */
    setupAppKey({ debug, appkey }) {
      logger.log(TAG_NAME, 'setupAppKey', { debug, appkey })
      const client = YunXinMiniappSDK.Client({
        debug,
        appkey,
      })
      client.init()


      // 注册监听
      client.on(CLIENT_EVENT.ERROR, this._onG2Error.bind(this))
      client.on(CLIENT_EVENT.STREAM_ADDED, this._onStreamAdded.bind(this))
      client.on(CLIENT_EVENT.STREAM_REMOVED, this._onStreamRemoved.bind(this))
      client.on(CLIENT_EVENT.SYNC_DONE, this._onSyncDone.bind(this))
      client.on(CLIENT_EVENT.CLIENT_LEAVE, this._onClientLeave.bind(this))
      client.on(CLIENT_EVENT.CLIENT_JOIN, this._onClientJoin.bind(this))
      client.on(CLIENT_EVENT.CLIENT_UPDATE, this._onClientUpdate.bind(this))
      client.on(CLIENT_EVENT.MUTE_AUDIO, this._onAudioMuteChange.bind(this, true))
      client.on(CLIENT_EVENT.UNMUTE_AUDIO, this._onAudioMuteChange.bind(this, false))
      client.on(CLIENT_EVENT.MUTE_VIDEO, this._onVideoMuteChange.bind(this, true))
      client.on(CLIENT_EVENT.UNMUTE_VIDEO, this._onVideoMuteChange.bind(this, false))
      client.on(CLIENT_EVENT.KICKED, this._onKicked.bind(this))
      client.on(CLIENT_EVENT.OPEN, this._onOpen.bind(this))
      client.on(CLIENT_EVENT.DISCONNECT, this._onDisconnect.bind(this))
      client.on(CLIENT_EVENT.WILLRECONNECT, this._onWillReconnect.bind(this))
      client.on(CLIENT_EVENT.SENDCOMMANDOVERTIME, this._onSendCommandOverTime.bind(this))
      client.on(CLIENT_EVENT.LIVEROOMCLOSE, this._onLiveRoomClose.bind(this))

      this.client = client
    },
    /**
    * 登录IM接口，所有功能需要先进行登录后才能使用
    */
    login({ account, token, ...opt }) {
      logger.log("===login", this.data.config)
      const _this = this
      this.NIM = SDK.NIM.getInstance({
        ...opt,
        appKey: this.data.config.appkey, // 在开发者管理控制台创建的应用的appKey
        account,        // IM帐号名称
        token,        // 登录IM所需的token
        onconnect: function onConnect(args) {
          logger.log('信令连接成功');
          opt.onconnect?.(args);
          // 接收一次离线消息
          _this.NIM.signalingSync().then(info => {
            logger.warn("用户的离线消息：", info)
          })
          //绑定在线消息
          _this._signalMsg()
          //绑定离线消息
          _this._signalOfflineMsg()
          //绑定多端消息
          _this._signalMutiClientMsg()
        },
        onwillreconnect: function onWillReconnect(obj) {
          // 此时说明 SDK 已经断开连接, 请开发者在界面上提示用户连接已断开, 而且正在重新建立连接
          logger.warn('======即将重连');
          logger.log(obj.retryCount);
          logger.log(obj.duration);
        },
        ondisconnect: function onDisconnect(error) {
          // 此时说明 SDK 处于断开状态, 开发者此时应该根据错误码提示相应的错误信息, 并且跳转到登录页面
          logger.warn('=====丢失连接');
          opt.ondisconnect?.(error);
          logger.log(error);
          if (error) {
            switch (error.code) {
              // 账号或者密码错误, 请跳转到登录页面并提示错误
              case 302:
                toast("账号或者密码错误")
                wx.navigateBack({
                  delta: 1,
                })
                break;
              // 重复登录, 已经在其它端登录了, 请跳转到登录页面并提示错误
              case 417:
                toast("重复登录, 已在其它端登录")
                wx.navigateBack({
                  delta: 1,
                })
                break;
              // 被踢, 请提示错误后跳转到登录页面
              case 'kicked':
                toast("您已被踢下线")
                _this.hangup({ channelId: this.channelInfo.channelId, offlineEnabled: true })
                _this._exitRoom(false)
                break;
              default:
                _this.hangup({ channelId: this.channelInfo.channelId, offlineEnabled: true })
                _this._exitRoom(false)
                break;
            }
          }
        },
        onerror: function onError(error) {
          logger.log("==onerror:", error);
          opt.onerror?.(error);
        },
        onmsg: function (obj) {
          logger.log(">>>>>>>onmsg", obj)
          _this._emitter.emit('onMessageSent', { ...obj.attach, to: obj.to });
        }
      })

    },
    /**
    * 登出接口，登出后无法再进行拨打操作
    */
    logout(params) {
      try {
        this.NIM.destroy({
          done: function (err) {
            logger.log('实例已被完全清除')
            params?.success?.();
          }
        })
      } catch (err) {
        params?.fail?.(err);
      }

    },
    /**
  * 设置呼叫超时时间，在呼叫前调用
  * @param t 超时时间，单位ms
  */
    setCallTimeout(t) {
      this.callTimeout = this.rejectTimeout = t;
    },
    /**
     * 邀请通话，被邀请方会收到的回调，组合行为（创建+邀请）
     * 如果当前处于通话中，可以调用该函数以邀请第三方进入通话
     *
     * @param userId 被邀请方
     * @param type  1-语音通话，2-视频通话
     */
    async call({ userId, type, success, fail, attachment }) {
      logger.log("this.callStatus", this.callStatus, attachment)
      try {
        if (!this.NIM) {
          throw SIGNAL_NULL;
        }
        const config = this.data.config
        //当this.data.pusher不存在的时候重新初始化
        if (!this.data.pusher) {
          this._setPusherConfig({
            enableCamera: config.openCamera,
            enableMic: config.openMicrophone,
            audioQuality: config.audioQuality,
            minBitrate: config.minBitrate,
            maxBitrate: config.maxBitrate,
            videoWidth: config.videoWidth,
            videoHeight: config.videoHeight,
            whitenessLevel: config.whitenessLevel,
            beautyLevel: config.beautyLevel,
          })
        }
        this.callStatus = CallingStatus.calling;
        this.isGroupCall = false;
        this.userId = userId
        logger.log("==this.channelInfo", this.channelInfo)
        this.setData({
          callType: type
        })
        let createInfo = await this._createChannel({ type })
        let joinInfo = await this._joinChannel({ channelId: createInfo?.channelId, offlineEnabled: true })
        const callType = 0
        const attachExt = { // 各端统一的扩展字段
          callType,
          _attachment: attachment,
          version,
          channelName: `${createInfo.channelId}|${callType}|${joinInfo.members?.[0]?.uid}`
        }
        this.channelInfo = { ...createInfo, attachExt }
        this.joinInfo = joinInfo
        this.requestId = requestId()

        const inviteParam = {
          channelId: this.channelInfo.channelId,
          type,
          account: userId,
          requestId: this.requestId,
          offlineEnabled: true,
          pushInfo: {
            needPush: true,
            needBadge: true,
            pushTitle: 'title',
            pushContent: '',
            pushPayload: {},
          },
          attachExt: JSON.stringify(attachExt),
        }
        try {
          await this.NIM.signalingInvite(inviteParam);
        } catch (error) {
          // 过滤对方离线的错误
          if (!/OFFLINE/i.test(error?.message)) {
            throw error;
          }
        }
        logger.warn("独立呼叫信令，邀请别人加入频道成功，data：", this.channelInfo)
        success?.({ ...this.channelInfo, ...this.joinInfo.members?.[0] });
        logger.log("====this.callTimeout", this.callTimeout, this.callStatus)
        if (this.callTimeout !== undefined) {
          this.callTimer = setTimeout(async () => {
            if (this.callStatus === CallingStatus.calling) {
              this._hangUp(false)
              this._sendMessage(this.userId, 'timeout');
              this._emitter.emit("onCallingTimeOut")
              logger.warn("呼叫超时")
              this.callStatus = CallingStatus.idle
            }
          }, this.callTimeout);
        }
      } catch (err) {
        fail?.(err)
        this.callStatus = CallingStatus.idle
      }
    },

    /**
    * 邀请者取消呼叫
    * @param channelId 频道id
    * @param account  对方account账号
    * @param requestId  邀请者邀请的请求id
    * @param offlineEnabled  true
    * @param attachExt  额外信息
    */
    cancel(params, sdms = true) {
      if (!this.NIM) {
        return Promise.reject(SIGNAL_NULL);
      }
      this._clearTimer();
      return this.NIM.signalingCancel(params).then(data => {
        logger.log("取消邀请成功", data)
        const userId = this.data.config.account;
        this._emitter.emit("onUserCancel", { userId })
        sdms && this._sendMessage(this.userId, 'canceled');
        params?.success?.(data);
      }).catch(error => {
        params?.fail?.(error);
        logger.log("取消邀请失败", error)
        this.callStatus = CallingStatus.idle
      });
    },
    /**
     * 离开不影响他人
     * @param channelId 频道id
     * @param offlineEnabled  true
    */
    leave(params) {
      if (!this.NIM) {
        return Promise.reject(SIGNAL_NULL);
      }
      return this.NIM.signalingLeave(params).then(data => {
        logger.warn("独立呼叫信令，离开频道成功，data：", data)
        params?.success?.(data);
      }).catch(error => {
        logger.warn("独立呼叫信令，离开频道失败，error：", error)
        if (error.code == 10406) {
          toast("不在频道内");
        }
        params?.fail?.(error);
      })
    },
    /**
     * 挂断，同时挂断其他人
     * @param channelId 频道id
     * @param offlineEnabled  true
    */
    hangup(params) {
      if (!this.NIM) {
        return Promise.reject(SIGNAL_NULL);
      }
      return new Promise((resolve, reject) => {
        this.NIM.signalingClose(params).then(data => {
          logger.warn("独立呼叫信令，关闭频道成功，data：", data)
          this._emitter.emit("onCallEnd")
          params?.success?.(data);
          resolve(data)
        }).catch(error => {
          logger.warn("独立呼叫信令，关闭频道失败，error：", error)
          if (error.code == 10406) {
            logger.warn("独立呼叫信令：你不在频道内，无法关闭");
          }
          this._exitRoom(false)
          params?.fail?.(error);
          reject(error)
        })
      })
    },
    //被邀请者收到邀请事件
    _signalMsg() {
      // 在线用户接收到的通知事件
      this.NIM.on('signalingNotify', async (event) => {
        logger.log("signalingOnlineNotify: ", event, this.mutiChannelId)
        if (this.mutiChannelId == event.channelId) {
          logger.warn("远端设备的消息this.mutiChannelId", this.mutiChannelId)
          return
        }
        let attachExt
        switch (event.eventType) {
          case 'ROOM_CLOSE':
            logger.log("独立呼叫信令：频道关闭事件");
            if (this.mutiClientOp) {
              logger.warn("this.mutiClientOp")
              return
            }
            if (this.channelInfo.channelId !== event.channelId) {
              logger.warn("channleId不同")
              return
            }
            this.channelInfo = event
            this._emitter.emit("onCallEnd")
            this._exitRoom(false)
            break;
          case 'ROOM_JOIN':
            logger.log("独立呼叫信令：加入频道事件");
            break;
          case 'INVITE':
            logger.log("独立呼叫信令： 邀请事件");
            this._inviteHandler(event)
            break;
          case 'CANCEL_INVITE':
            logger.log("独立呼叫信令：取消邀请事件");
            this._clearTimer();
            this._emitter.emit("onUserCancel", { userId: event.to })
            // this._sendMessage(event.to, 'canceled'); // 重复调用
            this.callStatus = CallingStatus.idle
            break;
          case 'REJECT':
            logger.log("独立呼叫信令：拒绝邀请事件", event);
            if (this.channelInfo.channelId !== event.channelId) {
              logger.warn("channleId不同")
              return
            }
            this._clearTimer();
            if (event.attachExt === '601') {
              this._emitter.emit("onUserBusy", { userId: event.to })
              this._sendMessage(event.from, 'busy');
            } else {
              this._emitter.emit("onUserReject", { userId: event.to })
              if (this.callStatus != CallingStatus.idle) {
                this._sendMessage(event.from, 'rejected');
              }
            }
            this._hangUp()
            break;
          case 'ACCEPT':
            logger.log("独立呼叫信令：被邀请者接受邀请事件", event);
            if (this.channelInfo.channelId !== event.channelId) {
              logger.warn("channleId不同")
              return
            }
            this.callStatus = CallingStatus.inCall;
            this._clearTimer();
            this._emitter.emit("onUserAccept", {
              userId: event.to
            })
            this.durations.push({
              accid: event.from,
              duration: Date.now(),
            });
            try {
              attachExt = JSON.parse(event.attachExt)
            } catch (error) {
              attachExt = {};
            }
            if (compareVersion(attachExt.version, '1.1.0')) {
              // 新流程，呼叫人加入RTC，不再发起control信令
              const channelName = this.channelInfo.attachExt.channelName
              this.channelInfo = event
              let member = this.joinInfo.members.filter(item => item.accid === this.data.config.account)
              await this._enterRoom({
                channelName,
                uid: member[0]?.uid,
              })
              logger.log('_enterRoom 成功，不再发起control')
            } else {
              // 老流程，呼叫人加入RTC，发起control信令
              this.channelInfo = event
              let member = this.joinInfo.members.filter(item => item.accid === this.data.config.account)
              await this._enterRoom({
                channelName: this.channelInfo.channelId,
                uid: member[0]?.uid,
              })
              // 发送一条自定义信令给接收方，告知他可以加入RTC房间了
              setTimeout(() => {
                this.NIM.signalingControl({
                  channelId: event.channelId,
                  account: event.from,
                  attachExt: JSON.stringify({ cid: 1 }),
                }).then(data => {
                  logger.warn("独立呼叫信令，控制信令发送，data：", data)
                }).catch(error => {
                  logger.warn("独立呼叫信令，控制信令发送，data：", error)
                  if (error.code == 10404) {
                    logger.warn("独立呼叫信令：频道不存在");
                  } else if (error.code == 10406) {
                    logger.warn("独立呼叫信令：不在频道内（自己或者对方）");
                  }
                })
              }, 1000)
            }
            break;
          case 'LEAVE':
            logger.log("独立呼叫信令：离开频道事件");
            this._emitter.emit("onUserLeave", {
              userId: this.data.config.account
            })
            this._hangUp()
            break;
          case 'CONTROL':
            logger.log("独立呼叫信令：自定义控制事件");
            if (this.mutiClientOp) {
              logger.warn("this.mutiClientOp")
              return
            }
            try {
              attachExt = JSON.parse(event.attachExt);
            } catch (error) {
              attachExt = {};
            }
            if (attachExt.cid === 1) {
              await this._joinRtc(event);
            } else if (attachExt.cid === 2) {
              if (attachExt.type === 1) {
                this._emitter.emit('onCallTypeChange', 1);
                this.enableLocalVideo(false);
                logger.log('controlHandler switchCallType success');
              }
            }
            logger.log('controlHandler success: ');
            break;
        }
      });
    },
    async _signalOfflineMsg() {
      // 离线通知，调用signalingSync后触发
      this.NIM.on(
        'signalingUnreadMessageSyncNotify',
        async (data) => {
          logger.warn("signalingUnreadMessageSyncNotify", data)
          await this._batchMarkEvent(data);
          // 过滤掉无效的离线消息
          const validMessages = data.filter((item) => !item.channelInValid);
          const cancels = validMessages.filter(
            (item) => item.eventType === 'CANCEL_INVITE'
          );
          const invites = validMessages
            .filter((item) => item.eventType === 'INVITE')
            .sort((a, b) => b.channelCreateTime - a.channelCreateTime);
          if (
            invites[0] &&
            cancels.every((item) => item.requestId !== invites[0].requestId)
          ) {
            this._inviteHandler(invites[0]);
          }
        }
      );
    },
    async _signalMutiClientMsg() {
      // 在线多端同步通知
      this.NIM.on(
        'signalingMutilClientSyncNotify',
        async (event) => {
          logger.log('signalingMutilClientSyncNotify', event);
          await this._batchMarkEvent([event]);
          switch (event.eventType) {
            // 拒绝邀请
            case 'REJECT':
              this._emitter.emit("onOtherClientReject")
              this.mutiChannelId = event.channelId
              this.mutiClientOp = true
              this.callStatus = CallingStatus.idle
              break;
            // 接收邀请
            case 'ACCEPT':
              this._emitter.emit("onOtherClientAccept")
              this.mutiChannelId = event.channelId
              this.mutiClientOp = true
              this.callStatus = CallingStatus.idle
              break;
          }
        }
      );
    },
    _destorySignal() {
      // this.NIM.removeListener('signalingNotify');
      // this.NIM.removeListener('signalingMutilClientSyncNotify');
      // this.NIM.removeListener('signalingUnreadMessageSyncNotify');
      this.NIM.destroy({
        done: function (err) {
          logger.warn('实例已被完全清除了！！')
        }
      })
    },
    async _inviteHandler(event) {
      logger.log("this.callStatus", this.callStatus)
      if (this.callStatus != CallingStatus.idle) {
        logger.log(BE_CALL_BUSY);
        try {
          await this._reject(true, {
            channelId: event.channelId,
            account: event.from,
            requestId: event.requestId,
          });
        } catch (error) {
          logger.log('reject error in inviteHandler: ', error);
        }
        return;
      }
      this.callStatus = CallingStatus.called;
      this.channelInfo = event
      this.requestId = event.requestId
      let attachExt
      try {
        attachExt = JSON.parse(event.attachExt)
      } catch (error) {
        attachExt = {}
      }
      this._emitter.emit("onInvited", {
        ...event,
        invitor: event.from,
        userIds: [],
        isFromGroup: false,
        groupId: null,
        type: event.type,
        attachment: attachExt._attachment,
      })
      // 被叫超时后，如果还是called状态，会自动拒绝
      if (this.rejectTimeout !== undefined) {
        logger.log("==this.rejectTimer", this.callStatus)
        this.rejectTimer = setTimeout(async () => {
          if (this.callStatus === CallingStatus.called) {
            try {
              await this._reject(true, {
                channelId: event.channelId,
                account: event.from,
                requestId: event.requestId,
                offlineEnabled: false,
              })
              this._emitter.emit("onUserBusy", { userId: event.to })
              // this._sendMessage(event.from, 'busy');
              this.callStatus = CallingStatus.idle
              logger.log('reject timeout success', this.rejectTimeout);
            } catch (error) {
              logger.log('reject timeout fail: ', error, this.rejectTimeout);
            }
          }
        }, this.rejectTimeout);
      }
    },
    //被邀请者接受
    async accept(params) {
      logger.log("accept", params, this.channelInfo)
      this._clearTimer();
      const param = {
        channelId: params.channelId,
        account: params.from,
        requestId: params.requestId,
        offlineEnabled: true,
        autoJoin: true,
        attachExt: JSON.stringify({
          version,
        }),
      }
      try {
        const data = await this.NIM.signalingAccept(param)
        logger.warn("独立呼叫信令，接受别人的邀请，data：", data)
        this.setData({
          callType: data.type
        })
        this.callStatus = CallingStatus.inCall;
        const memberInfo = data.members.filter(item => item.accid === this.data.config.account)
        const attachExt = parseAttachExt(this.channelInfo.attachExt)
        if (attachExt) {
          await this._joinRtc({...this.channelInfo, channelId: attachExt.channelName})
        }
        params?.success?.({ ...this.channelInfo, ...memberInfo[0] });
      } catch (error) {
        logger.warn("接受别人的邀请失败，error：", error)
        if (!error.code) {
          toast('接听失败');
        } else if (error.code == 10404) {
          toast("频道不存在");
        } else if (error.code == 10408) {
          toast("邀请不存在或已过期");
        } else if (error.code == 10409) {
          toast("邀请已经拒绝");
        } else if (error.code == 10410) {
          toast("邀请已经接受");
        } else if (error.code == 10201) {
          toast("对方不在线");
        } else {
          toast('接听失败');
        }
        this._resetState()
        params?.fail?.(error);
      }
    },
    //被邀请者拒绝
    reject(params) {
      const { channelId, from, requestId, success, fail } = params
      const param = {
        channelId,
        account: from,
        requestId,
        offlineEnabled: false,
      }
      try {
        this._reject(false, param)
        success?.()
      } catch (err) {
        this._resetState()
        fail?.()
      }
    },
    _reject(isBusy = false, {
      channelId,
      account,
      requestId
    }) {
      try {
        if (!this.NIM) {
          throw SIGNAL_NULL;
        }
        this._clearTimer();
        const _params = {
          channelId,
          account,
          requestId,
          offlineEnabled: true,
        };
        if (isBusy) {
          _params.attachExt = '601';
        }
        this.NIM.signalingReject(_params).then(data => {
          logger.warn("独立呼叫信令，拒绝别人的邀请，data：", data)
          logger.log('rejectCall success');
        }).catch(error => {
          logger.warn("独立呼叫信令，拒绝别人的邀请失败，error：", error)
          if (error.code == 10404) {
            logger.warn("频道不存在");
          } else if (error.code == 10408) {
            logger.warn("邀请不存在或已过期");
          } else if (error.code == 10409) {
            logger.warn("邀请已经拒绝");
          } else if (error.code == 10410) {
            logger.warn("邀请已经接受");
          } else if (error.code == 10201) {
            logger.warn("对方不在线");
          }
        });
      } catch (error) {
        logger.log('rejectCall fail:', invitor, error);
      } finally {
        // if (!isBusy) {
        this.callStatus = CallingStatus.idle;
        // }
      }
    },
    /**
    * 开启/关闭摄像头
    * @param enabled true 打开 false 关闭
    */
    enableLocalVideo(enabled) {
      return enabled ? this._publishLocalVideo() : this._unpublishLocalVideo()
    },
    /**
    * 开启/关闭视频采集
    * @param mute：是否静音 true 静音 false 取消静音
    */
    muteLocalVideo(mute) {
      return mute ? this._muteLocalVideo() : this._unmuteLocalVideo()
    },
    /**
    * 开启/关闭音频采集
    * @param mute：是否静音 true 静音 false 取消静音
    */
    muteLocalAudio(mute) {
      return mute ? this._muteLocalAudio() : this._unmuteLocalAudio()
    },
    /**
     * 指定对某个用户静音
     * @param mute 是否静音 true 静音 false 取消静音
     * @param userID 需要静音的用户accID
     */
    setAudioMute({ mute, userId }) {
      const user = this.userController.getUser(userId)
      if (user && user.stream) {
        user.stream.setProperty({ muteAudio: mute })
        this._setList()
      }
    },
    /**
    * 切换前后摄像头
    */
    switchCamera() {
      if (!this.data.cameraPosition) {
        // this.data.pusher.cameraPosition 是初始值，不支持动态设置
        this.data.cameraPosition = this.data.pusher.frontCamera
      }
      logger.log(TAG_NAME, 'switchCamera', this.data.cameraPosition)
      this.data.cameraPosition = this.data.cameraPosition === 'front' ? 'back' : 'front'
      this.setData({
        cameraPosition: this.data.cameraPosition,
      }, () => {
        logger.log(TAG_NAME, 'switchCamera success', this.data.cameraPosition)
      })
      // wx 7.0.9 不支持动态设置 pusher.frontCamera ，只支持调用 API switchCamer() 设置，这里修改 cameraPosition 是为了记录状态
      this.data.pusher.getPusherContext().switchCamera()
    },
    on(eventCode, handler, context) {
      this._emitter.on(eventCode, handler, context)
    },
    off(eventCode, handler) {
      this._emitter.off(eventCode, handler)
    },
    /**
     * 视频通话/音频通话相互切换(仅支持视频切音频)
     * @param type
     * @param success
     * @param fail
     */
    async switchCallType(params) {
      const { type, success, fail } = params
      try {
        if (type !== 1) {
          throw 'sorry，目前仅支持视频切换为音频';
        }
        if (!this.NIM) {
          throw SIGNAL_NULL;
        }
        if (!this.channelInfo) {
          throw CHANNELINFO_NULL;
        }
        try {
          await this.enableLocalVideo(false);
        } catch (error) {
          logger.log('enableLocalVideo in switchCallType fail but resolve', error);
        }
        // 通知对端需要切换为音频
        await this.NIM.signalingControl({
          channelId: this.channelInfo.channelId,
          account: '',
          attachExt: JSON.stringify({ cid: 2, type: 1 }),
        });
        logger.log('switchCallType success');
        success?.();
      } catch (error) {
        logger.log('switchCallType fail: ', error);
        fail?.();
        return Promise.reject(error);
      }
    },
    /**
     * 批量标记消息已读
     * @param events
     */
    async _batchMarkEvent(events) {
      // 只要是在线消息，就标记已读
      try {
        const msgids = events.map((item) => item.msgid + '');
        await this.NIM.signalingMarkMsgRead({
          msgid: msgids,
        });
        logger.log('在线 signalingMarkMsgRead success');
      } catch (e) {
        logger.log('在线 signalingMarkMsgRead fail: ', e);
      } finally {
        return Promise.resolve();
      }
    },
    /**
      * 进房
      * @param {Object} params
      * @returns {Promise}
      */
    async _enterRoom(params) {
      let token = ''
      if (this.data.config.checkSum) {
        token = await this._getToken({ uid: params.uid, appkey: this.data.config.appkey })
      }
      params.token = token || ''
      logger.log(TAG_NAME, 'enterRoom', params);
      return new Promise((resolve, reject) => {
        if (!this._checkParam(params)) {
          reject('缺少必要参数')
          return
        }
        this.client.join(params)
          .then(() => {
            logger.log(TAG_NAME, 'enterRoom: join success')
            const { openCamera, openMicrophone } = this.data.config
            if (openCamera && openMicrophone) {
              return this.client.publish()
            }
            if (openCamera && !openMicrophone) {
              return this.client.publish('video')
            }
            if (!openCamera && openMicrophone) {
              return this.client.publish('audio')
            }
            if (!openCamera && !openMicrophone) {
              return Promise.resolve()
            }
          })
          .then(url => {
            logger.log(TAG_NAME, 'enterRoom: publish success', url)
            let func = () => {
              let pusher = this.data.pusher
              if (url) {
                pusher = Object.assign(this.data.pusher, { url })
              }
              logger.warn("===this.data.pusher??", this.data.pusher)
              this.setData({
                pusher
              }, () => {
                logger.log(TAG_NAME, 'enterRoom success', this.data.pusher)
                this._pusherStart()
                this.status.isPush = true
                resolve()
              })
            }
            this._pusherValid(func)

          })
          .catch(error => {
            logger.error(TAG_NAME, 'enterRoom fail: ', error);
            reject(error)
          })
      })
    },
    /**
    * 退房，停止推流和拉流，并重置数据
    * @param {Boolean} needBack
    * @returns {Promise}
    */
    _exitRoom(needBack = true) {
      // logger.warn("===_exitRoom", this.status.hasExit, needBack)
      if (this.status.hasExit) {
        this._resetState()
        return
      }
      this.status.hasExit = true
      logger.log(TAG_NAME, 'exitRoom')
      this.client.leave().then(() => {
        logger.log(TAG_NAME, 'exitRoom success')
        this._resetState()
      }).catch(err => {
        // 该错误可以忽略
        // logger.log(TAG_NAME, 'exitRoom fail: ', err)
        this._resetState()
        logger.warn("'exitRoom fail: ", err)
      })
      if (needBack) {
        wx.navigateBack({
          delta: 1,
        })
      }
    },
    _muteLocalVideo() {
      return this.client.mute('video').then(url => {
        logger.log('mute 视频成功: ', url)
        // return this._setPusherConfig({ url })
      }).catch(e => {
        logger.error('mute 视频失败: ', e)
      })
    },
    _unmuteLocalVideo() {
      return this.client.unmute('video').then(url => {
        logger.log('unmute 视频成功: ', url)
        // return this._setPusherConfig({ url })
      }).catch(e => {
        logger.error('unmute 视频失败: ', e)
      })
    },

    _muteLocalAudio() {
      return this.client.mute('audio').then(url => {
        logger.log('mute 音频成功: ', url)
        return this._setPusherConfig({ url })
      }).catch(e => {
        logger.error('mute 音频失败: ', e)
      })
    },
    _unmuteLocalAudio() {
      return this.client.unmute('audio').then(url => {
        logger.log('unmute 音频成功: ', url)
        return this._setPusherConfig({ url })
      }).catch(e => {
        logger.error('unmute 音频失败: ', e)
      })
    },
    /**
     * 开启麦克风
     * @returns {Promise}
     */
    _publishLocalAudio() {
      // 设置 pusher enableCamera
      logger.log(TAG_NAME, 'publishLocalAudio 开启麦克风')
      return this.client.publish('audio').then(url => {
        logger.log(TAG_NAME, 'publishAudio success', url)
        return this._setPusherConfig({ url, enableMic: true })
      }).then(() => {
        this._pusherStart()
      })
    },
    /**
     * 关闭麦克风
     * @returns {Promise}
     */
    _unpublishLocalAudio() {
      // 设置 pusher enableCamera
      logger.log(TAG_NAME, 'unpublshLocalAudio 关闭麦克风')
      return this.client.unpublish('audio').then(url => {
        logger.log(TAG_NAME, 'unpublishAudio success', url)
        return this._setPusherConfig({ enableMic: false })
      })
    },

    /**
     * 切换本端视频全屏
     * @returns {Promise}
     */
    togglePusherFullScreen() {
      logger.log(TAG_NAME, 'togglePusherFullScreen')
      return this._togglePusherFullScreen()
    },
    /**
     * 切换远端视频全屏
     * @param {Object} params uid
     * @returns {Promise}
     */
    togglePlayerFullScreen(params) {
      logger.log(TAG_NAME, 'togglePlayerFullScreen', params)
      const { uid } = params
      const user = this.userController.getUser(uid)
      if (!user) {
        return Promise.reject(TAG_NAME, 'togglePlayerFullScreen', 'remoteUser is not found')
      }
      if (user.isFullScreen) {
        this._setPusherNormal()
        this.userController.getAllUser().forEach(item => {
          this._setPlayerNormal(item.uid)
        })
        this._isFullScreen = false
      } else {
        this._setPusherListener()
        this.userController.getAllUser().forEach(item => {
          if (item.uid === uid) {
            this._setPlayerFullScreen(item.uid)
          } else {
            this._setPlayerListener(item.uid)
          }
        })
        this._sortPlayerListenerIndex()
        this._isFullScreen = true
      }
      return this._setList()
    },
    on(eventCode, handler, context) {
      this._emitter.on(eventCode, handler, context)
    },
    off(eventCode, handler) {
      this._emitter.off(eventCode, handler)
    },
    _createChannel(params) {
      return new Promise((resolve, reject) => {
        this.NIM.signalingCreate(params).then(data => {
          logger.warn("独立呼叫信令，创建频道成功，data：", data)
          resolve(data)
        }).catch(error => {
          logger.warn("独立呼叫信令，创建频道失败，error：", error)
          if (error.code == 10405) {
            logger.warn("独立呼叫信令：频道已存在，请勿重复创建");
          }
          reject(error)
        })
      })
    },
    _joinChannel(params) {
      return new Promise((resolve, reject) => {
        this.NIM.signalingJoin(params).then(data => {
          logger.warn("独立呼叫信令，加入频道成功，data：", data)
          resolve(data)
        }).catch(error => {
          logger.warn("独立呼叫信令，加入频道失败，error：", error)
          switch (error.code) {
            case 10407:
              logger.warn("独立呼叫信令：已经在频道内")
              break
            case 10419:
              logger.warn("独立呼叫信令：频道人数超限")
              break
            case 10417:
              logger.warn("独立呼叫信令：频道成员uid冲突了")
              break
            case 10420:
              logger.warn("独立呼叫信令：该账号，在其他端已经登录，并且已经在频道内")
              break
            case 10404:
              logger.warn("独立呼叫信令：频道不存在")
              break
          }
          reject(error)
        })
      })
    },
    async _joinRtc(event) {
      //被呼叫人加入RTC
      try {
        logger.log(TAG_NAME, '_joinRtc: ', event);
        let info = await this._getChannelMember(event.channelName)
        let member = info.members.filter(item => item.accid === this.data.config.account)
        logger.log("==info", info, member)
        await this._enterRoom({ channelName: event.channelId, uid: member[0]?.uid })
        this.durations = [
          {
            accid: info.members[1].accid,
            duration: Date.now(),
          },
          {
            accid: event.from,
            duration: Date.now(),
          },
        ];
      } catch (error) {
        logger.error(TAG_NAME, '_joinRtc fail: ', error);
      }
    },
    _getChannelMember(channelName) {
      return new Promise((resolve, reject) => {
        this.NIM.signalingGetChannelInfo({
          channelName
        }).then(function (result) {
          logger.log(result)
          resolve(result)
        }).catch(err => {
          logger.warn("_getChannelMember err", err)
          resolve({})
        });
      })

    },

    /**
    * 单人通话下，需要通知服务端退出的情况
    * @param userId IM的account账号
    * @param status
    */
    _sendMessage(userId, status) {
      logger.log("====begin send msg===", userId, this.durations, this.durations.map((item) => ({
        ...item,
        duration: item.duration ? (Date.now() - item.duration) / 1000 : null,
      })))
      return new Promise((resolve, reject) => {
        if (!this.NIM) {
          return reject(SIGNAL_NULL);
        }
        if (!this.callType) {
          return reject(CALLTYPE_NULL);
        }
        if (!this.channelInfo) {
          return reject(CHANNELINFO_NULL);
        }
        if (!userId) {
          return reject('userId is invalid');
        }

        const statusMap = {
          complete: 1,
          canceled: 2,
          rejected: 3,
          timeout: 4,
          busy: 5,
        };
        const attach = {
          type: this.callType,
          channelId: this.channelInfo.channelId,
          status: statusMap[status],
          durations: this.durations.map((item) => ({
            ...item,
            duration: item.duration ? (Date.now() - item.duration) / 1000 : null,
          })),
        };
        this.NIM.sendG2Msg({
          attach,
          scene: 'p2p',
          to: userId,
          done: (error) => {
            if (error) {
              logger.log('sendMessage fail:', attach, error);
              return reject(error);
            }
            logger.log('sendMessage success', attach, userId);
            this._emitter.emit('onMessageSent', { ...attach, to: userId });
            this.callStatus = CallingStatus.idle;
            resolve();
          },
        });
      }).catch(e => logger.log("eeee", e));
    },

    /**
     * 设置推流参数并触发页面渲染更新
     * @param {Object} config live-pusher 的配置
     * @returns {Promise}
     */
    _setPusherConfig(config) {
      return new Promise((resolve) => {
        let pusher
        logger.log("====_setPusherConfig", this.data.pusher)
        if (!this.data.pusher) {
          pusher = new Pusher(config)
        } else {
          pusher = Object.assign(this.data.pusher, config)
        }
        this.setData({
          pusher,
        }, () => {
          resolve(config)
        })
      })
    },

    _setList() {
      logger.log("====_setList", this.userController.getAllUser())
      return new Promise(resolve => {
        this.setData({
          userList: this.userController.getAllUser()
        }, () => {
          resolve()
        })
      })
    },
    _resetState() {
      logger.warn("===_resetState", this.data, this)
      if (this.data.pusher) {
        this.data.pusher.reset()
      }
      if (this.status) {
        this.status.isPush = false
        this.status.isPending = false
        this.status.pageLife = ''
        this.status.hasExit = false
        this.status.isOnHideAddStream = false
      }
      if (this.userController) {
        this.userController.reset()
      }
      this._isFullScreen = false
      this.channelInfo = null
      this.requestId = '';
      this.callStatus = CallingStatus.idle;
      this.userId = ''
      this.mutiChannelId = ''
      this.mutiClientOp = false
      this.setData({
        pusher: null,
        userList: [],
      })
      this._clearTimer()
    },
    _clearTimer() {
      if (this.callTimer) {
        clearTimeout(this.callTimer);
        this.callTimer = null;
      }
      if (this.rejectTimer) {
        clearTimeout(this.rejectTimer);
        this.rejectTimer = null;
      }
    },
    _onG2Error(err) {
      logger.error(TAG_NAME, '_onG2Error', err)
      this._emitter.emit("onError", err)
    },
    async _onStreamAdded(data) {
      logger.log(TAG_NAME, '_onStreamAdded', data)
      try {
        const { uid, mediaType } = data
        const res = await this.client.subscribe(uid, mediaType)
        logger.log(TAG_NAME, '_onStreamAdded', 'subscribe success', res)
        const { url } = res
        const user = this.userController.addUser({ uid, url })
        // if (user && user.stream && mediaType) {
        //   const streamParams = mediaType === 'audio' ? {
        //     muteAudio: false
        //   } : mediaType === 'video' ? {
        //     muteVideo: false
        //   } : {}
        //   user.stream.setProperty(streamParams)
        // }
        await this._setList()
        if (user.stream.playerContext) {
          user.stream.replay()
          logger.log(TAG_NAME, '_onStreamAdded replay success', user)
        } else {
          user.stream.setProperty({ playerContext: wx.createLivePlayerContext(uid + '', this) })
          user.stream.play()
          logger.log(TAG_NAME, '_onStreamAdded play success', user)
        }

        if (mediaType === 'audio') {
          this._emitter.emit('onAudioAvailable', {
            userId: this.data.config.account,
            uid,
            available: true,
          });
        }
        if (mediaType === 'video') {
          this._emitter.emit('onCameraAvailable', {
            userId: this.data.config.account,
            uid,
            available: true,
          });

        }
      } catch (error) {
        logger.error(TAG_NAME, '_onStreamAdded fail: ', err)
      }
    },
    _onStreamRemoved(data) {
      logger.log(TAG_NAME, '_onStreamRemoved', data)
      const { uid, mediaType } = data
      const user = this.userController.getUser(uid)
      if (user && user.stream) {
        // if (mediaType === 'audio') {
        //   user.stream.setProperty({ muteAudio: true })
        // } else if (mediaType === 'video') {
        //   user.stream.setProperty({ muteVideo: true })
        // }
        this._setList()
        if (mediaType === 'audio') {
          this._emitter.emit('onAudioAvailable', {
            userId: this.data.config.account,
            uid,
            available: false,
          });

        }
        if (mediaType === 'video') {
          this._emitter.emit('onCameraAvailable', {
            userId: this.data.config.account,
            uid,
            available: false,
          });

        }
      }
    },
    _onSyncDone(data) {
      logger.log(TAG_NAME, '_onSyncDone', data, this.data.config.uid)
      logger.warn("_onSyncDone", data, this.data.config.uid)
      const { userlist: userList } = data
      // 更新pusher
      const newPusher = userList.find(item => item.uid === this.data.config.uid)
      if (newPusher && newPusher.url && newPusher.url !== this.data.pusher.url) {
        // pusher url有变更，重新推流
        this._setPusherConfig({ url: newPusher.url }).then(() => {
          this._pusherStart()
        })
      }
      // 更新streams
      // userList.filter(item => item.uid !== this.data.config.uid)
      //   .forEach(item => {
      //     const { uid, url } = item
      //     let user = this.userController.addUser({ uid, url })
      //     logger.log(TAG_NAME, '_onSyncDone addUser', user)
      //     this._setList().then(() => {
      //       logger.log(TAG_NAME, '_onSyncDone play', user)
      //       if (user.stream.playerContext) {
      //         user.stream.replay()
      //       } else {
      //         user.stream.setProperty({ playerContext: wx.createLivePlayerContext(uid + '', this) })
      //         user.stream.play()
      //       }
      //     })
      //   })
    },
    _onClientLeave(data) {
      const { uid } = data
      // 如果开着全屏模式的人走了，需要重置为画廊模式
      const user = this.userController.getUser(uid)
      logger.log(TAG_NAME, '_onClientLeave', data, user)
      if (user) {
        if (user.isFullScreen && this._isFullScreen) {
          this._setPusherNormal()
          this.userController.getAllUser().filter(item => item.uid !== uid).forEach(item => {
            this._setPlayerNormal(item.uid)
          })
          this._isFullScreen = false
        }
        this.userController.removeUser(uid)
        this._setList()
      }
      this._hangUp()
      if (data.reason === '0') {
        this._emitter.emit('onUserLeave', { userId: this.data.config.account, uid });
      } else {
        this._emitter.emit('onUserDisconnect', { userId: this.data.config.account, uid });
      }
    },
    _onClientJoin(data) {
      logger.log(TAG_NAME, '_onClientJoin', data, this.data.config)
      const { uid } = data
      this.userController.addUser({ uid })
      // 如果此时是全屏模式，需要将新加入的人置为跟随者模式
      if (this._isFullScreen) {
        this._setPlayerListener(uid)
        this._sortPlayerListenerIndex()
      }
      this._setList()
      this._emitter.emit("onUserEnter", { userId: this.data.config.account, uid })
    },
    _onClientUpdate(data) {
      logger.log(TAG_NAME, '_onClientUpdate', data)
      const { uid } = data
      const user = this.userController.getUser(uid)
      if (user) {
        if (user.stream.playerContext) {
          user.stream.replay()
        } else {
          user.stream.setProperty({ playerContext: wx.createLivePlayerContext(uid + '', this) })
          user.stream.play()
        }
      }
    },
    _onAudioMuteChange(mute, uid) {
      logger.log(TAG_NAME, '_onAudioMuteChange', uid, mute)
      this._emitter.emit("onAudioMuted", { uid, mute, userId: this.data.config.account })
    },
    _onVideoMuteChange(mute, uid) {
      logger.log(TAG_NAME, '_onVideoMuteChange', uid, mute)
      this._emitter.emit("onVideoMuted", { uid, mute, userId: this.data.config.account })
    },
    _onKicked(data) {
      logger.log(TAG_NAME, '_onKicked', data)
      this.hangup({ channelId: this.channelInfo.channelId, offlineEnabled: true })
      this._exitRoom(false)
    },
    _onOpen(data) {
      logger.log(TAG_NAME, '_onOpen', data)
    },
    _onDisconnect(data) {
      logger.log(TAG_NAME, '_onDisconnect', data)
      this._emitter.emit("onDisconnect", { userId: this.data.config.account })
      this._resetState()
      this._exitRoom(false)
    },
    _onWillReconnect(data) {
      logger.log(TAG_NAME, '_onWillReconnect', data)
    },
    _onSendCommandOverTime(data) {
      logger.log(TAG_NAME, '_onSendCommandOverTime', data)
    },
    _onLiveRoomClose(data) {
      logger.log(TAG_NAME, '_onLiveRoomClose', data)
      this._emitter.emit("onDisconnect", { userId: this.data.config.account })
      this._resetState
      this._exitRoom(false)
    },
    _publishLocalVideo() {
      // 设置 pusher enableCamera
      logger.log(TAG_NAME, 'publishLocalVideo 开启摄像头')
      return this.client.publish('video').then(url => {
        logger.log(TAG_NAME, 'publishVideo success', url)
        return this._setPusherConfig({ url, enableCamera: true })
      }).then(() => {
        this._pusherStart()
      })
    },
    _unpublishLocalVideo() {
      logger.log(TAG_NAME, 'unpublshLocalVideo 关闭摄像头')
      return this.client.unpublish('video').then(url => {
        logger.log(TAG_NAME, 'unpublishVideo success', url)
        return this._setPusherConfig({ enableCamera: false })
      })
    },
    /**
     * 保持屏幕常亮
     */
    _keepScreenOn() {
      setInterval(() => {
        wx.setKeepScreenOn({
          keepScreenOn: true,
        })
      }, 20000)
    },
    /**
     * 必选参数检测
     * @param {Object} rtcConfig rtc参数
     * @returns {Boolean}
     */
    _checkParam(rtcConfig) {
      logger.log(TAG_NAME, 'checkParam config:', rtcConfig)
      if (!rtcConfig.channelName) {
        logger.error('未设置 channelName')
        return false
      }
      if (!rtcConfig.uid) {
        logger.error('未设置 uid')
        return false
      }
      return true
    },
    _pusherStateChangeHandler(event) {
      const { code, message } = event.detail
      switch (code) {
        case 0: // 未知状态码，不做处理
          logger.log(TAG_NAME, message, code)
          break
        case 1001:
          logger.log(TAG_NAME, '已经连接推流服务器', code)
          break
        case 1002:
          logger.log(TAG_NAME, '已经与服务器握手完毕,开始推流', code)
          break
        case 1003:
          logger.log(TAG_NAME, '打开摄像头成功', code)
          break
        case 1004:
          logger.log(TAG_NAME, '录屏启动成功', code)
          break
        case 1005:
          logger.log(TAG_NAME, '推流动态调整分辨率', code)
          break
        case 1006:
          logger.log(TAG_NAME, '推流动态调整码率', code)
          break
        case 1007:
          logger.log(TAG_NAME, '首帧画面采集完成', code)
          break
        case 1008:
          logger.log(TAG_NAME, '编码器启动', code)
          break
        case 2003:
          logger.log(TAG_NAME, '渲染首帧视频', code)
          break
        case -1301:
          logger.error(TAG_NAME, '打开摄像头失败: ', code)
          break
        case -1302:
          logger.error(TAG_NAME, '打开麦克风失败: ', code)
          break
        case -1303:
          logger.error(TAG_NAME, '视频编码失败: ', code)
          break
        case -1304:
          logger.error(TAG_NAME, '音频编码失败: ', code)
          break
        case -1307:
          logger.error(TAG_NAME, '推流连接断开: ', code)
          this._pusherStart()
          break
        case 5000:
          logger.log(TAG_NAME, '小程序被挂起: ', code)
          // 20200421 iOS 微信点击胶囊圆点会触发该事件
          // 触发 5000 后，底层SDK会退房，返回前台后会自动进房
          break
        case 5001:
          // 20200421 仅有 Android 微信会触发该事件
          logger.log(TAG_NAME, '小程序悬浮窗被关闭: ', code)
          // this.status.isPending = true
          // if (this.status.isPush) {
          //   this._exitRoom()
          // }
          break
        case 1021:
          logger.log(TAG_NAME, '网络类型发生变化，需要重新进房', code)
          break
        case 2007:
          logger.log(TAG_NAME, '本地视频播放loading: ', code)
          break
        case 2004:
          logger.log(TAG_NAME, '本地视频播放开始: ', code)
          break
        default:
          logger.log(TAG_NAME, message, code)
          break
      }
    },
    _pusherNetStatusHandler(event) {
      // logger.log(TAG_NAME, '_pusherNetStatusHandler', event)
      const {
        videoFPS,
        videoBitrate,
        audioBitrate,
        // netQualityLevel,
      } = event.detail.info

      if (this.data.statusVisible) {
        this._setPusherConfig({
          videoFPS: Math.round(videoFPS),
          videoBitrate,
          audioBitrate,
          // netQualityLevel,
          // netQualityIcon: netStatusIconMap[netQualityLevel],
        })
      }
    },
    handleOpenSetting() {
      wx.showModal({
        title: '无法使用摄像头和麦克风',
        content: '该功能需要摄像头，请允许小程序访问您的摄像头和麦克风权限',
        confirmText: '前往设置',
        success (res) {
          if (res.confirm) {
            wx.openSetting({
              success(res) {
                console.log('成功', res.authSetting)
                wx.navigateBack()
              },
              fail(err) {
                console.log('失败', err)
              }
            })
          } else if (res.cancel) {
            console.log('用户放弃授权')
          }
        }
      })
    },
    _pusherErrorHandler(event) {
      logger.log(TAG_NAME, '_pusherErrorHandler', event)
      // 未开启摄像头或者麦克风权限
      if (event.detail.errCode === 10001 || event.detail.errCode === 10002) {
        // 后于温馨提示弹窗显示
        setTimeout(() => {
          this.handleOpenSetting()
        }, 2000)
      }
    },
    _pusherBGMStartHandler(event) {
      // logger.log(TAG_NAME, '_pusherBGMStartHandler', event)
    },
    _pusherBGMProgressHandler(event) {
      // logger.log(TAG_NAME, '_pusherBGMProgressHandler', event)
    },
    _pusherBGMCompleteHandler(event) {
      // logger.log(TAG_NAME, '_pusherBGMCompleteHandler', event)
    },
    _pusherAudioVolumeNotify(event) {
      // logger.log(TAG_NAME, '_pusherAudioVolumeNotify', event)
    },
    _playerStateChange(event) {
      const { code, message } = event.detail
      const { nickname } = event.currentTarget.dataset
      logger.warn("===_playerStateChange", event)
      switch (code) {
        case -2301:
          logger.error(TAG_NAME, message, code)
          toast(`${nickname} 拉流彻底断了`)
          this._hangUp()
          break
        default:
          logger.log(TAG_NAME, message, code)
          break
      }
    },
    _playerFullscreenChange(event) {
      // logger.log(TAG_NAME, '_playerFullscreenChange', event)
    },
    _playerNetStatus(event) {
      // logger.log(TAG_NAME, '_playerNetStatus', event)
      // logger.warn("_playerNetStatus", event)
      if (this.data.statusVisible) {
        const uid = Number(event.currentTarget.dataset.uid)
        const user = this.userController.getUser(uid)
        const { videoBitrate, audioBitrate } = event.detail.info
        if (user && user.stream) {
          user.stream.setProperty({ videoBitrate, audioBitrate })
        }
        const averageBitrate = this.userController.getAverageBitrate()
        this.setData({
          playerVideoBitrate: averageBitrate.videoBitrate,
          playerAudioBitrate: averageBitrate.audioBitrate,
        })
      }
    },
    _playerAudioVolumeNotify(event) {
      // logger.log(TAG_NAME, '_playerAudioVolumeNotify', event)
    },
    _pusherValid(cb) {
      if (!this.data.pusher) {
        const config = this.data.config
        this._setPusherConfig({
          enableCamera: config.openCamera,
          enableMic: config.openMicrophone,
          audioQuality: config.audioQuality,
          minBitrate: config.minBitrate,
          maxBitrate: config.maxBitrate,
          videoWidth: config.videoWidth,
          videoHeight: config.videoHeight,
          whitenessLevel: config.whitenessLevel,
          beautyLevel: config.beautyLevel,
        }).then(() => {
          cb?.()
        })
        return
      }
      cb?.()
    },
    _pusherStart() {
      let func = () => {
        this.data.pusher.getPusherContext().start({
          success: () => {
            logger.log(TAG_NAME, '_pusherStart 推流成功')
          },
          fail: (err) => {
            logger.log(TAG_NAME, '_pusherStart 推流失败', err)
          },
        })
      }
      this._pusherValid(func)
    },

    _toggleVideo: prevent(function () {
      this.muteLocalVideo(!this.data.pusher.enableCamera)
      if (this.data.pusher.enableCamera) {
        this._unpublishLocalVideo()
      } else {
        this._publishLocalVideo()
      }
    }, 1000),
    _toggleAudio: prevent(function () {
      if (this.data.pusher.enableMic) {
        this._unpublishLocalAudio()
      } else {
        this._publishLocalAudio()
      }
    }, 1000),
    _toggleVisible(e) {
      const key = e.currentTarget.dataset.key
      this.setData({
        [key]: !this.data[key]
      })
    },
    _togglePusherFullScreen() {
      if (this.data.pusher.isFullScreen) {
        this._setPusherNormal()
        this.userController.getAllUser().forEach(item => {
          this._setPlayerNormal(item.uid)
        })
        this._isFullScreen = false
      } else {
        this._setPusherFullScreen()
        this.userController.getAllUser().forEach(item => {
          this._setPlayerListener(item.uid)
        })
        this._sortPlayerListenerIndex()
        this._isFullScreen = true
      }
      return this._setList()
    },
    _togglePlayerFullScreen(event) {
      const uid = Number(event.currentTarget.dataset.uid)
      this.togglePlayerFullScreen({ uid })
    },
    _setPusherFullScreen() {
      return this._setPusherConfig({ isFullScreen: true, isListener: false, listenerIndex: null })
    },
    _setPusherNormal() {
      return this._setPusherConfig({ isFullScreen: false, isListener: false, listenerIndex: null })
    },
    _setPusherListener() {
      return this._setPusherConfig({ isFullScreen: false, isListener: true, listenerIndex: 0 })
    },
    _setPlayerFullScreen(uid) {
      const user = this.userController.getUser(uid)
      if (user) {
        user.setProperty({
          isFullScreen: true,
          isListener: false,
          listenerIndex: null,
        })
      }
    },
    _setPlayerNormal(uid) {
      const user = this.userController.getUser(uid)
      if (user) {
        user.setProperty({
          isFullScreen: false,
          isListener: false,
          listenerIndex: null,
        })
      }
    },
    _setPlayerListener(uid) {
      const user = this.userController.getUser(uid)
      if (user) {
        user.setProperty({
          isFullScreen: false,
          isListener: true,
        })
      }
    },
    _sortPlayerListenerIndex() {
      const pusherIsListenr = this.data.pusher.isListener
      this.userController.getAllUser().filter(item => item.isListener).forEach((item, index) => {
        item.setProperty({
          listenerIndex: pusherIsListenr ? (index + 1) : index
        })
      })
    },
    _preventBubble() {
      // 阻止冒泡
    },
    /**
     * 退出通话
     */
    async _hangUp(sendMsg) {
      try {
        logger.log("--hangUp", this.channelInfo, this.callStatus)
        if (this.userId) {
          await this.cancel({
            channelId: this.channelInfo.channelId,
            account: this.userId,
            requestId: this.requestId,
            offlineEnabled: true,
          }, sendMsg)
        }
        this.hangup({ channelId: this.channelInfo.channelId, offlineEnabled: true })
        this._exitRoom(false)
      } catch (err) {
        logger.warn("hangUp==error", err)
        this._exitRoom(false)
      }

    },
    _getToken({ uid, appkey }) {
      return new Promise((resolve, reject) => {
        wx.request({
          method: "POST",
          header: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          },
          url: `https://nrtc.netease.im/demo/getChecksum.action`,
          data: {
            uid,
            appkey
          },
          success: function (res) {
            logger.log("====res====", res)
            resolve(res.data.checksum)
          },
          fail: function (err) {
            logger.log("=====errr", err)
            resolve()
          }
        })
      })
    },
    _removeListener() {
      if (this.client) {
        this.client.off(CLIENT_EVENT.ERROR)
        this.client.off(CLIENT_EVENT.STREAM_ADDED)
        this.client.off(CLIENT_EVENT.STREAM_REMOVED)
        this.client.off(CLIENT_EVENT.SYNC_DONE)
        this.client.off(CLIENT_EVENT.CLIENT_LEAVE)
        this.client.off(CLIENT_EVENT.CLIENT_JOIN)
        this.client.off(CLIENT_EVENT.CLIENT_UPDATE)
        this.client.off(CLIENT_EVENT.MUTE_AUDIO)
        this.client.off(CLIENT_EVENT.UNMUTE_AUDIO)
        this.client.off(CLIENT_EVENT.MUTE_VIDEO)
        this.client.off(CLIENT_EVENT.UNMUTE_VIDEO)
        this.client.off(CLIENT_EVENT.KICKED)
        this.client.off(CLIENT_EVENT.OPEN)
        this.client.off(CLIENT_EVENT.DISCONNECT)
        this.client.off(CLIENT_EVENT.WILLRECONNECT)
        this.client.off(CLIENT_EVENT.SENDCOMMANDOVERTIME)
        this.client.off(CLIENT_EVENT.LIVEROOMCLOSE)
      }
      if (this.NIM) {
        this.NIM.removeListener('signalingNotify');
        this.NIM.removeListener('signalingMutilClientSyncNotify');
        this.NIM.removeListener('signalingUnreadMessageSyncNotify');
      }
    }
  },
})
