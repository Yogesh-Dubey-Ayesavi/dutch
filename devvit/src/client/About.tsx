/**
 * About Clutch: version and build, where it runs, what it stores about you, fair play, and where to get help.
 * Opened from the (i) button on Home and from the table's menu. `Copy details` is for bug reports.
 */
import { useState, type ReactNode } from 'react';
import { INK, LINE, MUTED, SOFT, TXT, Y } from './tokens';

declare const __APP_VERSION__: string;
declare const __BUILT_AT__: string;
declare const __DEVVIT_VERSION__: string;

/** Shown everywhere as the version: Reddit's number for this upload once the server tells us, else package.json's. */
let redditVersion: string | null = null;
export function setAppVersion(v: string | null | undefined) { if (v) redditVersion = v.replace(/^v/, ''); }
const version = () => redditVersion ?? __APP_VERSION__;
/** "0.0.1.90 (code 0.1.0)" once Reddit's number is known, for Stats for nerds and bug reports. */
export const APP_VERSION_LABEL = () => (redditVersion ? `${redditVersion} (code ${__APP_VERSION__})` : __APP_VERSION__);
const built = new Date(__BUILT_AT__);
const builtLabel = Number.isNaN(built.getTime()) ? 'unknown' : built.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: `1px solid ${LINE}`, fontSize: 14.5 }}>
      <span style={{ color: MUTED }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </div>
  );
}
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', color: MUTED }}>{title}</div>
      <div style={{ fontSize: 14.5, lineHeight: 1.45, color: SOFT }}>{children}</div>
    </div>
  );
}

export function AboutBody({ username, subreddit, onClose }: { username?: string; subreddit?: string; onClose: () => void }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const details = [
    `Clutch ${version()} (code ${__APP_VERSION__})`,
    `Built ${__BUILT_AT__}`,
    `Devvit ${__DEVVIT_VERSION__}`,
    subreddit ? `r/${subreddit}` : null,
    username ? `u/${username}` : null,
    `Screen ${window.innerWidth}×${window.innerHeight}`,
    navigator.userAgent,
  ].filter(Boolean).join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(details); setCopied('yes'); } catch { setCopied('no'); }
  };
  const help = subreddit ? <>Message the moderators of <b style={{ color: TXT }}>r/{subreddit}</b>, and tap <b style={{ color: TXT }}>Copy details</b> to paste in what we need to look into it.</> : <>Message the moderators of this community, and tap <b style={{ color: TXT }}>Copy details</b> to paste in what we need to look into it.</>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '74vh', color: TXT }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 800, fontSize: 34, letterSpacing: '-0.02em', fontStretch: '75%', lineHeight: 1 }}>Clutch</div>
        <span style={{ padding: '3px 8px', background: Y, color: INK, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em' }}>v{version()}</span>
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.45, color: SOFT, marginTop: -6 }}>A 1-on-1 card game. Your cards are face down: remember them, and finish with the fewest points.</div>
      <div>
        <Row k="Version">{version()}</Row>
        {redditVersion && <Row k="Code version">{__APP_VERSION__}</Row>}
        <Row k="Built">{builtLabel}</Row>
        <Row k="Runs on">Reddit · Devvit {__DEVVIT_VERSION__}</Row>
        {subreddit && <Row k="Community">r/{subreddit}</Row>}
        {username && <Row k="Signed in as">u/{username}</Row>}
      </div>
      <Part title="WHAT WE KEEP">Your Reddit username and avatar, your rating, games played and won, chips, the items you own, and how far you got in the lesson. Games in progress are kept for 2 hours. We never see your email, password or other Reddit activity.</Part>
      <Part title="FAIR PLAY">The server shuffles, deals and checks every move. Your rival’s screen is never sent your cards. Leaving a game against a person counts as a loss.</Part>
      <Part title="RATING AND CHIPS">Everyone starts at 0. Games against people change your rating and earn chips. Bot games are practice: nothing changes. Chips only buy looks (card backs and tables) and can’t be bought or cashed out.</Part>
      <Part title="NEED HELP?">{help}</Part>
      </div>
      <div style={{ display: 'flex', gap: 10, flex: 'none', paddingRight: 4 }}>
        <button type="button" onClick={() => void copy()} style={{ flex: 1, height: 52, background: '#2A2924', color: TXT, fontWeight: 800, fontSize: 16, boxShadow: '4px 4px 0 #000, inset 0 0 0 1px #3A3833' }}>
          {copied === 'yes' ? 'Copied' : copied === 'no' ? 'Couldn’t copy' : 'Copy details'}
        </button>
        <button type="button" onClick={onClose} style={{ flex: 1, height: 52, background: TXT, color: INK, fontWeight: 800, fontSize: 16, boxShadow: '4px 4px 0 #000' }}>Close</button>
      </div>
    </div>
  );
}
