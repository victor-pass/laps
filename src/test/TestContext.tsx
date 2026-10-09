import { Mock, vi } from "vitest";

import { AppContext, AppContextValue } from "@/context";
import { ApiClient } from "@/api";
import { QrScanner, noopScanner } from "@/scanner";
import { OfflineEngine, createOfflineEngine, emptyState } from "@/offline";
import { splitProps, ParentComponent } from "solid-js";
import { mockJSONRequest } from "./fixtures";
import { Popups, createPopupService, PopupService } from "@/components/Popup";

export const TEST_ORIGIN = "https://laps.test";

type MockedApi<T> = { [K in keyof T]?: Mock };

export type ApiOverrides = {
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
  deviceId?: string;
  origin?: string;
};

export function testApi(overrides: ApiOverrides = {}): ApiClient {
  return {
    races: {
      $get: overrides.races?.$get ?? mockJSONRequest([]),
      $post: overrides.races?.$post ?? mockJSONRequest(null),
      selected: {
        $get: overrides.races?.selected?.$get ?? mockJSONRequest(null),
        $put: overrides.races?.selected?.$put ?? mockJSONRequest(null),
      },
      ":id": {
        $get: overrides.races?.[":id"]?.$get ?? mockJSONRequest(null),
        $patch: overrides.races?.[":id"]?.$patch ?? mockJSONRequest(null),
        join: {
          $post: overrides.races?.[":id"]?.join?.$post ?? mockJSONRequest(null),
        },
        laps: {
          $get: overrides.races?.[":id"]?.laps?.$get ?? mockJSONRequest([]),
        },
        devices: {
          $get: overrides.races?.[":id"]?.devices?.$get ?? mockJSONRequest([]),
        },
      },
    },
    runners: {
      scan: {
        $post: overrides.runners?.scan?.$post ?? mockJSONRequest(null),
      },
    },
  } as unknown as ApiClient;
}

export function offlineApi(): ApiOverrides {
  const unreachable = () =>
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  return {
    races: {
      $get: unreachable(),
      $post: unreachable(),
      selected: { $get: unreachable(), $put: unreachable() },
      ":id": {
        $get: unreachable(),
        $patch: unreachable(),
        join: { $post: unreachable() },
        laps: { $get: unreachable() },
        devices: { $get: unreachable() },
      },
    },
    runners: { scan: { $post: unreachable() } },
  };
}

function testContext(overrides: AppContextOverrides): AppContextValue {
  return {
    api: testApi(overrides.api),
    scanner: overrides.scanner ?? noopScanner,
    offline: overrides.offline ?? createOfflineEngine(emptyState()),
    popup: overrides.popup ?? createPopupService(),
    deviceId: overrides.deviceId,
    origin: overrides.origin ?? TEST_ORIGIN,
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
