import { expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { ChooseRace } from "./ChooseRace";
import { TestContext } from "@/test/TestContext";
import { jsonResponse, mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("ChooseRace", () => {
  it("doesn't default to '+ New race...' while races are still loading", async () => {
    let resolveRaces!: (res: Response) => void;
    const $get = vi.fn(
      () => new Promise<Response>((resolve) => (resolveRaces = resolve)),
    );

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { $get } }}>
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    // races() hasn't resolved yet - the select must not default to
    // "+ New race..." here, since that selection wouldn't reset once
    // races load in.
    expect(chooseRace.selectedValue).not.toStrictEqual("➕ New");

    resolveRaces(jsonResponse([testRace({ id: uuid(1), name: "Spring 5k" })]));
    await waitFor(() => expect(chooseRace.options()).toContain("Spring 5k"));
    expect(chooseRace.selectedValue).not.toStrictEqual("➕ New");
  });

  it("shows the currently selected race as the initial value", async () => {
    const $get = mockJSONRequest([
      testRace({ id: uuid(1), name: "Spring 5k" }),
    ]);
    const selected$get = mockJSONRequest(
      testRace({ id: uuid(1), name: "Spring 5k" }),
    );

    const views = loadViews(
      render(() => (
        <TestContext
          api={{ races: { $get, selected: { $get: selected$get } } }}
        >
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() =>
      expect(chooseRace.selectedValue).toStrictEqual("Spring 5k"),
    );
  });

  it("lets the user pick a race they already belong to", async () => {
    const $get = mockJSONRequest([
      testRace({ id: uuid(1), name: "Spring 5k" }),
      testRace({ id: uuid(2), name: "Trail Run" }),
    ]);
    const join$post = mockJSONRequest(null);

    const views = loadViews(
      render(() => (
        <TestContext
          api={{ races: { $get, ":id": { join: { $post: join$post } } } }}
        >
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("Trail Run"));
    chooseRace.choose("Trail Run");

    expect(join$post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(2) },
      json: { updateDefault: true },
    });
  });

  it("switches to an inline text field to create a new race", async () => {
    const $get = mockJSONRequest([testRace({ name: "Spring 5k" })]);
    const $post = mockJSONRequest(null);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { $get, $post } }}>
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("➕ New"));
    chooseRace.choose("➕ New");

    const createRace = await views.createRace();
    createRace.setName("Fall 10k");
    createRace.submit();

    expect($post).toHaveBeenCalledExactlyOnceWith({
      json: { id: expect.any(String), name: "Fall 10k", updateDefault: true },
    });
    await waitFor(() => expect(chooseRace.isCreating).toBe(false));
    await waitFor(() => expect(chooseRace.options()).toContain("Fall 10k"));
  });

  it("returns to the select when creating is cancelled", async () => {
    const $get = mockJSONRequest([testRace({ name: "Spring 5k" })]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { $get } }}>
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("➕ New"));
    chooseRace.choose("➕ New");

    const createRace = await views.createRace();
    createRace.cancel();
    expect(chooseRace.isCreating).toBe(false);
  });

  it("selects a race optimistically even when the sync fails", async () => {
    const $get = mockJSONRequest([testRace({ id: uuid(1), name: "Spring 5k" })]);
    const join$post = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    const views = loadViews(
      render(() => (
        <TestContext
          api={{ races: { $get, ":id": { join: { $post: join$post } } } }}
        >
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("Spring 5k"));
    chooseRace.choose("Spring 5k");

    // A join that can't reach the server (or is rejected transiently) is
    // still selected locally and queued for retry - it never blocks or
    // reverts the UI.
    await waitFor(() =>
      expect(chooseRace.selectedValue).toStrictEqual("Spring 5k"),
    );
    expect(join$post).toHaveBeenCalledExactlyOnceWith({
      param: { id: uuid(1) },
      json: { updateDefault: true },
    });
  });
});
