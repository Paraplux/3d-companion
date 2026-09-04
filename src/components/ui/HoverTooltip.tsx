import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type HoverTooltipProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

type TooltipPosition = {
  top: number;
  left: number;
  placement: "above" | "below";
};

const GAP = 8;
const VIEWPORT_PAD = 8;

export function HoverTooltip({
  content,
  children,
  className,
  disabled = false,
}: HoverTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = useId();

  useLayoutEffect(() => {
    if (!open || disabled || !triggerRef.current || !tipRef.current) {
      return;
    }

    const trigger = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = trigger.left + trigger.width / 2 - tip.width / 2;
    left = Math.max(
      VIEWPORT_PAD,
      Math.min(left, viewportWidth - tip.width - VIEWPORT_PAD),
    );

    const spaceAbove = trigger.top - VIEWPORT_PAD;
    const spaceBelow = viewportHeight - trigger.bottom - VIEWPORT_PAD;
    const preferAbove = spaceAbove >= tip.height + GAP || spaceAbove >= spaceBelow;

    let top: number;
    let placement: "above" | "below";
    if (preferAbove) {
      top = trigger.top - tip.height - GAP;
      placement = "above";
      if (top < VIEWPORT_PAD) {
        top = Math.min(trigger.bottom + GAP, viewportHeight - tip.height - VIEWPORT_PAD);
        placement = "below";
      }
    } else {
      top = trigger.bottom + GAP;
      placement = "below";
      if (top + tip.height > viewportHeight - VIEWPORT_PAD) {
        top = Math.max(VIEWPORT_PAD, trigger.top - tip.height - GAP);
        placement = "above";
      }
    }

    setPosition({ top, left, placement });
  }, [open, disabled, content]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const show = () => {
    if (!disabled) {
      setOpen(true);
    }
  };

  const hide = () => {
    setOpen(false);
    setPosition(null);
  };

  return (
    <span
      ref={triggerRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open && !disabled
        ? createPortal(
            <div
              ref={tipRef}
              id={tooltipId}
              role="tooltip"
              className={`hover-tooltip hover-tooltip--${position?.placement ?? "above"}`}
              style={
                position
                  ? { top: position.top, left: position.left, visibility: "visible" }
                  : { top: 0, left: 0, visibility: "hidden" }
              }
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
