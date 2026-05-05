import { useEffect, useState } from "react";

export interface CameraStreams {
  pose: MediaStream;
  background: MediaStream;
  singleCameraFallback: boolean;
}

export interface CameraDevices {
  pose: MediaDeviceInfo[];
  background: MediaDeviceInfo[];
}

interface UseCamerasArgs {
  enabled: boolean;
  poseDeviceId: string | null;
  backgroundDeviceId: string | null;
}

interface UseCamerasResult {
  streams: CameraStreams | null;
  devices: CameraDevices;
  error: Error | null;
}

const HD_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
};

const isLikelyVirtual = (d: MediaDeviceInfo): boolean =>
  /obs|virtual|snap\s*camera|loopback|nvidia\s*broadcast|xsplit|droidcam/i.test(d.label);

const isLikelyUserFacing = (d: MediaDeviceInfo): boolean =>
  /front|user|内側|フロント|face/i.test(d.label);

const isLikelyEnvironmentFacing = (d: MediaDeviceInfo): boolean =>
  /back|rear|environment|背面|外側/i.test(d.label);

interface PickedCameras {
  pose: MediaDeviceInfo | null;
  background: MediaDeviceInfo | null;
}

const pickCameras = (
  all: MediaDeviceInfo[],
  poseId: string | null,
  bgId: string | null,
): PickedCameras => {
  if (all.length === 0) return { pose: null, background: null };

  const real = all.filter((d) => !isLikelyVirtual(d));
  const preferReal = real.length > 0 ? real : all;

  const pose: MediaDeviceInfo | null = (() => {
    if (poseId) {
      const found = all.find((d) => d.deviceId === poseId);
      if (found) return found;
    }
    return preferReal.find(isLikelyUserFacing) ?? preferReal[0] ?? null;
  })();

  const background: MediaDeviceInfo | null = (() => {
    if (bgId) {
      const found = all.find((d) => d.deviceId === bgId);
      if (found) return found;
    }
    const others = preferReal.filter((d) => d.deviceId !== pose?.deviceId);
    return others.find(isLikelyEnvironmentFacing) ?? others[0] ?? null;
  })();

  return { pose, background };
};

const acquireByDeviceId = async (
  deviceId: string,
  facingFallback: "user" | "environment",
): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, ...HD_CONSTRAINTS },
    });
  } catch (e) {
    console.warn(`Acquire by deviceId failed, falling back to facingMode=${facingFallback}:`, e);
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingFallback }, ...HD_CONSTRAINTS },
    });
  }
};

const enumerateInputs = async (): Promise<MediaDeviceInfo[]> => {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "videoinput");
};

export const useCameras = ({
  enabled,
  poseDeviceId,
  backgroundDeviceId,
}: UseCamerasArgs): UseCamerasResult => {
  const [streams, setStreams] = useState<CameraStreams | null>(null);
  const [devices, setDevices] = useState<CameraDevices>({ pose: [], background: [] });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    const acquired: MediaStream[] = [];

    const stopAll = () => {
      acquired.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      acquired.length = 0;
    };

    void (async () => {
      try {
        // 1. Bootstrap: trigger permission so enumerateDevices returns labels.
        const bootstrap = await navigator.mediaDevices.getUserMedia({ video: true });
        if (disposed) {
          bootstrap.getTracks().forEach((t) => t.stop());
          return;
        }

        // 2. Enumerate (now with labels) and pick distinct devices intelligently.
        const inputs = await enumerateInputs();
        const picked = pickCameras(inputs, poseDeviceId, backgroundDeviceId);

        console.info(
          "[useCameras] devices=",
          inputs.map((d) => ({ id: d.deviceId.slice(0, 8), label: d.label })),
          "picked=",
          { pose: picked.pose?.label, background: picked.background?.label },
        );

        bootstrap.getTracks().forEach((t) => t.stop());

        if (!picked.pose) throw new Error("利用可能なカメラが見つかりません");

        // 3. Acquire pose camera.
        const pose = await acquireByDeviceId(picked.pose.deviceId, "user");
        if (disposed) {
          pose.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired.push(pose);

        // 4. Acquire background camera (different device if possible).
        let background: MediaStream;
        let singleCameraFallback = false;
        if (picked.background && picked.background.deviceId !== picked.pose.deviceId) {
          try {
            background = await acquireByDeviceId(picked.background.deviceId, "environment");
            if (disposed) {
              background.getTracks().forEach((t) => t.stop());
              return;
            }
            acquired.push(background);
          } catch (e) {
            console.warn("Background camera acquisition failed, single-camera fallback:", e);
            background = pose;
            singleCameraFallback = true;
          }
        } else {
          background = pose;
          singleCameraFallback = true;
        }

        if (disposed) return;
        setDevices({ pose: inputs, background: inputs });
        setStreams({ pose, background, singleCameraFallback });
      } catch (e) {
        console.error("Camera acquisition failed:", e);
        if (!disposed) setError(e as Error);
      }
    })();

    return () => {
      disposed = true;
      stopAll();
      setStreams(null);
    };
  }, [enabled, poseDeviceId, backgroundDeviceId]);

  return { streams, devices, error };
};
