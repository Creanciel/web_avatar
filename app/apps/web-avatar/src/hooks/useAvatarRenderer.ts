import type { NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { VRMHumanBoneName, VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  Euler,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { createOneEuroFilter, createOneEuroState, type OneEuroState } from "../lib/oneEuroFilter";
// import { landmarksToBoneRotations } from "../lib/poseToBone";

const VRM_URL = "/models/AliciaSolid.vrm";
const CANVAS_SIZE = 512;
const ONE_EURO_PARAMS = { minCutoff: 1.0, beta: 10, dCutoff: 1.0 };

// 顔向きベクトルの rest 方向。鼻が目/耳より下にある幾何オフセットの補正として、
// 純 +Z ではなく X 軸まわりに HEAD_REST_PITCH ぶん傾けた方向を「正面」とみなす。
// 値を増やすと頭が下向きになる方向に補正される。逆向きなら符号反転。
const HEAD_REST_PITCH = -0.35;
const HEAD_REST = new Vector3(0, Math.sin(HEAD_REST_PITCH), Math.cos(HEAD_REST_PITCH));

// 首 (yaw) のレスポンスカーブ
const YAW_SIGMA = 0.35; // Gaussian dead-zone 幅 (rad)
const YAW_GAIN = 0.6; // 振り切り時の最大ゲイン (人体可動域に合わせて控えめに)

// 腕の rest direction (VRM 0.x rotateVRM0 適用後の scene-local 系基準)
const X_PLUS = new Vector3(1, 0, 0);
const X_MINUS = new Vector3(-1, 0, 0);

// 腕は z 軸を潰した xy 平面で計算しているので、見た目を Tポーズではなく自然な前傾にするため、
// 正規化後の方向ベクトルに z 成分を加えて再正規化する。
// アバターは scene-local では +Z 向き → ワールドで camera 側へ向くのは scene-local の -Z。
// よって「正面側に出す」には -Z を足す。-1 = -tan(45°) で 45° 前傾。
const ARM_FORWARD_BIAS = -1;

const VISIBILITY_THRESHOLD = 0.5;

// 前腕が xy 平面で上向きしきい値を超えたら手をピース、それ以下なら開いた状態に戻す。
const PEACE_THRESHOLD = Math.sin(Math.PI / 6); // ≈ 0.5 (30°)
const FINGER_BEND_ANGLE = Math.PI / 2.2; // 1 セグメントあたり 約 82°
const FINGER_BEND_AXIS = new Vector3(0, 0, -1);
// 親指は他指と局所軸の向きが違うので別軸/別角度。左右で鏡像にしない。
const THUMB_BEND_ANGLE = Math.PI / 4; // 1 セグメントあたり 45°
const THUMB_BEND_AXIS = new Vector3(-1, 0, 0);
// ピース時の人差し指・中指の splay (proximal を ±5° 開く)
const SPREAD_ANGLE = (Math.PI * 20) / 180; // 20°
const SPREAD_AXIS = new Vector3(1, 0, 0);
// ピース時の掌の向き補正 (手首ねじり)
const HAND_TWIST_ANGLE = (Math.PI * 2) / 5; // 72°
const HAND_TWIST_AXIS = new Vector3(1, 0, 0);

const PEACE_FINGER_BONES: Record<"left" | "right", readonly VRMHumanBoneName[]> = {
  left: [
    VRMHumanBoneName.LeftRingProximal,
    VRMHumanBoneName.LeftRingIntermediate,
    VRMHumanBoneName.LeftRingDistal,
    VRMHumanBoneName.LeftLittleProximal,
    VRMHumanBoneName.LeftLittleIntermediate,
    VRMHumanBoneName.LeftLittleDistal,
  ],
  right: [
    VRMHumanBoneName.RightRingProximal,
    VRMHumanBoneName.RightRingIntermediate,
    VRMHumanBoneName.RightRingDistal,
    VRMHumanBoneName.RightLittleProximal,
    VRMHumanBoneName.RightLittleIntermediate,
    VRMHumanBoneName.RightLittleDistal,
  ],
};

const PEACE_THUMB_BONES: Record<"left" | "right", readonly VRMHumanBoneName[]> = {
  left: [
    VRMHumanBoneName.LeftThumbMetacarpal,
    VRMHumanBoneName.LeftThumbProximal,
    VRMHumanBoneName.LeftThumbDistal,
  ],
  right: [
    VRMHumanBoneName.RightThumbMetacarpal,
    VRMHumanBoneName.RightThumbProximal,
    VRMHumanBoneName.RightThumbDistal,
  ],
};

const setPeaceHand = (vrm: VRM, side: "left" | "right", peace: boolean): void => {
  // 薬指/小指は左右で局所軸が鏡像なので side で符号反転。
  // 親指は鏡像になっていないので両側同じ軸を使う。
  const fingerAxis = side === "left" ? FINGER_BEND_AXIS.clone().negate() : FINGER_BEND_AXIS;
  const thumbAxis = THUMB_BEND_AXIS;

  const applyBend = (bones: readonly VRMHumanBoneName[], axis: Vector3, angle: number) => {
    for (const boneName of bones) {
      const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
      if (!node) continue;
      if (peace) {
        node.quaternion.setFromAxisAngle(axis, angle);
      } else {
        node.quaternion.set(0, 0, 0, 1);
      }
    }
  };

  applyBend(PEACE_FINGER_BONES[side], fingerAxis, FINGER_BEND_ANGLE);
  applyBend(PEACE_THUMB_BONES[side], thumbAxis, THUMB_BEND_ANGLE);

  // 人差し指 / 中指の Proximal を ±5° 開く (V 字形)
  const setSpread = (boneName: VRMHumanBoneName, sign: 1 | -1) => {
    const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
    if (!node) return;
    if (peace) {
      node.quaternion.setFromAxisAngle(SPREAD_AXIS, sign * SPREAD_ANGLE);
    } else {
      node.quaternion.set(0, 0, 0, 1);
    }
  };
  const indexProximal =
    side === "left" ? VRMHumanBoneName.LeftIndexProximal : VRMHumanBoneName.RightIndexProximal;
  const middleProximal =
    side === "left" ? VRMHumanBoneName.LeftMiddleProximal : VRMHumanBoneName.RightMiddleProximal;
  setSpread(indexProximal, +1);
  setSpread(middleProximal, -1);

  // 手首をねじって掌の向きを補正
  const handBone = side === "left" ? VRMHumanBoneName.LeftHand : VRMHumanBoneName.RightHand;
  const handNode = vrm.humanoid?.getNormalizedBoneNode(handBone);
  if (handNode) {
    if (peace) {
      handNode.quaternion.setFromAxisAngle(HAND_TWIST_AXIS, HAND_TWIST_ANGLE);
    } else {
      handNode.quaternion.set(0, 0, 0, 1);
    }
  }
};

const toSceneVec = (lm: NormalizedLandmark): Vector3 =>
  new Vector3(lm.x - 0.5, -(lm.y - 0.5), -lm.z);

/**
 * MediaPipe Pose の smoothed landmarks から head bone の向きを更新。
 * 顔の向きベクトル = (鼻 - 右耳) + (鼻 - 左耳) を、scene-local (x/y/z 反転) に置いて、
 * z は depth 推定が雑なので潰し、xy 平面成分のみで yaw を作る。Gaussian dead-zone とゲイン適用後に流し込む。
 *
 * MediaPipe Pose はどうしても顔の上下の認識に限界があるので縦軸は殺している。
 */
const updateHeadFromPose = (smoothed: NormalizedLandmark[], vrm: VRM): void => {
  const nose = smoothed[0];
  const rightEar = smoothed[8];
  const leftEar = smoothed[7];
  if (!nose || !rightEar || !leftEar) return;

  const faceDir = {
    x: 2 * nose.x - rightEar.x - leftEar.x,
    y: 2 * nose.y - rightEar.y - leftEar.y,
  };

  const faceDirVec = new Vector3(-faceDir.x, -faceDir.y, 0);
  if (faceDirVec.lengthSq() <= 1e-6) return;
  faceDirVec.normalize();

  const headQ = new Quaternion().setFromUnitVectors(HEAD_REST, faceDirVec);
  // pitch (X) と roll (Z) を 0 固定、yaw (Y) のみ反映 + Gaussian dead-zone + gain
  const e = new Euler().setFromQuaternion(headQ, "YXZ");
  e.x = 0;
  e.z = 0;
  const yIn = e.y;
  const damp = 1 - Math.exp(-(yIn * yIn) / (2 * YAW_SIGMA * YAW_SIGMA));
  e.y = yIn * damp * YAW_GAIN;
  headQ.setFromEuler(e);

  const headNode = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head);
  if (headNode) headNode.quaternion.copy(headQ);
};

/**
 * 片腕(肩→肘→手首)を対応する VRM ボーンに反映する。
 * spine/chest を identity 固定としているので、上腕のローカル Q = world Q。
 * 下腕は上腕 world Q を親として local 座標系へ変換した上で適用。
 */
const updateArm = (smoothed: NormalizedLandmark[], vrm: VRM, side: "left" | "right"): void => {
  // VRM の左腕にはユーザーの右側ランドマーク (12/14/16)、右腕には左側 (11/13/15) を割り当てる。
  // (鏡像にせず、画面上の左右と一致させるため)
  const { shoulderIdx, elbowIdx, wristIdx, upperBone, lowerBone, restDir } =
    side === "left"
      ? {
          shoulderIdx: 12,
          elbowIdx: 14,
          wristIdx: 16,
          upperBone: VRMHumanBoneName.LeftUpperArm,
          lowerBone: VRMHumanBoneName.LeftLowerArm,
          restDir: X_MINUS,
        }
      : {
          shoulderIdx: 11,
          elbowIdx: 13,
          wristIdx: 15,
          upperBone: VRMHumanBoneName.RightUpperArm,
          lowerBone: VRMHumanBoneName.RightLowerArm,
          restDir: X_PLUS,
        };

  const shoulder = smoothed[shoulderIdx];
  const elbow = smoothed[elbowIdx];
  const wrist = smoothed[wristIdx];
  if (!shoulder || !elbow) return;
  if ((shoulder.visibility ?? 0) < VISIBILITY_THRESHOLD) return;
  if ((elbow.visibility ?? 0) < VISIBILITY_THRESHOLD) return;

  const sh = toSceneVec(shoulder);
  const el = toSceneVec(elbow);

  // 上腕: 肩 → 肘 方向。MediaPipe Pose の z は腕近辺で雑なので潰して xy 平面で計算。
  const upperDir = el.clone().sub(sh);
  upperDir.z = 0;
  if (upperDir.lengthSq() < 1e-6) return;
  upperDir.normalize();
  // 45度前傾バイアス
  upperDir.z = ARM_FORWARD_BIAS;
  upperDir.normalize();
  const upperQ = new Quaternion().setFromUnitVectors(restDir, upperDir);
  const upperNode = vrm.humanoid?.getNormalizedBoneNode(upperBone);
  if (upperNode) upperNode.quaternion.copy(upperQ);

  // 下腕: 肘 → 手首 方向。親 (upperArm world Q) で逆変換して local に。
  if (!wrist) return;
  if ((wrist.visibility ?? 0) < VISIBILITY_THRESHOLD) return;
  const wr = toSceneVec(wrist);
  const lowerDirWorld = wr.clone().sub(el);
  lowerDirWorld.z = 0;
  if (lowerDirWorld.lengthSq() < 1e-6) return;
  lowerDirWorld.normalize();
  // 前腕 (肘→手首) が上向きしきい値を超えたらピース
  const isPeace = lowerDirWorld.y > PEACE_THRESHOLD;
  setPeaceHand(vrm, side, isPeace);
  // 45度前傾バイアス
  lowerDirWorld.z = ARM_FORWARD_BIAS;
  lowerDirWorld.normalize();
  const lowerWorldQ = new Quaternion().setFromUnitVectors(restDir, lowerDirWorld);
  const lowerLocalQ = upperQ.clone().invert().multiply(lowerWorldQ);
  const lowerNode = vrm.humanoid?.getNormalizedBoneNode(lowerBone);
  if (lowerNode) lowerNode.quaternion.copy(lowerLocalQ);
};

interface LandmarkFilters {
  x: OneEuroState;
  y: OneEuroState;
  z: OneEuroState;
}

const loadVRM = async (url: string): Promise<VRM> => {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
  });
  return vrm;
};

interface UseAvatarRendererArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  poseVideoRef: RefObject<HTMLVideoElement | null>;
  debugCanvasRef?: RefObject<HTMLCanvasElement | null>;
  landmarker: PoseLandmarker | null;
  mirror: boolean;
  enabled: boolean;
}

const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 11],
  [0, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

const drawPoseDebug = (
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[] | null,
  visibilityThreshold: number,
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 内部解像度と表示比率を実映像に合わせる
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw > 0 && vh > 0) {
    if (canvas.width !== vw) canvas.width = vw;
    if (canvas.height !== vh) canvas.height = vh;
    const ratio = `${vw} / ${vh}`;
    if (canvas.style.aspectRatio !== ratio) canvas.style.aspectRatio = ratio;
  }

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (vw > 0 && vh > 0) ctx.drawImage(video, 0, 0, width, height);
  if (!landmarks) return;

  const lineW = Math.max(2, width / 240);
  const dotR = Math.max(3, width / 180);

  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = lineW;
  ctx.beginPath();
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 0) < visibilityThreshold) continue;
    if ((lb.visibility ?? 0) < visibilityThreshold) continue;
    ctx.moveTo(la.x * width, la.y * height);
    ctx.lineTo(lb.x * width, lb.y * height);
  }
  ctx.stroke();

  ctx.fillStyle = "#ff3366";
  for (const lm of landmarks) {
    if ((lm.visibility ?? 0) < visibilityThreshold) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
};

interface UseAvatarRendererResult {
  vrmReady: boolean;
  error: Error | null;
}

export const useAvatarRenderer = ({
  canvasRef,
  poseVideoRef,
  debugCanvasRef,
  landmarker,
  mirror,
  enabled,
}: UseAvatarRendererArgs): UseAvatarRendererResult => {
  const [vrmReady, setVrmReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const landmarkerRef = useRef(landmarker);
  const mirrorRef = useRef(mirror);

  useEffect(() => {
    landmarkerRef.current = landmarker;
  }, [landmarker]);

  useEffect(() => {
    mirrorRef.current = mirror;
  }, [mirror]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const camera = new PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 1.4, 1.4);
    camera.lookAt(0, 1.4, 0);

    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(CANVAS_SIZE, CANVAS_SIZE, false);
    renderer.setClearColor(0x000000, 0);

    const scene: Scene = (() => {
      const dir = new DirectionalLight(0xffffff, 1.8);
      dir.position.set(0, 1.5, 1.5);
      dir.target.position.set(0, 1.4, 0);
      const ambient = new AmbientLight(0xffffff, 1.0);
      return new Scene().add(ambient, dir, dir.target);
    })();

    const clock = new Clock();
    const xFilter = createOneEuroFilter(ONE_EURO_PARAMS);
    const yFilter = createOneEuroFilter(ONE_EURO_PARAMS);
    const zFilter = createOneEuroFilter(ONE_EURO_PARAMS);
    const landmarkFilters: LandmarkFilters[] = [];

    const smooth = (lms: NormalizedLandmark[], timeMs: number): NormalizedLandmark[] =>
      lms.map((lm, i) => {
        let f = landmarkFilters[i];
        if (!f) {
          f = {
            x: createOneEuroState(),
            y: createOneEuroState(),
            z: createOneEuroState(),
          };
          landmarkFilters[i] = f;
        }
        return {
          ...lm,
          x: xFilter(f.x, lm.x, timeMs),
          y: yFilter(f.y, lm.y, timeMs),
          z: zFilter(f.z, lm.z, timeMs),
        };
      });

    let vrm: VRM | null = null;
    let disposed = false;
    let lastVideoTime = -1;

    loadVRM(VRM_URL)
      .then((loaded) => {
        if (disposed) {
          VRMUtils.deepDispose(loaded.scene);
          return;
        }
        scene.add(loaded.scene);
        vrm = loaded;
        setVrmReady(true);
      })
      .catch((e) => {
        console.error("Failed to load VRM:", e);
        if (!disposed) setError(e as Error);
      });

    let raf = 0;
    const tick = () => {
      const delta = clock.getDelta();

      const video = poseVideoRef.current;
      const lm = landmarkerRef.current;
      if (lm && video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        const now = performance.now();
        const result = lm.detectForVideo(video, now);
        if (result.landmarks.length > 0 && vrm?.humanoid) {
          const smoothed = smooth(result.landmarks[0], now);

          updateHeadFromPose(smoothed, vrm);
          updateArm(smoothed, vrm, "left");
          updateArm(smoothed, vrm, "right");

          const debugCanvas = debugCanvasRef?.current;
          if (debugCanvas) drawPoseDebug(debugCanvas, video, smoothed, 0.5);
        } else {
          const debugCanvas = debugCanvasRef?.current;
          if (debugCanvas) drawPoseDebug(debugCanvas, video, null, 0.5);
        }
        lastVideoTime = video.currentTime;
      }

      vrm?.update(delta);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      renderer.dispose();
      setVrmReady(false);
    };
  }, [enabled, canvasRef, poseVideoRef, debugCanvasRef]);

  return { vrmReady, error };
};
