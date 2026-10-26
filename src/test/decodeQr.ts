import jsQR from "jsqr";

// Big enough for jsQR to resolve each module; the SVG scales to fit.
const QR_SIZE = 300;

// What a camera would read: rasterises a rendered QR SVG and decodes it.
export async function decodeQrSvg(svg: Element): Promise<string | undefined> {
  const img = new Image();
  img.src = `data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`;
  await img.decode();

  const ctx = new OffscreenCanvas(QR_SIZE, QR_SIZE).getContext("2d")!;
  ctx.drawImage(img, 0, 0, QR_SIZE, QR_SIZE);
  const { data, width, height } = ctx.getImageData(0, 0, QR_SIZE, QR_SIZE);
  return jsQR(data, width, height)?.data;
}
