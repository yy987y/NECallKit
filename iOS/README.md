* [iOS 使用手册（1\.3\.0）](#ios-使用手册130)
  * [1\. 集成说明](#1-集成说明)
    * [1\.1 引入](#11-引入)
    * [1\.2 初始化](#12-初始化)
    * [1\.3 登录/登出](#13-登录登出)
    * [1\.4 设置通话回调](#14-设置通话回调)
    * [1\.5 设置TokenHandler](#15-设置tokenhandler)
    * [1\.6 一对一呼叫通话流程](#16-一对一呼叫通话流程)
      * [1\.6\.1 主叫\#呼叫](#161-主叫呼叫)
      * [1\.6\.2 <span id="user\-content\-caller\_cancel">主叫\#取消呼叫</span>](#162-主叫取消呼叫)
      * [1\.6\.3 被叫\#被邀请](#163-被叫被邀请)
      * [1\.6\.4 <span id="user\-content\-called\_accept">被叫\#接听</span>](#164-被叫接听)
      * [1\.6\.5 <span id="user\-content\-called\_reject">被叫\#拒接</span>](#165-被叫拒接)
      * [1\.6\.6 <span id="user\-content\-p2p\_hangup">挂断</span>](#166-挂断)
      * [1\.6\.7 忙线](#167-忙线)
      * [1\.6\.8 多端登录](#168-多端登录)
      * [1\.6\.9 呼叫/被叫超时](#169-呼叫被叫超时)
      * [1\.6\.10 <span id="user\-content\-p2p\_videoview">视频通话设置本地预览与订阅远端画面</span>](#1610-视频通话设置本地预览与订阅远端画面)
    * [1\.7 多人呼叫通话流程](#17-多人呼叫通话流程)
      * [1\.7\.1 主叫\#呼叫](#171-主叫呼叫)
      * [1\.7\.2 主叫\#中途邀请](#172-主叫中途邀请)
      * [1\.7\.3 用户离开](#173-用户离开)
      * [1\.7\.4 其他行为说明](#174-其他行为说明)
      * [1\.7\.5 存在的问题](#175-存在的问题)
  * [2\. API 文档](#2-api-文档)
  * [3\. IM sdk/ NERtc sdk 依赖说明](#3-im-sdk-nertc-sdk-依赖说明)
    * [3\.1 IM sdk](#31-im-sdk)
    * [3\.2 NERtc sdk](#32-nertc-sdk)
  * [4\. 版本变更记录](#4-版本变更记录)
    * [1\.3\.0（版本日期）](#130版本日期)
  * [5\. 升级指引](#5-升级指引)
    * [1\.2\.1 =&gt; 1\.3\.0](#121--130)

# iOS 使用手册（1.3.0）

此文档为 iOS 版本呼叫组件的使用手册，可参考文档来减少呼叫组件接入成本。

## 1. 集成说明

### 1.1 引入

> 建议使用CocoaPods进行管理，在`Podfile`中添加：

```ruby
pod 'NERtcCallKit'
```

> 组件依赖NERtcSDK，NIMSDK的特定版本，请***不要***在Podfile中指定NERtcSDK及NIMSDK的版本

### 1.2 初始化

组件实现为单实例，通过接口 `NERtcCallKit.sharedInstance` 获取此实例，调用实例方法 `setupAppKey` 完成初始化。

```objc
/// 初始化，所有功能需要先初始化
/// @param appKey 云信后台注册的appKey
/// @param options 其他配置项，如证书名
- (void)setupAppKey:(NSString *)appKey options:(nullable NERtcCallOptions *)options;
```

> 注：setupAppKey方法为使用组件前 ***必须*** 调用的方法，若不调用，会发生不可预知的问题!



### 1.3 登录/登出

**若已经在 app 内实现了 NIMSDK 登录/登出逻辑，则不必调用相应的登录/登出接口，直接跳过此章节。**

否则，可使用组件的`-[NERtcCallKit login:]` 进行登录，同样可使用`-[NERtcCallKit logout:]`进行登出，***登出或未进行登录则不能进行呼叫***。



### 1.4 设置通话回调

 **无论是一对一通话还是群组通话，在呼叫或收到呼叫邀请时需要设置相应的回调监听，用于接收对应通话的控制消息。**首先在需要收到监听的地方实现`NERtcCallKitDelegate`

```objc
@interface SomeViewController: UIViewController <NERtcCallKitDelegate>
@end
```

**注册回调**

```objc
// 执行设置回调监听
[NERtcCallKit.sharedInstance addDelegate:self];

// 通话结束后或页面销毁时需要移除对应的回调监听
[NERtcCallKit.sharedInstance removeDelegate:self];
```

**回调监听方法说明：**

```objc
@protocol NERtcCallKitDelegate <NSObject>

@optional

/// 收到邀请的回调
/// @param invitor 邀请方
/// @param userIDs 房间中的被邀请的所有人（不包含邀请者）
/// @param isFromGroup 是否是群组
/// @param groupID 群组ID
/// @param type 通话类型
- (void)onInvited:(NSString *)invitor
          userIDs:(NSArray<NSString *> *)userIDs
      isFromGroup:(BOOL)isFromGroup
          groupID:(nullable NSString *)groupID
             type:(NERtcCallType)type
       attachment:(nullable NSString *)attachment;

/// 接受邀请的回调
/// @param userID 接受者
- (void)onUserEnter:(NSString *)userID;

/// 拒绝邀请的回调
/// @param userID 拒绝者
- (void)onUserReject:(NSString *)userID;

/// 取消邀请的回调
/// @param userID 邀请方
- (void)onUserCancel:(NSString *)userID;

/// 用户离开的回调.
/// @param userID 用户userID
- (void)onUserLeave:(NSString *)userID;

/// 用户异常离开的回调
/// @param userID 用户userID
- (void)onUserDisconnect:(NSString *)userID;

/// 用户接受邀请的回调
/// @param userID 用户userID
- (void)onUserAccept:(NSString *)userID;

/// 忙线
/// @param userID 忙线的用户ID
- (void)onUserBusy:(NSString *)userID;

/// 通话类型切换的回调（仅1对1呼叫有效）
/// @param callType 切换后的类型
- (void)onCallTypeChange:(NERtcCallType)callType;

/// 通话结束
- (void)onCallEnd;

/// 呼叫超时
- (void)onCallingTimeOut;

/// 连接断开
/// @param reason 断开原因
- (void)onDisconnect:(NSError *)reason;

/// 发生错误
- (void)onError:(NSError *)error;

/// 启用/禁用相机
/// @param available 是否可用
/// @param userID 用户ID
- (void)onCameraAvailable:(BOOL)available userID:(NSString *)userID;

/// 启用/禁用麦克风
/// @param available 是否可用
/// @param userID 用户userID
- (void)onAudioAvailable:(BOOL)available userID:(NSString *)userID;

/// 视频采集变更回调
/// @param muted 是否关闭采集
/// @param userID 用户ID
- (void)onVideoMuted:(BOOL)muted userID:(NSString *)userID;

/// 音频采集变更回调
/// @param muted 是否关闭采集
/// @param userID 用户ID
- (void)onAudioMuted:(BOOL)muted userID:(NSString *)userID;

/// 自己加入成功的回调，通常用来上报、统计等
/// @param event 回调参数
- (void)onJoinChannel:(NERtcCallKitJoinChannelEvent *)event;

/// 首帧解码成功的回调
/// @param userID 用户id
/// @param width 宽度
/// @param height 高度
- (void)onFirstVideoFrameDecoded:(NSString *)userID width:(uint32_t)width height:(uint32_t)height;

/// 网络状态监测回调
/// @param stats key为用户ID, value为对应网络状态
- (void)onUserNetworkQuality:(NSDictionary<NSString *, NERtcNetworkQualityStats *> *)stats;

/// 呼叫请求已被其他端接收的回调
- (void)onOtherClientAccept;

/// 呼叫请求已被其他端拒绝的回调
- (void)onOtherClientReject;

@end
```



### 1.5 设置TokenHandler

若 NERtc sdk 采用安全模式则加入音视频房间时需要提供对应的token，详细参考[Token获取](https://doc.yunxin.163.com/docs/jcyOTA0ODM/DE0NjAwNDY?platformId=50192) 。

呼叫组件依赖 token，需要在用户在初始化时同时设置 token 服务，此 token 服务为用户服务端自己实现。若 NERtc sdk 采用非安全模式，则服务返回结果为 null，但是必须设置 Token Handler

```objc
    // 安全模式需要计算token，如果tokenHandler为nil表示非安全模式，需要联系经销商开通
    NERtcCallKit.sharedInstance.tokenHandler = ^(uint64_t uid, void (^complete)(NSString *token, NSError *error)) {
        // 在这里可以异步获取token，获取完成后调用complete(<tokenOrNil>, <errorOrNil>)
    };
```



### 1.6 一对一呼叫通话流程

主要介绍一对一场景下如何通过呼叫组件实现。

#### 1.6.1 主叫#呼叫

主叫通过点击呼叫按钮，跳转到正在呼叫的页面（此页面由用户自己实现）。

```objc
[NERtcCallKit.sharedInstance call:otherUserId
                             type:NERtcCallTypeVideo
                       attachment:attachment
                       completion:^(NSError * _Nullable error) {
      if (error) {
        // handle errors
        return;
      }
 }];
```

**设置回调监听；**

#### 1.6.2 <span id='caller_cancel'>主叫#取消呼叫</span>

当用户已经完成**呼叫动作**时，可以随时调用 `-[NERtcCallKit cancel:]` 取消本次呼叫。

```objc
[NERtcCallKit.sharedInstance cancel:^(NSError * _Nullable error) {
		if (error) {
      // Handle error;
      return;
    }
}];
```

#### 1.6.3 被叫#被邀请

**设置回调监听:**

```objc
/// 收到邀请的回调
/// @param invitor 邀请方
/// @param userIDs 房间中的被邀请的所有人（不包含邀请者）
/// @param isFromGroup 是否是群组
/// @param groupID 群组ID
/// @param type 通话类型
- (void)onInvited:(NSString *)invitor
          userIDs:(NSArray<NSString *> *)userIDs
      isFromGroup:(BOOL)isFromGroup
          groupID:(nullable NSString *)groupID
             type:(NERtcCallType)type
       attachment:(nullable NSString *)attachment {
    // 在这里唤起呼叫界面
}
```

#### 1.6.4 <span id='called_accept'>被叫#接听</span>

当被叫用户点击呼叫页面的中接听按钮时，若此时通话仍在呼叫中则可接通此次通话并加入对应的音视频房间内，和主叫方进行音视频通话。

```objc
[[NERtcCallKit sharedInstance] accept:^(NSError * _Nullable error) {
    if (error) {
      // Handle errors;
      return;
    } 
  	// Success
}];
```

#### 1.6.5 <span id='called_reject'>被叫#拒接</span>

当被叫用户点击呼叫页面的中接听按钮时，若此时通话仍在呼叫中则可接通此次通话并加入对应的音视频房间内，和主叫方进行音视频通话。

```objc
[[NERtcCallKit sharedInstance] reject:^(NSError * _Nullable error) {
    if (error) {
      // Handle errors;
      return;
    } 
  	// Success
}];
```

#### 1.6.6 <span id='p2p_hangup'>挂断</span>

用户在通话过程中结束通话可调用挂断接口，挂断接口无论成功还是失败都需要关闭页面做销毁动作。

```objc
[[NERtcCallKit sharedInstance] hangup:^(NSError * _Nullable error) {
    if (error) {
      // Handle errors;
      return;
    } 
  	// Success
}];
```

#### 1.6.7 忙线

当被叫用户不在 NERtcCallStatusIdle 状态下接收到其他主叫用户的呼叫邀请时，被叫方会自动执行 `reject` 动作，主叫方接收到对方的 `reject` 消息后会回调 `-[NERtcCallKitDelegate onUserBusy:]` 方法用于 UI 展示，主叫方本地发送忙线话单消息。

#### 1.6.8 多端登录

云信 IM sdk 支持多端或单端登录，若此时正在通过呼叫组件进行音视频通话时，其他端登录相同账号：

1. 不支持多端登录：此时由于不支持多端登录导致信令通道同时被踢出无法通过信令完成消息通知。此时会直接做离开音视频房间操作，对端用户感知到本端离开动作后，会做挂断挂断操作。
2. 支持多端登录：其他端的用户登录不会影响当前通过组件发起的音视频通话。但若多端同时在线时，收到呼叫邀请时会同时展示被邀请页面，如果其中一端接听或拒绝，则其他端会收到相应错误回调。错误码为 `2001`或`2002` 。

#### 1.6.9 呼叫/被叫超时

主叫方发起呼叫被叫方时，若主叫方不取消，被叫方既不接听也不挂断，此时会触发超时限制。目前超时限制时间最长为 **2分钟**，触发超时限制后主叫方和被叫方都会触发 `-[NERtcCallKitDelegate onCallingTimeout]` 回调，同时主叫方会做取消动作，被叫方会做挂断操作。用户可通过如下接口实现更改超时时间，但不能超过 **2分钟**。发生呼叫或收到呼叫邀请前对本次通话生效，否则对下次通话生效。

```objc
NERtcCallKit.sharedInstance.timeOutSeconds = 30;// 单位为秒
```

#### 1.6.10 <span id='p2p_videoview'>视频通话设置本地预览与订阅远端画面</span>

用户发起呼叫后可以调用如下接口设置本地预览画面：

```objc
[NERtcCallKit.sharedInstance setupLocalView:yourLocalView];
```

调用如下接口设置远端画面，此方法可在 `-[NERtcCallKitDelegate onFirstVideoFrameDecoded]` 回调用调用。

```objc
[NERtcCallKit.sharedInstance setupRemoteView:yourRemoteView forUser:remoteUserId];
```



### 1.7 多人呼叫通话流程

主要介绍多人多人群组呼叫场景如何通过呼叫组件实现。

#### 1.7.1 主叫#呼叫

主叫方点击呼叫按钮触发群组呼叫，并启动群组呼叫页面（自己实现）。

```objc
[NERtcCallKit.sharedInstance groupCall:userIDArray
                               groupID:groupIdOrNil
                                  type:NERtcCallTypeVideo
                            attachment:attachmentOrNil
                            completion:^(NSError * _Nullable error) {
    if (error) {
      	// Handle error
	      return;
    }
    // Success
}];

```

#### 1.7.2 主叫#中途邀请

在主叫方发起呼叫或在群组通话过程中，主叫方可以邀请其他用户进入本次的群组通话。

```objc
[NERtcCallKit.sharedInstance groupInvite:userIdArray
                                 groupID:groupIdOrNil
                              attachment:attachmentOrNil
                              completion:^(NSError * _Nullable error) {
    if (error) {
        // Handle error
	      return;
    }
		// Success
}];
```

#### 1.7.3 用户离开

群组通话过程中如果用户需要离开当前通话但是不想影响其他参会用户，则可用调用离开接口。

```objc
[NERtcCallKit.sharedInstance leave:^(NSError * _Nullable error) {
    if (error) {
      // Handle errors
      return;
    }
  	// Success
}];
```

#### 1.7.4 其他行为说明

主叫方的的[取消](#caller_cancel)，被叫方的[接听](#called_accept)、[拒接](#called_reject) 动作均同上问的一对一呼叫，若某一个参会者执行[挂断](#p2p_hangup)操作则会导致此次的群组通话结束。

设置视频通话本地预览与订阅远端画面参考[一对一流程](#p2p_videoview)。

#### 1.7.5 存在的问题

1. 当前版本的群组呼叫不存在中间服务器，所以除了主叫方外，其他的参会者无法获知另外的参会者是否拒绝本次群组通话。
2. 中途邀请目前仅支持主叫方发起。



## 2. API 文档

暂未实现



## 3. IM sdk/ NERtc sdk 依赖说明

说明 sdk 当前适配版本，若升级相应sdk 确认是否兼容；

### 3.1 IM sdk

当前依赖版本；依赖内容：初始化，登录；依赖信令能力；互踢说明

### 3.2 NERtc sdk 

当前依赖版本；通话过程，加入房间/退出房间 异步说明；断网时回调，被踢出时回调；初始化相关说明；当前的nertc 配置可能存在的问题；



## 4. 版本变更记录

### 1.3.0（版本日期）

1. 支持呼叫/邀请用户时设置自定义数据（attachment），被叫方在收到呼叫时可拿到对应的数据；
2. 添加相关统计上报；
3. bug 修复；



## 5. 升级指引

### 1.2.1 => 1.3.0

1. 添加视频采集控制接口：

   ```objc
   @interface NERtcCallKit : NSObject
     
   /// 开启或关闭视频采集
   /// @param muted YES：关闭，NO：开启
   /// @return 操作返回值，成功则返回 0
   - (int)muteLocalVideo:(BOOL)muted;
   
   @end
   ```

   接口调用会触发 `NERTCCallingDelegate.onVideoMuted()` 回调；

2. 添加音频采集控制回调接口

      ```objc
   @protocol NERtcCallKitDelegate <NSObject>
      
      /// 音频采集变更回调
      /// @param muted 是否关闭采集
      /// @param userID 用户ID
      - (void)onAudioMuted:(BOOL)muted userID:(NSString *)userID;
      
      @end
   ```

3. 添加 `onJoinChannel` 回调，此接口当用户加入音视频房间时触发此回调，用户可通过此回调获取用户 IM 的账号 Id在此次通话中的 uid 以及音视频房间的房间 Id 以及名称。

    ```objc
    @protocol NERtcCallKitDelegate <NSObject>
    
    /// 自己加入成功的回调，通常用来上报、统计等
    /// @param event 回调参数
    - (void)onJoinChannel:(NERtcCallKitJoinChannelEvent *)event;
    
    @end
      
    @interface NERtcCallKitJoinChannelEvent : NSObject
    
    /// IM userID
    @property (nonatomic, copy) NSString *accid;
    
    /// 音视频用户id
    @property (nonatomic, assign) uint64_t uid;
    
    /// 音视频channelId
    @property (nonatomic, assign) uint64_t cid;
    
    /// 音视频channelName
    @property (nonatomic, copy) NSString *cname;
    
    @end
      
    ```

4. 呼叫接口变更  `-[NERtcCallKit call]`、` -[NERtcCallKit groupCall]`、` -[NERtcCallKit groupInvite]` 均增加 `attachment` 参数，此参数用户传递自定义参数，在被叫方收到邀请通知时可解析出。

   ```objc
   /// 收到邀请的回调
   /// @param invitor 邀请方
   /// @param userIDs 房间中的被邀请的所有人（不包含邀请者）
   /// @param isFromGroup 是否是群组
   /// @param groupID 群组ID
   /// @param type 通话类型
   - (void)onInvited:(NSString *)invitor
             userIDs:(NSArray<NSString *> *)userIDs
         isFromGroup:(BOOL)isFromGroup
             groupID:(nullable NSString *)groupID
                type:(NERtcCallType)type
          attachment:(nullable NSString *)attachment; // 增加的attachment，建议用JSON字符串
   ```
