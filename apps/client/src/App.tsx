import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  DoorOpen,
  Eye,
  LoaderCircle,
  Plus,
  Settings,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import { gsap } from "gsap";
import {
  DEFAULT_RULES,
  type GameView,
  type Rules,
} from "../../../packages/engine/src/index";
import { act, connect, leave, seat, usePrefs, useRoom } from "./store";
import {
  configureFlightSounds,
  configureSound,
  playChime,
  playOverspeed,
  playPullUp,
  playSound,
  startDutchAlarm,
  stopDutchAlarm,
} from "./sound";
import { Diamond, HeroCards } from "./Cards";
import { AvatarArt } from "./Avatar";
import { Lobby } from "./Lobby";
import { Results } from "./Results";
import { GameTable } from "./table/GameTable";
import type { ModalName } from "./ui";
import { useClientUpdate } from "./useClientUpdate";
export default function App() {
  const updateAvailable = useClientUpdate();
  const prefs = usePrefs();
  const room = useRoom();
  const [modal, setModal] = useState<ModalName>(null);
  const [invite, setInvite] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    configureSound(prefs.sound, prefs.volume, prefs.ambience);
  }, [prefs.sound, prefs.volume, prefs.ambience]);
  useEffect(() => {
    configureFlightSounds(prefs.flightSounds);
  }, [prefs.flightSounds]);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("room");
    const stored = sessionStorage.getItem("dutch-seat");
    if (stored) {
      try {
        const saved = JSON.parse(stored);
        if (!code || code === saved.code) {
          connect(saved.code);
          return;
        }
      } catch {
        sessionStorage.removeItem("dutch-seat");
      }
    }
    if (code) {
      setInvite(code.toUpperCase());
      setModal("join");
    }
  }, []);
  useLayoutEffect(() => {
    if (
      !prefs.effects ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const ctx = gsap.context(() => {
      gsap.from(".reveal-in", {
        y: 22,
        opacity: 0,
        duration: 0.85,
        stagger: 0.11,
        ease: "power3.out",
      });
      gsap.from(".hero-fan", {
        y: 50,
        opacity: 0,
        duration: 1.3,
        delay: 0.2,
        ease: "power3.out",
      });
    }, root);
    return () => ctx.revert();
  }, [!!room.state, prefs.effects]);
  const open = (m: ModalName) => {
    playSound("flip");
    setModal(m);
  };
  const backToLobby = () => {
    if (room.state) open("leave");
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const inGame =
    !!room.state &&
    ["choosing", "peeking", "playing", "power"].includes(room.state.phase);
  return (
    <div
      ref={root}
      className={`app ${!prefs.effects ? "no-effects" : ""} ${inGame ? "in-game" : ""} ${room.state ? "delft" : ""}`}
    >
      {!inGame && (
        <header className="site-header">
          <button
            className="brand"
            aria-label="Dutch home"
            onClick={backToLobby}
          >
            <Diamond />
            <span>
              DUTCH<span className="brand-dot">.</span>
            </span>
            <span className="brand-divider" />
            <span className="brand-tag">THE CARD CLUB</span>
          </button>
          <nav aria-label="Main navigation">
            <button
              onClick={() => {
                if (room.state) open("rules");
                else
                  document
                    .getElementById("how-to-play")
                    ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              How to play
            </button>
            <button className="nav-rules" onClick={() => open("rules")}>
              House rules <span className="nav-dot">✧</span>
            </button>
            <span className="nav-separator" />
            <button
              className="sound-button"
              aria-label={prefs.sound ? "Mute sound" : "Enable sound"}
              title={prefs.sound ? "Sound on" : "Sound off"}
              onClick={() => {
                prefs.set({ sound: !prefs.sound });
                if (!prefs.sound) {
                  configureSound(true, prefs.volume, prefs.ambience);
                  playSound("snap");
                }
              }}
            >
              {prefs.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
              <span>Sound {prefs.sound ? "on" : "off"}</span>
            </button>
            <button
              className="icon-button settings-nav"
              aria-label="Open settings"
              onClick={() => open("settings")}
            >
              <Settings size={18} />
            </button>
            {!room.state && (
              <button className="header-cta" onClick={() => open("create")}>
                Take a seat <ArrowUpRight size={16} />
              </button>
            )}
            {room.state && (
              <button className="header-cta" onClick={() => open("leave")}>
                Leave table <DoorOpen size={15} />
              </button>
            )}
          </nav>
        </header>
      )}
      <main>
        {!room.state ? (
          <Landing open={open} />
        ) : room.state.phase === "lobby" ? (
          <Lobby state={room.state} open={open} />
        ) : inGame ? (
          <GameTable state={room.state} open={open} />
        ) : (
          <Results state={room.state} />
        )}
      </main>
      {updateAvailable && (
        <div className="client-update-banner" role="status">
          <span>New game controls are available for this tab.</span>
          <button onClick={() => location.reload()}>Reload controls</button>
        </div>
      )}
      {!room.state && (
        <footer className="site-footer">
          <span>
            <Diamond /> MADE FOR GOOD COMPANY.
          </span>
          <span className="footer-center">
            A little competition. A lot of connection.
          </span>
          <button onClick={() => open("rules")}>
            The finer details <ArrowUpRight size={13} />
          </button>
        </footer>
      )}
      {room.code && room.status !== "connected" && (
        <div className="connection-banner" role="status">
          {room.status === "closed" ? (
            <WifiOff size={16} />
          ) : (
            <LoaderCircle className="spin" size={16} />
          )}
          <span>
            {room.status === "closed"
              ? room.error || "Connection closed."
              : room.status === "connecting"
                ? "Finding your seat…"
                : "Reconnecting… Your seat is reserved for two minutes."}
          </span>
          {room.status === "closed" && (
            <button onClick={() => connect(room.code)}>Reconnect</button>
          )}
        </div>
      )}
      {room.error && room.status === "connected" && (
        <div className="toast" role="alert">
          <span>{room.error}</span>
          <button
            aria-label="Dismiss message"
            onClick={() => room.set({ error: "" })}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              create: "Create a room",
              join: "Join a room",
              rules: "A game of instinct.",
              settings: "Settings",
              leave: "Heading out?",
            }[modal]
          }
          eyebrow={
            {
              create: "YOUR TABLE, YOUR PEOPLE",
              join: "GOOD COMPANY AWAITS",
              rules: "THE HOUSE RULES",
              settings: "MAKE IT YOURS",
              leave: "LEAVE THE TABLE",
            }[modal]
          }
          close={() => setModal(null)}
          wide={modal === "rules"}
        >
          {modal === "create" || modal === "join" ? (
            <SeatForm
              mode={modal}
              invite={invite}
              done={() => setModal(null)}
            />
          ) : modal === "rules" ? (
            <RulesContent state={room.state} />
          ) : modal === "settings" ? (
            <SettingsContent />
          ) : (
            <>
              <p className="modal-copy">
                {room.state?.phase === "lobby"
                  ? "You can join again with the room code."
                  : "Your seat will be reserved for two minutes. If you don’t return, the current round ends without a score."}
              </p>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  onClick={() => setModal(null)}
                >
                  Stay a little longer
                </button>
                <button
                  className="gold-button"
                  onClick={() => {
                    void leave();
                    setModal(null);
                  }}
                >
                  Leave table <ArrowUpRight size={16} />
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
function Landing({ open }: { open: (m: ModalName) => void }) {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow reveal-in">
            <span className="eyebrow-line" /> DUTCH · MULTIPLAYER CARD GAME.
          </div>
          <h1 className="reveal-in">
            Four cards.
            <br />
            <em>Anyone’s game.</em>
          </h1>
          <p className="hero-description reveal-in">
            A game of memory, swaps, and a little luck.
            <br className="desktop-break" /> Play 13 rounds with 2–8 friends.
            <br className="desktop-break" /> Keep your score low to win.
          </p>
          <div className="hero-actions reveal-in">
            <button
              className="gold-button hero-primary"
              onClick={() => open("create")}
            >
              <Plus size={19} /> Create a table{" "}
              <ArrowUpRight className="button-arrow" size={20} />
            </button>
            <button className="join-button" onClick={() => open("join")}>
              Join with a code <ArrowRight size={17} />
            </button>
          </div>
          <div className="hero-reassurance reveal-in">
            <span className="status-dot" /> No downloads. No sign-ups. Just
            play.
          </div>
          <div className="hero-stats reveal-in">
            <div>
              <Users size={17} />
              <span>
                <b>2–8</b> players
              </span>
            </div>
            <span className="stat-divider" />
            <div>
              <span className="clock-icon" />
              <span>
                <b>10 min</b> rounds
              </span>
            </div>
            <span className="stat-divider" />
            <div>
              <ShieldCheck size={17} />
              <span>
                <b>100%</b> your circle
              </span>
            </div>
          </div>
        </div>
        <HeroCards />
      </section>
      <section className="how-section" id="how-to-play">
        <div className="section-heading">
          <span className="eyebrow">SIMPLE TO LEARN. HARD TO READ.</span>
          <h2>
            Less overthinking.
            <br />
            <em>More “one more round.”</em>
          </h2>
          <button onClick={() => open("rules")} className="text-button">
            Get to know the game <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="how-steps">
          <div className="how-step">
            <span className="step-number">01</span>
            <div className="step-icon">
              <Eye size={23} strokeWidth={1.3} />
            </div>
            <h3>A little look.</h3>
            <p>
              Four cards, face down. Peek at two.
              <br />
              Remember what you can.
            </p>
          </div>
          <div className="how-step">
            <span className="step-number">02</span>
            <div className="step-icon">
              <Shuffle size={23} strokeWidth={1.3} />
            </div>
            <h3>A little mischief.</h3>
            <p>
              Draw, swap, or play a power.
              <br />
              Keep your score. Lose the points.
            </p>
          </div>
          <div className="how-step">
            <span className="step-number">03</span>
            <div className="step-icon">
              <Diamond />
            </div>
            <h3>A little nerve.</h3>
            <p>
              Think you’re the lowest? Call Dutch.
              <br />
              Let the cards do the talking.
            </p>
          </div>
        </div>
      </section>
      <div className="lounge-note">
        <span>♠</span>
        <p>Some things are better around a table.</p>
        <span>♥</span>
      </div>
    </div>
  );
}
function Modal({
  title,
  eyebrow,
  close,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current;
    node?.querySelector<HTMLElement>("input,button,select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && node) {
        const all = Array.from(
          node.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        );
        const first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
        <Diamond className="modal-diamond" />
        <span className="eyebrow">{eyebrow}</span>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
function SeatForm({
  mode,
  invite,
  done,
}: {
  mode: "create" | "join";
  invite: string;
  done: () => void;
}) {
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name);
  const [avatar, setAvatar] = useState(prefs.avatar);
  const [code, setCode] = useState(invite);
  const [rules, setRules] = useState({ ...DEFAULT_RULES });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await seat(
            mode,
            name.trim(),
            avatar,
            code.toUpperCase().trim(),
            rules,
          );
          prefs.set({ name: name.trim(), avatar });
          playSound("snap");
          done();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not connect.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="modal-copy">
        {mode === "create"
          ? "Choose a name and invite your friends."
          : "Enter the room code your friend shared."}
      </p>
      <label className="field-label" htmlFor="player-name">
        What should we call you?
      </label>
      <input
        id="player-name"
        placeholder="Your display name"
        autoComplete="nickname"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={1}
        maxLength={20}
      />
      <span className="field-label">Your table avatar</span>
      <div className="avatar-picker">
        {Array.from({ length: 8 }, (_, i) => (
          <button
            type="button"
            aria-label={`Choose avatar ${i + 1}`}
            aria-pressed={i === avatar}
            className={`avatar-option ${i === avatar ? "active" : ""}`}
            onClick={() => {
              setAvatar(i);
              playSound("snap");
            }}
            key={i}
          >
            <AvatarArt name={name || "Player"} variant={i} />
          </button>
        ))}
      </div>
      {mode === "join" ? (
        <>
          <label className="field-label" htmlFor="room-code">
            Your table code
          </label>
          <input
            id="room-code"
            className="code-input"
            placeholder="ABC234"
            maxLength={6}
            minLength={6}
            pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))
            }
            required
            autoComplete="off"
          />
        </>
      ) : (
        <>
          <div className="form-divider" />
          <div className="rule-form-pair">
            <label>
              <span className="field-label">The evening</span>
              <input
                aria-label="Number of rounds"
                value="13 rounds · 13 → 1"
                readOnly
              />
            </label>
            <label>
              <span className="field-label">Time to think</span>
              <select
                aria-label="Turn duration"
                value={rules.turnSeconds}
                onChange={(e) =>
                  setRules({ ...rules, turnSeconds: Number(e.target.value) })
                }
              >
                {[15, 30, 45, 60, 90, 120].map((n) => (
                  <option value={n} key={n}>
                    {n} seconds
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Toggle
            checked={rules.powers}
            onChange={(v) => setRules({ ...rules, powers: v })}
            title="Special card powers"
            description="Enable peek and blind swap powers"
          />
          <p className="form-note">
            <Settings size={13} /> You can fine-tune all house rules in the
            lobby.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="gold-button full"
        disabled={busy || !name.trim()}
        type="submit"
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <>
            {mode === "create" ? "Create my table" : "Join the table"}
            <ArrowUpRight size={18} />
          </>
        )}
      </button>
      <p className="privacy-note">
        <ShieldCheck size={13} /> Private table. Real people. No accounts.
      </p>
    </form>
  );
}
function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <b>{title}</b>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
function SettingsContent() {
  const p = usePrefs();
  return (
    <div className="settings-content">
      <p className="modal-copy">
        Set the mood. Your preferences stay with this browser.
      </p>
      <Toggle
        title="Sound effects"
        description="Recorded card sounds, power flourishes, and celebrations"
        checked={p.sound}
        onChange={(v) => {
          p.set({ sound: v });
          if (v) {
            configureSound(true, p.volume, p.ambience);
            playSound("snap");
          }
        }}
      />
      <Toggle
        title="Lounge ambience"
        description="A quiet, warm background soundscape"
        checked={p.ambience}
        onChange={(v) => p.set({ ambience: v })}
      />
      <label className="volume-row">
        <span>Volume</span>
        <input
          aria-label="Sound volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={p.volume}
          onChange={(e) => p.set({ volume: Number(e.target.value) })}
        />
        <span>{Math.round(p.volume * 100)}%</span>
      </label>
      <Toggle
        title="Dutch alarm"
        description="A cheeky loop while the last lap plays out after a Dutch call"
        checked={p.dutchAlarm}
        onChange={(v) => p.set({ dutchAlarm: v })}
      />
      <label className="volume-row">
        <span>Alarm</span>
        <input
          aria-label="Dutch alarm volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={p.alarmVolume}
          disabled={!p.dutchAlarm || !p.sound}
          onChange={(e) => p.set({ alarmVolume: Number(e.target.value) })}
        />
        <span>{Math.round(p.alarmVolume * 100)}%</span>
      </label>
      <button
        className="sound-chip"
        disabled={!p.sound || !p.dutchAlarm}
        onClick={() => {
          startDutchAlarm(p.alarmVolume);
          setTimeout(stopDutchAlarm, 3200);
        }}
      >
        <Volume2 size={12} />
        Preview alarm
      </button>
      <Toggle
        title="Flight-deck cues"
        description="An overspeed clacker for penalty streaks, and a chime or “pull up” for how a Dutch call lands"
        checked={p.flightSounds}
        onChange={(v) => p.set({ flightSounds: v })}
      />
      <div className="sound-preview">
        <div>
          {(
            [
              ["overspeed", playOverspeed],
              ["chime", playChime],
              ["pull up", playPullUp],
            ] as const
          ).map(([label, play]) => (
            <button
              className="sound-chip"
              key={label}
              onClick={play}
              disabled={!p.sound || !p.flightSounds}
            >
              <Volume2 size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <Toggle
        title="Cinematic effects"
        description="Floating particles, card motion, and celebrations"
        checked={p.effects}
        onChange={(v) => p.set({ effects: v })}
      />
      <p className="form-note">
        Your device’s reduced-motion preference is always respected.
      </p>
      <div className="sound-preview">
        <span className="field-label">PREVIEW SOUNDS</span>
        <div>
          {(
            [
              "shuffle",
              "deal",
              "draw",
              "snap",
              "penalty",
              "burn",
              "power",
              "dutch",
              "tick",
              "victory",
            ] as const
          ).map((s) => (
            <button
              className="sound-chip"
              key={s}
              onClick={() => playSound(s)}
              disabled={!p.sound}
            >
              <Volume2 size={12} />
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
function RulesContent({ state }: { state: GameView | null }) {
  const [tab, setTab] = useState("basics");
  const r = state?.rules ?? DEFAULT_RULES;
  return (
    <>
      <div className="rule-tabs" role="tablist" aria-label="Rules sections">
        {[
          ["basics", "The basics"],
          ["powers", "A little mischief"],
          ["house", "House rules"],
        ].map(([id, label]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "basics" ? (
        <div className="rules-basics">
          <p>Lowest score. Sharpest memory. Best poker face.</p>
          <div className="rules-list">
            {[
              [
                "01",
                "Meet your cards",
                "Two full decks are shuffled together: 104 cards, 52 with red backs and 52 with blue backs. Everyone gets four face-down cards. Each round has a moderator: the table owner first, then the next player clockwise. The moderator decides whether everyone may look at 0, 1 or 2 of their cards, and the player after the moderator starts. Back design identifies the deck, not the suit.",
              ],
              [
                "02",
                "Make your move",
                "Tap the deck or the discard to draw. Tap one of your cards, or drag the new card onto it, to swap it in. Don’t want a deck card? Tap the discard pile or flick the card up. Drag your own cards to reorder them. A taken discard must be swapped in. If the new card matches the cards it replaces, they are all discarded.",
              ],
              [
                "03",
                "Free throw",
                "Throw a hand card that matches the top discard, on any player’s turn: drag it onto the discard pile. Holding a card from the deck? Drag matching hand cards onto it to discard them all. To throw several at once, long-press a card (Shift-click on a computer), tap the others, then tap the ↑ chip or drag them to the pile. Wrong matches add one penalty card. Each Queen thrown from your hand grants one blind swap; each hand Jack grants one private peek.",
              ],
              [
                "04",
                "Call your shot",
                "Declare Dutch before you draw, or just after your turn until the next player draws. Every opponent gets one final turn, then all cards are revealed. If the caller’s card is swapped, Dutch is cancelled. A caller who isn’t the lowest draws one extra card for every player at or below their score, and those cards count. Emptying your hand is an automatic Dutch: on your own turn the round ends at once; on someone else’s turn the round ends when the moderator finishes their turn.",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="joker-rule-note">
            <Sparkles size={16} />
            Rounds count down 13 → 1. Jokers: K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3,
            2, A. Every card of the round’s joker rank is worth 0 points,
            regardless of suit or back. Other card values stay as shown below.
          </p>
          <div className="values-grid">
            <div>
              <b>A</b>
              <span>1 point</span>
            </div>
            <div>
              <b>2–10</b>
              <span>Face value</span>
            </div>
            <div>
              <b>J / Q</b>
              <span>11 / 12 points</span>
            </div>
            <div>
              <b className="red-text">K ♥ ♦</b>
              <span>0 points</span>
            </div>
            <div>
              <b>K ♠ ♣</b>
              <span>13 points</span>
            </div>
          </div>
          <p className="form-note">
            Start with 2–8 players. Every match lasts 13 rounds, counting down
            from 13 to 1. Lowest round total wins; the lowest combined score
            wins the match.
          </p>
        </div>
      ) : tab === "powers" ? (
        <div className="rules-list power-rules">
          <p>
            Each Queen discarded from your hand grants one blind swap. Each Jack
            discarded from your hand grants one private peek at your own cards.
            Three hand Queens or Jacks grant three swaps or peeks. Jacks and
            Queens discarded directly from the draw pile grant no power. The 7,
            8, 9 and 10 have no special powers.
          </p>
          {[
            [
              "J",
              "Hand Jack",
              "Each Jack discarded from your hand grants one private peek at your own cards. A directly discarded deck draw grants none.",
            ],
            [
              "Q",
              "A twist of fate",
              "For each Queen discarded from your hand, blindly exchange any two different cards at the table, including your own. A drawn Queen grants no swap. Identities stay hidden.",
            ],
          ].map(([rank, title, desc]) => (
            <div key={rank}>
              <span className="power-rank">{rank}</span>
              <div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            </div>
          ))}
          <p className="form-note">
            Only hand Jacks and Queens grant powers. You may skip a power; the
            turn timer continues while choosing.
          </p>
        </div>
      ) : (
        <div>
          <p className="modal-copy">
            Every circle plays a little differently. The table owner can adjust
            these before the match. Changing a rule resets everyone’s ready
            status.
          </p>
          {state?.phase === "lobby" && state.hostId === state.you ? (
            <HouseRuleEditor state={state} />
          ) : (
            <div className="house-summary">
              {[
                ["Rounds", r.rounds],
                ["Turn timer", `${r.turnSeconds} seconds`],
                ["Initial peek", `${r.peekSeconds} seconds`],
                ["Special powers", r.powers ? "On" : "Off"],
                [
                  "Free throws",
                  r.burning === "off" ? "Off" : `Same ${r.burning}`,
                ],
                ["Free throw window", "Always — any player’s turn"],
                ["Failed call", "One extra card per player at or below you"],
                [
                  "Moderator",
                  "Moves clockwise each round; picks 0, 1 or 2 cards to see",
                ],
                [
                  "Successful call",
                  r.callerMustBeLowest
                    ? "Strictly lowest score"
                    : "Tied lowest is enough",
                ],
                ["Maximum turns per round", r.maxTurns],
              ].map(([t, v]) => (
                <div key={String(t)}>
                  <span>{t}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          )}
          <div className="rules-callout">
            <ShieldCheck size={20} />
            <p>
              Each room is run by an authoritative Cloudflare server. Hidden
              cards stay on the server until a rule allows you to see them. The
              table continues if its owner briefly disconnects; any player
              missing for two minutes interrupts the round without scoring it.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
function HouseRuleEditor({ state }: { state: GameView }) {
  const [r, setR] = useState(state.rules);
  const pending = useRoom((s) => s.pending);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act({ type: "rules", rules: r });
      }}
    >
      <p className="form-note">2–8 players · 13 rounds in every match</p>
      <div className="rule-form-pair">
        {(["turnSeconds", "peekSeconds", "maxTurns"] as const).map((key) => (
          <label key={key}>
            <span className="field-label">
              {
                {
                  rounds: "Rounds",
                  turnSeconds: "Turn timer (seconds)",
                  peekSeconds: "Peek time (seconds)",
                  maxTurns: "Maximum turns",
                }[key]
              }
            </span>
            <input
              type="number"
              aria-label={key}
              value={r[key]}
              min={
                {
                  rounds: 1,
                  turnSeconds: 10,
                  peekSeconds: 10,
                  maxTurns: 10,
                }[key]
              }
              max={
                {
                  rounds: 10,
                  turnSeconds: 120,
                  peekSeconds: 60,
                  maxTurns: 500,
                }[key]
              }
              onChange={(e) => setR({ ...r, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label>
          <span className="field-label">Free throw matching</span>
          <select
            aria-label="Matching rule"
            value={r.burning}
            onChange={(e) =>
              setR({ ...r, burning: e.target.value as Rules["burning"] })
            }
          >
            <option value="off">Off</option>
            <option value="rank">Match rank</option>
            <option value="value">Match point value</option>
          </select>
        </label>
      </div>
      <Toggle
        title="Special powers"
        checked={r.powers}
        onChange={(v) => setR({ ...r, powers: v })}
      />
      <p className="form-note">
        Free throws are always allowed on anyone’s turn.
      </p>
      <Toggle
        title="Caller must be strictly lowest"
        checked={r.callerMustBeLowest}
        onChange={(v) => setR({ ...r, callerMustBeLowest: v })}
      />
      <button className="gold-button full" disabled={!!pending}>
        Apply house rules <Check size={16} />
      </button>
    </form>
  );
}
