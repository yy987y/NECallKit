
# NERtcCallKit

为了方便开发者接入音视频2.0呼叫功能，我们将NIN的信令和NERTC的音视频能力结合简化呼叫的复杂流程，以组件的形式提供给客户，提高接入效率，降低接入成本。

## 1. 功能介绍

`NERtcCallKit`基于 NIM 信令以及 NERTC 音视频实现了一对一音/视频呼叫通话，群组音/视频呼叫通话等功能。**此仓库只包含各端组件实现并不包含 UI 部分，可参考 demo 实现自己的界面。** 

### 1.1 组件使用参考

#### 1.1.1 IM 即时通讯

完整的即时通讯demo，功能较为齐全。在此 demo 中同时使用了组件 一对一呼叫通话以及多人呼叫通话场景，demo 地址参考传送门。

#### 1.1.2 一对一视频通话

功能较为简单，用户在登录后可以通过对方登录的手机号查找对方并发起呼叫，完成视频通话，demo 地址参考传送门。



## 2. 话单功能开通

网易云控制台，点击【应用】>【创建】创建自己的App，在【功能管理】中申请开通如下功能

1. 若仅使用呼叫功能，则开通
   1. 【信令】
   2. 【音视频通话2.0】
   3. 【安全模式】- 组件支持使用安全模式以及非安全模式，开启安全模式请咨询相应SO
2. 若还需使用话单功能，则需要开通
   1. 【IM】以及【信令】功能
   2. 【G2话单功能】-云信控制台-音视频通话2.0-功能配置-开启话单类型消息抄送

3. 在控制台中【appkey管理】获取appkey。

注：如果曾经已有相应的应用，可在原应用上申请开通【音视频通话2.0】及【信令】功能

## 3. 使用手册

  1.  [Android](https://github.com/netease-kit/NECallKit/blob/master/Android/README.md) 
    2.  [iOS](https://github.com/netease-kit/NECallKit/blob/master/iOS/README.md)
    3.  [Web](https://github.com/netease-kit/NECallKit/blob/master/Web/README.md)
    4.  [PC](https://github.com/netease-kit/NECallKit/blob/master/PC/README.md)


## 4. Demo传送门（即时通讯Demo）
[IOS Demo传送门](https://github.com/netease-im/NIM_iOS_Demo/tree/NERtcCallKit)

[AOS Demo传送门](https://github.com/netease-im/NIM_Android_Demo/tree/dev_g2)

[PC Demo传送门](https://github.com/netease-im/NIM_PC_Demo/)

[Web Demo传送门](https://github.com/netease-im/NIM_Web_Demo)

**以下端Demo暂不支持CallKit**

[H5 Demo传送门](https://github.com/netease-im/NIM_Web_Demo_H5)

[WebRTC Demo传送门](https://github.com/netease-im/NIM_Web_Demo)

[小程序 Demo传送门](https://github.com/netease-im/NIM_Web_Weapp_Demo)

[Mac Demo传送门](https://github.com/netease-im/NIM_macOS_AVChat_Demo)

[聊天室小程序 Demo传送门](https://github.com/netease-im/NIM_Weapp_Chatroom_Demo)

[RN Demo传送门](https://github.com/netease-im/NIM_ReactNative_Demo)

