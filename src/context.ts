import { createContext, useContext } from "solid-js";
import type { ApiClient } from "@/api";
import type { QrScanner } from "@/scanner";
import type { OfflineEngine } from "@/offline";
import { PopupParams } from "./components/Popup";

export interface AppContextValue {
  api: ApiClient;
  scanner: QrScanner;
  offline: OfflineEngine;
  popup: {
    set: (message?: PopupParams) => void;
  };
}

export const AppContext = createContext<AppContextValue>();

export function context(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("context must be used within AppContext");
  return value;
}
