# 打包成 Android APK（Cordova）

本项目核心是一个**纯前端 PWA**，所有数据与对话逻辑都已离线内置。
要生成可安装的 `.apk` 安装包，用 Cordova 把它包一层原生壳即可。

> 当前开发沙箱内没有 Android SDK / Java，无法在此直接编译签名 APK；
> 请在装有 Android Studio 的机器上执行以下步骤。

## 一、准备环境（一次性）
1. 安装 [Node.js](https://nodejs.org/)（建议 18+）。
2. 安装 Cordova：
   ```bash
   npm install -g cordova
   ```
3. 安装 [Android Studio](https://developer.android.com/studio)，并打开
   “SDK Manager” 安装：
   - Android SDK Platform 34
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - NDK（可选）
4. 配置环境变量（示例，按你的实际路径改）：
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools
   ```

## 二、初始化 Cordova 工程并把应用放进去
在 `EnglishTalkApp/` 目录下执行：

```bash
cd EnglishTalkApp
cordova create build com.estalk.scenarios "英语口语情景对话"
# 用本项目已写好的前端覆盖 Cordova 的 www
rm -rf build/www
cp -r . build/www
# 把 cordova/config.xml 复制进去
cp cordova/config.xml build/config.xml
cd build
cordova platform add android
# 麦克风运行时权限申请需要这个插件（config.xml 已声明，这里安装对齐）
cordova plugin add cordova-plugin-android-permissions
```

> 说明：`build/www` 就是本项目的 `index.html / css / js / assets / manifest.webmanifest / sw.js`。
> 若你希望图标更规范，请用 `assets/icon.svg` 导出 `res/icon-512.png` 与
> `res/icon-192.png`，并在 `config.xml` 的 `<platform name="android">` 内引用 PNG。

## 三、生成 APK
```bash
cordova build android
```
成功后在：
`build/platforms/android/app/build/outputs/apk/debug/app-debug.apk`
即得到可直接安装到安卓手机的调试版 APK。

## 四、生成正式（签名）APK（发布用）
```bash
# 1) 生成签名密钥（仅首次）
keytool -genkey -v -keystore my-release-key.keystore -alias estalk -keyalg RSA -keysize 2048 -validity 10000

# 2) 在 build/platforms/android/ 下建 release-signing.properties
#    storeFile=my-release-key.keystore
#    storePassword=你的密码
#    keyAlias=estalk
#    keyPassword=你的密码

# 3) 编译正式包
cordova build android --release
```
输出：`build/platforms/android/app/build/outputs/apk/release/app-release.apk`

## 五、不打包也能用（最快路径）
安卓 Chrome 打开 `index.html`（或部署到任意静态服务器），
点右上角菜单 → **“添加到主屏幕”**，即可全屏离线当作 App 使用，
语音朗读/识别在 Chrome 上体验最佳。

## 六、功能与内容
- **25 个内置情景**，均为完整 12 节模板，按年级组织：
  - **小学三年级 10 个**（英语起步年专版）：认识新同学、找回丢失的蜡笔、
    拼一个怪物木偶、聊聊喜欢的动物、早餐想吃什么、生日派对、介绍我的家人、
    在动物园、找不见的铅笔、买水果。话题按 **PEP 三上 / 三下** 编排，
    统一限 S1–S2 难度、每句 ≤ 6–8 词、只用 be 动词与一般现在时。
  - **四~六年级 15 个**：覆盖全部 11 项交际功能（询问信息、表达偏好、邀请与回应、
    请求与提供帮助、选择并说明理由、比较与推荐、计划与协商、描述与确认、
    购买与点餐、问路与指路、解决简单问题）。
- **年级体系**：情景库与首页均可按年级筛选；每个年级限定句长、生词量、
  互动轮次与难度区间（三年级 S1–S2，四年级 S2–S3，五年级 S3–S4，六年级 S4–S5）。
- **智能生成·离线**：选年级 + 类别 + 交际功能 + 难度，离线生成新情景包；
  选年级后可选难度会自动钳制在该年级区间，三年级还会注入语言上限约束。
- **智能生成·云端**：配置 API Key 后，用自然语言描述主题，由大模型现场创作情景包；
  选三年级时，语言上限会作为最高优先级写入提示词，返回难度越界也会被自动钳制。
- 独立练习：应用按脚本事实扮演对方，支持文字 / 语音输入，自动朗读。
- 外教执行卡、评价标准、迁移任务一应俱全。
- 离线场景无任何联网请求、不收集个人信息。

## 七、云端大模型生成（可选功能）
应用在「智能生成 → 云端大模型生成」中调用 OpenAI 兼容的
`/chat/completions` 接口，支持 OpenAI / DeepSeek / Kimi(Moonshot) /
通义千问 Qwen / 智谱 GLM / 自定义兼容服务。

- **密钥存储**：API Key 仅保存在用户设备的 `localStorage`，仅发往用户所选的服务商，
  不会上传任何第三方。
- **网络权限**：`config.xml` 已含 `<access origin="*" />`，APK 可访问外网。
  若你希望更严格，可将其改为仅放行你的服务商域名。
- **CORS 说明**：浏览器直接调用大模型接口可能受跨域限制；打包成 APK 后，
  WebView 发起的请求不受同源策略约束，通常可正常调用。
  若仍报 CORS，建议把 Key 放在自有后端代理中转发请求（生产环境推荐做法）。
- **练习仍离线**：云端只负责「生成情景内容」；生成后的对话练习由本地
  `partner.js` 引擎基于模型产出的 `partner` 数据驱动，不再逐轮调用接口，
  既省额度也无需持续联网。

## 八、麦克风权限与语音输入（APK 关键）
语音输入（STT）依赖麦克风，Android 6+ 把 `RECORD_AUDIO` 列为**危险权限**，
仅写在 Manifest 不够，必须**运行时弹窗申请**。本项目已内置完整链路：

1. **权限声明**：`config.xml` 已写入
   `<uses-permission android:name="android.permission.RECORD_AUDIO" />`
   （并在 iOS 平台块写入 `NSMicrophoneUsageDescription` 用途说明）。
2. **运行时申请**：`cordova-plugin-android-permissions` 插件（config.xml 已声明）
   在 `js/mic-permission.js` 中封装 `MicPermission.ensure()`，首次点麦克风按钮时
   自动向用户申请麦克风权限；被拒后给出「去系统设置开启」的引导。
3. **触发点**：`js/speech.js` 的 `listen()` 在启动识别前先调 `MicPermission.ensure()`，
   授权成功才启动，全程对上层透明。

> ⚠️ **WebView 语音识别兼容性说明**：本应用使用的是 Web Speech API，
> 在**系统 Chrome / 桌面浏览器**上 STT 工作良好；但打包成 APK 后，应用内是
> **Android System WebView**，其对 `SpeechRecognition` 的支持在不同设备/ROM 上
> 不一致，部分机型可能无法启动识别。**权限链路已打通**，若某台设备仍无法识别，
> 可选方案是改用原生插件 `cordova-plugin-speechrecognition` 替换 `Speech.listen()`
> 的底层实现（该插件同样自带权限处理，且基于系统 SpeechRecognizer，兼容性更好）。
> 在改用前，键盘输入框始终可用，不影响练习主流程。

## 九、在已生成的 APK 工程里追加权限（可选）
若你已 `cordova build` 过、不想重建工程，可进入 `build/` 目录执行：
```bash
cordova plugin add cordova-plugin-android-permissions
# 重新编译
cordova build android
```
`RECORD_AUDIO` 权限与 `NSMicrophoneUsageDescription` 已由 config.xml 在打包时自动合并，
无需手动改 AndroidManifest。
