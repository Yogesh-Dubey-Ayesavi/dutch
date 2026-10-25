import { Howl, Howler } from "howler";
import type { SoundName } from "../../../packages/protocol/src/index";

const sounds = new Map<string, Howl>();
const cardRecordings: Partial<Record<SoundName, string>> = {
  shuffle: "shuffle",
  deal: "card-contact1",
  draw: "card-cut",
  snap: "card-contact2",
  flip: "card-cut",
  burn: "card-contact2",
};
let enabled = true,
  volume = 0.65,
  flightSounds = true;
let ambient: Howl | undefined;
let alarm: Howl | undefined;

export function configureFlightSounds(on: boolean) {
  flightSounds = on;
}

export function configureSound(
  sound: boolean,
  level: number,
  ambience: boolean,
) {
  enabled = sound;
  volume = level;
  Howler.volume(level);
  if (!sound) Howler.stop();
  if (sound && ambience) {
    ambient ??= new Howl({
      src: ["/audio/ambience.wav"],
      loop: true,
      volume: 0.16,
    });
    if (!ambient.playing()) ambient.play();
  } else ambient?.stop();
}

export function playSound(name: SoundName, options: { rate?: number } = {}) {
  if (!enabled || volume === 0) return;
  let sound = sounds.get(name);
  if (!sound) {
    sound = new Howl({
      src: [`/audio/${cardRecordings[name] ?? name}.wav`],
      volume:
        name === "penalty"
          ? 0.82
          : name === "tick"
            ? 0.46
            : name === "dutch"
              ? 1
              : name === "shuffle"
                ? 0.7
                : 0.85,
      preload: true,
    });
    sounds.set(name, sound);
  }
  const id = sound.play();
  if (options.rate) sound.rate(options.rate, id);
  // Recorded card taps all sound alike; give the big moments their own voice.
  if (name === "burn") throwSound();
  else if (name === "power") magicSound();
}

/* ---------- synthesized accents, routed through Howler's master volume ---------- */

function audio() {
  const ctx = Howler.ctx as AudioContext | undefined;
  if (!enabled || volume === 0 || !ctx) return null;
  if (ctx.state === "suspended") void ctx.resume();
  const out =
    (Howler as unknown as { masterGain?: GainNode }).masterGain ??
    ctx.destination;
  return { ctx, out, t: ctx.currentTime };
}

function noise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * seconds),
    ctx.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function envelope(
  ctx: AudioContext,
  at: number,
  peak: number,
  attack: number,
  release: number,
) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  return gain;
}

/** A card flicked through the air and slapped onto the pile. */
export function throwSound() {
  const a = audio();
  if (!a) return;
  const { ctx, out, t } = a;
  const air = noise(ctx, 0.25);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(700, t);
  band.frequency.exponentialRampToValueAtTime(3400, t + 0.18);
  const airGain = envelope(ctx, t, 0.5, 0.05, 0.16);
  air.connect(band).connect(airGain).connect(out);
  air.start(t);
  const slap = noise(ctx, 0.08);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 1800;
  const slapGain = envelope(ctx, t + 0.17, 0.9, 0.004, 0.07);
  slap.connect(low).connect(slapGain).connect(out);
  slap.start(t + 0.17);
}

/** A glassy rising shimmer for Queen and Jack powers. */
export function magicSound() {
  const a = audio();
  if (!a) return;
  const { ctx, out, t } = a;
  [659, 880, 1109, 1319, 1760].forEach((freq, i) => {
    const at = t + i * 0.07;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = envelope(ctx, at, 0.16, 0.01, 0.55);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.7);
  });
  const sparkle = ctx.createOscillator();
  sparkle.type = "sine";
  sparkle.frequency.setValueAtTime(2637, t + 0.3);
  sparkle.frequency.exponentialRampToValueAtTime(3520, t + 0.8);
  const gain = envelope(ctx, t + 0.3, 0.06, 0.05, 0.5);
  sparkle.connect(gain).connect(out);
  sparkle.start(t + 0.3);
  sparkle.stop(t + 0.9);
}

/** Air moving past a card flying across the table. */
export function swooshSound(duration = 0.6) {
  const a = audio();
  if (!a) return;
  const { ctx, out, t } = a;
  const air = noise(ctx, duration + 0.1);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.9;
  band.frequency.setValueAtTime(400, t);
  band.frequency.exponentialRampToValueAtTime(2600, t + duration * 0.5);
  band.frequency.exponentialRampToValueAtTime(600, t + duration);
  const gain = envelope(ctx, t, 0.35, duration * 0.45, duration * 0.5);
  air.connect(band).connect(gain).connect(out);
  air.start(t);
}

/* ---------- flight-deck cues: optional, silly, toggled separately ---------- */

function cue(name: string, clipVolume: number) {
  if (!enabled || volume === 0 || !flightSounds) return;
  let sound = sounds.get(name);
  if (!sound) {
    sound = new Howl({ src: [`/audio/${name}.mp3`], volume: clipVolume });
    sounds.set(name, sound);
  }
  sound.play();
}
/** A pleasant cockpit chime for a Dutch call that paid off. */
export const playChime = () => cue("chime", 0.85);
/** The classic "pull up" warning for a Dutch call that went down in flames. */
export const playPullUp = () => cue("pull-up", 0.9);

let overspeedId: number | null = null;
export function startOverspeed() {
  if (!enabled || volume === 0 || !flightSounds) return;
  let sound = sounds.get("overspeed");
  if (!sound) {
    sound = new Howl({
      src: ["/audio/overspeed.mp3"],
      volume: 0.8,
      loop: true,
    });
    sounds.set("overspeed", sound);
  }
  sound.stop();
  overspeedId = sound.play();
}
export function stopOverspeed() {
  const sound = sounds.get("overspeed");
  if (!sound || overspeedId === null) return;
  const id = overspeedId;
  overspeedId = null;
  sound.fade(0.8, 0, 220, id);
  setTimeout(() => {
    sound.stop(id);
    sound.volume(0.8, id);
  }, 230);
}

let overspeedStreakTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Call once per wrong free throw. Keeps the overspeed clacker running
 * while the mistakes keep coming, and stops it 3 seconds after the last
 * one — for everyone at the table, not just the player who missed.
 */
export function noteWrongFreeThrow() {
  if (!enabled || volume === 0 || !flightSounds) return;
  if (!overspeedStreakTimer) startOverspeed();
  if (overspeedStreakTimer) clearTimeout(overspeedStreakTimer);
  overspeedStreakTimer = setTimeout(() => {
    overspeedStreakTimer = null;
    stopOverspeed();
  }, 3000);
}

/** A soft two-note chime announcing it's your turn, like a message notification. */
export function turnSound() {
  const a = audio();
  if (!a) return;
  const { ctx, out, t } = a;
  [880, 1318.5].forEach((freq, i) => {
    const at = t + i * 0.11;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = envelope(ctx, at, 0.22, 0.008, 0.22);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.3);
  });
}

/* ---------- the Dutch alarm: loops quietly through the last lap ---------- */

export function startDutchAlarm(level: number) {
  if (!enabled || volume === 0 || level <= 0) return stopDutchAlarm();
  alarm ??= new Howl({
    src: ["/audio/dutch-alarm.mp3"],
    loop: true,
    volume: level,
  });
  alarm.volume(level);
  if (!alarm.playing()) alarm.play();
}

export function stopDutchAlarm() {
  alarm?.stop();
}
