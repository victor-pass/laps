import { View } from "./View";
import { decodeQrSvg } from "@/test/decodeQr";

export class RaceQRView extends View {
  static selector = ".show-race-qr";
  hasQrCode = () => !!this.$("svg");

  async qrCodeValue(): Promise<string | undefined> {
    const svg = this.$("svg");
    return svg ? decodeQrSvg(svg) : undefined;
  }
}
