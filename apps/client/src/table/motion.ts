/**
 * Table motion uses the Web Animations API only. Finished or cancelled
 * animations leave no inline styles behind, so a card can never be stranded
 * at opacity 0 or off its slot (the old GSAP deal could).
 */
export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const EASE = "cubic-bezier(.2,.8,.2,1)";

/** Fan offset for hand slot `k` of `n`: a gentle arc like cards held in a hand. */
export function fan(n: number, k: number, step = 3) {
  const d = k - (n - 1) / 2;
  return { y: d * d * 2.4, r: d * step };
}

export const fanTransform = (n: number, k: number) => {
  const f = fan(n, k);
  return `translate(0px, ${f.y}px) rotate(${f.r}deg)`;
};

export function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}

/** Animate `el` in from where `from` sits on screen. */
export function flyFrom(
  el: HTMLElement,
  from: Element | DOMRect,
  options: {
    duration?: number;
    delay?: number;
    scale?: number;
    rotate?: number;
  } = {},
) {
  if (reducedMotion()) return null;
  const a =
    from instanceof Element ? from.getBoundingClientRect() : (from as DOMRect);
  const b = el.getBoundingClientRect();
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const base = getComputedStyle(el).transform;
  const end = base === "none" ? "" : base;
  return el.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${options.scale ?? 0.8}) rotate(${options.rotate ?? -8}deg) ${end}`,
        opacity: 0.6,
      },
      { transform: end || "none", opacity: 1 },
    ],
    {
      duration: options.duration ?? 420,
      delay: options.delay ?? 0,
      easing: EASE,
      fill: "backwards",
    },
  );
}

export function pulse(el: Element | null | undefined, color = "#5fd39a") {
  if (!el || reducedMotion()) return;
  el.animate(
    [
      { boxShadow: `0 0 0 3px ${color}, 0 0 22px ${color}` },
      { boxShadow: "0 0 0 0 transparent" },
    ],
    { duration: 1100, easing: "ease-out" },
  );
}

export function shake(el: Element | null | undefined) {
  if (!el || reducedMotion()) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 380 },
  );
}
