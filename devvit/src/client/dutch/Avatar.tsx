import { useRoom } from "./store";
import { avatarHue } from "../tokens";
import { BOT_AVATAR } from "../../shared/avatars";

/**
 * A player's picture at the table: their Reddit avatar (from the match's seats), or their initial on a colour of
 * their own. (This used to draw a generated cartoon, which put a 440 KB library in front of the first screen.)
 */
export function Avatar({
  id,
  name,
  active = false,
  connected = true,
}: {
  id?: string;
  avatar?: number;
  name: string;
  active?: boolean;
  connected?: boolean;
}) {
  const seat = useRoom((r) => r.env?.seats.find((s) => (id ? s.userId === id : s.username === name)));
  const src = seat?.avatar || (seat?.bot ? BOT_AVATAR : "");
  return (
    <span
      className={`avatar ${active ? "active-player" : ""}`}
      aria-label={`${name}${connected ? " connected" : " disconnected"}`}
      style={src ? undefined : { background: `oklch(0.72 0.16 ${avatarHue(name)})`, color: "#141412", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}
    >
      {src ? <img src={src} alt="" aria-hidden="true" referrerPolicy="no-referrer" style={{ objectFit: "cover" }} /> : (name[0] ?? "?").toUpperCase()}
      <i className={connected ? "online" : "offline"} />
    </span>
  );
}
