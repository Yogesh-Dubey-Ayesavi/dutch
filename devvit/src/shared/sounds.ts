import type { Action, Game } from '@engine';
import type { SoundName } from './protocol';

/** Which cue an action makes: the original Dutch table's rules, one for one. */
export function soundFor(before: Game, next: Game, actor: string, action: Action, now: number): SoundName | null {
  if (['ready', 'rules', 'finishPeek', 'reorder'].includes(action.type)) return null;
  let sound: SoundName = 'snap';
  if (['start', 'nextRound', 'rematch'].includes(action.type)) sound = 'shuffle';
  else if (action.type === 'draw') sound = 'draw';
  else if (action.type === 'initialPeek' || action.type === 'powerPeek') sound = 'flip';
  else if (action.type === 'burn') {
    const matched = next.players.find((p) => p.id === actor)!.hand.length < before.players.find((p) => p.id === actor)!.hand.length;
    const finalWindow = !!before.caller && before.finalTurns === 0 && !!before.reactionWindow && now < before.reactionWindow.deadline;
    sound = matched ? (finalWindow ? 'whoop' : 'burn') : 'penalty';
  } else if (['blindSwap', 'blindSwapBatch', 'rearrange'].includes(action.type) || next.phase === 'power') sound = 'power';
  else if (action.type === 'call') sound = 'dutch';
  if (action.type === 'swap' && next.message.startsWith('Automatic match')) sound = 'burn';
  if (next.handPower && !before.handPower && sound !== 'whoop') sound = 'power';
  if (['finished', 'results'].includes(next.phase) && !['finished', 'results'].includes(before.phase)) sound = next.phase === 'finished' ? 'victory' : 'dutch';
  return sound;
}
