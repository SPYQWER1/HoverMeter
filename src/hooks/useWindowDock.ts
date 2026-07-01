/**
 * useWindowDock Hook — 屏幕边缘停靠
 *
 * 当窗口被拖到屏幕边缘附近时自动吸附停靠，
 * 鼠标悬停时滑出完整窗口，离开时仅保留 6px 可见条。
 * 支持左/右/上/下四个方向。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type { PhysicalSize } from "@tauri-apps/api/dpi";

/** 停靠边缘方向 */
export type DockEdge = "left" | "right" | "top" | "bottom" | null;

/** 停靠状态 */
export interface DockState {
  edge: DockEdge;
}

/** 显示器边界信息 */
interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 吸附触发阈值（px） */
const DOCK_THRESHOLD = 20;
/** 拖离解除停靠阈值（px） */
const UNDOCK_THRESHOLD = 30;
/** 滑动动画总时长（ms） */
const SLIDE_DURATION_MS = 180;
/** 滑动动画帧数 */
const SLIDE_STEPS = 12;
/** 拖拽结束后重新应用停靠的延迟（ms） */
const DRAG_END_DELAY_MS = 300;
/** 隐藏时保留的可见条宽度（px） */
const VISIBLE_STRIP = 6;

/**
 * 从 Tauri Monitor 对象提取统一的显示器边界。
 * 在 hook 内多处重复使用，减少样板代码。
 */
async function getMonitorBounds(): Promise<MonitorBounds | null> {
  const monitor = await currentMonitor();
  if (!monitor) return null;
  return {
    x: monitor.position.x,
    y: monitor.position.y,
    width: monitor.size.width,
    height: monitor.size.height,
  };
}

/**
 * 屏幕边缘停靠 Hook。
 *
 * @param hovered - 鼠标是否悬停在窗口上（控制显示/隐藏）
 * @returns 停靠状态、隐藏前等待函数、强制隐藏到停靠位置函数
 */
export function useWindowDock(hovered: boolean) {
  const [dockState, setDockState] = useState<DockState>({ edge: null });
  const dockRef = useRef<DockState>({ edge: null });
  const slidingRef = useRef(false);
  const savedPosRef = useRef<{ x: number; y: number } | null>(null);
  const winSizeRef = useRef<{ width: number; height: number }>({
    width: 290,
    height: 142,
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

  /** 更新停靠状态（同时更新 ref 和 React state） */
  const setDock = useCallback((edge: DockEdge) => {
    dockRef.current = { edge };
    setDockState({ edge });
  }, []);

  /**
   * 执行缓动滑动动画，将窗口从当前位置平滑移动到目标位置。
   *
   * 使用 ease-out 曲线（quadratic），分 SLIDE_STEPS 帧完成。
   * 如果用户开始拖拽或新的滑动请求到来，当前动画会中止。
   */
  const slideTo = useCallback(async (targetX: number, targetY: number) => {
    const generation = ++slideGenerationRef.current;

    if (slidingRef.current) {
      return;
    }

    slidingRef.current = true;

    try {
      const pos = await winRef.current.outerPosition();
      const startX = pos.x;
      const startY = pos.y;
      const stepMs = SLIDE_DURATION_MS / SLIDE_STEPS;

      for (let i = 1; i <= SLIDE_STEPS; i++) {
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

      if (pendingApplyRef.current) {
        pendingApplyRef.current = false;
        const edge = dockRef.current.edge;
        if (edge) {
          try {
            const bounds = await getMonitorBounds();
            if (bounds) {
              await applyDockVisibilityRef.current?.(edge, bounds);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  }, []);

  /**
   * 计算指定边缘的可见/隐藏坐标。
   *
   * 可见位置：窗口完全在屏幕内
   * 隐藏位置：仅保留 VISIBLE_STRIP 像素可见
   */
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

  /**
   * 应用停靠可见性：根据 hover 状态决定滑动到可见还是隐藏位置。
   *
   * - 用户拖拽中不干预
   * - 滑动动画进行中则标记待应用，动画结束后自动重试
   * - forceVisible 用于系统托盘"显示面板"事件
   */
  const applyDockVisibility = useCallback(
    async (edge: DockEdge, bounds: MonitorBounds, forceVisible = false) => {
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

  /**
   * 显示窗口：停靠状态下滑到可见位置，非停靠状态下确保窗口在当前显示器内。
   */
  const revealWindow = useCallback(async () => {
    const win = winRef.current;
    if (slidingRef.current) return;

    const edge = dockRef.current.edge;
    if (edge) {
      try {
        const bounds = await getMonitorBounds();
        if (bounds) {
          await applyDockVisibility(edge, bounds);
        }
      } catch {
        // ignore
      }
      return;
    }

    try {
      const bounds = await getMonitorBounds();
      if (!bounds) return;

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

  /**
   * 检测窗口是否在屏幕边缘附近，若是则触发停靠。
   *
   * 优先处理已完全在屏幕外的窗口（如从旧版本保存的位置恢复），
   * 然后按四方向距离判断最近的边缘。
   */
  const checkAndDock = useCallback(async () => {
    if (slidingRef.current) return;

    const pos = await winRef.current.outerPosition();
    const x = pos.x;
    const y = pos.y;

    try {
      const bounds = await getMonitorBounds();
      if (!bounds) return;

      const ww = winSizeRef.current.width;
      const wh = winSizeRef.current.height;

      // 检测窗口是否完全在屏幕外
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

  /**
   * 初始化：获取窗口尺寸，注册移动/缩放/焦点/显示事件监听。
   *
   * - 移动事件：调度拖拽结束计时器 + 停靠检测
   * - 缩放事件：更新缓存的窗口尺寸
   * - 失焦事件：停靠状态下隐藏窗口
   * - show-widget 事件：从托盘恢复显示
   * - mousedown 事件：检测拖拽开始
   */
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

    /**
     * 标记拖拽开始，中止滑动动画。
     * DRAG_END_DELAY_MS 后重新应用停靠可见性。
     */
    const scheduleDragEnd = () => {
      isDraggingRef.current = true;
      slideGenerationRef.current += 1;
      if (dragEndTimerRef.current) {
        clearTimeout(dragEndTimerRef.current);
      }
      dragEndTimerRef.current = setTimeout(async () => {
        isDraggingRef.current = false;
        const edge = dockRef.current.edge;
        if (!edge) return;

        try {
          const bounds = await getMonitorBounds();
          if (bounds) {
            await applyDockVisibility(edge, bounds);
          }
        } catch {
          // ignore
        }
      }, DRAG_END_DELAY_MS);
    };

    const unlistenMovedPromise = win.onMoved(
      (_event: { payload: PhysicalPosition }) => {
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
              const bounds = await getMonitorBounds();
              if (!bounds) return;

              const ww = winSizeRef.current.width;
              const wh = winSizeRef.current.height;
              const edge = dockRef.current.edge;

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
        if (focused || slidingRef.current) return;

        const edge = dockRef.current.edge;
        if (edge && !hoveredRef.current) {
          try {
            const bounds = await getMonitorBounds();
            if (bounds) {
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

      slideGenerationRef.current += 1;
      while (slidingRef.current) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const edge = dockRef.current.edge;
      if (edge) {
        try {
          const bounds = await getMonitorBounds();
          if (bounds) {
            const positions = await getDockedPositions(edge, bounds);
            await win.setPosition(
              new PhysicalPosition(positions.visible.x, positions.visible.y),
            );
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
        try {
          const bounds = await getMonitorBounds();
          if (bounds) {
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

    /** 在拖拽区域按下鼠标时标记拖拽开始 */
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
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

  /** 启动时恢复可能保存在屏幕外的窗口位置 */
  useEffect(() => {
    const timer = setTimeout(() => {
      checkAndDock();
    }, 500);
    return () => clearTimeout(timer);
  }, [checkAndDock]);

  /** hover 状态变化时重新应用停靠可见性 */
  useEffect(() => {
    const edge = dockRef.current.edge;
    if (!edge) return;

    let cancelled = false;
    getMonitorBounds()
      .then((bounds) => {
        if (!bounds || cancelled) return;
        return applyDockVisibility(edge, bounds);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      cancelled = true;
    };
  }, [hovered, applyDockVisibility]);

  /**
   * 隐藏前准备工作：等待滑动动画完成，清除定时器。
   * 防止在 setPosition 调用期间隐藏窗口导致 WebView2 无响应。
   */
  const prepareForHide = useCallback(async () => {
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

  /**
   * 强制隐藏到停靠位置。
   *
   * 已停靠窗口：直接应用隐藏可见性
   * 未停靠窗口：吸附到最近的屏幕边缘后隐藏
   */
  const forceHideToDock = useCallback(async () => {
    if (slidingRef.current) return;

    const edge = dockRef.current.edge;
    if (edge) {
      try {
        const bounds = await getMonitorBounds();
        if (bounds) {
          await applyDockVisibility(edge, bounds);
        }
      } catch {
        // ignore
      }
      return;
    }

    try {
      const pos = await winRef.current.outerPosition();
      const bounds = await getMonitorBounds();
      if (!bounds) return;

      const ww = winSizeRef.current.width;
      const wh = winSizeRef.current.height;

      const distLeft = Math.abs(pos.x - bounds.x);
      const distRight = Math.abs(bounds.x + bounds.width - (pos.x + ww));
      const distTop = Math.abs(pos.y - bounds.y);
      const distBottom = Math.abs(bounds.y + bounds.height - (pos.y + wh));

      const distances: { edge: DockEdge; dist: number }[] = [
        { edge: "left", dist: distLeft },
        { edge: "right", dist: distRight },
        { edge: "top", dist: distTop },
        { edge: "bottom", dist: distBottom },
      ];
      distances.sort((a, b) => a.dist - b.dist);

      const nearest = distances[0];
      savedPosRef.current = { x: pos.x, y: pos.y };
      setDock(nearest.edge);
      await applyDockVisibility(nearest.edge, bounds);
    } catch {
      // ignore
    }
  }, [applyDockVisibility, setDock]);

  return {
    dockState,
    prepareForHide,
    forceHideToDock,
  };
}
