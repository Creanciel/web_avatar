import { useEffect, useRef } from "react";

interface BackgroundVideoProps {
  stream: MediaStream | null;
  mirror?: boolean;
}

const BackgroundVideo = ({ stream, mirror = false }: BackgroundVideoProps) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      void video.play().catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ transform: mirror ? "scaleX(-1)" : undefined }}
      playsInline
      muted
      autoPlay
    />
  );
};

export default BackgroundVideo;
