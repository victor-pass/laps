import { Component, For } from "solid-js";
import { A, useLocation } from "@solidjs/router";

const scanItems = [
  { href: "/scanFront", label: "Front" },
  { href: "/scanBack", label: "Back" },
];

const pageItems = [
  { href: "/race", label: "Summary" },
  { href: "/race/qr", label: "Share" },
];

export const Menu: Component = () => {
  const location = useLocation();
  let menu: HTMLUListElement | undefined;

  const current = () => {
    const scan = scanItems.find((item) => item.href === location.pathname);
    if (scan) return `Scan ${scan.label}`;
    return (
      pageItems.find((item) => item.href === location.pathname)?.label ??
      "Menu"
    );
  };

  const link = (item: { href: string; label: string }) => (
    <li>
      <A href={item.href} end onClick={() => menu?.hidePopover()}>
        {item.label}
      </A>
    </li>
  );

  return (
    <nav class="menu">
      <button type="button" popovertarget="menu-items" aria-haspopup="menu">
        ☰ {current()}
      </button>
      <ul id="menu-items" popover ref={(el) => (menu = el)}>
        <li class="menu-group">
          <span id="menu-group-scan">Scan</span>
          <ul aria-labelledby="menu-group-scan">
            <For each={scanItems}>{link}</For>
          </ul>
        </li>
        <For each={pageItems}>{link}</For>
      </ul>
    </nav>
  );
};
