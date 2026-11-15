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
  let cleanup = () => {};

  const stop = () => {
    session++;
    cleanup();
    cleanup = () => {};
  };

  const start: QrScanner["start"] = (video, onDecode) => {
    stop();
    const current = session;
    let delivered = false;
    const deliver = () => {
      if (current !== session || delivered) return;
      delivered = true;
      clearTimeout(timer);
      options.beforeDecode();
      onDecode(options.payload);
    };
    const checkCue = () => {
      if (video.currentTime >= options.scanAt) deliver();
    };

    video.muted = true;
    video.playsInline = true;
    video.loop = false;
    video.style.objectPosition = options.cropPosition;
    video.style.transform = `scale(${options.cropZoom})`;

    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    if (options.racerVideo) {
      video.src = options.racerVideo;
      video.addEventListener("timeupdate", checkCue);
      video.addEventListener("ended", deliver, { once: true });
      timer = setTimeout(deliver, Math.max(12_000, (options.scanAt + 8) * 1_000));
    } else {
      stream = syntheticCamera(options.payload, () => current === session);
      video.srcObject = stream ?? null;
      timer = setTimeout(deliver, options.scanAt * 1_000);
    }
    void video.play().catch((error: unknown) => {
      console.error("Could not play the demo camera:", error);
    });

    cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("timeupdate", checkCue);
      video.removeEventListener("ended", deliver);
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
      stream?.getTracks().forEach((track) => track.stop());
    };
  };

  return { start, stop };
}

/** A fake camera feed showing the racer's QR code. */
function syntheticCamera(
  payload: string,
  isLive: () => boolean,
): MediaStream | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  context.fillStyle = "#18252c";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = "bold 34px system-ui";
  context.textAlign = "center";
  context.fillText("DEMO RACER", canvas.width / 2, 190);

  const size = 480;
  const left = (canvas.width - size) / 2;
  const qr = new Image();
  qr.onload = () => {
    if (!isLive()) return;
    context.fillStyle = "white";
    context.fillRect(left, 300, size, size);
    context.drawImage(qr, left, 300, size, size);
    context.fillStyle = "#fff";
    context.font = "bold 42px system-ui";
    context.fillText("CALEB · FINISH", canvas.width / 2, 900);
  };
  void QRCode.toDataURL(payload, { width: size, margin: 2 })
    .then((dataUrl) => {
      if (isLive()) qr.src = dataUrl;
    })
    .catch((error: unknown) => console.error("Could not render demo QR:", error));

  return canvas.captureStream(24);
}
