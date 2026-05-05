import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export interface Settings {
  poseDeviceId: string | null;
  backgroundDeviceId: string | null;
  mirror: boolean;
}

const STORAGE_KEY = "web-avatar.settings";
const DEFAULT_SETTINGS: Settings = {
  poseDeviceId: null,
  backgroundDeviceId: null,
  mirror: false,
};

const loadSettings = (): Settings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const useSettings = (): readonly [Settings, Dispatch<SetStateAction<Settings>>] => {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore quota / private mode errors
    }
  }, [settings]);

  return [settings, setSettings] as const;
};
