import { Button } from '@/components/ui/button';
import type { VoiceMode } from '@/voice/types';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface VoiceControlProps {
  mode: VoiceMode;
  isSupported: boolean;
  isListening: boolean;
  interimText: string;
  lastTranscript: string;
  error: string | null;
  onToggle: () => void;
  onStopSpeech: () => void;
  assistEnabled?: boolean;
}

export function VoiceControl({
  mode,
  isSupported,
  isListening,
  interimText,
  lastTranscript,
  error,
  onToggle,
  onStopSpeech,
  assistEnabled = false,
}: VoiceControlProps) {
  // Always render, even when voice mode is 'off' (the default for every account) - a control
  // that only appears once voice is already on gives users no way to discover or enable it.
  // onToggle (push-to-talk) works regardless of mode, so this is safe to click from 'off'.
  const unavailable = !isSupported;
  return (
    <section
      className="fixed bottom-5 left-5 z-[9998] max-w-sm rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur"
      aria-label="Voice accessibility controls"
      data-testid="voice-control"
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={isListening ? 'default' : 'outline'}
          onClick={onToggle}
          disabled={unavailable}
          aria-pressed={isListening || assistEnabled}
          aria-label={assistEnabled ? 'OPSIS Assist continuous listening is enabled' : isListening ? 'Stop listening' : 'Start push-to-talk voice command listening'}
          title={unavailable ? 'Voice input is not supported in this browser' : assistEnabled ? 'Assist is listening continuously' : 'Start a short push-to-talk command session'}
          data-testid="button-voice-command"
        >
          {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
          {assistEnabled ? 'Assist active' : isListening ? 'Stop listening' : 'Voice command'}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onStopSpeech}
          aria-label="Stop speech"
          title="Stop speech"
          data-testid="button-stop-voice-speech"
        >
          {isListening ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <span className="text-xs text-muted-foreground">
          {assistEnabled ? 'Continuous Assist' : isListening ? 'Listening' : 'Voice command'}
        </span>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {unavailable
          ? 'Voice input is unavailable in this browser. Keyboard and screen-reader controls remain available.'
          : isListening
            ? `Listening. ${interimText}`
            : lastTranscript
              ? `Last heard: ${lastTranscript}`
              : 'Voice commands are ready.'}
      </p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {interimText && <p className="mt-1 truncate text-xs text-muted-foreground">{interimText}</p>}
    </section>
  );
}