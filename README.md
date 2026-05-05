# Web Avatar

MediaPipe (Pose Landmarker) を使って VRM を動かすサンプル

## 構成

### Practice MediaPipe

MediaPipe Pose Landmarker を使ったトラッキングのサンプルです。

<https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js> のものになります。
<https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker?hl=ja> にそれぞれに割り当てられた数字を使って座標を参照します。

```sh
cd app/apps/practice-mediapipe
vp install
vp dev
```

#### アクセス

<http://localhost:5171/>

### Practice VRM

VRM を読み込むためのサンプルです。次の実際に動かすことを想定して上半身にカメラを向けた構成になっています。
VRM の読み込みは `@pixiv/three-vrm` を使い、 `three.js` でレンダリングを行います。

```sh
cd app/apps/practice-vrm
vp install
vp dev
```

#### アクセス

<http://localhost:5172/>

### app/apps/web-avatar

前の2つを組み合わせて構成した MediaPipe を使って VRM を動かすサンプル

インカメラを MediaPipe に取り込み、アウトカメラを背景に置く構成

荒ぶるので 首の上下方向や体は固定しています。

<video src="./docs/webavatar.mp4" controls="true"></video>

```sh
cd app/apps/web-avatar
vp install
vp dev
```

#### アクセス

<http://localhost:5173/>
