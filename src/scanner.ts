import jsQR from "jsqr";

export type CameraFacing = "user" | "environment";

class Scanner implements QrScanner {
  // Bumped on every start/stop so a getUserMedia or animation frame from a
  // previous session (e.g. the front camera, before switching to the back)
  // can tell it's stale and must not attach or keep decoding.
  session = 0;
  frame?: number;
  stream?: MediaStream;

  start = (
    video: HTMLVideoElement,
    onDecode: (text: string) => void,
    facing: CameraFacing = "environment",
  ) => {
    this.stop();
    const session = this.session;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (session !== this.session) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frameData.data, frameData.width, frameData.height);
        if (code) onDecode(code.data);
      }
      this.frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing } })
      .then((mediaStream) => {
        if (session !== this.session) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.stream = mediaStream;
        video.srcObject = this.stream;
        video.play().catch((err: unknown) => {
          // A restart on the same <video> (camera switch, resuming after a
          // race prompt) replaces srcObject, which aborts the pending play.
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Failed to play camera:", err);
        });
        this.frame = requestAnimationFrame(tick);
      })
      .catch((err: unknown) => {
        console.error("Failed to start camera:", err);
      });
  };

  stop = () => {
    this.session++;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = undefined;
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
