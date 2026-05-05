import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Quaternion, Vector3 } from "three";

const VISIBILITY_THRESHOLD = 0.5;

const L = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
} as const;

const Y_UP = new Vector3(0, 1, 0);
const X_PLUS = new Vector3(1, 0, 0);
const X_MINUS = new Vector3(-1, 0, 0);

const toV3 = (lm: NormalizedLandmark): Vector3 => new Vector3(lm.x - 0.5, -(lm.y - 0.5), -lm.z);

const midpoint = (a: Vector3, b: Vector3): Vector3 =>
  new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);

const isVisible = (lm: NormalizedLandmark | undefined): boolean =>
  !!lm && (lm.visibility ?? 0) >= VISIBILITY_THRESHOLD;

const getPos = (lms: NormalizedLandmark[], i: number): Vector3 | null =>
  isVisible(lms[i]) ? toV3(lms[i]) : null;

const computeChild = (
  origin: Vector3 | null,
  target: Vector3 | null,
  rest: Vector3,
  parentWorld: Quaternion | null,
): Quaternion | null => {
  if (!origin || !target) return null;
  const dir = target.clone().sub(origin).normalize();
  const worldQ = new Quaternion().setFromUnitVectors(rest, dir);
  return parentWorld ? parentWorld.clone().invert().multiply(worldQ) : worldQ;
};

const swapMirrored = (lms: NormalizedLandmark[]): NormalizedLandmark[] => {
  const flipped = lms.map((lm) => ({ ...lm, x: 1 - lm.x }));
  const result = [...flipped];
  const pairs: [number, number][] = [
    [L.L_SHOULDER, L.R_SHOULDER],
    [L.L_ELBOW, L.R_ELBOW],
    [L.L_WRIST, L.R_WRIST],
    [L.L_HIP, L.R_HIP],
  ];
  for (const [a, b] of pairs) {
    [result[a], result[b]] = [result[b], result[a]];
  }
  return result;
};

export type BoneRotations = Partial<Record<VRMHumanBoneName, Quaternion>>;

export interface PoseToBoneOptions {
  mirror?: boolean;
}

export const landmarksToBoneRotations = (
  landmarks: NormalizedLandmark[],
  options: PoseToBoneOptions = {},
): BoneRotations => {
  if (landmarks.length < 25) return {};

  const lms = options.mirror ? swapMirrored(landmarks) : landmarks;
  const out: BoneRotations = {};

  const lShoulder = getPos(lms, L.L_SHOULDER);
  const rShoulder = getPos(lms, L.R_SHOULDER);
  const lHip = getPos(lms, L.L_HIP);
  const rHip = getPos(lms, L.R_HIP);

  let spineWorld: Quaternion | null = null;

  if (lShoulder && rShoulder && lHip && rHip) {
    const hipMid = midpoint(lHip, rHip);
    const shoulderMid = midpoint(lShoulder, rShoulder);
    const torsoDir = shoulderMid.clone().sub(hipMid).normalize();
    const fullTorso = new Quaternion().setFromUnitVectors(Y_UP, torsoDir);

    const spineLocal = new Quaternion().slerp(fullTorso, 0.6);
    const chestLocal = spineLocal.clone().invert().multiply(fullTorso);

    out[VRMHumanBoneName.Spine] = spineLocal;
    out[VRMHumanBoneName.Chest] = chestLocal;
    spineWorld = fullTorso;
  }

  if (lShoulder && rShoulder && isVisible(lms[L.NOSE])) {
    const shoulderMid = midpoint(lShoulder, rShoulder);
    const nose = toV3(lms[L.NOSE]);
    const neckLocal = computeChild(shoulderMid, nose, Y_UP, spineWorld);
    if (neckLocal) out[VRMHumanBoneName.Neck] = neckLocal;
  }

  const lElbow = getPos(lms, L.L_ELBOW);
  const rElbow = getPos(lms, L.R_ELBOW);
  const lWrist = getPos(lms, L.L_WRIST);
  const rWrist = getPos(lms, L.R_WRIST);

  // VRM 0.x (rotateVRM0 適用後) のシーンローカル系では character は依然 +Z 向き。
  // よって leftUpperArm の rest direction は -X、rightUpperArm の rest direction は +X。
  const lUpperLocal = computeChild(lShoulder, lElbow, X_MINUS, spineWorld);
  if (lUpperLocal) out[VRMHumanBoneName.LeftUpperArm] = lUpperLocal;
  const lUpperWorld =
    lUpperLocal && spineWorld ? spineWorld.clone().multiply(lUpperLocal) : lUpperLocal;

  const rUpperLocal = computeChild(rShoulder, rElbow, X_PLUS, spineWorld);
  if (rUpperLocal) out[VRMHumanBoneName.RightUpperArm] = rUpperLocal;
  const rUpperWorld =
    rUpperLocal && spineWorld ? spineWorld.clone().multiply(rUpperLocal) : rUpperLocal;

  const lLowerLocal = computeChild(lElbow, lWrist, X_MINUS, lUpperWorld);
  if (lLowerLocal) out[VRMHumanBoneName.LeftLowerArm] = lLowerLocal;

  const rLowerLocal = computeChild(rElbow, rWrist, X_PLUS, rUpperWorld);
  if (rLowerLocal) out[VRMHumanBoneName.RightLowerArm] = rLowerLocal;

  return out;
};
