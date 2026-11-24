import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Check, EyeOff, Layers } from "lucide-react";
import {
  PEEK_CHOICES,
  CHOOSE_SECONDS,
  FINAL_REACTION_MS,
  REACTION_WINDOW_MS,
  canCallDutch,
  powerOwnerId,
  value as cardValue,
  type Card,
  type CardBack,
  type GameView,
  type SwapPair,
} from "@engine";
import { EMOTES } from "../../../shared/protocol";
import { BoardScale } from "../board";
import { FELT, avatarHue } from "../../tokens";
import { SwapAnimation } from "../SwapAnimation";
import {
  playSound,
  preloadEmoteSounds,
  startDutchAlarm,
  stopDutchAlarm,
  turnSound,
} from "../sound";
import { act, emote, reorderHand, usePrefs, useRoom } from "../store";
import { Bursts, ChatButton, ChatPanel, ChatToast, NetBadge, TableMenu } from "./TableChrome";
import type { ModalName } from "../ui";
import { PlayingCard, cardName } from "./PlayingCard";
import { DiscardTray, RivalPlate, Seat, Tray } from "./Seats";
import { BOT_AVATAR } from "../../../shared/avatars";
import { Seconds, StatusBand, TimerLine } from "./Clock";
import {
  EASE,
  fan,
  fanTransform,
  dealIn,
  flyCard,
  flyFrom,
  glideFrom,
  landFlights,
  pulse,
  riffle,
  reducedMotion,
  shake,
  throwCards,
} from "./motion";
import "./table.css";
import "./board.css";

const Y = "oklch(0.9 0.17 100)";
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
  revision: number;
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
  flySwapIn: (heldEl: Element, index: number) => void;
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
/** How long a flown card may wait on its target for the server's answer before it lets go anyway. */
const HOLD = 1500;
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
  coach,
  keepSeen = false,
}: {
  state: GameView;
  open: (m: ModalName) => void;
  /** Practice mode: this panel takes the app bar's place (the tutorial's coach). */
  coach?: ReactNode;
  /** Practice mode: cards you've seen stay face up instead of turning back after five seconds. */
  keepSeen?: boolean;
}) {
  // Narrow subscriptions: the ping's latency, chat, bursts and the sync flag must not re-render the whole table.
  const pending = useRoom((r) => r.pending);
  const status = useRoom((r) => r.status);
  const roomError = useRoom((r) => r.error);
  const seats = useRoom((r) => r.env?.seats);
  const effects = usePrefs((p) => p.effects);
  // A peeked card (Jack power, Queen-swap peek) turns face-down again after
  // Done or five seconds. Initial peeks keep their own Done button.
  const [veiled, setVeiled] = useState<Set<string>>(() => new Set());
  // Keyed by card identity, not slot: reordering must never flip a card you already turned back down.
  const revealKey = (owner: string, _index: number, id: string) =>
    `${owner}:${id}`;
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
    if (!liveKeys.length || keepSeen) return;
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
    s.phase === "reaction"
      ? null
      : s.phase === "power"
      ? powerOwner
      : s.phase === "choosing"
        ? (s.moderator ?? null)
        : s.players[s.turn]?.id;
  const online = status === "connected";
  const disabled = !!pending || !online || !!s.pendingCall;
  const inRound = ["choosing", "peeking", "playing", "power", "reaction"].includes(s.phase);
  const peekCount = s.peekCount ?? 2;
  const moderator = s.players.find((p) => p.id === s.moderator);
  const choosing = s.phase === "choosing" && s.moderator === s.you;

  const [selected, setSelected] = useState<number[]>([]);
  const [firstPick, setFirstPick] = useState<Pick | null>(null);
  const [plan, setPlan] = useState<SwapPair[]>([]);
  const [tray, setTray] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pickup, setPickup] = useState<{
    key: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    fromDeck: boolean;
    back: CardBack;
    card: Card | null;
  } | null>(null);
  /** A draw on its way to the server, already shown travelling to your hand. */
  const [drawing, setDrawing] = useState<{ fromDeck: boolean; back: CardBack; card: Card | null } | null>(null);
  const earlyHeld = useRef(false);
  const [emotes, setEmotes] = useState(false);
  const [keys, setKeys] = useState(false);
  const [toast, setToast] = useState("");
  const [, setTurnsPlayed] = useState(readTurns);

  const rootRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  /** One design pixel in screen pixels: the board is the design's 390 × 844 frame, scaled to fit. */
  const [k, setK] = useState(1);
  /** Board width in design pixels: 390 at the design's own shape, wider on screens that are shorter than 390 × 844. */
  const [bw, setBw] = useState(390);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const scale = Math.max(0.4, Math.min(el.clientWidth / 390, el.clientHeight / 786));
      setK(scale);
      // Height decides the scale; spare width is given to the table instead of leaving empty margins.
      setBw(Math.round(Math.min(480, Math.max(390, el.clientWidth / scale))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [touch, setTouch] = useState<{ id: string; i: number }[]>([]);
  const touchedVersion = useRef(s.swapEvent?.version);
  const arenaRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const landingRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const queuedSwap = useRef<{ index: number; version: number; early?: boolean } | null>(null);
  /** Your cards in the air: the thrown slots and where every hand card stood at release, for the glide after. */
  const flight = useRef<{
    removed: number[];
    rects: DOMRect[];
    at: number;
    revision: number;
  } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const handlers = useRef<Handlers>(null!);
  /** When a card last left your hand by your own gesture, so the generic throw animation stays out of its way. */
  const lastFling = useRef(0);

  const holding = mine && s.phase === "playing" && !!s.drawn;
  const tossable = holding && !!s.drawn?.fromDeck;
  const canDraw = !disabled && mine && s.phase === "playing" && !s.drawn;
  const topCard = s.discard.at(-1);
  // A card you free-threw stays out of your reach, even when it's back on top on your turn.
  const ownThrowOnTop = !!topCard && s.freeThrown?.[topCard.id] === s.you;
  const canTakeDiscard = canDraw && !!topCard && !ownThrowOnTop;
  const canFreeThrow =
    !disabled &&
    (s.phase === "playing" || s.phase === "reaction" || (s.phase === "power" && !!s.handPower)) &&
    s.rules.burning !== "off" &&
    (!!s.discard.length || tossable);
  const canSelect = canFreeThrow || (holding && !disabled);
  // The window keeps the discarded rank matchable for everyone, even after someone
  // else's reaction already changed the physical top card.
  const reactionLive = !!s.reactionWindow && Date.now() < s.reactionWindow.deadline;
  const picking = s.phase === "power" && powerMine;
  const pickOpponents =
    picking && (s.power === "blindSwap" || s.power === "otherPeek" || s.power === "rearrange");
  const canCall = !disabled && canCallDutch(s, s.you);
  const myPeeks = s.reveals.filter((r) => r.owner === s.you).length;
  // A hand Jack's peek never blocks the table: it just sits here, usable on your own
  // cards whenever you like, independent of whose turn or power it currently is.
  const jackPeeksPending = disabled ? 0 : (s.peeks ?? 0);
  const n = me.hand.length;
  const myPendingCall =
    s.pendingCall?.actor === s.you ? s.pendingCall : null;
  // Once every allowed card has been seen, the peek finishes itself after a short look (DONE still ends it sooner).
  const peekSeen = s.phase === "peeking" && !me.peekDone && peekCount > 0 && myPeeks >= peekCount;
  useEffect(() => {
    if (!peekSeen) return;
    const t = setTimeout(() => act({ type: "finishPeek" }), 2500);
    return () => clearTimeout(t);
  }, [peekSeen]);
  // No clock ticks in here (see Clock.tsx); the only time-driven flag is the reaction window, so wake up once when it closes.
  const [, wake] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const ms = (s.reactionWindow?.deadline ?? 0) - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(wake, ms + 10);
    return () => clearTimeout(t);
  }, [s.reactionWindow?.deadline]);

  const flash = (text: string) => setToast(text);
  useEffect(() => {
    if (!roomError) return;
    setToast(roomError);
    useRoom.getState().set({ error: "" });
  }, [roomError]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => preloadEmoteSounds(), []);

  // ----- page lock: the table is one screen, never a scrolling page -----
  useEffect(() => {
    document.documentElement.classList.add("table-lock");
    return () => document.documentElement.classList.remove("table-lock");
  }, []);


  // ----- resets when the table moves on -----
  useEffect(() => {
    setSelected([]);
    setFirstPick(null);
  }, [s.phase, s.turn, s.round, n]);
  useEffect(() => setDiscardOpen(false), [s.round]);
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
  /** The new card glides onto slot `index` and the card it replaces sails to the pile, before the server answers. */
  const flySwapIn = (heldEl: Element | null | undefined, index: number) => {
    const root = rootRef.current;
    const slotEl = root?.querySelector(`[data-drop="hand-${index}"] .pc`);
    if (!root || !heldEl || !slotEl || heldEl.hasAttribute("data-flying")) return;
    const pile = root.querySelector('[data-drop="discard"] .pc') ?? root.querySelector('[data-drop="discard"]');
    if (pile) flyCard(slotEl, pile, { duration: 360, hold: HOLD });
    if (flyCard(heldEl, slotEl, { duration: 300, hold: HOLD })) heldEl.setAttribute("data-flying", "");
  };
  const exchange = (indices: number[], silent = false) => {
    act({ type: "swap", indices, handRevision: me.handRevision }, { silent });
    setSelected([]);
  };
  const discardHeld = () => {
    if (!tossable) return;
    // The card goes straight from your hand to the pile, like a thrown card.
    const root = rootRef.current;
    const held = root?.querySelector<HTMLElement>(".held");
    const pile = root?.querySelector<HTMLElement>(".discard");
    if (held && pile && motionOn && !held.hasAttribute("data-flying")) {
      lastFling.current = Date.now();
      // The card leaves the dock: hide it (the server's answer unmounts it, a refusal brings it back).
      if (flyCard(held, pile.querySelector(".pc") ?? pile, { duration: 300, hold: HOLD }))
        held.setAttribute("data-flying", "");
    }
    act({ type: "discard", usePower: false });
  };
  const draw = (source: "deck" | "discard", slot?: number) => {
    if (source === "discard" && canDraw && ownThrowOnTop) {
      flash("You threw that one · draw the deck");
      shake(rootRef.current?.querySelector(".discard .pc"));
      return;
    }
    if (!canDraw || (source === "discard" && !s.discard.length)) return;
    if (slot !== undefined)
      queuedSwap.current = { index: slot, version: s.version };
    act({ type: "draw", source });
    // Don't wait a round trip to show it: the card leaves the pile now and is turned up when the answer lands.
    if (slot === undefined && motionOn && useRoom.getState().pending)
      setDrawing(
        source === "deck"
          ? { fromDeck: true, back: s.deckBack ?? "black", card: null }
          : { fromDeck: false, back: "black", card: s.discard.at(-1) ?? null },
      );
  };
  const toggle = (i: number) =>
    setSelected((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]));
  const submitSwaps = (pairs: SwapPair[]) =>
    s.power === "rearrange"
      ? act({
          type: "rearrange",
          moves: pairs.map((p) => ({ playerId: p.firstPlayerId, firstIndex: p.firstIndex, secondIndex: p.secondIndex })),
          revisions: Object.fromEntries(s.players.map((p) => [p.id, p.handRevision])),
        })
      : act({
      type: "blindSwapBatch",
      pairs,
      revisions: Object.fromEntries(
        s.players.map((p) => [p.id, p.handRevision]),
      ),
    });
  const pick = (playerId: string, index: number) => {
    if (!picking || disabled) return;
    if (s.power !== "rearrange") setTray(null);
    if (s.power === "rearrange") {
      // An Ace swaps two positions inside one rival hand; they only ever learn that their cards moved.
      if (playerId === s.you) {
        flash("Pick your rival’s cards");
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
      if (firstPick.playerId !== playerId) {
        flash("Pick two cards from the same hand");
        return;
      }
      const moves = [...plan, { firstPlayerId: playerId, firstIndex: firstPick.index, secondPlayerId: playerId, secondIndex: index }];
      setFirstPick(null);
      setTray(null);
      if (moves.length >= (s.handPower?.remaining ?? 1)) {
        submitSwaps(moves);
        setPlan([]);
      } else setPlan(moves);
      return;
    }
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
    if (firstPick.playerId === playerId && playerId !== s.you) {
      // Two cards from the same opponent would just rearrange their hand — that's theirs to do.
      flash("Pick from a different hand");
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
    // Tapped a slot while the card you just drew is still on its way back from the server: the swap happens now on
    // screen (card into the slot, old card to the pile, sound) and is sent the moment the draw is confirmed.
    if (drawing && pending && !s.drawn && mine && !queuedSwap.current && online) {
      queuedSwap.current = { index: i, version: s.version, early: true };
      if (motionOn) flySwapIn(rootRef.current?.querySelector(".held"), i);
      playSound("snap");
      return;
    }
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
    if (holding) {
      if (motionOn) flySwapIn(rootRef.current?.querySelector(".held"), i);
      return exchange([i]);
    }
    // A pending Jack peek wins on a fresh tap (it's earned and time-limited);
    // once you're already selecting cards, or hold shift, that takes over.
    if (jackPeeksPending > 0 && !modifier && !selected.length) {
      act({ type: "powerPeek", playerId: s.you, index: i });
      return;
    }
    // A single tap on your own card starts (or extends) a free-throw
    // selection directly — no long-press needed to discover it.
    if (canSelect) return toggle(i);
    const el = handRef.current?.querySelector(`[data-drop="hand-${i}"] .pc`);
    if (el && !reducedMotion())
      el.animate(
        [{ translate: "0 0" }, { translate: "0 -8px" }, { translate: "0 0" }],
        { duration: 220 },
      );
  };

  handlers.current = {
    // Reordering is optimistic and private, so it stays available while other moves confirm.
    canReorder: inRound && online && !s.pendingCall,
    canDraw,
    hasDiscard: canTakeDiscard,
    holding: holding && !disabled,
    tossable: tossable && !disabled,
    canFreeThrow,
    selected,
    revision: me.handRevision,
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
      if (!online || !!s.pendingCall) return false;
      if (!reorderHand(from, to)) return false;
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
    flySwapIn,
    draw,
  };

  // A pile-to-slot drag is two validated actions: draw, then swap.
  useEffect(() => {
    const queued = queuedSwap.current;
    if (!queued) return;
    if (
      roomError ||
      status !== "connected" ||
      !mine ||
      s.phase !== "playing"
    ) {
      queuedSwap.current = null;
      return;
    }
    if (pending) return;
    if (s.version > queued.version) {
      queuedSwap.current = null;
      if (s.drawn) exchange([queued.index], !!queued.early);
      else rootRef.current?.querySelectorAll<HTMLElement>(".held[data-flying]").forEach((el) => el.removeAttribute("data-flying"));
    }
  }, [
    s.version,
    s.drawn,
    s.phase,
    mine,
    pending,
    roomError,
    status,
  ]);

  // Cards you threw are hidden while their stand-ins fly. Once the server answers, either
  // they're gone (the rest glide together to close the gap) or the throw failed and they
  // fade back in where they were.
  useLayoutEffect(() => {
    const f = flight.current;
    if (!f) return;
    const changed = me.handRevision !== f.revision;
    if (!changed && pending && Date.now() - f.at < 4000) return;
    flight.current = null;
    const hidden = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>("[data-flying]") ?? [],
    );
    hidden.forEach((el) => el.removeAttribute("data-flying"));
    const els = handCards(handRef.current);
    if (changed && els.length === f.rects.length - f.removed.length) {
      const kept = f.rects.filter((_, i) => !f.removed.includes(i));
      els.forEach((el) => el.style.setProperty("transition", "none", "important"));
      els.forEach((el, i) => (el.style.transform = fanTransform(els.length, i)));
      glideFrom(els, kept, (i) => fanTransform(els.length, i));
      void handRef.current?.offsetWidth;
      els.forEach((el) => el.style.removeProperty("transition"));
    } else if (!changed && !reducedMotion())
      hidden.forEach((el) =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }),
      );
  }, [me.handRevision, pending, n]);

  // The answer is in: the real cards are where the stand-ins were parked (or the move was refused).
  useLayoutEffect(() => {
    if (!pending) landFlights();
  }, [pending]);
  // A drawn card flown to a slot or the pile reappears if the server turned the move down.
  useEffect(() => {
    // A swap queued behind the draw keeps the card in flight until it is sent.
    if (pending || queuedSwap.current?.early) return;
    rootRef.current
      ?.querySelectorAll<HTMLElement>(".held[data-flying]")
      .forEach((el) => el.removeAttribute("data-flying"));
  }, [pending]);

  // Keep all hand cards neatly aligned whenever card count, revision, or phase
  // updates, so no card is ever stranded with a stale drag/hover transform.
  useLayoutEffect(() => {
    const els = handCards(handRef.current);
    if (dragRef.current?.active) return;
    els.forEach((el, i) => {
      el.classList.remove("lifting");
      el.style.pointerEvents = "";
      el.style.zIndex = String(i);
      el.style.transform = fanTransform(els.length, i);
    });
  }, [n, me.handRevision, pending, roomError, s.phase, s.version]);

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
    // Release over the pile: the cards leave from exactly where your finger let go and land on
    // it, instead of springing back to the hand first and then being thrown from there.
    const fling = (
      d: Drag,
      indices: number[],
      target: "discard" | "held",
      send: () => void,
    ) => {
      const els = d.els;
      const dest =
        root.querySelector(`[data-drop="${target}"] .pc`) ??
        root.querySelector(`[data-drop="${target}"]`);
      const flown = dest
        ? indices.map((i, gi) =>
            els[i] ? flyCard(els[i], dest, { duration: 300 + gi * 40, hold: HOLD }) : null,
          )
        : [];
      if (flown.some(Boolean)) {
        const rects = els.map((el, i) =>
          indices.includes(i) ? el.getBoundingClientRect() : restingRect(el, els.length, i),
        );
        indices.forEach((i) => els[i]?.setAttribute("data-flying", ""));
        flight.current = {
          removed: [...indices],
          rects,
          at: Date.now(),
          revision: handlers.current.revision,
        };
        lastFling.current = Date.now();
      }
      landingRef.current?.classList.remove("on");
      els.forEach((el, i) => {
        el.classList.remove("lifting");
        el.style.pointerEvents = "";
        el.style.zIndex = String(i);
        if (indices.includes(i)) {
          el.style.setProperty("transition", "none", "important");
          el.style.transform = fanTransform(els.length, i);
        } else el.style.transform = fanTransform(els.length, i);
      });
      void root.offsetWidth;
      els.forEach((el) => el.style.removeProperty("transition"));
      send();
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
        const cards = d.el.querySelectorAll<HTMLElement>(".pc");
        const ghost = cards[cards.length - 1]?.cloneNode(true) as HTMLElement | undefined;
        if (!ghost) return false;
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
          // Positioned by transform, not `left`: the slide between slots then never relays out the board.
          slotEl.style.transform = `translate(${d.offs[to]}px, ${ft.y}px) rotate(${ft.r}deg)`;
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
        if (!cancel && (d.over === "discard" || d.over === "held")) {
          const target = d.over;
          return fling(d, [d.k], target, () =>
            target === "discard" ? H.throwToPile([d.k]) : H.matchDrawn([d.k]),
          );
        }
        const to = cancel ? d.k : d.to;
        d.els.forEach((el) => (el.style.pointerEvents = ""));
        landingRef.current?.classList.remove("on");
        if (to === d.k) return settleHand(d, true);
        // FLIP: note where every card is right now (the dragged one under your finger,
        // the others already parted), reorder instantly, then glide each card home.
        const before = d.els.map((el) => el.getBoundingClientRect());
        const order = d.els.map((_, i) => i);
        order.splice(to, 0, order.splice(d.k, 1)[0]);
        let moved = false;
        flushSync(() => {
          moved = H.reorder(d.k, to);
        });
        if (!moved) return settleHand(d, true);
        const els = handCards(handRef.current);
        els.forEach((el, i) => {
          el.classList.remove("lifting");
          el.style.pointerEvents = "";
          el.style.zIndex = String(i);
          el.style.setProperty("transition", "none", "important");
          el.style.transform = fanTransform(els.length, i);
        });
        glideFrom(
          els,
          els.map((_, i) => before[order[i]]),
          (i) => fanTransform(els.length, i),
          { lifted: to },
        );
        void root.offsetWidth;
        els.forEach((el) => el.style.removeProperty("transition"));
      } else if (d.kind === "group") {
        if (!cancel && (d.over === "discard" || d.over === "held")) {
          const target = d.over;
          return fling(d, d.group, target, () =>
            target === "discard" ? H.throwToPile(d.group) : H.matchDrawn(d.group),
          );
        }
        settleHand(d, true);
      } else if (d.kind === "held") {
        d.el.classList.remove("lifting");
        d.el.style.pointerEvents = "";
        const slot = d.over && /^hand-(\d+)$/.exec(d.over);
        if (!cancel && slot) {
          // The new card glides onto the slot; the card it replaces sails to the pile.
          H.flySwapIn(d.el, Number(slot[1]));
          d.el.style.transform = "";
          return H.dropHeldOn(Number(slot[1]));
        }
        if (!cancel && H.tossable && (d.over === "discard" || dy < -90)) {
          const pile = root.querySelector('[data-drop="discard"] .pc') ?? root.querySelector('[data-drop="discard"]');
          if (pile && flyCard(d.el, pile, { duration: 300, hold: HOLD })) {
            d.el.setAttribute("data-flying", "");
            lastFling.current = Date.now();
          }
          d.el.style.transform = "";
          return H.discardHeld();
        }
        d.el.animate(
          [{ transform: d.el.style.transform || "none" }, { transform: "none" }],
          { duration: 220, easing: EASE },
        );
        d.el.style.transform = "";
      } else if (d.kind === "pile") {
        d.ghost?.remove();
        if (cancel) return;
        const slot = d.over && /^hand-(\d+)$/.exec(d.over);
        if (slot) H.draw(d.src as "deck" | "discard", Number(slot[1]));
        else H.draw(d.src as "deck" | "discard");
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
      if (target.closest("[data-no-drag]")) return;
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
      dragRef.current = d;
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
          dragRef.current = null;
          return;
        }
        d.active = true;
      }
      move(d, dx, dy, e.clientX, e.clientY);
    };
    const cancelDrag = () => {
      const d = drag;
      if (!d) return;
      drag = null;
      dragRef.current = null;
      clearTimeout(d.timer);
      if (d.active) finish(d, 0, true);
    };
    const end = (e: PointerEvent) => {
      const d = drag;
      if (!d) return;
      drag = null;
      dragRef.current = null;
      clearTimeout(d.timer);
      const cancel = e.type !== "pointerup";
      if (d.active) finish(d, e.clientY - d.y0, cancel);
      else if (!d.long && !cancel) tap(d);
    };
    root.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", moveListener);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", cancelDrag);
    return () => {
      root.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", moveListener);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", cancelDrag);
      if (drag) {
        clearTimeout(drag.timer);
        if (drag.active) finish(drag, 0, true);
        drag = null;
        dragRef.current = null;
      }
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
        setDiscardOpen(false);
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
        if (to !== from && reorderHand(from, to)) {
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
  /** True while the cards fly out of the deck; the dealer's 0/1/2 panel waits for them to land. */
  const [dealing, setDealing] = useState(false);
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
    setDealing(true);
    void Promise.allSettled(animations.map((a) => a.finished)).then(() => setDealing(false));
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
      setDealing(false);
    };
  }, [s.phase, s.round, s.history.length]);
  // The optimistic draw: fly the stand-in in at once, and drop it when the answer (or a refusal) arrives.
  useLayoutEffect(() => {
    if (!drawing) return;
    const held = rootRef.current?.querySelector<HTMLElement>(".held");
    const from = rootRef.current?.querySelector(drawing.fromDeck ? ".deck" : ".discard");
    if (held && from && flyFrom(held, from, { duration: 380, rotate: -6 })) earlyHeld.current = true;
  }, [drawing]);
  useLayoutEffect(() => {
    if (!drawing || (pending && !s.drawn)) return;
    if (!s.drawn) earlyHeld.current = false;
    setDrawing(null);
  }, [drawing, pending, s.drawn]);
  const heldId = s.drawn?.card?.id;
  useLayoutEffect(() => {
    const early = earlyHeld.current;
    earlyHeld.current = false;
    if (!holding || !motionOn) return;
    const held = rootRef.current?.querySelector<HTMLElement>(".held");
    if (early) {
      // Already on its way since the tap; a deck card just turns face up as the answer reveals it.
      if (s.drawn?.fromDeck)
        held?.querySelector(".pc")?.animate(
          [{ transform: "rotateY(90deg)" }, { transform: "none" }],
          { duration: 200, easing: EASE },
        );
      return;
    }
    const from = rootRef.current?.querySelector(
      s.drawn?.fromDeck ? ".deck" : ".discard",
    );
    if (held && from) flyFrom(held, from, { duration: 380, rotate: -6 });
  }, [heldId]);
  // Other players see a deck card's back, or the public face of a card taken
  // from the discard pile, travel to the drawing player's seat.
  useLayoutEffect(() => {
    const event = s.drawEvent;
    const root = rootRef.current;
    if (!event || event.playerId === s.you || !motionOn || !root) return;
    const from = root.querySelector(event.fromDeck ? ".deck" : ".discard");
    const to = root.querySelector(`[data-seat="${event.playerId}"]`);
    if (!from || !to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    setPickup({
      key: `${event.version}`,
      from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      to: { x: b.left + b.width / 2, y: b.top + b.height / 2 },
      fromDeck: event.fromDeck,
      back: event.back,
      card: event.card,
    });
    const t = setTimeout(() => setPickup(null), 900);
    return () => clearTimeout(t);
  }, [s.drawEvent?.version]);
  // While a discard draw is on its way, the pile already shows the card underneath.
  const pileTop = drawing && !drawing.fromDeck ? s.discard.at(-2) : s.discard.at(-1);
  const topId = pileTop?.id;
  const firstTop = useRef(topId);
  useLayoutEffect(() => {
    if (topId === firstTop.current) return;
    firstTop.current = topId;
    landFlights();
    const top = rootRef.current?.querySelector(".discard .pc");
    if (top && motionOn && Date.now() - lastFling.current < 1500) {
      // Your own card just landed here; only turn its face up.
      top.animate(
        [{ transform: "rotateY(80deg)" }, { transform: "none" }],
        { duration: 180, easing: EASE },
      );
      return;
    }
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
  // A free throw flies from the thrower's hand to the pile, spreading apart
  // mid-air and stacking as it lands — visible to everyone at the table.
  useLayoutEffect(() => {
    const event = s.swapEvent;
    if (!event?.thrown || !motionOn || !rootRef.current) return;
    if (event.actorId === s.you && Date.now() - lastFling.current < 2500) return;
    const toEl = rootRef.current.querySelector(".discard");
    const fromEl =
      event.actorId === s.you
        ? handRef.current
        : rootRef.current.querySelector(`[data-seat="${event.actorId}"]`);
    if (toEl && fromEl)
      void throwCards(
        fromEl.getBoundingClientRect(),
        toEl,
        event.thrown.count,
        rootRef.current,
        rootRef.current.querySelector(".discard .pc"),
      );
  }, [s.swapEvent?.version]);
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
  // The Dutch alarm loops for the whole last lap, at the player's chosen level.
  const alarmOn = usePrefs((p) => p.sound && p.dutchAlarm);
  const alarmVolume = usePrefs((p) => p.alarmVolume);
  const lastLap = !!s.caller && ["playing", "power"].includes(s.phase);
  useEffect(() => {
    if (alarmOn && lastLap) startDutchAlarm(alarmVolume);
    else stopDutchAlarm();
  }, [alarmOn, alarmVolume, lastLap]);
  useEffect(() => stopDutchAlarm, []);
  const message = useRef(s.message);
  useEffect(() => {
    if (s.message === message.current) return;
    message.current = s.message;
    if (s.message.startsWith("Dutch cancelled")) flash("Call LOW cancelled");
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

  const total =
    (s.phase === "choosing"
      ? CHOOSE_SECONDS
      : s.phase === "peeking"
        ? s.rules.peekSeconds
        : s.phase === "reaction"
          ? FINAL_REACTION_MS / 1000
          : s.rules.turnSeconds) || 30;
  // Slots a power just moved pulse white for a moment: you see that cards moved, never which values.
  useEffect(() => {
    const ev = s.swapEvent;
    if (!ev || ev.version === touchedVersion.current) return;
    touchedVersion.current = ev.version;
    const hits = [
      ...(ev.highlightSlots ?? []).map((h) => ({ id: h.playerId, i: h.index })),
      ...ev.pairs.flatMap((p) => [
        { id: p.firstPlayerId, i: p.firstIndex },
        { id: p.secondPlayerId, i: p.secondIndex },
      ]),
    ].filter((h) => ev.actorId !== s.you || h.id !== s.you);
    if (!hits.length) return;
    setTouch(hits);
    const t = setTimeout(() => setTouch([]), 1800);
    return () => clearTimeout(t);
  }, [s.swapEvent?.version]);

  // ----- hint: three words at most, routine ones retire after a few turns -----
  const veteran = false;
  const activeName = s.players.find((p) => p.id === activeId)?.name ?? "";
  let hint = "";
  let quiet = false;
  let routine = false;
  if (s.pendingCall) {
    const caller = s.players.find((pl) => pl.id === s.pendingCall!.actor);
    hint = myPendingCall
      ? "Changed your mind? Tap undo"
      : `${caller?.name ?? "Your rival"} called LOW`;
    quiet = true;
  } else if (s.phase === "choosing") {
    hint = dealing
      ? "Dealing…"
      : choosing
      ? "Pick a number above"
      : `${moderator?.name ?? "Your rival"} deals: picking how many cards you see`;
    quiet = !choosing;
  } else if (s.phase === "peeking")
    hint = me.peekDone
      ? "Waiting for your rival"
      : `Peek ${["no", "one", "two"][peekCount] ?? peekCount} card${peekCount === 1 ? "" : "s"}`;
  else if (picking) {
    const swapTotal = s.handPower?.remaining ?? 1;
    const swapNote = swapTotal > 1 ? ` (swap ${plan.length + 1} of ${swapTotal})` : "";
    hint =
      s.power === "rearrange"
        ? (firstPick ? "Now a second card" : "Move two of theirs") + swapNote
        : s.power === "blindSwap"
        ? (firstPick ? "Now a second card" : "Pick two cards") + swapNote
        : s.power === "ownPeek"
          ? "Peek one card"
          : "Peek their card";
  }
  else if (s.phase === "power") {
    hint = `${activeName}’s power`;
    quiet = true;
  } else if (s.phase === "reaction") {
    hint = selected.length ? "Drop it on the pile now" : "Last chance to match · 5s";
  } else if (selected.length)
    hint = holding ? "Swap it, or drop it on the pile" : "Drop it on the pile";
  else if (holding) {
    hint = tossable ? "Keep or discard" : "Swap it in";
    routine = true;
  } else if (jackPeeksPending > 0) {
    hint = `Tap a card to peek at it (${jackPeeksPending})`;
  } else if (mine) {
    hint = "Draw a card";
    routine = true;
  } else if (canCall) hint = "Lowest? Call LOW";
  else {
    hint = `${activeName}’s turn`;
    quiet = true;
    routine = true;
  }
  if (routine && veteran) hint = "";
  let hintBadge: string | null = null;
  // Wording of the design's duel table.
  if (!s.pendingCall && s.phase === "playing") {
    if (holding) hint = tossable ? "Tap a card to swap, or the pile to discard" : "Tap a card to swap it in";
    else if (mine && !selected.length && jackPeeksPending === 0) hint = canCall ? "Draw, take the pile, or call LOW" : "Draw or take the pile";
    else if (!mine && !selected.length && !s.caller) hint = "Same number as the pile? Drag it on";
  }
  // A thrown Jack earns a peek: say so right where the player is already looking.
  if (!picking && jackPeeksPending > 0) {
    hintBadge = "J";
    const label = jackPeeksPending > 1 ? `${jackPeeksPending} Jack peeks` : "Jack peek";
    hint = holding ? `Swap or discard · ${label} waiting` : `${label} ready · tap a card you haven’t seen`;
  }

  const pickedOf = (playerId: string) => [
    ...(firstPick?.playerId === playerId ? [firstPick.index] : []),
    ...plan.flatMap((pair) => [
      ...(pair.firstPlayerId === playerId ? [pair.firstIndex] : []),
      ...(pair.secondPlayerId === playerId ? [pair.secondIndex] : []),
    ]),
  ];
  const myPicked = pickedOf(s.you);
  const trayPlayer = opponents.find((p) => p.id === tray);
  const handInteractive = inRound && online;
  const placeable = holding && !selected.length;

  // ----- the Clutch board: layout, status and copy follow "Clutch Duel Table v4" -----
  const seatOf = (id: string) => seats?.find((x) => x.userId === id);
  const scoreOf = (id: string) =>
    s.history.reduce((sum, r) => sum + (r.scores[id] ?? 0), 0);
  const roundNo = Math.min(s.rules.rounds, s.history.length + 1);
  const lastTurnMine = !!s.caller && s.caller !== s.you && mine && ["playing", "power"].includes(s.phase);
  const powerName =
    s.power === "blindSwap" ? "Swap 2 cards" : s.power === "rearrange" ? "Move their cards" : s.power === "ownPeek" || s.power === "otherPeek" ? "Peek" : "Your power";
  // The band counts down on its own (StatusBand); here we only decide what it says and against which deadline.
  let banner: { text: string; kind: "hot" | "you"; deadline: number | null; total: number; tenths?: boolean; badge?: string; sub?: string; skip?: boolean } | null = null;
  if (picking) {
    // One expanded bar in the header slot: which power, what to do next, Skip and the clock, all in one place.
    const swaps = s.handPower?.remaining ?? 1;
    const step = swaps > 1 ? ` · ${Math.min(plan.length + 1, swaps)} of ${swaps}` : "";
    const power =
      s.power === "rearrange"
        ? { badge: "A", sub: `${firstPick ? "Now the second of their cards" : "Pick two of their cards"}${step}` }
        : s.power === "blindSwap"
          ? { badge: "Q", sub: `${firstPick ? "Now one of theirs" : "Tap one of yours, then one of theirs"}${step}` }
          : { badge: "J", sub: "Tap one of your cards to peek" };
    banner = { text: powerName, kind: "you", deadline: s.deadline, total, skip: true, ...power };
  } else if (reactionLive && s.reactionWindow && s.phase === "reaction") {
    const win = (s.phase === "reaction" ? FINAL_REACTION_MS : REACTION_WINDOW_MS) / 1000;
    banner = {
      text: s.phase === "reaction" ? "LAST CHANCE TO MATCH" : "MATCH IT!",
      kind: "hot",
      deadline: s.reactionWindow.deadline,
      total: win,
      tenths: true,
    };
  } else if (s.phase === "peeking" && !me.peekDone) {
    banner = {
      text: myPeeks >= peekCount ? "Remember them" : `Peek ${["no", "one", "two"][peekCount] ?? peekCount} card${peekCount === 1 ? "" : "s"}`,
      kind: "you",
      deadline: s.deadline,
      total,
    };
  } else if (lastTurnMine) {
    banner = { text: "Last turn", kind: "you", deadline: s.deadline, total };
  }
  const showTurnPills = inRound && s.phase === "playing" && !banner && !!s.deadline;
  const handN = Math.max(1, n);
  const handGap = handN <= 4 ? 10 : handN === 5 ? 8 : 4;
  const handW = handN <= 4 ? 74 : Math.min(66, Math.floor((bw - 32 - (handN - 1) * handGap) / handN));
  const handTop = handN > 4 ? 584 : 568;
  const cs = "xl";
  const pileRing = "transparent";
  const turnSecs = (v: number) => `${s.deadline ? v : 0}s`;
  const touchedOf = (id: string) => touch.filter((t) => t.id === id).map((t) => t.i);
  const myChips = s.history.filter((h) => h.autoDutch === s.you).length * 10;
  const oppTurn = (id: string) => activeId === id && s.phase === "playing" && !!s.deadline;

  return (
    <BoardScale.Provider value={k}>
    <section
      className={`table board-root ${motionOn ? "" : "still"}`}
      ref={rootRef}
      aria-label="Card table"
    >
      <div className="board" ref={boardRef} style={{ "--u": `${k}px`, "--bw": bw, "--felt": FELT[seatOf(s.you)?.cosmetics.table ?? "blue"] } as CSSProperties}>
        <div className="board-in">
        {coach ?? <header className="b-head">
          {opponents[0] ? (
            <RivalPlate
              state={s}
              player={opponents[0]}
              rating={seatOf(opponents[0].id)?.rating ?? null}
              score={scoreOf(opponents[0].id)}
              turn={oppTurn(opponents[0].id)}
              called={s.caller === opponents[0].id}
              deadline={s.deadline}
              total={total}
              hue={avatarHue(opponents[0].name)}
              avatarUrl={seatOf(opponents[0].id)?.avatar ?? (seatOf(opponents[0].id)?.bot ? BOT_AVATAR : undefined)}
              round={roundNo}
              rounds={s.rules.rounds}
            />
          ) : (
            <div className="b-round">
              <span>
                <small>ROUND</small>
                <b>
                  {roundNo} <em>of {s.rules.rounds}</em>
                </b>
              </span>
            </div>
          )}
          <div className="b-tools">
            <ChatButton />
            <span className="b-net"><NetBadge /></span>
            <TableMenu open={open} showKeys={() => setKeys(true)} />
          </div>
        </header>}

        {banner && (
          <StatusBand text={banner.text} kind={banner.kind} deadline={banner.deadline} total={banner.total} tenths={banner.tenths} badge={banner.badge} top={holding ? 218 : handTop - 46} onSkip={banner.skip ? skipPower : undefined} />
        )}

        <div className="b-rim" />
        <div className="b-wood" />
        <div
          className="b-felt"
          data-clear
          style={{ backgroundImage: `${mine && inRound && s.phase === "playing" ? "radial-gradient(ellipse 70% 38% at 50% 100%, oklch(0.9 0.17 100 / 0.38), transparent 75%)" : activeId && activeId !== s.you && inRound && s.phase === "playing" ? "radial-gradient(ellipse 70% 38% at 50% 0%, rgba(255,255,255,0.28), transparent 75%)" : "linear-gradient(transparent, transparent)"}, var(--felt)` }}
          ref={arenaRef}
        />

        {opponents.map((p) => (
          <Seat
            key={p.id}
            state={s}
            player={p}
            called={s.caller === p.id}
            pickable={pickOpponents && !disabled}
            picked={pickedOf(p.id)}
            touched={touchedOf(p.id)}
            onPick={(i) => pick(p.id, i)}
          />
        ))}

        <div className="b-centre">
          <div className="b-col">
            <div
              className={`heap deck ${canDraw ? "can" : ""}`}
              data-src="deck"
              data-drop="deck"
              role="button"
              tabIndex={canDraw ? 0 : -1}
              aria-label={`Draw pile, ${s.deckCount} cards`}
              aria-disabled={!canDraw}
              onKeyDown={(e) => e.key === "Enter" && draw("deck")}
              style={{ width: (cs === "xl" ? 100 : 66) * k, height: (cs === "xl" ? 140 : 92) * k }}
            >
              <span className="deck-shadow" />
              <span className="count">{s.deckCount}</span>
              <PlayingCard back={s.deckBack ?? "black"} />
            </div>
          </div>
          <div className="b-col" style={{ marginTop: -8 * k }}>
            <div className="b-ring" style={{ borderColor: pileRing }}>
              <div
                className={`heap discard ${canTakeDiscard ? "can" : ""} ${canDraw && ownThrowOnTop ? "own-throw" : ""} ${tossable ? "toss" : ""} ${s.discard.length ? "" : "empty"} ${reactionLive ? "reacting" : ""}`}
                data-src="discard"
                data-drop="discard"
                role="button"
                tabIndex={canDraw || tossable ? 0 : -1}
                aria-label={
                  tossable
                    ? "Discard your new card"
                    : s.discard.at(-1)
                      ? `Discard pile, ${cardName(s.discard.at(-1)!)}${ownThrowOnTop ? " — you matched this card, so you can’t take it" : ""}${reactionLive ? ` — you can still match it` : ""}`
                      : "Empty discard pile"
                }
                aria-disabled={!(canDraw || tossable || canFreeThrow)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (tossable ? discardHeld() : draw("discard"))
                }
                style={{ width: (cs === "xl" ? 100 : 66) * k, height: (cs === "xl" ? 140 : 92) * k }}
              >
                {pileTop ? <PlayingCard card={pileTop} /> : <span className="pile-ghost" />}
                {s.discard.length > 0 && (
                  <button
                    className="browse-discard"
                    data-no-drag
                    aria-label={`Browse the whole discard pile, ${s.discard.length} cards`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDiscardOpen(true);
                    }}
                  >
                    <Layers size={12} />
                    {s.discard.length}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {choosing && !dealing && (
          <div className="b-deal" role="group" aria-label="How many cards each player may look at">
            <div className="b-deal-k">You deal this round</div>
            <div className="b-deal-q">How many of your 4 cards can each of you look at?</div>
            <div className="b-deal-row">
              {PEEK_CHOICES.map((count) => (
                <button key={count} type="button" data-no-drag disabled={disabled} onClick={() => act({ type: "peekCount", count })} aria-label={`${count} card${count === 1 ? "" : "s"}`}>
                  <b>{count}</b>
                  <span>{["None", "One", "Two"][count]}</span>
                </button>
              ))}
            </div>
            <div className="b-deal-note">Fewer cards means more guessing, for both of you. Your rival plays first.</div>
            {s.deadline ? <TimerLine className="b-deal-bar" deadline={s.deadline} total={CHOOSE_SECONDS} urgent="var(--Y)" calm="#f2f0ea" /> : null}
          </div>
        )}
        {trayPlayer && (
          <Tray player={trayPlayer} picked={pickedOf(trayPlayer.id)} onPick={(i) => pick(trayPlayer.id, i)} onClose={() => setTray(null)} />
        )}
        {discardOpen && <DiscardTray cards={s.discard} jokerRank={s.jokerRank} onClose={() => setDiscardOpen(false)} />}

        {showTurnPills && !mine && (
          <div className="b-turnpill theirs"><span>THEIR TURN</span><b><Seconds deadline={s.deadline}>{turnSecs}</Seconds></b></div>
        )}
        {showTurnPills && mine && !holding && !drawing && (
          <div className="b-turnpill mine" style={{ top: `calc(${handTop - 46} * var(--u))` }}><span>YOUR TURN</span><b><Seconds deadline={s.deadline}>{turnSecs}</Seconds></b></div>
        )}

        <div className="hand-area b-hand" style={{ top: `calc(${handTop} * var(--u))` }}>
          <div
            className={`hand ${placeable ? "placeable" : ""}`}
            ref={handRef}
            style={{ "--n": Math.max(1, n), gap: handGap * k } as CSSProperties}
          >
            <div className="drop-slot" ref={landingRef} />
            {me.hand.map((card, i) => {
              const peekable = s.phase === "peeking" && !me.peekDone && myPeeks < peekCount && !card;
              const pickable = picking && (s.power === "blindSwap" || s.power === "ownPeek");
              const jackPeekable = jackPeeksPending > 0 && !holding && !selected.length && !picking;
              const tappable = false;
              return (
                <button
                  key={i}
                  className={`hc ${selected.includes(i) || myPicked.includes(i) ? "sel" : ""} ${peekable || pickable || jackPeekable || (holding && !disabled) ? "beckon" : ""} ${touchedOf(me.id).includes(i) ? "touched" : ""} ${s.caller === me.id ? "locked" : ""} ${tappable ? "tappable" : ""}`}
                  data-src={handInteractive ? `hand-${i}` : undefined}
                  data-drop={`hand-${i}`}
                  data-player-slot={`${me.id}:${i}`}
                  aria-disabled={!handInteractive}
                  aria-pressed={selected.includes(i)}
                  aria-label={`Your card ${i + 1}${card ? `, ${cardName(card)}` : ""}`}
                  style={{ transform: fanTransform(n, i), zIndex: i, width: handW * k, height: handW * k * 1.44 }}
                  onClick={(e) => e.detail === 0 && tapHand(i, e.shiftKey)}
                >
                  <PlayingCard card={card} back={me.handBacks?.[i]} />
                  <em className="slot-key">{i + 1}</em>
                  {card && !keepSeen &&
                    liveKeys.includes(revealKey(me.id, i, card.id)) && (
                      <>
                        <span
                          className="peek-hide"
                          role="button"
                          tabIndex={0}
                          data-no-drag
                          aria-label="Hide this card again"
                          onClick={(e) => {
                            e.stopPropagation();
                            veil([revealKey(me.id, i, card.id)]);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            e.stopPropagation();
                            veil([revealKey(me.id, i, card.id)]);
                          }}
                        >
                          <EyeOff size={13} strokeWidth={2.4} />
                        </span>
                        <span key={liveKeys.join()} className="peek-timer" aria-hidden="true" />
                      </>
                    )}
                </button>
              );
            })}
          </div>
          {((holding && s.drawn) || drawing) && (
            <div className="held-dock">
              {/* One element for the optimistic stand-in and the real card, so the answer never restarts its flight. */}
              <div
                className="held"
                data-src={holding && s.drawn ? "held" : undefined}
                data-drop={holding && s.drawn ? "held" : undefined}
                aria-label={holding && s.drawn ? `Your new card${s.drawn.card ? `, ${cardName(s.drawn.card)}` : ""}` : "Drawing a card"}
                style={{ width: 70 * k, height: 70 * k * 1.44 }}
              >
                {holding && s.drawn ? (
                  <PlayingCard card={s.drawn.card} back={s.drawn.back} />
                ) : (
                  <PlayingCard card={drawing?.card} back={drawing?.back} />
                )}
              </div>
              {tossable && (
                <button className="held-discard" data-no-drag onClick={discardHeld}>
                  Discard
                </button>
              )}
            </div>
          )}
          {(selected.length > 0 || plan.length > 0) && (
            <div className="chips" ref={chipsRef}>
              {selected.length > 0 && holding && (
                <button className="chip hot" aria-label={`Put your new card here and drop ${selected.length}`} onClick={() => exchange(selected)}>
                  <svg viewBox="0 0 24 24"><path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4" /></svg>
                  {selected.length}
                </button>
              )}
              {selected.length > 0 && canFreeThrow && (
                <button className={`chip ${holding ? "" : "hot"}`} aria-label={`Throw ${selected.length} on the pile`} onClick={() => throwToPile(selected)}>
                  <svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                  {selected.length}
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

        {(toast || banner?.sub || (hint && !picking && !(banner && s.phase === "peeking"))) && (
          <p className={`b-hint ${quiet && !toast && !banner?.sub ? "quiet" : ""} ${hintBadge || toast || banner?.sub ? "power" : ""}`} role="status">
            {hintBadge && !toast && !banner?.sub && <i className="b-hint-badge">{hintBadge}</i>}
            {toast || banner?.sub || hint}
          </p>
        )}

        <div className="b-bar">
          {s.phase === "peeking" ? (
            <button className="b-call on" disabled={disabled || me.peekDone} onClick={() => act({ type: "finishPeek" })}>
              {me.peekDone ? <Check size={22} /> : "DONE"}
            </button>
          ) : myPendingCall ? (
            <button className="b-call undo" onClick={() => act({ type: "undoCall" })} aria-label="Undo call">
              UNDO · <Seconds deadline={myPendingCall.deadline}>{(v) => `${Math.max(0, v)}s`}</Seconds>
            </button>
          ) : (
            <button
              className={`b-call ${canCall ? "on" : ""} ${canCall && !mine ? "window" : ""}`}
              disabled={!canCall}
              onClick={() => act({ type: "call" })}
              aria-label="Call low"
            >
              CALL LOW
            </button>
          )}
          <button
            data-no-drag
            className={`b-you ${mine && inRound && s.phase === "playing" ? "live" : ""}`}
            aria-label="Send a reaction"
            aria-expanded={emotes}
            onClick={() => setEmotes((v) => !v)}
          >
            {mine && inRound && s.phase === "playing" && s.deadline ? (
              <TimerLine className="b-you-bar" deadline={s.deadline} total={total} urgent={Y} calm="#F2F0EA" />
            ) : null}
            <span className="b-you-l">
              <small>
                YOU{mine && inRound && s.phase === "playing" && s.deadline ? <em> · <Seconds deadline={s.deadline}>{(v) => `${v}s`}</Seconds></em> : null}
              </small>
              <b>+{myChips} chips</b>
            </span>
            <span className="b-you-score">{scoreOf(s.you)}</span>
          </button>
          {emotes && (
            <div className="emotes" data-no-drag>
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
        </div>

        {keys && <KeysOverlay close={() => setKeys(false)} />}
        {pickup && (
          <div
            key={pickup.key}
            className="pickup-fly"
            aria-hidden="true"
            style={
              {
                left: pickup.from.x,
                top: pickup.from.y,
                "--dx": `${pickup.to.x - pickup.from.x}px`,
                "--dy": `${pickup.to.y - pickup.from.y}px`,
              } as CSSProperties
            }
          >
            <span className={`pickup-flip ${pickup.fromDeck ? "" : "public"}`}>
              <PlayingCard card={pickup.card} back={pickup.back} className="pickup-face" />
              <PlayingCard back={pickup.back} className="pickup-back" />
            </span>
          </div>
        )}
        <SwapAnimation event={s.swapEvent} enabled={effects} />
        <ChatPanel state={s} />
        <ChatToast state={s} />
        <Bursts you={s.you} />
        </div>
      </div>
    </section>
    </BoardScale.Provider>
  );
}

/** Where a hand card sits when nothing is dragging it: its box with the plain fan transform. */
function restingRect(el: HTMLElement, n: number, i: number) {
  const current = el.style.transform;
  el.style.setProperty("transition", "none", "important");
  el.style.transform = fanTransform(n, i);
  const rect = el.getBoundingClientRect();
  el.style.transform = current;
  el.style.removeProperty("transition");
  return rect;
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
    ["D", "Call LOW"],
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
