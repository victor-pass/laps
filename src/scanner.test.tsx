import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@solidjs/testing-library";
import { browserScanner } from "@/scanner";

// A real MediaStream (rather than a plain object) so it can be assigned to
// video.srcObject and its tracks report "ended" once stopped.
function cameraStream() {
  return document.createElement("canvas").captureStream();
}

// Muted like Scan's <video>, which is what lets play() autostart.
function videoElement() {
  const video = document.createElement("video");
  video.muted = true;
  return video;
}

const ended = (stream: MediaStream) =>
  stream.getTracks().every((track) => track.readyState === "ended");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("browserScanner", () => {
  afterEach(() => {
    browserScanner.stop();
    vi.restoreAllMocks();
  });

  it("requests the camera facing the given direction", async () => {
    const getUserMedia = vi
      .spyOn(navigator.mediaDevices, "getUserMedia")
      .mockResolvedValue(cameraStream());

    browserScanner.start(videoElement(), () => {}, "user");

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: "user" },
      }),
    );
  });

  it("stop turns the camera off", async () => {
    const stream = cameraStream();
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
    const video = videoElement();

    browserScanner.start(video, () => {});
    await waitFor(() => expect(video.srcObject).toBe(stream));
    browserScanner.stop();

    expect(ended(stream)).toBe(true);
  });

  it("starting again turns the previous camera off", async () => {
    const back = cameraStream();
    const front = cameraStream();
    vi.spyOn(navigator.mediaDevices, "getUserMedia")
      .mockResolvedValueOnce(back)
      .mockResolvedValueOnce(front);
    const video = videoElement();

    browserScanner.start(video, () => {}, "environment");
    await waitFor(() => expect(video.srcObject).toBe(back));
    browserScanner.start(video, () => {}, "user");
    await waitFor(() => expect(video.srcObject).toBe(front));

    expect(ended(back)).toBe(true);
    expect(ended(front)).toBe(false);
  });

  it("discards a camera that opens after switching to another", async () => {
    // Back is still waiting on permission/hardware when the user switches
    // to front, and only arrives afterwards.
    const back = cameraStream();
    const front = cameraStream();
    const slowBack = deferred<MediaStream>();
    vi.spyOn(navigator.mediaDevices, "getUserMedia")
      .mockReturnValueOnce(slowBack.promise)
      .mockResolvedValueOnce(front);
    const backVideo = videoElement();
    const frontVideo = videoElement();

    browserScanner.start(backVideo, () => {}, "environment");
    browserScanner.start(frontVideo, () => {}, "user");
    await waitFor(() => expect(frontVideo.srcObject).toBe(front));
    slowBack.resolve(back);

    await waitFor(() => expect(ended(back)).toBe(true));
    expect(backVideo.srcObject).toBeNull();
    expect(ended(front)).toBe(false);
  });
});
