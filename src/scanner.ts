import jsQR from "jsqr";

export type CameraFacing = "user" | "environment";

export const CAMERA_RETRY_MS = 1000;

// getUserMedia failures that retrying can't fix: permission denied, no
// camera, or no camera matching the requested facing.
const PERMANENT_CAMERA_ERRORS = new Set([
  "NotAllowedError",
  "NotFoundError",
  "OverconstrainedError",
]);

function isPermanentCameraError(err: unknown) {
  return err instanceof DOMException && PERMANENT_CAMERA_ERRORS.has(err.name);
}

class Scanner implements QrScanner {
  session = 0;
  frame?: number;
  retry?: ReturnType<typeof setTimeout>;
  stream?: MediaStream;

  start = (
    video: HTMLVideoElement,
    onDecode: (text: string) => void,
    facing: CameraFacing = "environment",
  ) => {
    this.stop();
    const session = this.session;
    const current = () => session === this.session;
    const restart = () => {
      if (current()) this.start(video, onDecode, facing);
    };

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let frameErrorLogged = false;

    const tick = () => {
      if (!current()) return;
      try {
        if (video.paused) void video.play().catch(() => {});
        if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frameData.data, frameData.width, frameData.height);
          if (code) onDecode(code.data);
        }
      } catch (err) {
        if (!frameErrorLogged)
          console.error("Failed to decode camera frame:", err);
        frameErrorLogged = true;
      }
      this.frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing } })
      .then((mediaStream) => {
        if (!current()) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.stream = mediaStream;
        mediaStream
          .getTracks()
          .forEach((track) => track.addEventListener("ended", restart));
        video.srcObject = this.stream;
        video.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Failed to play camera:", err);
        });
        this.frame = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        console.error("Failed to start camera:", err);
        if (current() && !isPermanentCameraError(err))
          this.retry = setTimeout(restart, CAMERA_RETRY_MS);
      });
  };

  stop = () => {
    this.session++;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  };
}

export interface QrScanner {
  start(
    video: HTMLVideoElement,
    onDecode: (text: string) => void,
    facing?: CameraFacing,
  ): void;
  stop(): void;
}

export const browserScanner = new Scanner();
export const noopScanner: QrScanner = {
  start: () => {},
  stop: () => {},
};
