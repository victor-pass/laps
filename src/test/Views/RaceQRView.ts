import { View } from "./View";
import jsQR from "jsqr";

// Big enough for jsQR to resolve each module; the SVG scales to fit.
const QR_SIZE = 300;

export class RaceQRView extends View {
  static selector = ".show-race-qr";
  hasQrCode = () => !!this.$("svg");

  // What a camera would read: rasterises the rendered SVG and decodes it.
  async qrCodeValue(): Promise<string | undefined> {
    const svg = this.$("svg");
    if (!svg) return undefined;

    const img = new Image();
    img.src = `data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`;
    await img.decode();

    const ctx = new OffscreenCanvas(QR_SIZE, QR_SIZE).getContext("2d")!;
    ctx.drawImage(img, 0, 0, QR_SIZE, QR_SIZE);
    const { data, width, height } = ctx.getImageData(0, 0, QR_SIZE, QR_SIZE);
    return jsQR(data, width, height)?.data;
  }
}
