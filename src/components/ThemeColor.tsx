import { Component, createEffect } from "solid-js";
import { useLocation } from "@solidjs/router";

// Android paints the system bars with theme-color: match the page under them.
export const ThemeColor: Component = () => {
  const location = useLocation();
  createEffect(() => {
    const color = location.pathname.startsWith("/scan") ? "#000000" : "#ccdce2";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", color);
  });
  return null;
};
