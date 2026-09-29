import { Accessor, Component, createSignal, Show } from "solid-js";
import { Router, Route, A, RouteSectionProps } from "@solidjs/router";
import { ApiClient } from "@/api";
import { QrScanner } from "@/scanner";
import { OfflineEngine } from "@/offline";
import { AppContext } from "@/context";
import { Laps } from "@/components/Laps";
import { ShowRaceQR } from "@/components/SelectedRaceQR";
import { Scan } from "@/components/Scan";
import { ChooseRace } from "@/components/ChooseRace";
import { Popup, PopupParams } from "./components/Popup";

interface AppProps {
  api: ApiClient;
  scanner: QrScanner;
  offline: OfflineEngine;
  url?: string;
}

const Layout: (
  popup: Accessor<PopupParams | undefined>,
) => Component<RouteSectionProps> = (
  popup: Accessor<PopupParams | undefined>,
) => {
  return (props) => (
    <>
      <main>
        {props.children}
        <Show when={popup()}>
          <Popup {...popup()!} />
        </Show>
      </main>
      <footer>
        <nav>
          <A href="/" end>
            Scan
          </A>
          <A href="/race" end>
            Summary
          </A>
          <A href="/race/qr">Share</A>
        </nav>
        <ChooseRace />
      </footer>
    </>
  );
};

export const App: Component<AppProps> = (props) => {
  const [get, set] = createSignal<PopupParams>();
  const popup = {
    set: (message?: PopupParams) => set(message),
  };

  return (
    <AppContext.Provider
      value={
        // eslint-disable-next-line solid/reactivity -- api/scanner/offline don't change
        { api: props.api, scanner: props.scanner, offline: props.offline, popup }
      }
    >
      <Router url={props.url ?? ""} root={Layout(get)}>
        <Route path="/" component={Scan} />
        <Route path="/race" component={Laps} />
        <Route path="/race/qr" component={ShowRaceQR} />
      </Router>
    </AppContext.Provider>
  );
};

export const createApp = (props: AppProps) => <App {...props} />;
