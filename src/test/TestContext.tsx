import { Mock } from "vitest";

import { AppContext, AppContextValue } from "@/context";
import { ApiClient } from "@/api";
import { QrScanner, noopScanner } from "@/scanner";
import { OfflineEngine, createOfflineEngine, emptyState } from "@/offline";
import {
  Accessor,
  createSignal,
  Show,
  splitProps,
  ParentComponent,
} from "solid-js";
import { mockJSONRequest } from "./fixtures";
import { Popup, PopupParams } from "@/components/Popup";

type MockedApi<T> = { [K in keyof T]?: Mock };

type ApiOverrides = {
  races?: MockedApi<Pick<ApiClient["races"], "$get" | "$post">> & {
    selected?: MockedApi<ApiClient["races"]["selected"]>;
    ":id"?: MockedApi<Pick<ApiClient["races"][":id"], "$get">> & {
      join?: MockedApi<ApiClient["races"][":id"]["join"]>;
      laps?: MockedApi<ApiClient["races"][":id"]["laps"]>;
      devices?: MockedApi<ApiClient["races"][":id"]["devices"]>;
    };
  };
  runners?: {
    scan?: MockedApi<ApiClient["runners"]["scan"]>;
  };
};

export type AppContextOverrides = {
  api?: ApiOverrides;
  scanner?: QrScanner;
  offline?: OfflineEngine;
  popup?: {
    set: (message?: PopupParams) => void;
  };
};

function testContext(
  overrides: AppContextOverrides,
): [AppContextValue, Accessor<PopupParams | undefined>] {
  const api = {
    races: {
      $get: overrides.api?.races?.$get ?? mockJSONRequest([]),
      $post: overrides.api?.races?.$post ?? mockJSONRequest(null),
      selected: {
        $get: overrides.api?.races?.selected?.$get ?? mockJSONRequest(null),
      },
      ":id": {
        $get: overrides.api?.races?.[":id"]?.$get ?? mockJSONRequest(null),
        join: {
          $post:
            overrides.api?.races?.[":id"]?.join?.$post ?? mockJSONRequest(null),
        },
        laps: {
          $get: overrides.api?.races?.[":id"]?.laps?.$get ?? mockJSONRequest([]),
        },
        devices: {
          $get:
            overrides.api?.races?.[":id"]?.devices?.$get ?? mockJSONRequest([]),
        },
      },
    },
    runners: {
      scan: {
        $post: overrides.api?.runners?.scan?.$post ?? mockJSONRequest(null),
      },
    },
  } as unknown as ApiClient;

  const [getPopup, setPopup] = createSignal<PopupParams>();
  const popup = {
    set: (message?: PopupParams) => setPopup(message),
  };

  return [
    {
      api,
      scanner: overrides.scanner ?? noopScanner,
      // A fresh, in-memory (non-localStorage) engine by default so tests
      // are isolated from each other; pass `offline` explicitly to seed a
      // selected race or assert on queued/synced state.
      offline: overrides.offline ?? createOfflineEngine(emptyState()),
      popup,
    },
    getPopup,
  ];
}

export const TestContext: ParentComponent<AppContextOverrides> = (props) => {
  const [_, overrides] = splitProps(props, ["children"]);
  const [context, popup] = testContext(overrides);

  return (
    <AppContext.Provider value={context}>
      {props.children}
      <Show when={popup()}>{(message) => <Popup {...message()} />}</Show>
    </AppContext.Provider>
  );
};
