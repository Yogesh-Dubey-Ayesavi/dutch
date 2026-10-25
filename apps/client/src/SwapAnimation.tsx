import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SwapEvent } from "../../../packages/engine/src/index";
import { swooshSound } from "./sound";

const slotEl = (id: string, index: number) =>
  document.querySelector<HTMLElement>(`[data-player-slot="${id}:${index}"]`);

/**
 * Public slot movements only. A blind swap sends the two cards across the
 * table on crossing arcs; the fliers are clones of the card backs, so hidden
 * faces are never shown.
 */
export function SwapAnimation({
  event,
  enabled,
}: {
  event: SwapEvent | null;
  enabled: boolean;
}) {
  const last = useRef<number | undefined>(event?.version);
  const overlay = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState("");
  useLayoutEffect(() => {
    if (!event || event.version === last.current) return;
    last.current = event.version;
    // Blind swaps are the only change a glow alone cannot explain.
    setCaption(
      event.pairs.length
        ? `${event.pairs.length} blind swap${event.pairs.length === 1 ? "" : "s"}`
        : "",
    );
    const host = overlay.current;
    const reduced =
      !enabled || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];
    const glow = (el: HTMLElement | null, delay = 0) => {
      const card = el?.querySelector(".pc") ?? el;
      if (!card) return;
      const a = card.animate(
        [
          { boxShadow: "0 0 0 4px #ffd36b, 0 0 26px 8px #ffb52d99" },
          { boxShadow: "0 0 0 0 transparent" },
        ],
        { duration: reduced ? 800 : 2400, delay, easing: "ease-out" },
      );
      cleanups.push(() => a.cancel());
    };
    const flight = 900;
    event.pairs.forEach((pair, i) => {
      const a = slotEl(pair.firstPlayerId, pair.firstIndex);
      const b = slotEl(pair.secondPlayerId, pair.secondIndex);
      if (!a || !b || !host) return;
      const delay = i * 380;
      if (reduced) {
        glow(a, delay);
        glow(b, delay);
        return;
      }
      const ra = a.getBoundingClientRect(),
        rb = b.getBoundingClientRect();
      const fly = (
        from: HTMLElement,
        fr: DOMRect,
        to: DOMRect,
        bend: number,
      ) => {
        const ghost = document.createElement("div");
        ghost.className = "swap-flier";
        ghost.appendChild((from.querySelector(".pc") ?? from).cloneNode(true));
        Object.assign(ghost.style, {
          left: `${fr.left}px`,
          top: `${fr.top}px`,
          width: `${fr.width}px`,
          height: `${fr.height}px`,
        });
        host.appendChild(ghost);
        const dx = to.left - fr.left,
          dy = to.top - fr.top;
        const scale = to.width / Math.max(1, fr.width);
        // Arc away from the straight line so the two cards visibly cross.
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * bend,
          ny = (dx / len) * bend;
        const mid = 1 + Math.max(0.35, 0.6 - len / 2000);
        const anim = ghost.animate(
          [
            { transform: "translate(0,0) scale(1) rotate(0deg)", offset: 0 },
            {
              transform: `translate(${dx / 2 + nx}px, ${dy / 2 + ny}px) scale(${mid * Math.max(1, scale)}) rotate(${bend > 0 ? 200 : -200}deg)`,
              offset: 0.5,
            },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(360deg)`,
              offset: 1,
            },
          ],
          {
            duration: flight,
            delay,
            easing: "cubic-bezier(.45,.05,.35,1)",
            fill: "both",
          },
        );
        cleanups.push(() => {
          anim.cancel();
          ghost.remove();
        });
        anim.finished.then(() => ghost.remove()).catch(() => undefined);
      };
      // Hide the real slots while their stand-ins are in the air.
      for (const el of [a, b]) {
        const hide = el.animate([{ opacity: 0 }, { opacity: 0 }], {
          duration: flight,
          delay,
          fill: "backwards",
        });
        cleanups.push(() => hide.cancel());
      }
      fly(a, ra, rb, 70);
      fly(b, rb, ra, 70);
      const t = setTimeout(() => swooshSound(flight / 1000), delay);
      cleanups.push(() => clearTimeout(t));
      glow(a, delay + flight);
      glow(b, delay + flight);
    });
    for (const changed of event.highlightSlots ?? [])
      glow(slotEl(changed.playerId, changed.index));
    if (event.discardChanged)
      glow(document.querySelector<HTMLElement>('[data-drop="discard"]'));
    const timeout = setTimeout(() => setCaption(""), 3000);
    return () => {
      clearTimeout(timeout);
      cleanups.forEach((c) => c());
    };
  }, [event?.version, enabled]);
  return createPortal(
    <div className="swap-animation-layer" aria-live="polite">
      {/* Fliers live in their own node: React owns the caption, not them. */}
      <div ref={overlay} />
      {caption ? <div className="swap-caption">{caption}</div> : null}
    </div>,
    document.body,
  );
}
