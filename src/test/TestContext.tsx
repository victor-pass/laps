import { Mock } from "vitest";

import { AppContext, AppContextValue } from "@/context";
import { ApiClient } from "@/api";
import { QrScanner, noopScanner } from "@/scanner";
import { OfflineEngine, createOfflineEngine, emptyState } from "@/offline";
import { splitProps, ParentComponent } from "solid-js";
import { mockJSONRequest } from "./fixtures";
import { Popups, createPopupService, PopupService } from "@/components/Popup";

type MockedApi<T> = { [K in keyof T]?: Mock };

type ApiOverrides = {
  races?: MockedApi<Pick<ApiClient["races"], "$get" | "$post">> & {
    selected?: MockedApi<Pick<ApiClient["races"]["selected"], "$get" | "$put">>;
    ":id"?: MockedApi<Pick<ApiClient["races"][":id"], "$get" | "$patch">> & {
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
  popup?: PopupService;
};

function testContext(overrides: AppContextOverrides): AppContextValue {
  const api = {
    races: {
      $get: overrides.api?.races?.$get ?? mockJSONRequest([]),
      $post: overrides.api?.races?.$post ?? mockJSONRequest(null),
      selected: {
        $get: overrides.api?.races?.selected?.$get ?? mockJSONRequest(null),
        $put: overrides.api?.races?.selected?.$put ?? mockJSONRequest(null),
      },
      ":id": {
        $get: overrides.api?.races?.[":id"]?.$get ?? mockJSONRequest(null),
        $patch: overrides.api?.races?.[":id"]?.$patch ?? mockJSONRequest(null),
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

  return {
    api,
    scanner: overrides.scanner ?? noopScanner,
    // A fresh, in-memory (non-localStorage) engine by default so tests
    // are isolated from each other; pass `offline` explicitly to seed a
    // selected race or assert on queued/synced state.
    offline: overrides.offline ?? createOfflineEngine(emptyState()),
    popup: overrides.popup ?? createPopupService(),
  };
}

export const TestContext: ParentComponent<AppContextOverrides> = (props) => {
  const [_, overrides] = splitProps(props, ["children"]);
  const context = testContext(overrides);

  return (
    <AppContext.Provider value={context}>
      {props.children}
      <Popups />
    </AppContext.Provider>
  );
};
