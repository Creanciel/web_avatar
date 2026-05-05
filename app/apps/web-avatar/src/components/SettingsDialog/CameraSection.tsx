export interface CameraDeviceList {
  pose: MediaDeviceInfo[];
  background: MediaDeviceInfo[];
}

export interface CameraSelection {
  poseDeviceId: string | null;
  backgroundDeviceId: string | null;
}

interface CameraSectionProps {
  devices: CameraDeviceList;
  selection: CameraSelection;
  onSelectionChange: (next: CameraSelection) => void;
  mirror: boolean;
  onMirrorChange: (next: boolean) => void;
}

const renderOptions = (list: MediaDeviceInfo[]) =>
  list.map((d) => (
    <option key={d.deviceId} value={d.deviceId}>
      {d.label || `カメラ (${d.deviceId.slice(0, 6)}…)`}
    </option>
  ));

const CameraSection = ({
  devices,
  selection,
  onSelectionChange,
  mirror,
  onMirrorChange,
}: CameraSectionProps) => (
  <section className="flex flex-col gap-3">
    <h3 className="text-base font-semibold">カメラ</h3>

    <label className="flex flex-col gap-1 text-sm">
      <span>ポーズ用(内側カメラ)</span>
      <select
        className="px-2 py-1"
        value={selection.poseDeviceId ?? ""}
        onChange={(e) => onSelectionChange({ ...selection, poseDeviceId: e.target.value || null })}
      >
        <option value="">(自動)</option>
        {renderOptions(devices.pose)}
      </select>
    </label>

    <label className="flex flex-col gap-1 text-sm">
      <span>背景用(外側カメラ)</span>
      <select
        className="px-2 py-1"
        value={selection.backgroundDeviceId ?? ""}
        onChange={(e) =>
          onSelectionChange({ ...selection, backgroundDeviceId: e.target.value || null })
        }
      >
        <option value="">(自動)</option>
        {renderOptions(devices.background)}
      </select>
    </label>

    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={mirror} onChange={(e) => onMirrorChange(e.target.checked)} />
      <span>左右反転</span>
    </label>
  </section>
);

export default CameraSection;
