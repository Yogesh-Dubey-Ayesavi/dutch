/**
 * Table motion uses the Web Animations API only. Finished or cancelled
 * animations leave no inline styles behind, so a card can never be stranded
 * at opacity 0 or off its slot (the old GSAP deal could).
 */
export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const EASE = "cubic-bezier(.2,.8,.2,1)";

/** Fan offset for hand slot `k` of `n`: a gentle arc like cards held in a hand.
 * The spread is capped so a hand swollen with penalty cards still fits on
 * screen — it stops arcing higher/wider past that point and the row scrolls
 * instead (see `.hand` in table.css). */
const MAX_FAN_SPREAD = 4.5;
export function fan(n: number, k: number, step = 3) {
  const raw = k - (n - 1) / 2;
  const d = Math.max(-MAX_FAN_SPREAD, Math.min(MAX_FAN_SPREAD, raw));
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

/**
 * Riffle the deck twice with throwaway card backs laid over the draw pile.
 * Resolves when the shuffle is over; the clones remove themselves.
 */
export function riffle(deck: HTMLElement, host: HTMLElement, duration = 1250) {
  const face = Array.from(deck.querySelectorAll(".pc")).at(-1);
  const rect = deck.getBoundingClientRect();
  if (!face) return Promise.resolve();
  const cards = Array.from({ length: 10 }, (_, i) => {
    const card = document.createElement("div");
    card.className = "riffle-card";
    card.appendChild(face.cloneNode(true));
    Object.assign(card.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: String(60 + i),
    });
    host.appendChild(card);
    return card;
  });
  const spread = rect.width * 0.62;
  const done = cards.map((card, i) => {
    const side = i % 2 ? 1 : -1;
    const lift = -Math.floor(i / 2) * 1.6;
    const apart = `translate(${side * spread}px, ${lift - 6}px) rotate(${side * 11}deg)`;
    const home = `translate(0px, ${-i * 0.8}px) rotate(0deg)`;
    return card
      .animate(
        [
          { transform: home, offset: 0 },
          { transform: apart, offset: 0.22 },
          { transform: home, offset: 0.48 },
          { transform: apart, offset: 0.72 },
          { transform: home, offset: 1 },
        ],
        // Each half closes card by card, which reads as the riffle.
        { duration, delay: Math.floor(i / 2) * 22, easing: "ease-in-out" },
      )
      .finished.catch(() => undefined)
      .finally(() => card.remove());
  });
  return Promise.all(done).then(() => undefined);
}

/**
 * Free-thrown cards flying from `fromRect` to `toEl`: they spread apart
 * mid-air, like a small hand of cards being flicked onto the pile, then
 * converge and stack as they land. Purely decorative ghosts — the real
 * discard pile updates underneath them and is what remains once they land.
 */
export function throwCards(
  fromRect: DOMRect,
  toEl: Element,
  count: number,
  host: HTMLElement,
  face?: Element | null,
) {
  if (reducedMotion() || count < 1) return Promise.resolve();
  const to = toEl.getBoundingClientRect();
  const n = Math.min(count, 5);
  const done = Array.from({ length: n }, (_, i) => {
    const ghost = document.createElement("div");
    ghost.className = face ? "throw-ghost with-face" : "throw-ghost";
    // The thrown cards are public once they land, so the flier can wear the real face.
    if (face) ghost.appendChild(face.cloneNode(true));
    Object.assign(ghost.style, {
      left: `${fromRect.left + fromRect.width / 2 - 17}px`,
      top: `${fromRect.top + fromRect.height / 2 - 24}px`,
      zIndex: String(70 + i),
    });
    host.appendChild(ghost);
    const dx = to.left + to.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = to.top + to.height / 2 - (fromRect.top + fromRect.height / 2);
    const side = i % 2 ? 1 : -1;
    const spread = 16 + side * 10 * Math.ceil(i / 2);
    return ghost
      .animate(
        [
          { transform: "translate(0px, 0px) rotate(0deg) scale(0.9)", offset: 0 },
          {
            transform: `translate(${dx * 0.55 + spread}px, ${dy * 0.5 - 22}px) rotate(${side * 14}deg) scale(1.02)`,
            offset: 0.55,
          },
          {
            transform: `translate(${dx}px, ${dy}px) rotate(${side * 4}deg) scale(0.96)`,
            offset: 1,
          },
        ],
        { duration: 420, delay: i * 70, easing: EASE, fill: "forwards" },
      )
      .finished.catch(() => undefined)
      .finally(() => ghost.remove());
  });
  return Promise.all(done).then(() => undefined);
}

/** Deal one card from the deck to its slot; hidden until its turn comes. */
export function dealIn(el: HTMLElement, deck: Element, delay: number) {
  const a = deck.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const scale = a.width / Math.max(1, b.width);
  const base = getComputedStyle(el).transform;
  const end = base === "none" ? "" : base;
  return el.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale}) ${end}`,
        opacity: 0,
        offset: 0,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale}) ${end}`,
        opacity: 1,
        offset: 0.01,
      },
      { transform: end || "none", opacity: 1, offset: 1 },
    ],
    { duration: 360, delay, easing: EASE, fill: "backwards" },
  );
}

/** Smooth arrival curve for a card leaving your fingers: fast off the hand, gentle on landing. */
export const FLING = "cubic-bezier(.22,.9,.28,1)";

/**
 * Fly a stand-in of `source` (its current on-screen look, mid-drag transform and all) onto
 * `target`, landing exactly on the target's footprint. The real DOM updates underneath when
 * the server confirms; the stand-in removes itself once it lands.
 */
export function flyCard(
  source: Element,
  target: Element,
  options: { duration?: number; spin?: number; lift?: number } = {},
) {
  if (reducedMotion()) return null;
  const face = source.matches(".pc") ? source : source.querySelector(".pc");
  if (!face) return null;
  const from = face.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "card-flight";
  ghost.appendChild(face.cloneNode(true));
  Object.assign(ghost.style, {
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
  });
  document.body.appendChild(ghost);
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  // `from` is the axis-aligned box of a possibly-rotated card; its layout width is the true size.
  const scale = (face as HTMLElement).offsetWidth / Math.max(1, to.width) || 1;
  const spin = options.spin ?? (dx > 0 ? -10 : 10);
  const lift = options.lift ?? Math.min(60, Math.hypot(dx, dy) * 0.18);
  const anim = ghost.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${spin}deg)` },
      {
        transform: `translate(${dx * 0.42}px, ${dy * 0.42 - lift}px) scale(${(scale + 1) / 2 * 1.04}) rotate(${spin / 3}deg)`,
        offset: 0.5,
      },
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)" },
    ],
    { duration: options.duration ?? 320, easing: FLING, fill: "forwards" },
  );
  const done = anim.finished
    .catch(() => undefined)
    .then(() => requestAnimationFrame(() => ghost.remove()));
  return { anim, done, ghost };
}

/**
 * FLIP: given where each element used to be (`before[i]` for the element now at index i),
 * glide them from there to their resting place. Elements with no previous rect are left alone.
 */
export function glideFrom(
  els: HTMLElement[],
  before: (DOMRect | undefined)[],
  finalTransform: (i: number) => string,
  options: { duration?: number; lifted?: number } = {},
) {
  if (reducedMotion()) return;
  const after = els.map((el) => el.getBoundingClientRect());
  els.forEach((el, i) => {
    const b = before[i];
    const a = after[i];
    if (!b || !a) return;
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const end = finalTransform(i);
    const lifted = i === options.lifted;
    if (lifted) el.style.zIndex = "30";
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) ${end}${lifted ? " scale(1.08)" : ""}` },
        { transform: end },
      ],
      { duration: options.duration ?? (lifted ? 280 : 240), easing: EASE },
    );
    if (lifted)
      anim.finished
        .catch(() => undefined)
        .then(() => (el.style.zIndex = String(i)));
  });
}
