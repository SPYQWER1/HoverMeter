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
    width: 320,
    height: 210,
  });
  const winRef = useRef(getCurrentWebviewWindow());
  const hoveredRef = useRef(hovered);
  const isDraggingRef = useRef(false);
  const dragEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingApplyRef = useRef(false);
  const applyDockVisibilityRef = useRef<
    ((edge: DockEdge, bounds: MonitorBounds) => Promise<void>) | null
  >(null);

  hoveredRef.current = hovered;

  const setDock = useCallback((edge: DockEdge) => {
    dockRef.current = { edge };
    setDockState({ edge });
  }, []);

  const slideTo = useCallback(async (targetX: number, targetY: number) => {
    if (slidingRef.current) return;
    slidingRef.current = true;

    try {
      const pos = await winRef.current.outerPosition();
      const startX = pos.x;
      const startY = pos.y;
      const stepMs = SLIDE_DURATION_MS / SLIDE_STEPS;

      for (let i = 1; i <= SLIDE_STEPS; i++) {
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
    async (edge: DockEdge, bounds: MonitorBounds) => {
      if (slidingRef.current) {
        pendingApplyRef.current = true;
        return;
      }

      const positions = await getDockedPositions(edge, bounds);
      const target = hoveredRef.current || isDraggingRef.current
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

    let pendingDockCheck: ReturnType<typeof setTimeout> | null = null;

    const scheduleDragEnd = () => {
      isDraggingRef.current = true;
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
        scheduleDragEnd();

        if (pendingDockCheck) clearTimeout(pendingDockCheck);
        pendingDockCheck = setTimeout(async () => {
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

              let dockedX: number;
              let dockedY: number;

              switch (edge) {
                case "left":
                  dockedX = bounds.x - ww + VISIBLE_STRIP;
                  dockedY = y;
                  break;
                case "right":
                  dockedX = bounds.x + bounds.width - VISIBLE_STRIP;
                  dockedY = y;
                  break;
                case "top":
                  dockedX = x;
                  dockedY = bounds.y - wh + VISIBLE_STRIP;
                  break;
                case "bottom":
                  dockedX = x;
                  dockedY = bounds.y + bounds.height - VISIBLE_STRIP;
                  break;
                default:
                  return;
              }

              const dx = Math.abs(x - dockedX);
              const dy = Math.abs(y - dockedY);

              if (dx > UNDOCK_THRESHOLD || dy > UNDOCK_THRESHOLD) {
                // Dragged away from the docked hidden position:
                // slide fully into view at the edge and undock.
                let targetX = x;
                let targetY = y;
                switch (edge) {
                  case "left":
                    targetX = bounds.x;
                    break;
                  case "right":
                    targetX = bounds.x + bounds.width - ww;
                    break;
                  case "top":
                    targetY = bounds.y;
                    break;
                  case "bottom":
                    targetY = bounds.y + bounds.height - wh;
                    break;
                }
                savedPosRef.current = { x: targetX, y: targetY };
                setDock(null);
                await win.setPosition(
                  new PhysicalPosition(targetX, targetY),
                );
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
        if (!focused || slidingRef.current) return;
        await revealWindow();
      },
    );

    const unlistenShowWidgetPromise = listen("show-widget", async () => {
      if (slidingRef.current) return;
      await revealWindow();
    });

    return () => {
      if (pendingDockCheck) clearTimeout(pendingDockCheck);
      if (dragEndTimerRef.current) clearTimeout(dragEndTimerRef.current);
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

  return {
    dockState,
  };
}
