import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check, EyeOff, Gavel, LogOut, Settings } from "lucide-react";
import {
  PEEK_CHOICES,
  canCallDutch,
  powerOwnerId,
  value as cardValue,
  type GameView,
  type SwapPair,
} from "../../../../packages/engine/src/index";
import { EMOTES } from "../../../../packages/protocol/src/index";
import { Avatar } from "../Avatar";
import { Diamond } from "../Cards";
import { SwapAnimation } from "../SwapAnimation";
import {
  playSound,
  startDutchAlarm,
  stopDutchAlarm,
  turnSound,
} from "../sound";
import { act, emote, usePrefs, useRoom } from "../store";
import type { ModalName } from "../ui";
import { PlayingCard, cardName } from "./PlayingCard";
import { Seat, Tray, seatPositions } from "./Seats";
import { TurnPill } from "./TurnPill";
import {
  EASE,
  fan,
  fanTransform,
  dealIn,
  flyFrom,
  pulse,
  riffle,
  reducedMotion,
  shake,
} from "./motion";
import "./table.css";

type Pick = { playerId: string; index: number };

/** What the pointer controller needs from the latest render. */
interface Handlers {
  canReorder: boolean;
  canDraw: boolean;
  hasDiscard: boolean;
  holding: boolean;
  tossable: boolean;
  canFreeThrow: boolean;
  selected: number[];
  handSize: number;
  tapHand: (index: number, modifier: boolean) => void;
  longPress: (index: number) => void;
  tapDeck: () => void;
  tapDiscard: () => void;
  clear: () => void;
  reorder: (from: number, to: number) => boolean;
  throwToPile: (indices: number[]) => void;
  matchDrawn: (indices: number[]) => void;
  dropHeldOn: (index: number) => void;
  discardHeld: () => void;
  draw: (source: "deck" | "discard", slot?: number) => void;
}

interface Drag {
  src: string;
  el: HTMLElement;
  x0: number;
  y0: number;
  active: boolean;
  long: boolean;
  modifier: boolean;
  timer?: ReturnType<typeof setTimeout>;
  kind?: "hand" | "group" | "held" | "pile";
  els: HTMLElement[];
  offs: number[];
  k: number;
  to: number;
  group: number[];
  over: string | null;
  ghost?: HTMLElement;
}

const HINT_KEY = "dutch-turns-played";
const readTurns = () => {
  try {
    return Number(localStorage.getItem(HINT_KEY) ?? 0);
  } catch {
    return 0;
  }
};

export function GameTable({
  state: s,
  open,
}: {
  state: GameView;
  open: (m: ModalName) => void;
}) {
  const room = useRoom();
  const effects = usePrefs((p) => p.effects);
  // A peeked card (Jack power, Queen-swap peek) turns face-down again after
  // Done or five seconds. Initial peeks keep their own Done button.
  const [veiled, setVeiled] = useState<Set<string>>(() => new Set());
  const revealKey = (owner: string, index: number, id: string) =>
    `${owner}:${index}:${id}`;
  const liveReveals =
    s.phase === "peeking"
      ? []
      : s.reveals.filter(
          (r) => !veiled.has(revealKey(r.owner, r.index, r.card.id)),
        );
  const liveKeys = liveReveals.map((r) =>
    revealKey(r.owner, r.index, r.card.id),
  );
  const veil = (keys: string[]) => setVeiled((v) => new Set([...v, ...keys]));
  useEffect(() => {
    if (!liveKeys.length) return;
    const t = setTimeout(() => veil(liveKeys), 5000);
    return () => clearTimeout(t);
  }, [liveKeys.join()]);
  const masked = (p: GameView["players"][number]) =>
    s.phase === "peeking"
      ? p
      : {
          ...p,
          hand: p.hand.map((c, i) =>
            c && veiled.has(revealKey(p.id, i, c.id)) ? null : c,
          ),
        };
  const me = masked(s.players.find((p) => p.id === s.you)!);
  const opponents = s.players.filter((p) => p.id !== s.you).map(masked);
  const mine = s.players[s.turn]?.id === s.you;
  const powerOwner = powerOwnerId(s);
  const powerMine = powerOwner === s.you;
  const activeId =
    s.phase === "power"
      ? powerOwner
      : s.phase === "choosing"
        ? (s.moderator ?? null)
        : s.players[s.turn]?.id;
  const disabled =
    !!room.pending || room.status !== "connected" || !!s.pendingCall;
  const inRound = ["choosing", "peeking", "playing", "power"].includes(s.phase);
  const peekCount = s.peekCount ?? 2;
  const moderator = s.players.find((p) => p.id === s.moderator);
  const choosing = s.phase === "choosing" && s.moderator === s.you;

  const [selected, setSelected] = useState<number[]>([]);
  const [firstPick, setFirstPick] = useState<Pick | null>(null);
  const [plan, setPlan] = useState<SwapPair[]>([]);
  const [tray, setTray] = useState<string | null>(null);
  const [emotes, setEmotes] = useState(false);
  const [keys, setKeys] = useState(false);
  const [toast, setToast] = useState("");
  const [stamp, setStamp] = useState<string | null>(null);
  const [arena, setArena] = useState({ w: 0, h: 0 });
  const [turnsPlayed, setTurnsPlayed] = useState(readTurns);

  const rootRef = useRef<HTMLElement>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const landingRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const queuedSwap = useRef<{ index: number; version: number } | null>(null);
  const pendingMove = useRef<number | null>(null);
  const handlers = useRef<Handlers>(null!);

  const holding = mine && s.phase === "playing" && !!s.drawn;
  const tossable = holding && !!s.drawn?.fromDeck;
  const canDraw = !disabled && mine && s.phase === "playing" && !s.drawn;
  const canFreeThrow =
    !disabled &&
    (s.phase === "playing" || (s.phase === "power" && !!s.handPower)) &&
    s.rules.burning !== "off" &&
    (!!s.discard.length || tossable);
  const canSelect = canFreeThrow || (holding && !disabled);
  const picking = s.phase === "power" && powerMine;
  const pickOpponents =
    picking && (s.power === "blindSwap" || s.power === "otherPeek");
  const canCall = !disabled && canCallDutch(s, s.you);
  const myPeeks = s.reveals.filter((r) => r.owner === s.you).length;
  const n = me.hand.length;
  const myPendingCall =
    s.pendingCall?.actor === s.you ? s.pendingCall : null;
  const [undoSecs, setUndoSecs] = useState(0);
  useEffect(() => {
    if (!myPendingCall) return;
    const tick = () =>
      setUndoSecs(
        Math.max(0, Math.ceil((myPendingCall.deadline - Date.now()) / 1000)),
      );
    tick();
    const i = setInterval(tick, 200);
    return () => clearInterval(i);
  }, [myPendingCall?.deadline]);

  const flash = (text: string) => setToast(text);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  // ----- page lock: the table is one screen, never a scrolling page -----
  useEffect(() => {
    document.documentElement.classList.add("table-lock");
    return () => document.documentElement.classList.remove("table-lock");
  }, []);

  useLayoutEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setArena({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ----- resets when the table moves on -----
  useEffect(() => {
    setSelected([]);
    setFirstPick(null);
  }, [s.phase, s.turn, s.round, n]);
  useEffect(() => {
    setPlan([]);
    setFirstPick(null);
    setTray(null);
  }, [s.phase, s.handPower?.ownerId, s.handPower?.kind, s.power]);
  const revisions = useRef<Record<string, number>>({});
  useEffect(() => {
    const touched = new Set(
      plan.flatMap((pair) => [pair.firstPlayerId, pair.secondPlayerId]),
    );
    if (firstPick) touched.add(firstPick.playerId);
    if (
      s.players.some(
        (p) =>
          touched.has(p.id) &&
          revisions.current[p.id] !== undefined &&
          revisions.current[p.id] !== p.handRevision,
      )
    ) {
      setPlan([]);
      setFirstPick(null);
      flash("Cards moved · pick again");
    }
    revisions.current = Object.fromEntries(
      s.players.map((p) => [p.id, p.handRevision]),
    );
  }, [s.players.map((p) => p.handRevision).join(",")]);

  // Count finished turns so routine hints can step aside for regulars.
  const wasMine = useRef(mine);
  useEffect(() => {
    if (wasMine.current && !mine && s.phase === "playing") {
      const next = readTurns() + 1;
      try {
        localStorage.setItem(HINT_KEY, String(next));
      } catch {
        /* Hints just stay on. */
      }
      setTurnsPlayed(next);
    }
    // A short chime when it becomes your turn, like a message notification.
    if (!wasMine.current && mine && s.phase === "playing") turnSound();
    wasMine.current = mine;
  }, [mine, s.phase]);

  // ----- actions -----
  const throwToPile = (indices: number[]) => {
    if (!indices.length) return;
    // Two or more same-rank cards from your own hand are always a valid free
    // throw on your own turn, whether or not they match the discard pile.
    const cards = indices.map((i) => me.hand[i]);
    const selfMatch =
      indices.length >= 2 &&
      cards.every(
        (c) =>
          c &&
          (s.rules.burning === "rank"
            ? c.rank === cards[0]?.rank
            : cardValue(c, s.jokerRank) === cardValue(cards[0]!, s.jokerRank)),
      );
    const pair = mine && s.phase === "playing" && selfMatch;
    act({
      type: "burn",
      indices,
      match: pair ? "pair" : "discard",
      handRevision: me.handRevision,
      targetId: pair ? s.drawn?.card?.id : s.discard.at(-1)?.id,
    });
    setSelected([]);
  };
  const matchDrawn = (indices: number[]) => {
    act({
      type: "burn",
      indices,
      match: "drawn",
      handRevision: me.handRevision,
      targetId: s.drawn?.card?.id,
    });
    setSelected([]);
  };
  const exchange = (indices: number[]) => {
    act({ type: "swap", indices, handRevision: me.handRevision });
    setSelected([]);
  };
  const discardHeld = () => {
    if (tossable) act({ type: "discard", usePower: false });
  };
  const draw = (source: "deck" | "discard", slot?: number) => {
    if (!canDraw || (source === "discard" && !s.discard.length)) return;
    if (slot !== undefined)
      queuedSwap.current = { index: slot, version: s.version };
    act({ type: "draw", source });
  };
  const toggle = (i: number) =>
    setSelected((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]));
  const submitSwaps = (pairs: SwapPair[]) =>
    act({
      type: "blindSwapBatch",
      pairs,
      revisions: Object.fromEntries(
        s.players.map((p) => [p.id, p.handRevision]),
      ),
    });
  const pick = (playerId: string, index: number) => {
    if (!picking || disabled) return;
    setTray(null);
    if (s.power !== "blindSwap") {
      act({ type: "powerPeek", playerId, index });
      return;
    }
    if (!firstPick) {
      setFirstPick({ playerId, index });
      playSound("flip");
      return;
    }
    if (firstPick.playerId === playerId && firstPick.index === index) {
      setFirstPick(null);
      return;
    }
    const pairs = [
      ...plan,
      {
        firstPlayerId: firstPick.playerId,
        firstIndex: firstPick.index,
        secondPlayerId: playerId,
        secondIndex: index,
      },
    ];
    setFirstPick(null);
    if (pairs.length >= (s.handPower?.remaining ?? 1)) {
      submitSwaps(pairs);
      setPlan([]);
    } else setPlan(pairs);
  };
  const skipPower = () => {
    setPlan([]);
    setFirstPick(null);
    setTray(null);
    act({ type: "skipPower" });
  };
  const tapHand = (i: number, modifier: boolean) => {
    if (disabled) return;
    if (s.phase === "peeking") {
      const ok =
        !me.peekDone &&
        myPeeks < peekCount &&
        !s.reveals.some((r) => r.owner === s.you && r.index === i);
      if (ok) act({ type: "initialPeek", index: i });
      return;
    }
    if (picking) {
      if (s.power === "blindSwap" || s.power === "ownPeek") pick(s.you, i);
      return;
    }
    if ((modifier || selected.length) && canSelect) return toggle(i);
    if (holding) return exchange([i]);
    const el = handRef.current?.querySelector(`[data-drop="hand-${i}"] .pc`);
    if (el && !reducedMotion())
      el.animate(
        [{ translate: "0 0" }, { translate: "0 -8px" }, { translate: "0 0" }],
        { duration: 220 },
      );
  };

  handlers.current = {
    canReorder: inRound && !disabled,
    canDraw,
    hasDiscard: !!s.discard.length,
    holding: holding && !disabled,
    tossable: tossable && !disabled,
    canFreeThrow,
    selected,
    handSize: n,
    tapHand,
    longPress: (i) => {
      if (!canSelect || picking || s.phase === "peeking") return;
      toggle(i);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* Haptics are optional. */
      }
    },
    tapDeck: () => draw("deck"),
    tapDiscard: () => (tossable ? discardHeld() : draw("discard")),
    clear: () => {
      setSelected([]);
      setEmotes(false);
    },
    reorder: (from, to) => {
      if (disabled) return false;
      pendingMove.current = me.handRevision;
      act({ type: "reorder", from, to, handRevision: me.handRevision });
      playSound("snap");
      return true;
    },
    throwToPile,
    matchDrawn,
    dropHeldOn: (i) =>
      exchange(
        selected.includes(i) ? [i, ...selected.filter((x) => x !== i)] : [i],
      ),
    discardHeld,
    draw,
  };

  // A pile-to-slot drag is two validated actions: draw, then swap.
  useEffect(() => {
    const queued = queuedSwap.current;
    if (!queued) return;
    if (
      room.error ||
      room.status !== "connected" ||
      !mine ||
      s.phase !== "playing"
    ) {
      queuedSwap.current = null;
      return;
    }
    if (room.pending) return;
    if (s.version > queued.version) {
      queuedSwap.current = null;
      if (s.drawn) exchange([queued.index]);
    }
  }, [
    s.version,
    s.drawn,
    s.phase,
    mine,
    room.pending,
    room.error,
    room.status,
  ]);

  // Settle a reorder: once the server's order arrives the cards already sit
  // in their new places, so snap transforms home without a second animation.
  useLayoutEffect(() => {
    const revision = pendingMove.current;
    if (revision === null) return;
    const els = handCards(handRef.current);
    if (me.handRevision !== revision) {
      pendingMove.current = null;
      els.forEach((el, i) => {
        // .hc's transition is `!important`, so a plain inline override can't
        // beat it — without `important` here the "instant" snap would still
        // animate over 0.26s, showing as a confusing second reorder.
        el.style.setProperty("transition", "none", "important");
        el.style.transform = fanTransform(els.length, i);
        el.style.zIndex = String(i);
        el.classList.remove("lifting");
      });
      void handRef.current?.offsetWidth;
      els.forEach((el) => el.style.removeProperty("transition"));
    } else if (!room.pending) {
      pendingMove.current = null;
      els.forEach((el, i) => {
        el.style.transform = fanTransform(els.length, i);
        el.style.zIndex = String(i);
      });
    }
  }, [me.handRevision, room.pending, room.error]);

  // ----- pointer controller: drag to reorder, place, throw and draw -----
  useEffect(() => {
    const root = rootRef.current!;
    let drag: Drag | null = null;
    const hit = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]")
        ?.dataset.drop ?? null;
    // Placing a card shouldn't need aim: anywhere in a generous band over the
    // hand picks the nearest card, judged from the centre of the dragged card.
    const nearestSlot = (card: Element) => {
      const c = card.getBoundingClientRect();
      const x = c.left + c.width / 2,
        y = c.top + c.height / 2;
      const rects = handCards(handRef.current).map((e) =>
        e.getBoundingClientRect(),
      );
      if (!rects.length) return null;
      const h = rects[0].height;
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      if (y < top - h * 0.9 || x < left - h * 0.7 || x > right + h * 0.7)
        return null;
      let best = 0;
      rects.forEach((r, i) => {
        const mid = (q: DOMRect) => Math.abs(q.left + q.width / 2 - x);
        if (mid(r) < mid(rects[best])) best = i;
      });
      return `hand-${best}`;
    };
    const mark = (name: string | null) => {
      root
        .querySelectorAll(".drop-target")
        .forEach((e) => e.classList.remove("drop-target"));
      if (name)
        root
          .querySelector(`[data-drop="${name}"]`)
          ?.classList.add("drop-target");
    };
    const settleHand = (d: Drag, animate: boolean) => {
      d.els.forEach((el, i) => {
        el.classList.remove("lifting");
        el.style.pointerEvents = "";
        el.style.zIndex = String(i);
        if (!animate) el.style.transition = "none";
        el.style.transform = fanTransform(d.els.length, i);
      });
      if (!animate) {
        void root.offsetWidth;
        d.els.forEach((el) => (el.style.transition = ""));
      }
      landingRef.current?.classList.remove("on");
    };
    const begin = (d: Drag) => {
      const H = handlers.current;
      const hand = /^hand-(\d+)$/.exec(d.src);
      if (hand) {
        const k = Number(hand[1]);
        const els = handCards(handRef.current);
        d.els = els;
        d.offs = els.map((e) => e.offsetLeft);
        d.k = d.to = k;
        if (H.selected.includes(k) && H.selected.length > 1) {
          if (!H.canFreeThrow && !H.holding) return false;
          d.kind = "group";
          d.group = [...H.selected];
          d.group.forEach((i) => els[i]?.classList.add("lifting"));
        } else {
          if (!H.canReorder) return false;
          if (H.selected.length) H.clear();
          d.kind = "hand";
          d.el.classList.add("lifting");
        }
        els.forEach((e) => (e.style.pointerEvents = "none"));
        return true;
      }
      if (d.src === "held") {
        if (!H.holding) return false;
        d.kind = "held";
        d.el.classList.add("lifting");
        d.el.style.pointerEvents = "none";
        return true;
      }
      if (
        (d.src === "deck" || d.src === "discard") &&
        H.canDraw &&
        (d.src === "deck" || H.hasDiscard)
      ) {
        d.kind = "pile";
        const r = d.el.getBoundingClientRect();
        const ghost = d.el.cloneNode(true) as HTMLElement;
        ghost.classList.add("drag-ghost");
        Object.assign(ghost.style, {
          left: `${r.left}px`,
          top: `${r.top}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
        });
        root.appendChild(ghost);
        d.ghost = ghost;
        return true;
      }
      return false;
    };
    const move = (d: Drag, dx: number, dy: number, x: number, y: number) => {
      const H = handlers.current;
      const over = hit(x, y);
      if (d.kind === "hand") {
        const f = fan(d.els.length, d.k);
        d.el.style.transform = `translate(${dx}px, ${f.y + dy}px) rotate(${dx / 40}deg) scale(1.08)`;
        d.over =
          (over === "discard" && H.canFreeThrow) ||
          (over === "held" && H.tossable)
            ? over
            : null;
        mark(d.over);
        const w = d.el.offsetWidth;
        let to = d.k;
        if (!d.over && dy > -d.el.offsetHeight * 1.5) {
          const x0 = d.offs[d.k] + w / 2 + dx;
          let best = Infinity;
          d.offs.forEach((o, j) => {
            const dist = Math.abs(o + w / 2 - x0);
            if (dist < best) {
              best = dist;
              to = j;
            }
          });
        }
        d.to = to;
        const count = d.els.length;
        d.els.forEach((el, j) => {
          if (j === d.k) return;
          let slot = j;
          if (d.k < to && j > d.k && j <= to) slot = j - 1;
          if (to < d.k && j >= to && j < d.k) slot = j + 1;
          const fs = fan(count, slot);
          el.style.transform = `translate(${d.offs[slot] - d.offs[j]}px, ${fs.y}px) rotate(${fs.r}deg)`;
        });
        const slotEl = landingRef.current;
        if (slotEl) {
          const ft = fan(count, to);
          slotEl.style.left = `${d.offs[to]}px`;
          slotEl.style.transform = `translate(0, ${ft.y}px) rotate(${ft.r}deg)`;
          slotEl.classList.toggle("on", to !== d.k);
        }
      } else if (d.kind === "group") {
        const f = fan(d.els.length, d.k);
        d.group.forEach((i, gi) => {
          const el = d.els[i];
          if (!el) return;
          el.style.zIndex = String(40 + gi);
          el.style.transform = `translate(${d.offs[d.k] - d.offs[i] + dx + gi * 5}px, ${f.y + dy - gi * 4}px) rotate(${gi * 4 - 4}deg) scale(1.06)`;
        });
        d.over =
          (over === "discard" && H.canFreeThrow) ||
          (over === "held" && H.tossable)
            ? over
            : null;
        mark(d.over);
      } else if (d.kind === "held") {
        d.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 30}deg) scale(1.05)`;
        d.over = over === "discard" && H.tossable ? over : nearestSlot(d.el);
        mark(d.over);
      } else if (d.kind === "pile" && d.ghost) {
        d.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 30}deg) scale(1.05)`;
        d.over = nearestSlot(d.ghost);
        mark(d.over);
      }
    };
    const finish = (d: Drag, dy: number, cancel: boolean) => {
      const H = handlers.current;
      mark(null);
      if (d.kind === "hand") {
        if (!cancel && d.over === "discard") {
          settleHand(d, true);
          return H.throwToPile([d.k]);
        }
        if (!cancel && d.over === "held") {
          settleHand(d, true);
          return H.matchDrawn([d.k]);
        }
        const to = cancel ? d.k : d.to;
        d.els.forEach((el) => (el.style.pointerEvents = ""));
        landingRef.current?.classList.remove("on");
        if (to === d.k || !H.reorder(d.k, to)) return settleHand(d, true);
        // Glide into the gap and wait there for the server's order.
        const ft = fan(d.els.length, to);
        d.el.classList.remove("lifting");
        d.el.style.zIndex = "30";
        d.el.style.transform = `translate(${d.offs[to] - d.offs[d.k]}px, ${ft.y}px) rotate(${ft.r}deg)`;
      } else if (d.kind === "group") {
        settleHand(d, true);
        if (cancel) return;
        if (d.over === "discard") H.throwToPile(d.group);
        else if (d.over === "held") H.matchDrawn(d.group);
      } else if (d.kind === "held") {
        d.el.classList.remove("lifting");
        d.el.style.pointerEvents = "";
        const slot = d.over && /^hand-(\d+)$/.exec(d.over);
        if (!cancel && slot) return H.dropHeldOn(Number(slot[1]));
        if (!cancel && H.tossable && (d.over === "discard" || dy < -90))
          return H.discardHeld();
        d.el.style.transform = "";
      } else if (d.kind === "pile") {
        d.ghost?.remove();
        if (cancel) return;
        const slot = d.over && /^hand-(\d+)$/.exec(d.over);
        if (slot) H.draw(d.src as "deck" | "discard", Number(slot[1]));
        else if (dy > 40) H.draw(d.src as "deck" | "discard");
      }
    };
    const tap = (d: Drag) => {
      const H = handlers.current;
      const hand = /^hand-(\d+)$/.exec(d.src);
      if (hand) H.tapHand(Number(hand[1]), d.modifier);
      else if (d.src === "deck") H.tapDeck();
      else if (d.src === "discard") H.tapDiscard();
    };
    const down = (e: PointerEvent) => {
      if (e.button > 0 || drag) return;
      const target = e.target as HTMLElement;
      const src = target.closest<HTMLElement>("[data-src]");
      if (!src || src.getAttribute("aria-disabled") === "true") {
        if (target.closest("[data-clear]")) handlers.current.clear();
        return;
      }
      const d: Drag = {
        src: src.dataset.src!,
        el: src,
        x0: e.clientX,
        y0: e.clientY,
        active: false,
        long: false,
        modifier: e.shiftKey || e.ctrlKey || e.metaKey,
        els: [],
        offs: [],
        k: -1,
        to: -1,
        group: [],
        over: null,
      };
      drag = d;
      try {
        src.setPointerCapture(e.pointerId);
      } catch {
        /* Capture is a nicety; moves still bubble to the table. */
      }
      if (e.pointerType !== "mouse" && d.src.startsWith("hand-"))
        d.timer = setTimeout(() => {
          if (drag === d && !d.active) {
            d.long = true;
            handlers.current.longPress(Number(d.src.slice(5)));
          }
        }, 420);
    };
    const moveListener = (e: PointerEvent) => {
      const d = drag;
      if (!d) return;
      const dx = e.clientX - d.x0,
        dy = e.clientY - d.y0;
      if (!d.active) {
        if (Math.hypot(dx, dy) < 8 || d.long) return;
        clearTimeout(d.timer);
        if (!begin(d)) {
          drag = null;
          return;
        }
        d.active = true;
      }
      move(d, dx, dy, e.clientX, e.clientY);
    };
    const end = (e: PointerEvent) => {
      const d = drag;
      if (!d) return;
      drag = null;
      clearTimeout(d.timer);
      const cancel = e.type !== "pointerup";
      if (d.active) finish(d, e.clientY - d.y0, cancel);
      else if (!d.long && !cancel) tap(d);
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", moveListener);
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("lostpointercapture", end);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", moveListener);
      root.removeEventListener("pointerup", end);
      root.removeEventListener("pointercancel", end);
      root.removeEventListener("lostpointercapture", end);
    };
  }, []);

  // ----- keyboard -----
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const node = event.target as HTMLElement;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        node.closest("input,select,textarea,[contenteditable=true]") ||
        document.querySelector(".modal-backdrop,[aria-modal=true]")
      )
        return;
      const k = event.key.toLowerCase();
      const digit = /^Digit([1-9])$/.exec(event.code);
      let handled = true;
      if (k === "escape") {
        setSelected([]);
        setFirstPick(null);
        setTray(null);
        setKeys(false);
        setEmotes(false);
      } else if (k === "?") setKeys((v) => !v);
      else if (disabled || !inRound) return;
      else if (choosing && /^Digit[0-2]$/.test(event.code))
        act({ type: "peekCount", count: Number(event.code.slice(5)) });
      else if (digit) {
        const i = Number(digit[1]) - 1;
        if (i >= n) return;
        if (event.shiftKey && canSelect) toggle(i);
        else tapHand(i, false);
      } else if (k === "e") draw("deck");
      else if (k === "r") draw("discard");
      else if (k === "x") discardHeld();
      else if (k === "d" && canCall) act({ type: "call" });
      else if (k === "l" && s.phase === "peeking" && !me.peekDone)
        act({ type: "finishPeek" });
      else if (k === "s" && picking) skipPower();
      else if (k === "t" && selected.length && canFreeThrow)
        throwToPile(selected);
      else if (k === "k" && selected.length && holding) exchange(selected);
      else if ((k === "arrowleft" || k === "arrowright") && event.shiftKey) {
        const focused = (
          document.activeElement as HTMLElement
        )?.closest<HTMLElement>(".hc");
        const from = Number(focused?.dataset.drop?.slice(5));
        if (!focused || Number.isNaN(from)) return;
        const to = Math.max(
          0,
          Math.min(n - 1, from + (k === "arrowright" ? 1 : -1)),
        );
        if (to !== from) {
          act({ type: "reorder", from, to, handRevision: me.handRevision });
          requestAnimationFrame(() =>
            handRef.current
              ?.querySelector<HTMLElement>(`[data-drop="hand-${to}"]`)
              ?.focus(),
          );
        }
      } else handled = false;
      if (handled) event.preventDefault();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  // ----- motion -----
  const motionOn = effects && !reducedMotion();
  const dealt = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Every round opens with the moderator choosing; that is when the deal happens.
    if (s.phase !== "choosing") return;
    const key = `${s.round}:${s.history.length}`;
    if (dealt.current === key) return;
    dealt.current = key;
    if (!motionOn) {
      playSound("deal");
      return;
    }
    const root = rootRef.current;
    const deck = root?.querySelector<HTMLElement>(".deck");
    if (!root || !deck) return;
    // Deal like a person would: one card to each seat in turn, four times
    // round, starting with whoever plays first.
    const order = s.players.map(
      (_, i) => s.players[(s.turn + i) % s.players.length].id,
    );
    const most = Math.max(...s.players.map((p) => p.hand.length));
    const slots: HTMLElement[] = [];
    for (let k = 0; k < most; k++)
      for (const id of order) {
        const el = root.querySelector<HTMLElement>(
          `[data-player-slot="${id}:${k}"]`,
        );
        if (el) slots.push(el);
      }
    const shuffle = 1300;
    const gap = Math.min(130, 2600 / Math.max(1, slots.length));
    const animations = slots.map((el, i) =>
      dealIn(el, deck, shuffle + i * gap),
    );
    const timers = slots.map((_, i) =>
      setTimeout(() => playSound("deal"), shuffle + i * gap),
    );
    // The shuffle sound comes from the server with the new round.
    void riffle(deck, root, shuffle - 60);
    return () => {
      timers.forEach(clearTimeout);
      animations.forEach((a) => a.finish());
      root.querySelectorAll(".riffle-card").forEach((c) => c.remove());
      dealt.current = null;
    };
  }, [s.phase, s.round, s.history.length]);
  const heldId = s.drawn?.card?.id;
  useLayoutEffect(() => {
    if (!holding || !motionOn) return;
    const held = rootRef.current?.querySelector<HTMLElement>(".held");
    const from = rootRef.current?.querySelector(
      s.drawn?.fromDeck ? ".deck" : ".discard",
    );
    if (held && from) flyFrom(held, from, { duration: 380, rotate: -6 });
  }, [heldId]);
  const topId = s.discard.at(-1)?.id;
  const firstTop = useRef(topId);
  useLayoutEffect(() => {
    if (topId === firstTop.current) return;
    firstTop.current = topId;
    const top = rootRef.current?.querySelector(".discard .pc");
    if (top && motionOn)
      top.animate(
        [
          {
            transform: "translateY(-18px) scale(1.18) rotate(-7deg)",
            opacity: 0.4,
          },
          { transform: "none", opacity: 1 },
        ],
        { duration: 300, easing: EASE },
      );
  }, [topId]);
  // My hand only grows mid-round through a penalty card.
  const myCount = useRef(n);
  useLayoutEffect(() => {
    if (n > myCount.current && s.phase !== "peeking") {
      const cards = handCards(handRef.current);
      const deck = rootRef.current?.querySelector(".deck");
      const last = cards.at(-1);
      if (last && deck && motionOn) flyFrom(last, deck, { duration: 480 });
      shake(handRef.current);
      flash("No match · +1 card");
    }
    myCount.current = n;
  }, [n]);
  // Glow the slot your new card landed in.
  useLayoutEffect(() => {
    const event = s.swapEvent;
    if (!event || event.actorId !== s.you || event.label !== "Card exchanged")
      return;
    const slot = event.highlightSlots?.find((h) => h.playerId === s.you);
    if (slot)
      pulse(
        handRef.current?.querySelector(`[data-drop="hand-${slot.index}"] .pc`),
      );
  }, [s.swapEvent?.version]);
  const caller = useRef(s.caller);
  useEffect(() => {
    if (s.caller && s.caller !== caller.current) {
      setStamp(s.players.find((p) => p.id === s.caller)?.name ?? "");
      const t = setTimeout(() => setStamp(null), 1900);
      caller.current = s.caller;
      return () => clearTimeout(t);
    }
    caller.current = s.caller;
  }, [s.caller]);
  // The Dutch alarm loops for the whole last lap, at the player's chosen level.
  const alarmOn = usePrefs((p) => p.sound && p.dutchAlarm);
  const alarmVolume = usePrefs((p) => p.alarmVolume);
  const lastLap = !!s.caller && ["playing", "power"].includes(s.phase);
  useEffect(() => {
    if (alarmOn && lastLap) startDutchAlarm(alarmVolume);
    else stopDutchAlarm();
  }, [alarmOn, alarmVolume, lastLap]);
  useEffect(() => stopDutchAlarm, []);
  const outOfCards = useRef(s.autoDutch);
  useEffect(() => {
    if (s.autoDutch && s.autoDutch !== outOfCards.current) {
      const name = s.players.find((p) => p.id === s.autoDutch)?.name ?? "";
      setStamp(`${name} is out · last lap`);
      const t = setTimeout(() => setStamp(null), 1900);
      outOfCards.current = s.autoDutch;
      return () => clearTimeout(t);
    }
    outOfCards.current = s.autoDutch;
  }, [s.autoDutch]);
  const message = useRef(s.message);
  useEffect(() => {
    if (s.message === message.current) return;
    message.current = s.message;
    if (s.message.startsWith("Dutch cancelled")) flash("Dutch cancelled");
  }, [s.message]);

  // Chips float over the middle of the current selection.
  useLayoutEffect(() => {
    const chips = chipsRef.current;
    if (!chips) return;
    const cards = handCards(handRef.current);
    const xs = selected
      .map((i) => cards[i])
      .filter(Boolean)
      .map((c) => c.offsetLeft + c.offsetWidth / 2);
    const planned = plan.length
      ? cards.map((c) => c.offsetLeft + c.offsetWidth / 2)
      : [];
    const peeked = liveReveals
      .filter((r) => r.owner === s.you)
      .map((r) => cards[r.index])
      .filter(Boolean)
      .map((c) => c.offsetLeft + c.offsetWidth / 2);
    const all = xs.length ? xs : planned.length ? planned : peeked;
    chips.style.left = all.length
      ? `${all.reduce((a, b) => a + b, 0) / all.length}px`
      : "50%";
  });

  // ----- hint: three words at most, routine ones retire after a few turns -----
  const veteran = turnsPlayed >= 6;
  const activeName = s.players.find((p) => p.id === activeId)?.name ?? "";
  let hint = "";
  let quiet = false;
  let routine = false;
  if (s.pendingCall) {
    const caller = s.players.find((pl) => pl.id === s.pendingCall!.actor);
    hint = myPendingCall
      ? "Tap undo or wait"
      : `${caller?.name ?? "A player"} called Dutch`;
    quiet = true;
  } else if (s.phase === "choosing") {
    hint = choosing
      ? "Cards to see?"
      : `${moderator?.name ?? "Moderator"} is choosing`;
    quiet = !choosing;
  } else if (s.phase === "peeking")
    hint = me.peekDone
      ? "Waiting for others"
      : `Peek ${["no", "one", "two"][peekCount] ?? peekCount} card${peekCount === 1 ? "" : "s"}`;
  else if (picking) {
    const swapTotal = s.handPower?.remaining ?? 1;
    const swapNote = swapTotal > 1 ? ` (swap ${plan.length + 1} of ${swapTotal})` : "";
    hint =
      s.power === "blindSwap"
        ? (firstPick ? "Pick second card" : "Pick two cards") + swapNote
        : s.power === "ownPeek"
          ? "Peek one card"
          : "Peek their card";
  }
  else if (s.phase === "power") {
    hint = `${activeName}’s power`;
    quiet = true;
  } else if (selected.length)
    hint = holding ? "Swap or throw" : "Throw on pile";
  else if (holding) {
    hint = tossable ? "Keep or discard" : "Swap it in";
    routine = true;
  } else if (mine) {
    hint = "Draw a card";
    routine = true;
  } else if (canCall) hint = "Call Dutch?";
  else {
    hint = `${activeName}’s turn`;
    quiet = true;
    routine = true;
  }
  if (routine && veteran) hint = "";

  const positions = seatPositions(opponents.length, arena.w, arena.h);
  const pickedOf = (playerId: string) => [
    ...(firstPick?.playerId === playerId ? [firstPick.index] : []),
    ...plan.flatMap((pair) => [
      ...(pair.firstPlayerId === playerId ? [pair.firstIndex] : []),
      ...(pair.secondPlayerId === playerId ? [pair.secondIndex] : []),
    ]),
  ];
  const myPicked = pickedOf(s.you);
  const trayPlayer = opponents.find((p) => p.id === tray);
  const handInteractive = inRound && !disabled;
  const placeable = holding && !selected.length;

  return (
    <section
      className={`table ${motionOn ? "" : "still"}`}
      ref={rootRef}
      aria-label="Card table"
    >
      <header className="table-top">
        <div className="table-brand">
          <Diamond />
          <span className="room-chip" data-testid="room-code">
            {room.code}
          </span>
        </div>
        {inRound && (
          <TurnPill state={s} activeId={activeId} powerMine={powerMine} />
        )}
        <div className="table-tools">
          <button
            className="tool"
            aria-label="Settings"
            onClick={() => open("settings")}
          >
            <Settings size={18} />
          </button>
          <button
            className="tool"
            aria-label="Leave table"
            onClick={() => open("leave")}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="arena" ref={arenaRef} data-clear>
        <div className="felt" data-clear />
        {opponents.map((p, i) => (
          <Seat
            key={p.id}
            state={s}
            player={p}
            x={positions[i]?.x ?? 0}
            y={positions[i]?.y ?? 0}
            active={s.phase !== "peeking" && activeId === p.id}
            moderator={s.moderator === p.id}
            pickable={pickOpponents && !disabled}
            picked={pickedOf(p.id)}
            onOpen={() => setTray(p.id)}
          />
        ))}
        <div className="piles">
          {hint && (
            <p className={`hint ${quiet ? "quiet" : ""}`} role="status">
              <i />
              {hint}
              {picking && (
                <button className="chip inline" onClick={skipPower}>
                  Skip
                </button>
              )}
            </p>
          )}
          <div
            className={`heap deck ${canDraw ? "can" : ""}`}
            data-src="deck"
            data-drop="deck"
            role="button"
            tabIndex={canDraw ? 0 : -1}
            aria-label={`Draw pile, ${s.deckCount} cards`}
            aria-disabled={!canDraw}
            onKeyDown={(e) => e.key === "Enter" && draw("deck")}
          >
            <PlayingCard back="black" className="under2" />
            <PlayingCard back="red" className="under1" />
            <PlayingCard back={s.deckBack ?? "black"} />
            <span className="count">{s.deckCount}</span>
          </div>
          <div
            className={`heap discard ${canDraw && s.discard.length ? "can" : ""} ${tossable ? "toss" : ""} ${s.discard.length ? "" : "empty"}`}
            data-src="discard"
            data-drop="discard"
            role="button"
            tabIndex={canDraw || tossable ? 0 : -1}
            aria-label={
              tossable
                ? "Discard your new card"
                : s.discard.at(-1)
                  ? `Discard pile, ${cardName(s.discard.at(-1)!)}`
                  : "Empty discard pile"
            }
            aria-disabled={!(canDraw || tossable || canFreeThrow)}
            onKeyDown={(e) =>
              e.key === "Enter" && (tossable ? discardHeld() : draw("discard"))
            }
          >
            {s.discard.at(-1) && <PlayingCard card={s.discard.at(-1)} />}
            {tossable && (
              <span className="toss-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
              </span>
            )}
          </div>
        </div>
        {choosing && (
          <div
            className="mod-pick"
            role="group"
            aria-label="How many cards everyone may see"
          >
            {PEEK_CHOICES.map((count) => (
              <button
                key={count}
                disabled={disabled}
                onClick={() => act({ type: "peekCount", count })}
                aria-label={`${count} card${count === 1 ? "" : "s"}`}
              >
                {count}
              </button>
            ))}
          </div>
        )}
        {trayPlayer && (
          <Tray
            player={trayPlayer}
            picked={pickedOf(trayPlayer.id)}
            onPick={(i) => pick(trayPlayer.id, i)}
            onClose={() => setTray(null)}
          />
        )}
      </div>

      <div className="dock">
        <div className="me">
          <button
            className="me-avatar"
            aria-label="Send a reaction"
            aria-expanded={emotes}
            onClick={() => setEmotes((v) => !v)}
          >
            <Avatar
              avatar={me.avatar}
              name={me.name}
              active={activeId === me.id && s.phase !== "peeking"}
            />
            {s.moderator === me.id && (
              <span className="mod-badge" aria-label="You moderate this round">
                <Gavel size={12} />
              </span>
            )}
            <span className="smile" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
              </svg>
            </span>
          </button>
          {emotes && (
            <div className="emotes">
              {EMOTES.map((e) => (
                <button
                  key={e}
                  aria-label={`React ${e}`}
                  onClick={() => {
                    emote(e);
                    setEmotes(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {room.reactions[me.id] && (
            <span className="emote-bubble">{room.reactions[me.id]}</span>
          )}
        </div>

        <div
          className={`hand ${placeable ? "placeable" : ""}`}
          ref={handRef}
          style={{ "--n": Math.max(1, n) } as CSSProperties}
        >
          <div className="drop-slot" ref={landingRef} />
          {me.hand.map((card, i) => {
            const peekable =
              s.phase === "peeking" &&
              !me.peekDone &&
              myPeeks < peekCount &&
              !card;
            const pickable =
              picking && (s.power === "blindSwap" || s.power === "ownPeek");
            return (
              <button
                key={i}
                className={`hc ${selected.includes(i) || myPicked.includes(i) ? "sel" : ""} ${peekable || pickable ? "beckon" : ""}`}
                data-src={handInteractive ? `hand-${i}` : undefined}
                data-drop={`hand-${i}`}
                data-player-slot={`${me.id}:${i}`}
                aria-disabled={!handInteractive}
                aria-pressed={selected.includes(i)}
                aria-label={`Your card ${i + 1}${card ? `, ${cardName(card)}` : ""}`}
                style={{ transform: fanTransform(n, i), zIndex: i }}
                onClick={(e) => e.detail === 0 && tapHand(i, e.shiftKey)}
              >
                <PlayingCard card={card} back={me.handBacks?.[i]} />
                <em className="slot-key">{i + 1}</em>
              </button>
            );
          })}
          {holding && s.drawn && (
            <div className="held-dock">
              <div
                className="held"
                data-src="held"
                data-drop="held"
                aria-label={`Your new card${s.drawn.card ? `, ${cardName(s.drawn.card)}` : ""}`}
              >
                <PlayingCard card={s.drawn.card} back={s.drawn.back} />
              </div>
            </div>
          )}
          {(selected.length > 0 ||
            plan.length > 0 ||
            liveReveals.length > 0) && (
            <div className="chips" ref={chipsRef}>
              {selected.length > 0 && holding && (
                <button
                  className="chip hot"
                  aria-label={`Put your new card here and drop ${selected.length}`}
                  onClick={() => exchange(selected)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4" />
                  </svg>
                  {selected.length}
                </button>
              )}
              {selected.length > 0 && canFreeThrow && (
                <button
                  className={`chip ${holding ? "" : "hot"}`}
                  aria-label={`Throw ${selected.length} on the pile`}
                  onClick={() => throwToPile(selected)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                  {selected.length}
                </button>
              )}
              {liveReveals.length > 0 && (
                <button
                  className="chip hot"
                  aria-label="Done looking, turn the card face-down"
                  onClick={() => veil(liveKeys)}
                >
                  <EyeOff size={15} />
                  Done
                </button>
              )}
              {plan.length > 0 && (
                <button
                  className="chip hot"
                  aria-label={`Apply ${plan.length} planned swap${plan.length === 1 ? "" : "s"}`}
                  onClick={() => {
                    submitSwaps(plan);
                    setPlan([]);
                  }}
                >
                  <Check size={15} />
                  {plan.length}
                </button>
              )}
            </div>
          )}
        </div>

        {s.phase === "peeking" ? (
          <button
            className="primary"
            disabled={disabled || me.peekDone}
            onClick={() => act({ type: "finishPeek" })}
          >
            {me.peekDone ? <Check size={20} /> : <span>Done</span>}
          </button>
        ) : myPendingCall ? (
          <button
            className="primary dutch undo"
            onClick={() => act({ type: "undoCall" })}
            aria-label="Undo Dutch call"
          >
            <span>Undo · {undoSecs}s</span>
          </button>
        ) : (
          <button
            className={`primary dutch ${canCall && !mine ? "window" : ""}`}
            disabled={!canCall}
            onClick={() => act({ type: "call" })}
            aria-label="Call Dutch"
          >
            <span>Dutch!</span>
          </button>
        )}
      </div>

      {toast && (
        <div className="table-toast" role="status">
          {toast}
        </div>
      )}
      {stamp !== null && (
        <div className="dutch-stamp" role="status" aria-live="assertive">
          <b>Dutch!</b>
          <span>{stamp}</span>
        </div>
      )}
      {keys && <KeysOverlay close={() => setKeys(false)} />}
      <SwapAnimation event={s.swapEvent} enabled={effects} />
    </section>
  );
}

function handCards(hand: HTMLElement | null) {
  return Array.from(hand?.querySelectorAll<HTMLElement>(".hc") ?? []);
}

function KeysOverlay({ close }: { close: () => void }) {
  const rows: [string, string][] = [
    ["E", "Draw from deck"],
    ["R", "Take the discard"],
    ["1–9", "Place new card / peek / pick"],
    ["⇧ 1–9", "Select cards"],
    ["T", "Throw selected on the pile"],
    ["K", "New card in, selected out"],
    ["X", "Discard new card"],
    ["D", "Call Dutch"],
    ["L", "Done peeking"],
    ["S", "Skip power"],
    ["⇧ ← →", "Move focused card"],
    ["Esc", "Clear"],
  ];
  return (
    <div
      className="keys"
      onClick={close}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div>
        {rows.map(([k, label]) => (
          <span key={k}>
            <kbd>{k}</kbd>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
