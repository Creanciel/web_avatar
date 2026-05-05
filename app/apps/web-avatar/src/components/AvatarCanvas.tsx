import type { Ref } from "react";

interface AvatarCanvasProps {
  ref?: Ref<HTMLCanvasElement>;
}

const AVATAR_CANVAS_SIZE = 512;

const AvatarCanvas = ({ ref }: AvatarCanvasProps) => (
  <div className="absolute bottom-0 left-0 right-0 aspect-square w-full">
    <canvas
      ref={ref}
      className="h-full w-full"
      width={AVATAR_CANVAS_SIZE}
      height={AVATAR_CANVAS_SIZE}
    />
  </div>
);

export default AvatarCanvas;
