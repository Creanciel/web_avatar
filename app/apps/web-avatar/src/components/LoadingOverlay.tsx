import Spinner from "./Spinner";

interface LoadingOverlayProps {
  open: boolean;
  message: string;
}

const LoadingOverlay = ({ open, message }: LoadingOverlayProps) => {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
      <Spinner />
      <p className="text-sm">{message}</p>
    </div>
  );
};

export default LoadingOverlay;
