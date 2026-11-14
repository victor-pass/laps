import QRCode from "qrcode";
import type { QrScanner } from "@/scanner";

interface DemoScannerOptions {
  racerVideo?: string;
  scanAt: number;
  cropPosition: string;
  cropZoom: number;
  payload: string;
  beforeDecode: () => void;
}

export function createDemoScanner(options: DemoScannerOptions): QrScanner {
  let session = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let videoElement: HTMLVideoElement | undefined;
  let mediaStream: MediaStream | undefined;
  let delivered = false;

  const stop = () => {
    session++;
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (videoElement) {
      videoElement.removeEventListener("timeupdate", checkCue);
      videoElement.removeEventListener("ended", scanAtEnd);
      videoElement.pause();
      videoElement.srcObject = null;
      videoElement.removeAttribute("src");
      videoElement.load();
    }
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = undefined;
    videoElement = undefined;
  };

  const deliver = (onDecode: (text: string) => void, current: number) => {
    if (current !== session || delivered) return;
    delivered = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    options.beforeDecode();
    onDecode(options.payload);
  };

  function checkCue(event: Event) {
    const video = event.currentTarget as HTMLVideoElement;
    if (video.currentTime >= options.scanAt) {
      video.removeEventListener("timeupdate", checkCue);
      video.removeEventListener("ended", scanAtEnd);
      deliver(currentDecode!, currentSession);
    }
  }

  function scanAtEnd() {
    deliver(currentDecode!, currentSession);
  }

  let currentDecode: ((text: string) => void) | undefined;
  let currentSession = 0;

  const start: QrScanner["start"] = (video, onDecode) => {
    stop();
    videoElement = video;
    currentDecode = onDecode;
    currentSession = session;
    const current = session;
    delivered = false;

    video.muted = true;
    video.playsInline = true;
    video.loop = false;
    video.style.objectPosition = options.cropPosition;
    video.style.transform = `scale(${options.cropZoom})`;

    if (options.racerVideo) {
      video.src = options.racerVideo;
      video.addEventListener("timeupdate", checkCue);
      video.addEventListener("ended", scanAtEnd, { once: true });
      timer = setTimeout(
        () => deliver(onDecode, current),
        Math.max(12_000, (options.scanAt + 8) * 1_000),
      );
      void video.play().catch((error: unknown) => {
        console.error("Could not play the racer video:", error);
      });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#18252c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.font = "bold 34px system-ui";
    context.textAlign = "center";
    context.fillText("DEMO RACER", canvas.width / 2, 190);

    const qr = new Image();
    qr.onload = () => {
      if (current !== session) return;
      const size = 480;
      context!.fillStyle = "white";
      context!.fillRect((canvas.width - size) / 2, 300, size, size);
      context!.drawImage(qr, (canvas.width - size) / 2, 300, size, size);
      context!.fillStyle = "#fff";
      context!.font = "bold 42px system-ui";
      context!.fillText("CALEB · FINISH", canvas.width / 2, 900);
    };
    void QRCode.toDataURL(options.payload, { width: 480, margin: 2 })
      .then((dataUrl) => {
        if (current === session) qr.src = dataUrl;
      })
      .catch((error: unknown) => console.error("Could not render demo QR:", error));

    mediaStream = canvas.captureStream(24);
    video.srcObject = mediaStream;
    void video.play().catch((error: unknown) => {
      console.error("Could not play the synthetic demo camera:", error);
    });
    timer = setTimeout(() => deliver(onDecode, current), options.scanAt * 1_000);
  };

  return { start, stop };
}
