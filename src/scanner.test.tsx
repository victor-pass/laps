import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@solidjs/testing-library";
import QRCode from "qrcode";
import { browserScanner, CAMERA_RETRY_MS } from "@/scanner";

function cameraStream() {
  return document.createElement("canvas").captureStream();
}

async function qrStream(text: string) {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text);
  return canvas.captureStream();
}

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

  it("keeps decoding after a frame fails", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(
      await qrStream("runner-1"),
    );
    vi.spyOn(
      CanvasRenderingContext2D.prototype,
      "getImageData",
    ).mockImplementationOnce(() => {
      throw new DOMException("The source width is 0.", "IndexSizeError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onDecode = vi.fn();

    browserScanner.start(videoElement(), onDecode);

    await waitFor(() => expect(onDecode).toHaveBeenCalledWith("runner-1"));
  });

  it("reopens the camera when the OS takes it away", async () => {
    const lost = await qrStream("runner-1");
    const reopened = await qrStream("runner-2");
    const getUserMedia = vi
      .spyOn(navigator.mediaDevices, "getUserMedia")
      .mockResolvedValueOnce(lost)
      .mockResolvedValueOnce(reopened);
    const video = videoElement();
    const onDecode = vi.fn();

    browserScanner.start(video, onDecode, "user");
    await waitFor(() => expect(onDecode).toHaveBeenCalledWith("runner-1"));
    lost
      .getTracks()
      .forEach((track) => track.dispatchEvent(new Event("ended")));

    await waitFor(() => expect(onDecode).toHaveBeenCalledWith("runner-2"));
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: "user" },
    });
    expect(video.srcObject).toBe(reopened);
  });

  it("tries the camera again when it can't be opened yet", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia")
      .mockRejectedValueOnce(
        new DOMException("Could not start video source", "NotReadableError"),
      )
      .mockResolvedValueOnce(await qrStream("runner-1"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onDecode = vi.fn();

    browserScanner.start(videoElement(), onDecode);

    await waitFor(() => expect(onDecode).toHaveBeenCalledWith("runner-1"), {
      timeout: CAMERA_RETRY_MS * 3,
    });
  });

  it.each(["NotAllowedError", "NotFoundError", "OverconstrainedError"])(
    "doesn't retry the camera after %s",
    async (name) => {
      const getUserMedia = vi
        .spyOn(navigator.mediaDevices, "getUserMedia")
        .mockRejectedValue(new DOMException("no camera", name));
      vi.spyOn(console, "error").mockImplementation(() => {});

      browserScanner.start(videoElement(), () => {});
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, CAMERA_RETRY_MS * 1.5));

      expect(getUserMedia).toHaveBeenCalledTimes(1);
    },
  );

  it("logs a failing frame once, not every frame", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(
      await qrStream("runner-1"),
    );
    const getImageData = vi
      .spyOn(CanvasRenderingContext2D.prototype, "getImageData")
      .mockImplementation(() => {
        throw new DOMException("The source width is 0.", "IndexSizeError");
      });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    browserScanner.start(videoElement(), () => {});
    await waitFor(() =>
      expect(getImageData.mock.calls.length).toBeGreaterThan(2),
    );

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry the camera once stopped", async () => {
    const getUserMedia = vi
      .spyOn(navigator.mediaDevices, "getUserMedia")
      .mockRejectedValue(new DOMException("busy", "NotReadableError"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    browserScanner.start(videoElement(), () => {});
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    browserScanner.stop();
    await new Promise((r) => setTimeout(r, CAMERA_RETRY_MS * 1.5));

    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
