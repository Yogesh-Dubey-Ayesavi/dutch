/** Avatars: the bot's own face, and Reddit's default avatar for players without a Snoovatar. */

const BOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" fill="#F2DC4B"/>
<rect x="30.5" y="7" width="3" height="9" fill="#141412"/><rect x="27" y="4" width="10" height="6" fill="#141412"/>
<rect x="12" y="16" width="40" height="32" fill="#141412"/>
<rect x="7" y="26" width="5" height="12" fill="#141412"/><rect x="52" y="26" width="5" height="12" fill="#141412"/>
<rect x="19" y="25" width="9" height="9" fill="#5FD3A8"/><rect x="36" y="25" width="9" height="9" fill="#5FD3A8"/>
<rect x="22" y="39" width="20" height="3" fill="#F2F0EA"/>
<rect x="16" y="52" width="32" height="12" fill="#141412"/>
</svg>`;
export const BOT_AVATAR = `data:image/svg+xml,${encodeURIComponent(BOT_SVG)}`;

/** Reddit shows one of eight default avatars to users who never made a Snoovatar; pick one stably per user. */
export function defaultAvatar(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${h % 8}.png`;
}

/** Snoovatars are full-body pictures, so they're cropped to the head; every other avatar is shown whole. */
export const isFullBody = (url: string) => url.includes('/snoovatar/');
