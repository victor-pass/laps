import { createContext, useContext } from "solid-js";
import type { ApiClient } from "@/api";
import type { QrScanner } from "@/scanner";
import type { OfflineEngine } from "@/offline";
import { type PopupService } from "./components/Popup";

export interface AppContextValue {
  api: ApiClient;
  scanner: QrScanner;
  offline: OfflineEngine;
  popup: PopupService;
  // This browser's id from getDeviceId(). Absent during SSR, which can't
  // know which device is asking.
  deviceId?: string;
}

export const AppContext = createContext<AppContextValue>();

export function context(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("context must be used within AppContext");
  return value;
}
