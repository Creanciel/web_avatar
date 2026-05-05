import type { ReactNode } from "react";

interface StageProps {
  children: ReactNode;
}

const Stage = ({ children }: StageProps) => (
  <div className="flex h-screen w-screen items-center justify-center bg-black">
    <div className="relative aspect-[9/16] h-full max-h-screen max-w-screen overflow-hidden bg-neutral-900">
      {children}
    </div>
  </div>
);

export default Stage;
