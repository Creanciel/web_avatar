import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useState } from "react";

const TASKS_VISION_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const POSE_LANDMARK_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

interface UsePoseLandmarkerResult {
  landmarker: PoseLandmarker | null;
  error: Error | null;
}

export const usePoseLandmarker = (enabled: boolean): UsePoseLandmarkerResult => {
  const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let instance: PoseLandmarker | null = null;

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_PATH);
        instance = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_LANDMARK_MODEL },
          runningMode: "VIDEO",
        });
        if (disposed) {
          instance.close();
          return;
        }
        setLandmarker(instance);
      } catch (e) {
        console.error("PoseLandmarker init failed:", e);
        if (!disposed) setError(e as Error);
      }
    })();

    return () => {
      disposed = true;
      instance?.close();
      setLandmarker(null);
    };
  }, [enabled]);

  return { landmarker, error };
};
