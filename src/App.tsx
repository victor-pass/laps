import { Accessor, Component, createSignal, Show, splitProps } from "solid-js";
import { Router, Route, Navigate, RouteSectionProps } from "@solidjs/router";
import { ApiClient } from "@/api";
import { QrScanner } from "@/scanner";
import { OfflineEngine } from "@/offline";
import { AppContext } from "@/context";
import { Laps } from "@/components/Laps";
import { ShowRaceQR } from "@/components/SelectedRaceQR";
import { Scan } from "@/components/Scan";
import { ChooseRace } from "@/components/ChooseRace";
import { Popup, PopupParams } from "./components/Popup";
import { Menu } from "@/components/Menu";

interface AppProps {
  api: ApiClient;
  scanner: QrScanner;
  offline: OfflineEngine;
  url?: string;
}

const Layout: (
  popup: Accessor<PopupParams | undefined>,
) => Component<RouteSectionProps> =
  (popup: Accessor<PopupParams | undefined>) => (props) => (
    <>
      <main>
        {props.children}
        <Show when={popup()}>
          <Popup {...popup()!} />
        </Show>
      </main>
      <footer>
        <Menu />
        <ChooseRace />
      </footer>
    </>
  );

export const App: Component<AppProps> = (props) => {
  const [get, set] = createSignal<PopupParams>();
  const popup = {
    set: (message?: PopupParams) => set(message),
  };
  const [context, _] = splitProps(props, ["api", "scanner", "offline"]);

  return (
    <AppContext.Provider value={{ ...context, popup }}>
      <Router url={props.url ?? ""} root={Layout(get)}>
        <Route path="/" component={() => <Navigate href="/scanFront" />} />
        <Route path="/scanFront" component={() => <Scan facing="user" />} />
        <Route
          path="/scanBack"
          component={() => <Scan facing="environment" />}
        />
        <Route path="/race" component={Laps} />
        <Route path="/race/qr" component={ShowRaceQR} />
      </Router>
    </AppContext.Provider>
  );
};

export const createApp = (props: AppProps) => <App {...props} />;
