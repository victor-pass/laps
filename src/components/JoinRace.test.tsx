import { expect, describe, it, Mock, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import { JoinRace } from "./JoinRace";
import { TestContext } from "@/test/TestContext";
import { createOfflineEngine, emptyState } from "@/offline";
import { mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

function renderJoin(
  path: string,
  api: { $get: Mock; join$post?: Mock; select$put?: Mock },
) {
  const history = createMemoryHistory();
  history.set({ value: path });
  const offline = createOfflineEngine(emptyState());
  const views = loadViews(
    render(() => (
      <TestContext
        offline={offline}
        api={{
          races: {
            ":id": {
              $get: api.$get,
              join: { $post: api.join$post ?? mockJSONRequest(null) },
            },
            selected: { $put: api.select$put ?? mockJSONRequest(null) },
          },
        }}
      >
        <MemoryRouter history={history}>
          <Route path="/join/:id" component={JoinRace} />
          <Route path="/" component={() => <p class="home" />} />
        </MemoryRouter>
      </TestContext>
    )),
  );
  return { views, history, offline };
}

describe("JoinRace", () => {
  it("joins and selects the linked race once confirmed, then starts scanning", async () => {
    const $get = mockJSONRequest(testRace({ id: uuid(3), name: "Trail Run" }));
    const join$post = mockJSONRequest(null);
    const select$put = mockJSONRequest(null);
    const { views, history, offline } = renderJoin(`/join/${uuid(3)}`, {
      $get,
      join$post,
      select$put,
    });

    const confirmRace = await views.confirmRace();
    expect($get).toHaveBeenCalledExactlyOnceWith({ param: { id: uuid(3) } });
    expect(confirmRace.message()).toStrictEqual('Join race "Trail Run"?');
    expect(confirmRace.confirmLabel()).toStrictEqual("Join");
    expect(join$post).not.toHaveBeenCalled();

    confirmRace.confirm();

    const popup = await views.popup();
    expect(popup.message()).toStrictEqual("Joined Trail Run");
    expect(join$post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(3) },
    });
    await waitFor(() =>
      expect(select$put).toHaveBeenCalledExactlyOnceWith({
        json: { id: uuid(3) },
      }),
    );
    expect(offline.state().selectedRace?.id).toStrictEqual(uuid(3));
    await waitFor(() => expect(history.get()).toStrictEqual("/"));
  });

  it("leaves without joining when cancelled", async () => {
    const join$post = mockJSONRequest(null);
    const { views, history } = renderJoin(`/join/${uuid(3)}`, {
      $get: mockJSONRequest(testRace({ id: uuid(3) })),
      join$post,
    });

    (await views.confirmRace()).cancel();

    await waitFor(() => expect(history.get()).toStrictEqual("/"));
    expect(join$post).not.toHaveBeenCalled();
  });

  it("joins using the link's name when the server can't be reached", async () => {
    const offlineError = vi.fn().mockRejectedValue(new TypeError("offline"));
    const { views, history, offline } = renderJoin(
      `/join/${uuid(4)}?name=Trail+Run`,
      { $get: offlineError, join$post: offlineError, select$put: offlineError },
    );

    const confirmRace = await views.confirmRace();
    expect(confirmRace.message()).toStrictEqual('Join race "Trail Run"?');

    confirmRace.confirm();

    await waitFor(() => expect(history.get()).toStrictEqual("/"));
    expect(offline.state().selectedRace).toMatchObject({
      id: uuid(4),
      name: "Trail Run",
    });
    expect(offline.pendingCount()).toBeGreaterThan(0);
  });

  it("explains when the linked race doesn't exist", async () => {
    const $get = notFoundRequest();
    const { views } = renderJoin(`/join/${uuid(9)}?name=Ghost`, { $get });

    const joinRace = await views.joinRace();
    await waitFor(() =>
      expect(joinRace.text).toStrictEqual("Race not found. Start scanning"),
    );
  });
});

function notFoundRequest(): Mock {
  return mockJSONRequest(null).mockImplementation(
    async () => new Response("Race not found", { status: 404 }),
  );
}
