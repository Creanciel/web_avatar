export interface LicenseEntry {
  name: string;
  license: string;
  url?: string;
}

export const LICENSES: LicenseEntry[] = [
  {
    name: "VRM モデル: AliciaSolid",
    license: "VRoid Hub 利用規約に従う",
    url: "https://hub.vroid.com/",
  },
  {
    name: "@pixiv/three-vrm",
    license: "MIT",
    url: "https://github.com/pixiv/three-vrm",
  },
  { name: "three.js", license: "MIT", url: "https://github.com/mrdoob/three.js" },
  {
    name: "@mediapipe/tasks-vision",
    license: "Apache-2.0",
    url: "https://github.com/google/mediapipe",
  },
  {
    name: "PoseLandmarker model",
    license: "Google MediaPipe Models",
    url: "https://developers.google.com/mediapipe/solutions/vision/pose_landmarker",
  },
  { name: "React", license: "MIT", url: "https://github.com/facebook/react" },
  {
    name: "Tailwind CSS",
    license: "MIT",
    url: "https://github.com/tailwindlabs/tailwindcss",
  },
];
