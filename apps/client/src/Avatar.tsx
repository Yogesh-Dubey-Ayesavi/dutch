import { Avatar as DiceAvatar, Style } from "@dicebear/core";
import adventurer from "@dicebear/styles/adventurer.json";

const AVATAR_STYLE = new Style(adventurer);
export function AvatarArt({
  name,
  variant = 0,
}: {
  name: string;
  variant?: number;
}) {
  const image = new DiceAvatar(AVATAR_STYLE, {
    seed: `${name.trim().toLowerCase()}-${variant}`,
    size: 96,
    backgroundColor: [
      "dbe7f4",
      "f1d8cf",
      "e8dfc6",
      "d5e8dd",
      "e6d9f2",
      "f3e3bd",
      "d5e2ea",
      "edd8df",
    ][((variant % 8) + 8) % 8],
  }).toDataUri();
  return <img src={image} alt="" aria-hidden="true" />;
}
export function Avatar({
  avatar,
  name,
  active = false,
  connected = true,
}: {
  avatar: number;
  name: string;
  active?: boolean;
  connected?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${avatar} ${active ? "active-player" : ""}`}
      aria-label={`${name}${connected ? " connected" : " disconnected"}`}
    >
      <AvatarArt name={name} variant={avatar} />
      <i className={connected ? "online" : "offline"} />
    </span>
  );
}
