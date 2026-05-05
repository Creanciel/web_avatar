import GearIcon from "./GearIcon";

interface TopBarProps {
  onSettingsClick: () => void;
}

const TopBar = ({ onSettingsClick }: TopBarProps) => (
  <div className="absolute right-2 top-2 z-30">
    <button
      type="button"
      aria-label="設定"
      className="px-2 py-2 text-white"
      onClick={onSettingsClick}
    >
      <GearIcon />
    </button>
  </div>
);

export default TopBar;
