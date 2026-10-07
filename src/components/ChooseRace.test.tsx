import { expect, describe, it, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { ChooseRace } from "./ChooseRace";
import { TestContext } from "@/test/TestContext";
import { jsonResponse, mockJSONRequest, testRace, uuid } from "@/test/fixtures";
import { loadViews } from "@/test/Views/";

describe("ChooseRace", () => {
  it("shows 'Select a race' while races are still loading", async () => {
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
    expect(chooseRace.selectedValue).toStrictEqual("Select a race");

    resolveRaces(jsonResponse([testRace({ id: uuid(1), name: "Spring 5k" })]));
    await waitFor(() => expect(chooseRace.options()).toContain("Spring 5k"));
    expect(chooseRace.selectedValue).toStrictEqual("Select a race");
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
    expect(chooseRace.active()).toStrictEqual("Spring 5k");
  });

  it("lets the user pick a race they already belong to", async () => {
    const $get = mockJSONRequest([
      testRace({ id: uuid(1), name: "Spring 5k" }),
      testRace({ id: uuid(2), name: "Trail Run" }),
    ]);
    const select$put = mockJSONRequest(null);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { $get, selected: { $put: select$put } } }}>
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("Trail Run"));
    chooseRace.open();
    expect(chooseRace.isOpen).toBe(true);
    chooseRace.choose("Trail Run");

    expect(chooseRace.isOpen).toBe(false);
    await waitFor(() =>
      expect(chooseRace.selectedValue).toStrictEqual("Trail Run"),
    );

    // Already a member - this is a pure selection, so it goes through
    // PUT /races/selected, not a re-join.
    await waitFor(() =>
      expect(select$put).toHaveBeenCalledExactlyOnceWith({
        json: { id: uuid(2) },
      }),
    );
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
    await waitFor(() => expect(chooseRace.options()).toContain("New race"));
    chooseRace.choose("New race");

    const createRace = await views.createRace();
    createRace.setName("Fall 10k");
    createRace.submit();

    expect($post).toHaveBeenCalledExactlyOnceWith({
      json: { id: expect.any(String), name: "Fall 10k" },
    });
    await waitFor(() => expect(chooseRace.isCreating).toBe(false));
    await waitFor(() => expect(chooseRace.options()).toContain("Fall 10k"));
  });

  it("returns to the race chooser when creating is cancelled", async () => {
    const $get = mockJSONRequest([testRace({ name: "Spring 5k" })]);

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { $get } }}>
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("New race"));
    chooseRace.choose("New race");

    const createRace = await views.createRace();
    createRace.cancel();
    expect(chooseRace.isCreating).toBe(false);
  });

  it("selects a race optimistically even when the sync fails", async () => {
    const $get = mockJSONRequest([
      testRace({ id: uuid(1), name: "Spring 5k" }),
    ]);
    const select$put = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));

    const views = loadViews(
      render(() => (
        <TestContext api={{ races: { $get, selected: { $put: select$put } } }}>
          <ChooseRace />
        </TestContext>
      )),
    );

    const chooseRace = await views.chooseRace();
    await waitFor(() => expect(chooseRace.options()).toContain("Spring 5k"));
    chooseRace.choose("Spring 5k");

    // A selection that can't reach the server (or is rejected transiently)
    // is still applied locally and queued for retry - it never blocks or
    // reverts the UI.
    await waitFor(() =>
      expect(chooseRace.selectedValue).toStrictEqual("Spring 5k"),
    );
    await waitFor(() =>
      expect(select$put).toHaveBeenCalledExactlyOnceWith({
        json: { id: uuid(1) },
      }),
    );
  });
});
