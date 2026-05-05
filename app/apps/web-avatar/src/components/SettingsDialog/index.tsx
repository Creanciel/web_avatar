import Dialog from "../Dialog";
import CameraSection, { type CameraDeviceList, type CameraSelection } from "./CameraSection";
import LicenseSection from "./LicenseSection";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  devices: CameraDeviceList;
  selection: CameraSelection;
  onSelectionChange: (next: CameraSelection) => void;
  mirror: boolean;
  onMirrorChange: (next: boolean) => void;
}

const SettingsDialog = ({
  open,
  onClose,
  devices,
  selection,
  onSelectionChange,
  mirror,
  onMirrorChange,
}: SettingsDialogProps) => (
  <Dialog open={open} onClose={onClose} title="設定">
    <div className="flex flex-col gap-6">
      <CameraSection
        devices={devices}
        selection={selection}
        onSelectionChange={onSelectionChange}
        mirror={mirror}
        onMirrorChange={onMirrorChange}
      />
      <LicenseSection />
      <button type="button" className="px-4 py-2" onClick={onClose}>
        閉じる
      </button>
    </div>
  </Dialog>
);

export default SettingsDialog;
