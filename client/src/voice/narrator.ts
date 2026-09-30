export type NarratorPriority = 'interrupt' | 'queue' | 'drop-if-speaking';

export interface NarratorOptions {
  priority?: NarratorPriority;
  rate?: number;
  volume?: number;
  pitch?: number;
  voiceName?: string;
}

interface QueuedSpeech {
  text: string;
  options: NarratorOptions;
}

export class VoiceNarrator {
  private queue: QueuedSpeech[] = [];
  private active = false;
  private generation = 0;

  constructor(
    private readonly speech: SpeechSynthesis | null,
    private readonly onStateChange?: (speaking: boolean, text?: string) => void,
  ) {}

  speak(text: string, options: NarratorOptions = {}) {
    if (!this.speech || !text.trim()) return;
    const priority = options.priority ?? 'queue';

    if (priority === 'drop-if-speaking' && (this.active || this.speech.speaking)) return;
    if (priority === 'interrupt') {
      this.cancel();
    }

    this.queue.push({ text: text.trim(), options });
    if (!this.active) this.startNext();
  }

  cancel() {
    this.generation += 1;
    this.queue = [];
    try {
      this.speech?.cancel();
    } catch {
      // ignore
    }
    this.active = false;
    this.onStateChange?.(false);
  }

  pause() {
    this.speech?.pause();
  }

  resume() {
    this.speech?.resume();
  }

  isSpeaking() {
    return this.active || Boolean(this.speech?.speaking);
  }

  private startNext() {
    const next = this.queue.shift();
    if (!next || !this.speech) {
      this.active = false;
      this.onStateChange?.(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(next.text);
    const generation = this.generation;
    utterance.rate = next.options.rate ?? 1;
    utterance.volume = next.options.volume ?? 0.8;
    utterance.pitch = next.options.pitch ?? 1;

    if (next.options.voiceName) {
      const voice = this.speech.getVoices().find(item => item.name === next.options.voiceName);
      if (voice) utterance.voice = voice;
    }

    this.active = true;
    this.onStateChange?.(true, next.text);

    let finished = false;
    let watchdog: number | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (watchdog !== null && typeof window !== 'undefined') window.clearTimeout(watchdog);
      if (generation !== this.generation) return;
      this.active = false;
      this.onStateChange?.(false);
      this.startNext();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    if (typeof window !== 'undefined') {
      const estimatedMs = Math.max(3000, ((next.text.length / 5) * 1000) / (next.options.rate ?? 1) + 2000);
      watchdog = window.setTimeout(() => {
        if (!finished && generation === this.generation) {
          finish();
        }
      }, estimatedMs);
    }

    try {
      this.speech.speak(utterance);
    } catch {
      finish();
    }
  }
}