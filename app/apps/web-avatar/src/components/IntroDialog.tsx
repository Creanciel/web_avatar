import Dialog from "./Dialog";

interface IntroDialogProps {
  open: boolean;
  onStart: () => void;
}

const IntroDialog = ({ open, onStart }: IntroDialogProps) => (
  <Dialog open={open} onClose={() => {}} title="カメラを使用します">
    <p className="mb-4 text-sm leading-relaxed">
      あなたの動きを VRM アバターに反映するため、内側カメラと外側カメラの使用を許可してください。
    </p>
    <button type="button" className="w-full px-4 py-2" onClick={onStart}>
      開始する
    </button>
  </Dialog>
);

export default IntroDialog;
