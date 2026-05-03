import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createOneEuroFilter,
  createOneEuroState,
  type OneEuroParams,
  type OneEuroState,
} from "./oneEuroFilter";

const TASKS_VISION_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const CANVAS_SIZE = 512;
const POSE_LANDMARK_MODEL = {
  LITE: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  FULL: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  HEAVY:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
} as const;

const VISIBILITY_THRESHOLD = 0.5;
const CONNECTOR_LINE_WIDTH = 4;
const CONNECTOR_COLOR = "#00FF00";
const LANDMARK_LINE_WIDTH = 2;
const LANDMARK_COLOR = "#FF0000";

interface LandmarkFilters {
  x: OneEuroState;
  y: OneEuroState;
  z: OneEuroState;
}

const renderFrame = (
  ctx: CanvasRenderingContext2D,
  _video: HTMLVideoElement,
  poses: NormalizedLandmark[][],
  drawingUtils: DrawingUtils,
): void => {
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height); // for debugging

  for (const landmarks of poses) {
    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: CONNECTOR_COLOR,
      lineWidth: (data) => {
        const fromV = data.from?.visibility ?? 0;
        const toV = data.to?.visibility ?? 0;
        const hidden = fromV < VISIBILITY_THRESHOLD || toV < VISIBILITY_THRESHOLD;
        return hidden ? 0 : CONNECTOR_LINE_WIDTH;
      },
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: LANDMARK_COLOR,
      lineWidth: LANDMARK_LINE_WIDTH,
    });
  }

  ctx.restore();
};

const createLandmarkSmoother = (params: OneEuroParams) => {
  const filter = createOneEuroFilter(params);
  const filtersByPose: LandmarkFilters[][] = [];

  return (poses: NormalizedLandmark[][], timeMs: number): NormalizedLandmark[][] =>
    poses.map((landmarks, pi) => {
      let perPose = filtersByPose[pi];
      if (!perPose) {
        perPose = landmarks.map(() => ({
          x: createOneEuroState(),
          y: createOneEuroState(),
          z: createOneEuroState(),
        }));
        filtersByPose[pi] = perPose;
      }
      return landmarks.map((lm, i) => ({
        ...lm,
        x: filter(perPose[i].x, lm.x, timeMs),
        y: filter(perPose[i].y, lm.y, timeMs),
        z: filter(perPose[i].z, lm.z, timeMs),
      }));
    });
};

const createDetectLoop = (
  poseLandmarker: PoseLandmarker,
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  drawingUtils: DrawingUtils,
): (() => void) => {
  let lastVideoTime = -1;
  const smooth = createLandmarkSmoother({
    minCutoff: 1.0,
    beta: 10,
    dCutoff: 1.0,
  });
  return () => {
    if (video.currentTime === lastVideoTime) return;
    const now = performance.now();
    const result = poseLandmarker.detectForVideo(video, now);
    const smoothed = smooth(result.landmarks, now);
    renderFrame(ctx, video, smoothed, drawingUtils);
    lastVideoTime = video.currentTime;
  };
};

interface PoseSession {
  poseLandmarker: PoseLandmarker;
  stream: MediaStream;
  loop: () => void;
}

const startPoseSession = async (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  isDisposed: () => boolean,
): Promise<PoseSession | null> => {
  const poseLandmarker: PoseLandmarker = await (async () => {
    const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_PATH);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_LANDMARK_MODEL.FULL },
      runningMode: "VIDEO",
    });
  })();

  if (isDisposed()) {
    poseLandmarker.close();
    return null;
  }

  const stream: MediaStream = await (async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
    } catch (e) {
      if ((e as Error).name === "OverconstrainedError") {
        return navigator.mediaDevices.getUserMedia({ video: true });
      }
      throw e;
    }
  })();

  const abort = () => {
    stream.getTracks().forEach((t) => t.stop());
    poseLandmarker.close();
  };

  if (isDisposed()) {
    abort();
    return null;
  }

  video.srcObject = stream;
  await video.play();

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    abort();
    return null;
  }

  const drawingUtils = new DrawingUtils(ctx);
  const loop = createDetectLoop(poseLandmarker, video, ctx, drawingUtils);

  return { poseLandmarker, stream, loop };
};

const usePoseLandmarker = (
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onError?: (e: unknown) => void,
) => {
  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let disposed = false;
    const isDisposed = () => disposed;
    let cleanup = () => {};

    startPoseSession(video, canvas, isDisposed)
      .then((session) => {
        if (!session) return;
        const dispose = () => {
          session.stream.getTracks().forEach((t) => t.stop());
          session.poseLandmarker.close();
        };
        if (disposed) {
          dispose();
          return;
        }

        let rafId = 0;
        const tick = () => {
          if (isDisposed()) return;
          session.loop();
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        cleanup = () => {
          cancelAnimationFrame(rafId);
          dispose();
        };
      })
      .catch((e) => {
        console.error("pose init failed:", e);
        onError?.(e);
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [enabled]);
};

const Canvas = () => {
  const refVideo = useRef<HTMLVideoElement>(null);
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(true);

  usePoseLandmarker(refVideo, refCanvas, started, () => {
    setStarted(false);
  });

  return (
    <div className="size-full border">
      <video ref={refVideo} className="hidden" playsInline muted autoPlay></video>
      <canvas
        ref={refCanvas}
        className="size-full"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
      ></canvas>
    </div>
  );
};

export default Canvas;
