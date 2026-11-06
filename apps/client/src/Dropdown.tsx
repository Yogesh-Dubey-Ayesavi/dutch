import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
  /** Muted detail shown on the right, e.g. "K → A". */
  hint?: string;
}

/**
 * The app's own select: styled like the rest of the forms on every browser (the native
 * Safari/Chrome menus never matched), keyboard friendly, and drawn in a body-level layer
 * so a scrolling modal can't clip it. Opens upward when there's no room below.
 */
export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name; also how tests find it. */
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  const position = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const below = innerHeight - r.bottom - gap - 12;
    const above = r.top - gap - 12;
    const want = Math.min(320, options.length * 40 + 12);
    const up = below < Math.min(want, 220) && above > below;
    setPlace({
      left: r.left,
      width: Math.max(r.width, 200),
      ...(up ? { bottom: innerHeight - r.top + gap } : { top: r.bottom + gap }),
      maxHeight: Math.max(120, Math.min(want, up ? above : below)),
    });
  };

  const show = () => {
    if (disabled) return;
    setActive(selectedIndex);
    position();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus({ preventScroll: true });
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option && option.value !== value) onChange(option.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t))
        close(false);
    };
    const reflow = () => position();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open]);

  // Keep the highlighted row in view, starting on the current choice.
  useLayoutEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => (open ? setActive((i) => Math.min(last, i + 1)) : show()),
      ArrowUp: () => (open ? setActive((i) => Math.max(0, i - 1)) : show()),
      Home: () => open && setActive(0),
      End: () => open && setActive(last),
      Enter: () => (open ? choose(active) : show()),
      " ": () => (open ? choose(active) : show()),
      Escape: () => open && close(),
      Tab: () => open && close(false),
    };
    const run = keys[e.key];
    if (!run) return;
    if (e.key !== "Tab") e.preventDefault();
    if (e.key === "Escape" && open) e.stopPropagation();
    run();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`dropdown ${open ? "open" : ""}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-value={String(value)}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        <span className="dropdown-value">
          {selected?.label}
          {selected?.hint && <small>{selected.hint}</small>}
        </span>
        <ChevronDown size={16} className="dropdown-chevron" aria-hidden="true" />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            className={`dropdown-menu ${place.bottom !== undefined ? "up" : ""}`}
            style={{
              left: place.left,
              width: place.width,
              top: place.top,
              bottom: place.bottom,
              maxHeight: place.maxHeight,
            }}
            onKeyDown={onKey}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                role="option"
                data-index={i}
                aria-selected={o.value === value}
                className={`${i === active ? "active" : ""} ${o.value === value ? "chosen" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span className="dropdown-check" aria-hidden="true">
                  {o.value === value && <Check size={14} strokeWidth={2.6} />}
                </span>
                <span className="dropdown-label">{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
