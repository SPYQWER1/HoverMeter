import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type { PhysicalSize } from "@tauri-apps/api/dpi";

export type DockEdge = "left" | "right" | "top" | "bottom" | null;

export interface DockState {
  edge: DockEdge;
}

interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DOCK_THRESHOLD = 20;
const UNDOCK_THRESHOLD = 30;
const SLIDE_DURATION_MS = 180;
const SLIDE_STEPS = 12;
const DRAG_END_DELAY_MS = 300;
const VISIBLE_STRIP = 6;

export function useWindowDock(hovered: boolean) {
  const [dockState, setDockState] = useState<DockState>({ edge: null });
  const dockRef = useRef<DockState>({ edge: null });
  const slidingRef = useRef(false);
  const savedPosRef = useRef<{ x: number; y: number } | null>(null);
  const winSizeRef = useRef<{ width: number; height: number }>({
    width: 290,
    height: 156,
  });
  const winRef = useRef(getCurrentWebviewWindow());
  const hoveredRef = useRef(hovered);
  const isDraggingRef = useRef(false);
  const dragEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDockCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingApplyRef = useRef(false);
  const slideGenerationRef = useRef(0);
  const applyDockVisibilityRef = useRef<
    ((edge: DockEdge, bounds: MonitorBounds) => Promise<void>) | null
  >(null);

  hoveredRef.current = hovered;

  const setDock = useCallback((edge: DockEdge) => {
    dockRef.current = { edge };
    setDockState({ edge });
  }, []);

  const slideTo = useCallback(async (targetX: number, targetY: number) => {
    // Each slide call gets a new generation. If a later slide is requested
    // (or the user starts dragging), the generation changes and this loop
    // aborts so the window isn't fighting the user's drag.
    const generation = ++slideGenerationRef.current;

    if (slidingRef.current) {
      // A slide is already running; the generation bump will cause it to abort
      // and the caller (applyDockVisibility) will queue a new slide via
      // pendingApplyRef if needed.
      return;
    }

    slidingRef.current = true;

    try {
      const pos = await winRef.current.outerPosition();
      const startX = pos.x;
      const startY = pos.y;
      const stepMs = SLIDE_DURATION_MS / SLIDE_STEPS;

      for (let i = 1; i <= SLIDE_STEPS; i++) {
        // Abort if a newer slide was requested or the user started dragging.
        if (generation !== slideGenerationRef.current || isDraggingRef.current) {
          return;
        }

        const t = i / SLIDE_STEPS;
        const eased = 1 - (1 - t) * (1 - t);
        const curX = Math.round(startX + (targetX - startX) * eased);
        const curY = Math.round(startY + (targetY - startY) * eased);
        await winRef.current.setPosition(
          new PhysicalPosition(curX, curY),
        );
        await new Promise((r) => setTimeout(r, stepMs));
      }
    } finally {
      slidingRef.current = false;

      // If hover (or drag) changed while we were sliding, re-apply the
      // visibility for the current dock edge so the window doesn't get stuck
      // in the wrong state.
      if (pendingApplyRef.current) {
        pendingApplyRef.current = false;
        const edge = dockRef.current.edge;
        if (edge) {
          try {
            const monitor = await currentMonitor();
            if (!monitor) return;
            const bounds: MonitorBounds = {
              x: monitor.position.x,
              y: monitor.position.y,
              width: monitor.size.width,
              height: monitor.size.height,
            };
            await applyDockVisibilityRef.current?.(edge, bounds);
          } catch {
            // ignore
          }
        }
      }
    }
  }, []);

  const getDockedPositions = async (
    edge: DockEdge,
    bounds: MonitorBounds,
  ) => {
    const ww = winSizeRef.current.width;
    const wh = winSizeRef.current.height;
    const pos = await winRef.current.outerPosition();

    switch (edge) {
      case "left":
        return {
          visible: { x: bounds.x, y: pos.y },
          hidden: { x: bounds.x - ww + VISIBLE_STRIP, y: pos.y },
        };
      case "right":
        return {
          visible: { x: bounds.x + bounds.width - ww, y: pos.y },
          hidden: { x: bounds.x + bounds.width - VISIBLE_STRIP, y: pos.y },
        };
      case "top":
        return {
          visible: { x: pos.x, y: bounds.y },
          hidden: { x: pos.x, y: bounds.y - wh + VISIBLE_STRIP },
        };
      case "bottom":
        return {
          visible: { x: pos.x, y: bounds.y + bounds.height - wh },
          hidden: { x: pos.x, y: bounds.y + bounds.height - VISIBLE_STRIP },
        };
      default:
        return {
          visible: { x: pos.x, y: pos.y },
          hidden: { x: pos.x, y: pos.y },
        };
    }
  };

  const applyDockVisibility = useCallback(
    async (edge: DockEdge, bounds: MonitorBounds, forceVisible = false) => {
      // Don't fight an active user drag; the drag-end timer will re-apply
      // visibility once the user releases the window.
      if (isDraggingRef.current) return;

      if (slidingRef.current) {
        pendingApplyRef.current = true;
        return;
      }

      const positions = await getDockedPositions(edge, bounds);
      const target = forceVisible || hoveredRef.current
        ? positions.visible
        : positions.hidden;

      await slideTo(target.x, target.y);
    },
    [slideTo],
  );

  applyDockVisibilityRef.current = applyDockVisibility;

  const revealWindow = useCallback(async () => {
    const win = winRef.current;
    if (slidingRef.current) return;

    const edge = dockRef.current.edge;
    if (edge) {
      try {
        const monitor = await currentMonitor();
        if (!monitor) return;
        const bounds: MonitorBounds = {
          x: monitor.position.x,
          y: monitor.position.y,
          width: monitor.size.width,
          height: monitor.size.height,
        };
        await applyDockVisibility(edge, bounds);
      } catch {
        // ignore
      }
      return;
    }

    // Not docked: make sure the window is actually visible on the current monitor.
    try {
      const monitor = await currentMonitor();
      if (!monitor) return;
      const bounds: MonitorBounds = {
        x: monitor.position.x,
        y: monitor.position.y,
        width: monitor.size.width,
        height: monitor.size.height,
      };

      const pos = await win.outerPosition();
      const ww = winSizeRef.current.width;
      const wh = winSizeRef.current.height;

      const offLeft = pos.x < bounds.x;
      const offRight = pos.x + ww > bounds.x + bounds.width;
      const offTop = pos.y < bounds.y;
      const offBottom = pos.y + wh > bounds.y + bounds.height;

      if (offLeft || offRight || offTop || offBottom) {
        const targetX = offLeft
          ? bounds.x
          : offRight
            ? bounds.x + bounds.width - ww
            : pos.x;
        const targetY = offTop
          ? bounds.y
          : offBottom
            ? bounds.y + bounds.height - wh
            : pos.y;
        await win.setPosition(new PhysicalPosition(targetX, targetY));
      }
    } catch {
      // ignore
    }
  }, [applyDockVisibility]);

  const checkAndDock = useCallback(async () => {
    if (slidingRef.current) return;

    const pos = await winRef.current.outerPosition();
    const x = pos.x;
    const y = pos.y;

    try {
      const monitor = await currentMonitor();
      if (!monitor) return;

      const bounds: MonitorBounds = {
        x: monitor.position.x,
        y: monitor.position.y,
        width: monitor.size.width,
        height: monitor.size.height,
      };

      const ww = winSizeRef.current.width;
      const wh = winSizeRef.current.height;

      // First detect windows that are already off-screen (e.g. saved state from a
      // previous version). In that case snap to the corresponding edge and use the
      // fully-visible edge position as the saved undock position.
      const offLeft = x < bounds.x;
      const offRight = x + ww > bounds.x + bounds.width;
      const offTop = y < bounds.y;
      const offBottom = y + wh > bounds.y + bounds.height;

      let edge: DockEdge = null;
      if (offLeft) edge = "left";
      else if (offRight) edge = "right";
      else if (offTop) edge = "top";
      else if (offBottom) edge = "bottom";

      if (edge) {
        let visibleX = x;
        let visibleY = y;
        switch (edge) {
          case "left":
            visibleX = bounds.x;
            break;
          case "right":
            visibleX = bounds.x + bounds.width - ww;
            break;
          case "top":
            visibleY = bounds.y;
            break;
          case "bottom":
            visibleY = bounds.y + bounds.height - wh;
            break;
        }
        savedPosRef.current = { x: visibleX, y: visibleY };
        setDock(edge);
        await applyDockVisibility(edge, bounds);
        return;
      }

      const distLeft = x - bounds.x;
      const distRight = bounds.x + bounds.width - (x + ww);
      const distTop = y - bounds.y;
      const distBottom = bounds.y + bounds.height - (y + wh);

      let closest: { edge: DockEdge; dist: number } = {
        edge: null,
        dist: Infinity,
      };

      if (distLeft >= 0 && distLeft <= DOCK_THRESHOLD && distLeft < closest.dist) {
        closest = { edge: "left", dist: distLeft };
      }
      if (distRight >= 0 && distRight <= DOCK_THRESHOLD && distRight < closest.dist) {
        closest = { edge: "right", dist: distRight };
      }
      if (distTop >= 0 && distTop <= DOCK_THRESHOLD && distTop < closest.dist) {
        closest = { edge: "top", dist: distTop };
      }
      if (distBottom >= 0 && distBottom <= DOCK_THRESHOLD && distBottom < closest.dist) {
        closest = { edge: "bottom", dist: distBottom };
      }

      if (closest.edge) {
        if (!dockRef.current.edge) {
          savedPosRef.current = { x, y };
        }
        setDock(closest.edge);
        await applyDockVisibility(closest.edge, bounds);
      }
    } catch {
      // currentMonitor may fail; ignore.
    }
  }, [applyDockVisibility, setDock]);

  useEffect(() => {
    const win = winRef.current;

    win
      .innerSize()
      .then((size: PhysicalSize) => {
        winSizeRef.current = {
          width: size.width,
          height: size.height,
        };
      })
      .catch(() => {
        /* ignore */
      });

    const scheduleDragEnd = () => {
      isDraggingRef.current = true;
      // Abort any in-progress slide so the user's drag isn't fighting
      // programmatic setPosition calls.
      slideGenerationRef.current += 1;
      if (dragEndTimerRef.current) {
        clearTimeout(dragEndTimerRef.current);
      }
      dragEndTimerRef.current = setTimeout(async () => {
        isDraggingRef.current = false;
        const edge = dockRef.current.edge;
        if (!edge) return;

        try {
          const monitor = await currentMonitor();
          if (!monitor) return;
          const bounds: MonitorBounds = {
            x: monitor.position.x,
            y: monitor.position.y,
            width: monitor.size.width,
            height: monitor.size.height,
          };
          await applyDockVisibility(edge, bounds);
        } catch {
          // ignore
        }
      }, DRAG_END_DELAY_MS);
    };

    const unlistenMovedPromise = win.onMoved(
      (_event: { payload: PhysicalPosition }) => {
        // Skip all move processing during slide animation to prevent
        // drag-end timers from firing setPosition on a hidden window.
        if (slidingRef.current) return;

        scheduleDragEnd();

        if (pendingDockCheckRef.current) clearTimeout(pendingDockCheckRef.current);
        pendingDockCheckRef.current = setTimeout(async () => {
          if (slidingRef.current) return;

          if (dockRef.current.edge) {
            const pos = await win.outerPosition();
            const x = pos.x;
            const y = pos.y;

            try {
              const monitor = await currentMonitor();
              if (!monitor) return;

              const bounds: MonitorBounds = {
                x: monitor.position.x,
                y: monitor.position.y,
                width: monitor.size.width,
                height: monitor.size.height,
              };

              const ww = winSizeRef.current.width;
              const wh = winSizeRef.current.height;
              const edge = dockRef.current.edge;

              // If the user has dragged the window away from the docked edge,
              // undock and keep the window exactly where they dragged it.
              let draggedAway = false;
              switch (edge) {
                case "left":
                  draggedAway = x > bounds.x + UNDOCK_THRESHOLD;
                  break;
                case "right":
                  draggedAway = x + ww < bounds.x + bounds.width - UNDOCK_THRESHOLD;
                  break;
                case "top":
                  draggedAway = y > bounds.y + UNDOCK_THRESHOLD;
                  break;
                case "bottom":
                  draggedAway = y + wh < bounds.y + bounds.height - UNDOCK_THRESHOLD;
                  break;
              }

              if (draggedAway) {
                savedPosRef.current = { x, y };
                setDock(null);
              }
            } catch {
              // ignore
            }
          } else {
            await checkAndDock();
          }
        }, 100);
      },
    );

    const unlistenResizedPromise = win.onResized(
      (event: { payload: PhysicalSize }) => {
        winSizeRef.current = {
          width: event.payload.width,
          height: event.payload.height,
        };
      },
    );

    const unlistenFocusPromise = win.onFocusChanged(
      async ({ payload: focused }: { payload: boolean }) => {
        // Only care about losing focus — the show-widget handler and hover
        // effect already handle revealing. Reacting to focus gain here would
        // cause the window to pop up whenever another app closes (e.g. cmd).
        if (focused || slidingRef.current) return;

        const edge = dockRef.current.edge;
        if (edge && !hoveredRef.current) {
          try {
            const monitor = await currentMonitor();
            if (monitor) {
              const bounds: MonitorBounds = {
                x: monitor.position.x,
                y: monitor.position.y,
                width: monitor.size.width,
                height: monitor.size.height,
              };
              await applyDockVisibility(edge, bounds);
            }
          } catch {
            // ignore
          }
        }
      },
    );

    const unlistenShowWidgetPromise = listen("show-widget", async () => {
      const win = winRef.current;

      try {
        await win.show();
        await win.setFocus();
      } catch {
        // ignore
      }

      // Abort any in-progress slide (likely heading for hidden position
      // because the onFocusChanged handler raced in first).
      slideGenerationRef.current += 1;
      while (slidingRef.current) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const edge = dockRef.current.edge;
      if (edge) {
        // Stay docked — just slide to the fully-visible position.
        // The normal hover effect will handle hiding when the user
        // clicks away.
        try {
          const monitor = await currentMonitor();
          if (monitor) {
            const bounds: MonitorBounds = {
              x: monitor.position.x,
              y: monitor.position.y,
              width: monitor.size.width,
              height: monitor.size.height,
            };
            const positions = await getDockedPositions(edge, bounds);
            await win.setPosition(
              new PhysicalPosition(positions.visible.x, positions.visible.y),
            );
            // setPosition triggers onMoved, which schedules a drag-end
            // timer that would slide us back to hidden after 300ms.
            // Clear it so we stay visible until the user clicks away.
            if (dragEndTimerRef.current) {
              clearTimeout(dragEndTimerRef.current);
              dragEndTimerRef.current = null;
            }
            isDraggingRef.current = false;
          }
        } catch {
          // ignore
        }
      } else {
        // Not docked: just make sure the window is on the current monitor.
        try {
          const monitor = await currentMonitor();
          if (monitor) {
            const bounds: MonitorBounds = {
              x: monitor.position.x,
              y: monitor.position.y,
              width: monitor.size.width,
              height: monitor.size.height,
            };
            const pos = await win.outerPosition();
            const ww = winSizeRef.current.width;
            const wh = winSizeRef.current.height;

            const offLeft = pos.x < bounds.x;
            const offRight = pos.x + ww > bounds.x + bounds.width;
            const offTop = pos.y < bounds.y;
            const offBottom = pos.y + wh > bounds.y + bounds.height;

            if (offLeft || offRight || offTop || offBottom) {
              const targetX = offLeft
                ? bounds.x
                : offRight
                  ? bounds.x + bounds.width - ww
                  : pos.x;
              const targetY = offTop
                ? bounds.y
                : offBottom
                  ? bounds.y + bounds.height - wh
                  : pos.y;
              await win.setPosition(new PhysicalPosition(targetX, targetY));
            }
          }
        } catch {
          // ignore
        }
      }
    });

    // Detect drag starts immediately (even during a slide animation) so we can
    // abort programmatic movement and avoid fighting the user's drag.
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Ignore clicks on interactive controls; the title-bar buttons live inside
      // the drag region and should not start a drag.
      if (target.closest("button, a, input, textarea, select")) return;
      if (target.closest("[data-tauri-drag-region]")) {
        scheduleDragEnd();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);

    return () => {
      if (pendingDockCheckRef.current) clearTimeout(pendingDockCheckRef.current);
      if (dragEndTimerRef.current) clearTimeout(dragEndTimerRef.current);
      document.removeEventListener("mousedown", handleMouseDown);
      unlistenMovedPromise.then((fn) => fn());
      unlistenResizedPromise.then((fn) => fn());
      unlistenFocusPromise.then((fn) => fn());
      unlistenShowWidgetPromise.then((fn) => fn());
    };
  }, [applyDockVisibility, checkAndDock, revealWindow, setDock]);

  // On startup, recover windows that were saved in an off-screen position.
  useEffect(() => {
    const timer = setTimeout(() => {
      checkAndDock();
    }, 500);
    return () => clearTimeout(timer);
  }, [checkAndDock]);

  // React to hover changes while already docked.
  useEffect(() => {
    const edge = dockRef.current.edge;
    if (!edge) return;

    let cancelled = false;
    currentMonitor()
      .then((monitor) => {
        if (!monitor || cancelled) return;
        const bounds: MonitorBounds = {
          x: monitor.position.x,
          y: monitor.position.y,
          width: monitor.size.width,
          height: monitor.size.height,
        };
        return applyDockVisibility(edge, bounds);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [hovered, applyDockVisibility]);

  const prepareForHide = useCallback(async () => {
    // Wait for any in-flight slide animation to finish before the caller hides
    // the window. Hiding while setPosition is being called can make WebView2 on
    // Windows become unresponsive.
    while (slidingRef.current) {
      await new Promise((r) => setTimeout(r, 30));
    }
    if (dragEndTimerRef.current) {
      clearTimeout(dragEndTimerRef.current);
      dragEndTimerRef.current = null;
    }
    if (pendingDockCheckRef.current) {
      clearTimeout(pendingDockCheckRef.current);
      pendingDockCheckRef.current = null;
    }
  }, []);

  return {
    dockState,
    prepareForHide,
  };
}
