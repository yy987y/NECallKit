[TOC]

# Android 使用手册（1.3.0）

此文档为 Android 版本呼叫组件的使用手册，可参考文档来减少呼叫组件接入成本。

## 1. 集成说明

### 1.1 引入

> implementation 'com.netease.yunxin.kit:call:1.3.0'

```groovy
allprojects {
    repositories {
        //...
        mavenCentral()
        //...
    }
}
// 若出现 More than one file was found with OS independent path 'lib/arm64-v8a/libc++_shared.so'.
// 可以在主 module 的 build.gradle 文件中 android 闭包内追加如下 packageOptions 配置
android{
  	//......
    packagingOptions {
      pickFirst 'lib/arm64-v8a/libc++_shared.so'
      pickFirst 'lib/armeabi-v7a/libc++_shared.so'
  	}
}
```



### 1.2 初始化

**组件初始化不包含 IM sdk 的初始化，且组件初始化必须放在 IM sdk 初始化之后，否则会出现崩溃。** 可以放在 Application/MainActivity 内完成组件初始化调用。

组件实现为单实例，通过接口 `NERTCVideoCall.sharedInstance()` 获取此实例，调用实例方法 `setupAppKey` 完成初始化。

```java
	 /**
     * 初始化，需要且仅能调用一次。
     *
     * @param context context 
     * @param appKey  网易云信应用的 AppKey，请在控制台中获取。
     * @param option  初始化选项。
     */
    public abstract void setupAppKey(Context context, String appKey, VideoCallOptions option);
```

`VideoCallOptions` 对象构建，

```java

    /**
     * VideoCallOptions 构造函数
     *
     * @param rtcOption            NERtc sdk 初始化配置详细参考 {@link NERtcOption}
     * @param uiService            用户呼叫/被叫时展示的页面设置入口
     * @param userInfoInitCallBack 通过组件进行登录 IM sdk 时传入，登录成功回调。
     *                             也可以设置为 null，依赖
     *                             {@link NERTCVideoCall#login(String, String, RequestCallback)}接口的回调。
     */
    public VideoCallOptions(NERtcOption rtcOption, UIService uiService, UserInfoInitCallBack userInfoInitCallBack) {
			// ......
    }
```

`UIService`对象构建，

```java
/**
 * 呼叫组件设置 UI 相关的接口，用于被叫时获取对应的启动页面 activity，若存在不使用的功能可直接返回 null。
 */
public interface UIService {
    /**
     * 获取一对一音频通话时启动的 activity 页面 class
     */
    Class<? extends Activity> getOneToOneAudioChat();

    /**
     * 获取一对一视频通话时启动的 activity 页面 class
     */
    Class<? extends Activity> getOneToOneVideoChat();

    /**
     * 获取群组通话时启动的 activity 页面 class
     */
    Class<? extends Activity> getGroupVideoChat();

    /**
     * 获取呼叫组件产生呼叫推送时的本地图标资源 id
     */
    int getNotificationIcon();

    /**
     * 获取呼叫组件产生呼叫推送时的本地图标资源 id（小图），目前已经废弃返回 0
     */
    @Deprecated
    int getNotificationSmallIcon();

    /**
     * 群组通话邀请他人时触发联系人的选择列表，若不使用此功能可不实现
     *
     * @param context         上下文
     * @param groupId         群组id
     * @param excludeUserList 列表中已选择用户，不需要进行选择
     * @param requestCode     联系人选择通过 {@link Activity#startActivityForResult(Intent, int)} 实现，对应的请求码
     */
    void startContactSelector(Context context, String groupId, List<String> excludeUserList, int requestCode);
}
```



### 1.3 登录/登出

**用户若已经在 app 内实现了 IM 登录/登出逻辑，则不必调用相应的登录/登出接口，直接跳过此章节。**

用户在 IM sdk 及组件初始化完成后，可调用 `NERTCVideoCall.login(String imAccount, String imToken, RequestCallback<LoginInfo> callback)` 接口实现 IM 登录。

用户调用`NERTCVideoCall.logout()` 接口实现 IM 登出，**登出后则无法完成呼叫被叫等动作**。



### 1.4 设置通话回调

 **无论是一对一通话还是群组通话，在呼叫或收到呼叫邀请时需要设置相应的回调监听，用于接收对应通话的控制消息。**

```java
// 用于监听每次的通话的监听消息
NERTCCallingDelegate delegate = new NERTCCallingDelegate(){
  //......
}
// 执行设置回调监听
NERTCVideoCall.sharedInstance().addDelegate(delegate);

// 通话结束后或页面销毁时需要移除对应的回调监听
NERTCVideoCall.sharedInstance().removeDelegate(delegate);
```

**回调监听方法说明：**

```java
public interface NERTCCallingDelegate {

    /**
     * 错误回调。
     *
     * @note 如果 needFinish 为 true，表示 SDK 遇到不可恢复的严重错误，请及时退出 UI。
     *
     * @param errorCode  错误码。
     * @param errorMsg   错误信息。
     * @param needFinish UI 层是否需要退出。true 表示严重错误，需要退出 UI。
     */
    void onError(int errorCode, String errorMsg, boolean needFinish);

    /**
     * 被邀请通话回调。
     *
     * @param invitedInfo 邀请参数
     */
    void onInvited(InvitedInfo invitedInfo);

    /**
     * 用户进入通话回调。
     *
     * 如果呼叫对端用户接受呼叫邀请，并加入到音视频(NERtc)房间后，则本端会触发此回调。
     * 即使被叫方执行了接听动作，但此回调没有触发，则仍会打中呼叫/被叫超时逻辑。
     *
     * @param userId 进入通话的用户 ID。
     */
    void onUserEnter(String userId);

    /**
     * 通话结束回调。
     *
     * 如果有用户同意离开通话，那么本端会收到此回调。
     *
     * @param userId 离开通话的用户 ID。
     */
    void onCallEnd(String userId);

    /**
     * 用户离开时回调。
     * 当接通后用户正常从音视频房间离开则房间内的其他用户会收到此回调。
     *
     * @param userId 离开通话的用户 ID。
     */
    void onUserLeave(String userId);

    /**
     * 用户断开连接。
     * 当接通后用户异常从音视频房间离开则房间内的其他用户会收到此回调。
     *
     * @param userId 断开连接的用户 ID。
     */
    void onUserDisconnect(String userId);

    /**
     * 作为主叫方收到此回调，当被叫方拒绝通话触发。
     *
     * @param userId 拒绝通话的用户 ID。
     */
    void onRejectByUserId(String userId);

    /**
     * 被叫方忙线时主叫方收到此回调。
     *
     * @param userId 忙线用户 ID。
     */
    void onUserBusy(String userId);

    /**
     * 作为被叫方会收到，收到该回调说明本次通话被主叫方取消了。
     */
    void onCancelByUserId(String userId);

    /**
     * 远端用户开启或关闭了摄像头。
     *
     * @param userId           远端用户 ID。
     * @param isVideoAvailable true:远端用户打开摄像头；false:远端用户关闭摄像头。
     */
    void onCameraAvailable(String userId, boolean isVideoAvailable);

    /**
     * 远端用户是否开启视频流采集
     *
     * @param userId    远端用户id
     * @param isMuted   true:关闭，false:开启
     */
    void onVideoMuted(String userId, boolean isMuted);

    /**
     * 远端用户是否开启音频流采集
     *
     * @param userId    远端用户id
     * @param isMuted   true:关闭，false:开启
     */
    void onAudioMuted(String userId, boolean isMuted);

    /**
     * 当前用户加入音视频（NERtc）房间时的回调。此回调用于将用户的 IM 的账号 Id 同 NERtc 使用的 uid 进行管理，以及加入的
     * 音视频房间的名称（channelName）以及 id （rtcChannelId）
     *
     * @param accId         用户 id
     * @param uid           用户用于加入 rtc 房间的 uid
     * @param channelName   用户加入 rtc 房间的通道名称
     * @param rtcChannelId  rtc 房间通道 id
     */
    void onJoinChannel(String accId, long uid, String channelName, long rtcChannelId);

    /**
     * 远端用户开启或关闭了麦克风。
     *
     * @param userId           远端用户 ID。
     * @param isAudioAvailable true:远端用户打开摄像头；false:远端用户关闭摄像头。
     */
    void onAudioAvailable(String userId, boolean isAudioAvailable);

    /**
     * 音视频异常断开连接。
     *
     * 此时出现可能为后台将音视频通话中的用户踢出，断网等。
     * 收到此回调为通话结束。
     *
     * @param res 断开原因。
     */
    void onDisconnect(int res);

    /**
     * 网络状态回调。
     *
     * 0-网络质量未知
  	 * 1-网络质量极好
     * 2-用户主观感觉和极好差不多，但码率可能略低于极好
     * 3-能沟通但不顺畅
     * 4-网络质量差
     * 5-完全无法沟通
     *
     * @param stats 网络状态。
     */
    void onUserNetworkQuality(Entry<String, Integer>[] stats);

    /**
     * 通话类型改变。
     * 目前仅支持从视频类型通话转换到音频通话。
     *
     * @param type 通话类型。{@link ChannelType#AUDIO}音频通话，{@link ChannelType#VIDEO}视频通话
     */
    void onCallTypeChange(ChannelType type);

    /**
     * 呼叫超时。
     * 触发呼叫/被叫超时逻辑时触发。
     */
    void timeOut();

    /**
     * 已解码远端首帧回调。
     * 视频通话类型才会触发，触发说明一定能看到对应 userId 的画面，可在此回调中做相关 UI 变换。 
     *
     * @param userId 远端用户id。
     * @param width 首帧视频宽，单位为 px。
     * @param height 首帧视频高，单位为 px。
     */
    void onFirstVideoFrameDecoded(String userId, int width, int height);

}
```



### 1.5 设置TokenService

若 NERtc sdk 采用安全模式则加入音视频房间时需要提供对应的token，详细参考[Token获取](https://doc.yunxin.163.com/docs/jcyOTA0ODM/TQ0MTI2ODQ?platformId=50002) 。

呼叫组件依赖 token，需要在用户在初始化时同时设置 token 服务，此 token 服务为用户服务端自己实现。若 NERtc sdk 采用非安全模式，则服务返回结果为 null，但是必须设置 TokenService

```java
TokenService tokenService = new TokenService(){
   /**
    * 
    * 
    * @param uid      用户 rtcID（用于加入 rtc 房间）。
    * @param callback callback 回调。
    */
    void getToken(long uid, RequestCallback<String> callback){
      // 若采用安全模式
      // 网络请求需要用到 uid 获取token 获取成功后则调用 callback.onSuccess(token)
      
      // 若采用非安全模式
      // 则直接调用 callback.onSuccess(null)
    }
}

// 设置 TokenService
NERTCVideoCall.sharedInstance().setTokenService(tokenService);
```



### 1.6 一对一呼叫通话流程

主要介绍一对一场景下如何通过呼叫组件实现。

#### 1.6.1 主叫#呼叫

主叫通过点击呼叫按钮，跳转到正在呼叫的页面（此页面由用户自己实现）。

```java
String calledUserId = "被叫用户登录 IM 的 id";
String currentUserId = "当前用户登录 IM 的 id";
ChannelType type = ChannelType.VIDEO; // 呼叫类型为视频通话
String extraInfo = "自定义透传字段，被叫方可在 onInvited 接口中获取对应字段";
JoinChannelCallBack callback = new JoinChannelCallBack() {
		@Override
		public void onJoinChannel(ChannelFullInfo channelFullInfo) {
      // 呼叫成功，返回对应呼叫相关信息。
      // 如信令通道的 channelId = channelFullInfo.getChannelBaseInfo().getChannelId()
		}

		@Override
		public void onJoinFail(String msg, int code) {
			if (code == ResponseCode.RES_PEER_NIM_OFFLINE) {
				// 呼叫成功但被叫用户处于离线，不用关闭页面。若在呼叫过程中被叫用户上线，可收到对应的呼叫邀请 
				return;
			}
			// 呼叫失败关闭呼叫页面，停止提示音等
		}
}
// 发起呼叫，可在此时做呼叫提示音，呼叫页面展示
NERTCVideoCall.sharedInstance().call(calledUserId, currentUserId, type, extraInfo,callback);
```

**设置回调监听，如果为视频通话同时需要调用 `NERTCVideoCall.enableLocalVideo` 开启本地视频流发送。其他相关可以查看[Api 文档](https://dev.yunxin.163.com/docs/interface/NERTCCallkit/Latest/Android/html/)。**

#### 1.6.2 <span id='caller_cancel'>主叫#取消呼叫</span>

当用户已经完成**呼叫动作**时，可以随时调用 `NERTCVideoCall.cancel()` 完成取消本次呼叫，此时被叫的呼叫页面也会同步消失。

```java
RequestCallback<Void> callback  = new RequestCallback<Void>() {
		@Override
		public void onSuccess(Void aVoid) {
			// 取消成功，关闭相关页面等操作
		}

		@Override
		public void onFailed(int i) {
			// 邀请已经被被叫用户接受了，此时取消失败，被叫进入音视频房间，此时看作取消动作无效，若仍需取消可使用挂断接口
			if (i == ResponseCode.RES_INVITE_HAS_ACCEPT) {
				return;
			}
			// 取消失败，可做 hangup 挂断动作完成相关页面销毁
		}

		@Override
		public void onException(Throwable throwable) {
			// 取消出现异常，同取消失败                
		}
}
// 执行组件取消动作
NERTCVideoCall.sharedInstance().cancel(callback);
```

#### 1.6.3 被叫#被邀请

被叫用户在收到邀请信息时会通过 `UIService` 根据呼叫类型（VIDEO/AUDIO）来调用不同的方法直接启动被叫页面的 Activity。若被叫方系统在 **Android Q** 及以上时，系统限制不允许后台弹出页面，此时会弹出对应的 Notification，被叫方可通过点击 Notification 跳转至对应的被叫页面。若用户通过 launcher 或其他方式唤起 app 时，通话仍有效则同样会展示被叫页面。

**设置回调监听；**

被叫页面设置通过实现 `UIService` 方法完成，被叫页面 Activity 启动后可通过启动 `intent` 解析相应的呼叫参数：

**一对一通话参数列表**：

```java
/**
 * 标记本次邀请的请求 Id
 */
String inventRequestId = getIntent().getStringExtra(CallParams.INVENT_REQUEST_ID);
/**
 * 标记每次通话的 channel Id
 */
String inventChannelId = getIntent().getStringExtra(CallParams.INVENT_CHANNEL_ID);
/**
 * 主叫方的 IM 账号 Id
 */
String inventFromAccountId = getIntent().getStringExtra(CallParams.INVENT_FROM_ACCOUNT_ID);
/**
 * 呼叫通话类型 VIDEO/AUDIO 详见{@link com.netease.nimlib.sdk.avsignalling.constant.ChannelType}
 */
int callType = getIntent().getIntExtra(CallParams.INVENT_CHANNEL_TYPE, ChannelType.VIDEO.getValue());
/**
 * 是否做为被叫方启动此页面（被叫用户时都为 true）
 */
boolean callReceived = getIntent().getBooleanExtra(CallParams.INVENT_CALL_RECEIVED, false);
```

**群组通话参数列表**：

```java
/**
 * 同一对一通话，是否做为被叫方启动此页面（被叫用户时都为 true）
 */
boolean callReceived = intent.getBooleanExtra(CallParams.INVENT_CALL_RECEIVED, false);
/**
 * 群组被叫用户的 IM 账号列表
 */
List<String> accounts = (ArrayList<String>) intent.getSerializableExtra(CallParams.INVENT_USER_IDS);
/**
 * 同一对一通话，标记每次通话的 channel Id
 */
String invitedChannelId = intent.getStringExtra(CallParams.INVENT_CHANNEL_ID);
/**
 * 同一对一通话，标记本次邀请的请求 Id
 */
String invitedRequestId = intent.getStringExtra(CallParams.INVENT_REQUEST_ID);
/**
 * 同一对一通话，主叫方的 IM 账号 Id
 */
String inventFromAccountId = intent.getStringExtra(CallParams.INVENT_FROM_ACCOUNT_ID);
/**
 * 群组呼叫时标记群组通话的 Id
 */
String groupId = intent.getStringExtra(CallParams.TEAM_CHAT_GROUP_ID);
```

#### 1.6.4 <span id='called_accept'>被叫#接听</span>

当被叫用户点击呼叫页面的中接听按钮时，若此时通话仍在呼叫中则可接通此次通话并加入对应的音视频房间内，和主叫方进行音视频通话。**接听后如果为视频通话需同主叫一样调用 `NERTCVideoCall.enableLocalVideo` 开启本地视频流采集及发送。**

```java
/**
 * 利用收到被邀请信息构建邀请参数，此参数用于接听/拒接通话
 */
InviteParamBuilder inviteParamBuilder = new InviteParamBuilder(invitedChannelId, inventFromAccountId, invitedRequestId);

String currentUserId = "当前用户登录 IM 的 id";
JoinChannelCallBack callback = new JoinChannelCallBack() {
		@Override
		public void onJoinChannel(ChannelFullInfo channelFullInfo) {
      // 接听成功
		}

		@Override
		public void onJoinFail(String msg, int code) {  
      // 接听失败，测试可做被叫页面销毁等动作
    }
	}
// 执行通话接听动作
NERTCVideoCall.sharedInstance().accept(inviteParamBuilder, currentUserId, callback);
```

#### 1.6.5 <span id='called_reject'>被叫#拒接</span>

当被叫用户点击呼叫页面的中拒接按钮时，若此时通话仍在呼叫中则可终断此次通话。

```java
/**
 * 利用收到被邀请信息构建邀请参数，此参数用于接听/拒接通话
 */
InviteParamBuilder inviteParamBuilder = new InviteParamBuilder(invitedChannelId, inventFromAccountId, invitedRequestId);

RequestCallback<Void> callback = new RequestCallback<Void>() {
		@Override
		public void onSuccess(Void aVoid) {
			// 拒接成功，关闭对应页面等销毁动作
		}

		@Override
		public void onFailed(int code) {
      // 拒接失败，若 code 为 ResponseCode.RES_CHANNEL_NOT_EXISTS 、ResponseCode.RES_INVITE_NOT_EXISTS 、ResponseCode.RES_INVITE_HAS_REJECT、ResponseCode.RES_PEER_NIM_OFFLINE 、ResponseCode.RES_PEER_PUSH_OFFLINE) 说明主叫方存在问题可直接关闭页面做销毁动作，若非以上 code 则说明主叫方未收到拒接指令，则无法完成拒接动作，若仍想挂断可尝试使用挂断接口
		}

		@Override
		public void onException(Throwable throwable) {
      // 出现异常直接关闭当前页面，主叫方等待超时接听退出呼叫状态
		}
	}
// 执行通话拒接动作
NERTCVideoCall.sharedInstance().reject(inviteParamBuilder, callback);
```

#### 1.6.6 <span id='p2p_hangup'>挂断</span>

用户在通话过程中结束通话可调用挂断接口，挂断接口无论成功还是失败都需要关闭页面做销毁动作。

```java
String channelId = "当前通话的 channelId，如果设置为 null，则关闭当前正在进行中的通话。否则如果当前通话的 channelId 和传入值不同则不会进行挂断操作";

RequestCallback<Void> callback = new RequestCallback<Void>() {
		@Override
		public void onSuccess(Void aVoid) {
			// 挂断成功，关闭对应页面等销毁动作
		}

		@Override
		public void onFailed(int code) {
    	// 挂断失败，关闭对应页面等销毁动作
		}

		@Override
		public void onException(Throwable throwable) {
      // 挂断异常，关闭对应页面等销毁动作
		}
	}
NERTCVideoCall.sharedInstance().hangup(inviteParamBuilder, callback);
```

#### 1.6.7 忙线

当被叫用户不在 `STATE_IDLE` 状态下接收到其他主叫用户的呼叫邀请时，被叫方会自动执行 `NERTCVideoCall.reject` 动作，主叫方接收到对方的 `reject` 消息后会回调 `NERTCCallingDelegate.onUserBusy` 方法用于 UI 展示，主叫方本地发送忙线话单消息。

#### 1.6.8 多端登录

云信 IM sdk 支持多端或单端登录，若此时正在通过呼叫组件进行音视频通话时，其他端登录相同账号：

1. 不支持多端登录：此时由于不支持多端登录导致信令通道同时被踢出无法通过信令完成消息通知。此时会直接做离开音视频房间操作，对端用户感知到本端离开动作后，会做挂断挂断操作。
2. 支持多端登录：其他端的用户登录不会影响当前通过组件发起的音视频通话。但若多端同时在线时，收到呼叫邀请时会同时展示被邀请页面，如果其中一端接听或拒绝，则其他端会收到相应错误回调。错误码为 `2001`或`2002` 。

#### 1.6.9 呼叫/被叫超时

主叫方发起呼叫被叫方时，若主叫方不取消，被叫方既不接听也不挂断，此时会触发超时限制。目前超时限制时间最长为 **2分钟**，触发超时限制后主叫方和被叫方都会触发 `onTimeout` 回调，同时主叫方会做取消动作，被叫方会做挂断操作。用户可通过如下接口实现更改超时时间，但不能超过 **2分钟**。发生呼叫或收到呼叫邀请前对本次通话生效，否则对下次通话生效。

```java
NERTCVideoCall.sharedInstance().setTimeOut(long time);// 单位为毫秒
```

#### 1.6.10 <span id='p2p_videoview'>视频通话设置本地预览与订阅远端画面</span>

用户发起呼叫后可以调用如下接口设置本地预览画面：

```java
NERTCVideoCall.sharedInstance().setupLocalView();
```

调用如下接口设置远端画面，此方法可在 `onFirstVideoFrameDecoded` 回调用调用。

```java
NERtcVideoView videoView;// 用于展示远端画面的布局UI
String userId = "远端待订阅视频用户的 IM 账号 Id"；
NERTCVideoCall.sharedInstance().setupRemoteView(videoView, userId);
```



### 1.7 多人呼叫通话流程

主要介绍多人多人群组呼叫场景如何通过呼叫组件实现。

#### 1.7.1 主叫#呼叫

主叫方点击呼叫按钮触发群组呼叫，并启动群组呼叫页面（自己实现）。

```java
ArrayList<String> accounts; "被叫用户登录 IM 的 id列表"
String currentUserId = "当前用户登录 IM 的 id";
String groupId = "标记群组通话的群组 Id。";
ChannelType type = ChannelType.VIDEO; // 呼叫类型为视频通话
String extraInfo = "自定义透传字段，被叫方可在 onInvited 接口中获取对应字段";
JoinChannelCallBack callback = new JoinChannelCallBack() {
		@Override
		public void onJoinChannel(ChannelFullInfo channelFullInfo) {
      // 呼叫成功，返回对应呼叫相关信息。
      // 如信令通道的 channelId = channelFullInfo.getChannelBaseInfo().getChannelId()
		}

		@Override
		public void onJoinFail(String msg, int code) {
			// 呼叫失败关闭呼叫页面，停止提示音等
		}
}
// 发起群组呼叫，可在此时做呼叫提示音，群组呼叫页面展示
NERTCVideoCall.sharedInstance().groupCall(calledUserId, currentUserId, type, extraInfo,callback);
```

#### 1.7.2 主叫#中途邀请

在主叫方发起呼叫或在群组通话过程中，主叫方可以邀请其他用户进入本次的群组通话。

```java
ArrayList<String> newInvitedaccounts; //中途被叫用户登录 IM 的 id列表
ArrayList<String> totalAccounts; //群组通话中所有用户登录 IM 的 id列表
String currentUserId = "当前用户登录 IM 的 id";
String groupId = "标记群组通话的群组 Id。";
String extraInfo = "自定义透传字段，被叫方可在 onInvited 接口中获取对应字段";
JoinChannelCallBack callback = new JoinChannelCallBack() {
		@Override
		public void onJoinChannel(ChannelFullInfo channelFullInfo) {
      // 邀请成功，每邀请一个用户会触发一次回调，此时 channelFullInfo 为 null。
		}

		@Override
		public void onJoinFail(String msg, int code) {
			// 邀请失败，目前可给出提示但不做其他处理，此时还有已经参会的用户
		}
}
// 发起群组中途邀请，被邀请用户会收到 onInvited 回调通知。
NERTCVideoCall.sharedInstance().groupInvite(newInvitedaccounts, totalAccounts, groupId, currentUserId, extraInfo, callback);
```

#### 1.7.3 用户离开

群组通话过程中如果用户需要离开当前通话但是不想影响其他参会用户，则可用调用离开接口。

```java
/**
 * 当前版本中，无论是否离开成功都可关闭通话页面。
 */
RequestCallback<Void> callback = new RequestCallback<Void>() {
		@Override
		public void onSuccess(Void aVoid) {
		}

		@Override
		public void onFailed(int code) {
		}

		@Override
		public void onException(Throwable throwable) {
		}
	}
// 群组通话中，离开当前通话，但不进行挂断
NERTCVideoCall.sharedInstance().leave(callback);
```

#### 1.7.4 其他行为说明

主叫方的的[取消](#caller_cancel)，被叫方的[接听](#called_accept)、[拒接](#called_reject) 动作均同上问的一对一呼叫，若某一个参会者执行[挂断](#p2p_hangup)操作则会导致此次的群组通话结束。

设置视频通话本地预览与订阅远端画面参考[一对一流程](#p2p_videoview)。

#### 1.7.5 存在的问题

1. 当前版本的群组呼叫不存在中间服务器，所以除了主叫方外，其他的参会者无法获知另外的参会者是否拒绝本次群组通话。
2. 中途邀请目前仅支持主叫方发起。



## 2. API 文档

详见[Android API 文档](https://dev.yunxin.163.com/docs/interface/NERTCCallkit/Latest/Android/html/)



## 3. IM sdk/ NERtc sdk 依赖说明

若升级相应sdk 确认是否兼容；

### 3.1 IM sdk

云信IM Sdk 8.4.6，用户呼叫流程以及话单发送。

### 3.2 NERtc sdk 

云信音视频 Sdk 4.0.7，通话过程，以及通话过程中视频相关操作。**需要调用 NERTCVideoCall.setupAppKey** 完成相关初始化。



## 4. 异常说明

### 4.1 组件内部错误码

| 错误码 | 说明                       |
| ------ | -------------------------- |
| 2000   | 组件内部状态错误           |
| 2001   | 其他端已经接受             |
| 2002   | 其他端拒绝                 |
| 2021   | 请求token失败              |
| 2031   | rtcUid 和 imAccId 映射错误 |
| -1     | 使用错误                   |

### 4.2 其他错误

组件会直接抛出 IM sdk / NERtc sdk 的错误码。详情参考 [IM 通用错误码](http://dev.yunxin.163.com/docs/product/IM即时通讯/状态码)、[IM 信令错误码](http://dev.yunxin.163.com/docs/product/信令/SDK开发集成/Android开发集成/错误码)、[NERtc 错误码](https://dev.yunxin.163.com/docs/interface/NERTC_SDK/Latest/Android/html/interfacecom_1_1netease_1_1lava_1_1nertc_1_1sdk_1_1_n_e_rtc_constants_1_1_error_code.html)。

#### 4.2.1 典型错误码说明

| 错误码 | 说明                                                         |
| ------ | ------------------------------------------------------------ |
| -500   | 在 onError 回调中收到此错误码说明，当前用户仍在音视频房间且尝试加入另外的音视频房间。当执行挂断操作时，会离开音视频房间，若此时发起新的通话并立即接通则可能触发。根本原因为，离开音视频房间不是瞬时动作需要时间，若在离开的过程中加入，此时还没真正的离开房间则会打中此错误。 |



## 5. 版本变更记录

### 1.3.0（版本日期）

1. 支持呼叫/邀请用户时设置自定义数据，被叫方在收到呼叫时可拿到对应的数据；
2. 添加相关统计上报；
3. bug 修复；



## 6. 升级指引

### 1.2.1 => 1.3.0

1. `NERTCVideoCall`添加视频采集控制接口：

   ```java
      /**
      	* 开启/关闭视频采集
      	* @param isMute    true:视频采集关闭 false:视频采集打开
      	*/
      public abstract void muteLocalVideo(boolean isMute);
   ```

   接口调用会触发 `NERTCCallingDelegate.onVideoMuted()` 回调；

2. `NERTCCallingDelegate`添加音频采集控制回调接口，通过 

   `NERtcVideoCall.muteLocalAudio` 方法调用触发：

      ```java
      /**
      	* 远端用户是否开启音频流采集
      	* @param userId    远端用户id
      	* @param isMuted   true:关闭，false:开启
      	*/
      void onAudioMuted(String userId, boolean isMuted);
      ```

3. `NERTCCallingDelegate` 添加 `onJoinChannel` 接口，此接口当用户加入音视频房间时触发此回调，用户可通过此回调获取用户 IM 的账号 Id在此次通话中的 uid 以及音视频房间的房间 Id 以及名称。

    ```java
      /**
      	* 当前用户加入音视频的回调
      	*
      	* @param accId         用户 id
      	* @param uid           用户用于加入 rtc 房间的 uid
      	* @param channelName   用户加入 rtc 房间的通道名称
      	* @param rtcChannelId  rtc 房间通道 id
      	*/
      void onJoinChannel(String accId, long uid, String channelName, long rtcChannelId);
    ```

4. 呼叫接口变更  `NERtcVideoCall.call`、 `NERtcVideoCall.groupCall`、 `NERtcVideoCall.grouInvite` 均增加 `extraInfo` 参数，此参数用户传递自定义参数，在被叫方收到邀请通知时可解析出。

   ```java
       private NERTCCallingDelegate callingDelegate = new NERTCCallingDelegate() {
              @Override
              public void onInvited(InvitedInfo invitedInfo) {
                  // 被叫用户通过 invitedInfo.attachment 获取对应自定义参数；
              }
         //......
       }
   ```

