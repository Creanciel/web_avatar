import { useEffect, useMemo, useRef, useState } from "react";
import AvatarCanvas from "./components/AvatarCanvas";
import BackgroundVideo from "./components/BackgroundVideo";
import IntroDialog from "./components/IntroDialog";
import LoadingOverlay from "./components/LoadingOverlay";
import SettingsDialog from "./components/SettingsDialog";
import Stage from "./components/Stage";
import TopBar from "./components/TopBar";
import { useAvatarRenderer } from "./hooks/useAvatarRenderer";
import { useCameras } from "./hooks/useCameras";
import { usePoseLandmarker } from "./hooks/usePoseLandmarker";
import { useSettings } from "./hooks/useSettings";

type AppPhase = "intro" | "requesting" | "loading" | "running" | "error";

const App = () => {
  const [phase, setPhase] = useState<AppPhase>("intro");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useSettings();

  const pipelineEnabled = phase === "requesting" || phase === "loading" || phase === "running";

  const {
    streams,
    devices,
    error: cameraError,
  } = useCameras({
    enabled: pipelineEnabled,
    poseDeviceId: settings.poseDeviceId,
    backgroundDeviceId: settings.backgroundDeviceId,
  });

  const { landmarker, error: landmarkerError } = usePoseLandmarker(pipelineEnabled);

  const poseVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const debug = window.location.search.includes("debug");

  useEffect(() => {
    const v = poseVideoRef.current;
    if (!v) return;
    v.srcObject = streams?.pose ?? null;
    if (streams?.pose) {
      void v.play().catch(() => {});
    }
  }, [streams]);

  const { vrmReady, error: rendererError } = useAvatarRenderer({
    canvasRef,
    poseVideoRef,
    debugCanvasRef,
    landmarker,
    mirror: settings.mirror,
    enabled: pipelineEnabled,
  });

  useEffect(() => {
    const err = cameraError ?? landmarkerError ?? rendererError;
    if (err) {
      console.error(err);
      setPhase("error");
    }
  }, [cameraError, landmarkerError, rendererError]);

  useEffect(() => {
    if (phase === "requesting" && streams) setPhase("loading");
  }, [phase, streams]);

  useEffect(() => {
    if (phase === "loading" && landmarker && vrmReady) setPhase("running");
  }, [phase, landmarker, vrmReady]);

  const loadingMessage = useMemo(() => {
    if (!streams) return "カメラを準備中…";
    if (!landmarker) return "モデルを読込中…";
    if (!vrmReady) return "アバターを読込中…";
    return "";
  }, [streams, landmarker, vrmReady]);

  return (
    <Stage>
      <BackgroundVideo stream={streams?.background ?? null} mirror={settings.mirror} />
      <AvatarCanvas ref={canvasRef} />
      <video ref={poseVideoRef} className="hidden" playsInline muted autoPlay />
      {debug && (
        <canvas
          ref={debugCanvasRef}
          className="absolute left-2 top-2 z-30 w-96 border border-white/40 opacity-90 pointer-events-none"
        />
      )}

      <TopBar onSettingsClick={() => setSettingsOpen(true)} />

      <IntroDialog open={phase === "intro"} onStart={() => setPhase("requesting")} />
      <LoadingOverlay
        open={phase === "requesting" || phase === "loading"}
        message={loadingMessage}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        devices={devices}
        selection={{
          poseDeviceId: settings.poseDeviceId,
          backgroundDeviceId: settings.backgroundDeviceId,
        }}
        onSelectionChange={(next) =>
          setSettings((prev) => ({
            ...prev,
            poseDeviceId: next.poseDeviceId,
            backgroundDeviceId: next.backgroundDeviceId,
          }))
        }
        mirror={settings.mirror}
        onMirrorChange={(v) => setSettings((prev) => ({ ...prev, mirror: v }))}
      />

      {phase === "running" && streams?.singleCameraFallback && (
        <div className="absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded bg-black/60 px-3 py-1 text-xs text-white">
          単カメラ動作中(背景・ポーズ共通)
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
          <p>カメラの起動に失敗しました</p>
          <button type="button" className="px-4 py-2" onClick={() => setPhase("intro")}>
            再試行
          </button>
        </div>
      )}
    </Stage>
  );
};

export default App;
