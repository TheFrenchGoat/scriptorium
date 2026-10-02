// src/renderer/lib/sound.ts
// Sons de notification générés directement via l'API Web Audio (aucun
// fichier audio à embarquer ni à charger). Utilisés pour signaler la fin du
// minuteur d'écriture, avec plusieurs sonneries au choix.

export type TimerSoundId = 'chime' | 'bell' | 'soft' | 'alarm';

/** Libellés traduits dans SettingsModal.tsx (via i18n) ; ceci ne fixe que
 *  l'ordre et les identifiants valides. */
export const TIMER_SOUND_IDS: TimerSoundId[] = ['chime', 'bell', 'soft', 'alarm'];

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedContext) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      sharedContext = new Ctor();
    }
    // Certains navigateurs/OS démarrent le contexte audio suspendu tant
    // qu'aucune interaction utilisateur n'a eu lieu ; comme ce son est
    // toujours déclenché depuis une action déjà en cours (fin de minuteur
    // lancé par un clic), tenter de le relancer est sans risque.
    if (sharedContext.state === 'suspended') void sharedContext.resume();
    return sharedContext;
  } catch (err) {
    console.error("Impossible d'initialiser l'audio :", err);
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine'
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  // Enveloppe courte (attaque/chute) pour éviter un clic à l'allumage/
  // extinction de l'oscillateur.
  const attack = Math.min(0.02, duration / 4);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.linearRampToValueAtTime(0, start + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Trois bips courts et montants : signal clairement reconnaissable, sans
 *  être agressif. */
function playChime(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  [880, 988, 1174].forEach((freq, i) => tone(ctx, freq, now + i * 0.18, 0.16, volume));
}

/** Deux notes graves qui se chevauchent légèrement, façon "ding-dong". */
function playBell(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  tone(ctx, 660, now, 0.5, volume, 'triangle');
  tone(ctx, 550, now + 0.22, 0.6, volume, 'triangle');
}

/** Une seule note basse et douce, pour ne pas surprendre en pleine écriture. */
function playSoft(ctx: AudioContext, volume: number): void {
  tone(ctx, 523, ctx.currentTime, 0.5, volume * 0.8, 'sine');
}

/** Deux bips rapides et plus aigus, plus insistants (pour ne vraiment pas
 *  manquer la fin d'une session). */
function playAlarm(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  [0, 0.22, 0.44].forEach((offset) => tone(ctx, 1046, now + offset, 0.12, volume, 'square'));
}

const SOUND_PLAYERS: Record<TimerSoundId, (ctx: AudioContext, volume: number) => void> = {
  chime: playChime,
  bell: playBell,
  soft: playSoft,
  alarm: playAlarm
};

/** Joue la sonnerie choisie une fois. `volume` va de 0 (muet) à 1 (plein). */
export function playTimerSound(soundId: TimerSoundId = 'chime', volume = 0.5): void {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;
  (SOUND_PLAYERS[soundId] ?? playChime)(ctx, volume);
}

/** Rétro-compatibilité : ancien nom, conservé pour ne rien casser si
 *  référencé ailleurs. */
export function playTimerFinishedSound(volume = 0.5): void {
  playTimerSound('chime', volume);
}

/** Fait sonner la sonnerie choisie en boucle (avec un silence entre chaque
 *  répétition) jusqu'à l'appel de la fonction d'arrêt renvoyée. Utilisé pour
 *  que le signal de fin de minuteur continue tant que la personne n'a pas vu
 *  et fermé la notification correspondante. */
export function startTimerSoundLoop(soundId: TimerSoundId, volume: number, intervalMs = 2500): () => void {
  playTimerSound(soundId, volume);
  const id = setInterval(() => playTimerSound(soundId, volume), intervalMs);
  return () => clearInterval(id);
}
