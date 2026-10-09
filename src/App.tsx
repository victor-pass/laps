import { Component, splitProps } from "solid-js";
import { Router, Route, Navigate, RouteSectionProps } from "@solidjs/router";
import { ApiClient } from "@/api";
import { QrScanner } from "@/scanner";
import { OfflineEngine } from "@/offline";
import { AppContext } from "@/context";
import { Summary } from "@/components/Summary";
import { ShowRaceQR } from "@/components/SelectedRaceQR";
import { Scan } from "@/components/Scan";
import { ChooseRace } from "@/components/ChooseRace";
import { Popups, createPopupService } from "@/components/Popup";
import { Menu } from "@/components/Menu";
import { JoinRace } from "@/components/JoinRace";

interface AppProps {
  api: ApiClient;
  scanner: QrScanner;
  offline: OfflineEngine;
  deviceId?: string;
  origin: string;
  url?: string;
}

const Layout: Component<RouteSectionProps> = (props) => (
  <>
    <main>
      {props.children}
      <Popups />
    </main>
    <footer>
      <Menu />
      <ChooseRace />
    </footer>
  </>
);

export const App: Component<AppProps> = (props) => {
  const [context, _] = splitProps(props, [
    "api",
    "scanner",
    "offline",
    "deviceId",
    "origin",
  ]);
  const popup = createPopupService();

  return (
    <AppContext.Provider value={{ ...context, popup }}>
      <Router url={props.url ?? ""} root={Layout}>
        <Route path="/" component={() => <Navigate href="/scanFront" />} />
        <Route path="/scanFront" component={() => <Scan facing="user" />} />
        <Route
          path="/scanBack"
          component={() => <Scan facing="environment" />}
        />
        <Route path="/summary" component={Summary} />
        <Route path="/share" component={ShowRaceQR} />
        <Route path="/join/:id" component={JoinRace} />
      </Router>
    </AppContext.Provider>
  );
};

export const createApp = (props: AppProps) => <App {...props} />;
