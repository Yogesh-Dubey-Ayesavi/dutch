import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Keyboard,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Send,
  Settings,
  X,
} from "lucide-react";
import type { GameView } from "../../../../packages/engine/src/index";
import { CHAT_MAX } from "../../../../packages/protocol/src/index";
import { Avatar } from "../Avatar";
import { sendChat, useRoom, type Burst } from "../store";
import type { ModalName } from "../ui";

/**
 * Connection quality at a glance: a dot coloured by round-trip time, the time itself, and a
 * spinning ring while one of your moves is on its way. Reconnecting replaces it with a label,
 * so it's always obvious why the table isn't answering.
 */
export function NetBadge() {
  const status = useRoom((r) => r.status);
  const latency = useRoom((r) => r.latency);
  const syncing = useRoom((r) => r.syncing);
  // Only show the "sending" ring when a move takes noticeably long, so a fast table never flickers.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!syncing) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 220);
    return () => clearTimeout(t);
  }, [syncing]);
  const online = status === "connected";
  const quality = !online
    ? "down"
    : latency === null
      ? "ok"
      : latency < 150
        ? "good"
        : latency < 400
          ? "ok"
          : "poor";
  // Lower ping, more bars: 4 under 80 ms, 3 under 150, 2 under 300, otherwise 1; none when offline.
  const bars = !online
    ? 0
    : latency === null
      ? 3
      : latency < 80
        ? 4
        : latency < 150
          ? 3
          : latency < 300
            ? 2
            : 1;
  const label = online
    ? latency === null
      ? "Connected"
      : `${latency} ms`
    : status === "connecting"
      ? "Joining…"
      : status === "closed"
        ? "Offline"
        : "Reconnecting…";
  return (
    <span
      className={`net-badge ${quality} ${slow ? "sending" : ""}`}
      role="status"
      aria-label={`Connection: ${label}${slow ? ", sending your move" : ""}`}
      title={
        online
          ? "Round trip to the table server. The ring spins while your move is being confirmed."
          : "Trying to reach the table again. Your seat is kept."
      }
    >
      <SignalBars lit={bars} />
      <span>{label}</span>
    </span>
  );
}

function SignalBars({ lit }: { lit: number }) {
  return (
    <svg className="signal" viewBox="0 0 18 14" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 4.6}
          y={10 - i * 3.2}
          width={3.2}
          height={4 + i * 3.2}
          rx={1}
          className={i < lit ? "on" : ""}
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </svg>
  );
}

/** Everything that isn't the game itself lives behind one button. */
export function TableMenu({
  open,
  showKeys,
}: {
  open: (m: ModalName) => void;
  showKeys: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".table-menu")) setShown(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [shown]);
  const item = (icon: React.ReactNode, text: string, run: () => void) => (
    <button
      role="menuitem"
      onClick={() => {
        setShown(false);
        run();
      }}
    >
      {icon}
      {text}
    </button>
  );
  return (
    <div className="table-menu" data-no-drag>
      <button
        className="tool"
        aria-label="Table menu"
        aria-haspopup="menu"
        aria-expanded={shown}
        onClick={() => setShown((v) => !v)}
      >
        <MoreHorizontal size={18} />
      </button>
      {shown && (
        <div className="menu-pop" role="menu">
          {item(<Settings size={16} />, "Settings", () => open("settings"))}
          {item(<BookOpen size={16} />, "Rules", () => open("rules"))}
          {item(<Keyboard size={16} />, "Shortcuts", showKeys)}
          {item(<LogOut size={16} />, "Leave table", () => open("leave"))}
        </div>
      )}
    </div>
  );
}

export function ChatButton() {
  const unread = useRoom((r) => r.unread);
  const chatOpen = useRoom((r) => r.chatOpen);
  const set = useRoom((r) => r.set);
  return (
    <button
      className={`tool chat-tool ${chatOpen ? "on" : ""}`}
      aria-label={unread ? `Table chat, ${unread} unread` : "Table chat"}
      aria-expanded={chatOpen}
      data-no-drag
      onClick={() => set({ chatOpen: !chatOpen, unread: 0 })}
    >
      <MessageCircle size={18} />
      {unread > 0 && <b className="unread">{unread > 9 ? "9+" : unread}</b>}
    </button>
  );
}

/**
 * A new message while chat is closed slides in under the header: who sent it, and what they
 * said (two lines at most, then an ellipsis). Tap it to open the chat; it leaves by itself.
 */
export function ChatToast({ state }: { state: GameView }) {
  const chat = useRoom((r) => r.chat);
  const chatOpen = useRoom((r) => r.chatOpen);
  const set = useRoom((r) => r.set);
  const seen = useRef<string | null>(chat.at(-1)?.id ?? null);
  const [line, setLine] = useState<(typeof chat)[number] | null>(null);
  useEffect(() => {
    const last = chat.at(-1);
    if (!last || last.id === seen.current) return;
    seen.current = last.id;
    if (last.playerId === state.you || chatOpen) return;
    setLine(last);
  }, [chat, chatOpen, state.you]);
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), 4500);
    return () => clearTimeout(t);
  }, [line]);
  useEffect(() => {
    if (chatOpen) setLine(null);
  }, [chatOpen]);
  if (!line) return null;
  const from = state.players.find((p) => p.id === line.playerId);
  return (
    <button
      key={line.id}
      className="chat-toast"
      data-no-drag
      aria-label={`New message from ${from?.name ?? "someone"}: ${line.text}. Open chat`}
      onClick={() => set({ chatOpen: true, unread: 0 })}
    >
      {from && <Avatar avatar={from.avatar} name={from.name} />}
      <span className="chat-toast-body">
        <b>{from?.name ?? "Someone"}</b>
        <span className="chat-toast-text">{line.text}</span>
      </span>
    </button>
  );
}

export function ChatPanel({ state }: { state: GameView }) {
  const chat = useRoom((r) => r.chat);
  const chatOpen = useRoom((r) => r.chatOpen);
  const set = useRoom((r) => r.set);
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, chatOpen]);
  // Stay mounted while sliding away, however chat was closed (✕, the scrim, the header button).
  const [mounted, setMounted] = useState(chatOpen);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (chatOpen) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 240);
    return () => clearTimeout(t);
  }, [chatOpen]);
  useEffect(() => {
    // On touch screens the sheet opens on the conversation; the keyboard waits for a tap.
    if (chatOpen && !matchMedia("(pointer: coarse)").matches)
      input.current?.focus({ preventScroll: true });
  }, [chatOpen]);
  if (!mounted) return null;
  const nameOf = (id: string) =>
    state.players.find((p) => p.id === id)?.name ?? "Someone";
  const close = () => set({ chatOpen: false, unread: 0 });
  const submit = () => {
    if (sendChat(draft)) setDraft("");
  };
  return (
    <>
    {/* Phones only: the dimmed table behind the dialog; tapping it closes chat. */}
    <div className={`chat-scrim ${leaving ? "leaving" : ""}`} data-no-drag onClick={close} />
    <aside className={`chat-panel ${leaving ? "leaving" : ""}`} aria-label="Table chat" data-no-drag>
      <span className="sheet-grabber" aria-hidden="true" />
      <header>
        <b>Table talk</b>
        <button aria-label="Close chat" onClick={close}>
          <X size={16} />
        </button>
      </header>
      <ol ref={list}>
        {chat.length === 0 && <li className="empty">Say hello to the table.</li>}
        {chat.map((line) => (
          <li key={line.id} className={line.playerId === state.you ? "mine" : ""}>
            <span className="who">
              {line.playerId === state.you ? "You" : nameOf(line.playerId)}
            </span>
            <span className="text">{line.text}</span>
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          value={draft}
          maxLength={CHAT_MAX}
          placeholder="Message the table"
          aria-label="Chat message"
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim()}>
          <Send size={16} />
        </button>
      </form>
    </aside>
    </>
  );
}

/**
 * Reactions and chat lines float above whoever sent them. They're drawn in a body-level
 * layer so nothing at the table (the arena edge, the header) can clip them.
 */
export function Bursts({ you }: { you: string }) {
  const bursts = useRoom((r) => r.bursts);
  return createPortal(
    <div className="burst-layer" aria-live="polite">
      {bursts.map((b) => (
        <BurstAt key={b.id} burst={b} you={you} />
      ))}
    </div>,
    document.body,
  );
}

function BurstAt({ burst, you }: { burst: Burst; you: string }) {
  const [at, setAt] = useState<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    r: number;
    flip: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const anchor =
      burst.playerId === you
        ? document.querySelector(".me-avatar .avatar") ??
          document.querySelector(".me-avatar")
        : document.querySelector(`[data-seat="${burst.playerId}"] .avatar`);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    // Tapbacks sit on the avatar's upper corner, on whichever side has more room.
    const flip = r.left + r.width / 2 > innerWidth - 70;
    setAt({
      x: flip ? r.left + r.width * 0.15 : r.right - r.width * 0.15,
      y: r.top + r.height * 0.15,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      r: r.width / 2,
      flip,
    });
  }, [burst.id, burst.playerId, you]);
  if (!at) return null;
  if (burst.emoji)
    return (
      <span
        className={`tapback ${at.flip ? "flip" : ""}`}
        role="img"
        aria-label={`Reaction ${burst.emoji}`}
        style={
          {
            left: at.x,
            top: at.y,
            // Where the avatar's centre is, relative to the bubble: the pop starts there.
            "--fx": `${at.cx - at.x}px`,
            "--fy": `${at.cy - at.y}px`,
          } as React.CSSProperties
        }
      >
        <span className="tapback-bubble">{burst.emoji}</span>
        <i className="tapback-dot big" />
        <i className="tapback-dot small" />
      </span>
    );
  const style = { left: at.cx, top: Math.max(at.cy - at.r, 72) } as React.CSSProperties;
  return (
    <span className="burst said" style={style}>
      {burst.text}
    </span>
  );
}
