const cursor = document.querySelector<HTMLElement>("#demo-finger");

if (!cursor) throw new Error("The demo finger cursor is missing");

window.addEventListener("message", (event: MessageEvent) => {
  if (
    event.origin !== window.location.origin ||
    event.data?.source !== "laps-demo-pointer"
  )
    return;

  const { type, x, y } = event.data as {
    type: string;
    x: number;
    y: number;
  };
  const halfWidth = cursor.offsetWidth / 2;
  const halfHeight = cursor.offsetHeight / 2;
  cursor.style.left = `${Math.min(
    window.innerWidth - halfWidth,
    Math.max(halfWidth, x),
  )}px`;
  cursor.style.top = `${Math.min(
    window.innerHeight - halfHeight,
    Math.max(halfHeight, y),
  )}px`;
  cursor.classList.add("is-visible");
  if (type === "pointerdown") cursor.classList.add("is-pressed");
  if (type === "pointerup" || type === "pointercancel")
    cursor.classList.remove("is-pressed");
});
