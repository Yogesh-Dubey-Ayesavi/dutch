/**
 * Card art and sounds are bundled by Vite (hashed files under /assets) instead of living in `public/`,
 * because the Reddit web view only reliably serves what the build references the same way as its fonts.
 */
// The web view reliably shows only inline images (data URIs), so the SVGs are embedded in the JS, never fetched as files.
// The two card backs are tiny and always needed; the 52 faces load on demand, one small chunk per card.
const backs = import.meta.glob('./cards/*_Back.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const faces = import.meta.glob(['./cards/*.svg', '!./cards/*_Back.svg'], { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>;
const audio = import.meta.glob('./audio/*.{wav,mp3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const cardUrl = (name: string) => backs[`./cards/${name}.svg`] ?? '';
/** Loads one face (e.g. `QH`) as a data URI; null when there is no such file. */
export const loadFace = (code: string): Promise<string> | null => faces[`./cards/${code}.svg`]?.() ?? null;
/** A sound by file name. Big clips are stored as .mp3 and short taps as .wav, so either extension finds the clip. */
export const audioUrl = (file: string) => {
  const base = file.replace(/\.(wav|mp3)$/, '');
  return audio[`./audio/${file}`] ?? audio[`./audio/${base}.mp3`] ?? audio[`./audio/${base}.wav`] ?? '';
};
