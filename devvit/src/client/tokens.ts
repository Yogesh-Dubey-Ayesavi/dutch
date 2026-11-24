/** Clutch design tokens, lifted from the Claude Design project ("Clutch Screens", "Clutch Duel Table v4"). */
export const Y = 'oklch(0.9 0.17 100)'; // act-now yellow: your turn, free throws, last seconds
export const MINT = 'oklch(0.82 0.14 165)'; // gains, wins, good throws
export const DANGER = 'oklch(0.64 0.22 25)'; // penalties, failed calls, losses
export const TXT = '#F2F0EA';
export const INK = '#141412';
export const PAPER = '#F7F5EF';
export const PANEL = '#1F1E1B';
export const PANEL_LINE = '#2E2C28';
export const SHEET = '#1A1917';
export const LINE = '#3A3833';
export const MUTED = '#9C988E';
export const DIM = '#6E6A61';
export const SOFT = '#C8C4BA';
export const GROUND = 'radial-gradient(90% 60% at 50% 40%, #24211D 0%, #121110 70%)';
export const SHADOW = '4px 4px 0 #000';
export const AV_YOU = 'oklch(0.78 0.12 250)';
export const AV_OPP = 'oklch(0.72 0.18 35)';
export const FELT: Record<string, string> = {
  blue: 'radial-gradient(ellipse 70% 60% at 50% 42%, #2F5C9A 0%, #1E4176 55%, #142D55 100%)',
  green: 'radial-gradient(ellipse 70% 60% at 50% 42%, #2F7D55 0%, #1F5E3E 55%, #15442C 100%)',
  oxblood: 'radial-gradient(ellipse 70% 60% at 50% 42%, #8A3036 0%, #651E25 55%, #461318 100%)',
  slate: 'radial-gradient(ellipse 70% 60% at 50% 42%, #56626E 0%, #3A444F 55%, #262D35 100%)',
  plum: 'radial-gradient(ellipse 70% 60% at 50% 42%, #6A4486 0%, #4C2F63 55%, #331F44 100%)',
};
export const FONT = "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif";
export const SERIF = "'Libre Caslon Text', Georgia, serif";
export const avatarHue = (name: string) => [35, 165, 250, 300, 95, 200, 15, 130][[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 8];
export const fmt = (n: number) => n.toLocaleString('en-US');
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
