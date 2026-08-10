"use client";

import { useEffect } from "react";

export function PopoverDismissController() {
  useEffect(() => {
    const closeMenus = (except?: HTMLDetailsElement | null) => {
      document.querySelectorAll<HTMLDetailsElement>("details.toolbar-menu[open]").forEach((menu) => {
        if (menu !== except) menu.open = false;
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const activeMenu = target.closest<HTMLDetailsElement>("details.toolbar-menu");
      if (!activeMenu) {
        closeMenus();
        return;
      }

      const summary = target.closest("summary");
      if (summary && summary.parentElement === activeMenu) closeMenus(activeMenu);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
