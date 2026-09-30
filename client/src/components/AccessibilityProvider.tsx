import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { VoiceNarrator, type NarratorOptions } from '@/voice/narrator';
import { matchVoiceCommand } from '@/voice/commandRegistry';
import { logVoiceCommand } from '@/voice/commandLog';
import { BrowserSpeechEngine, isSpeechRecognitionSupported } from '@/voice/speechRecognition';
import { ReadingScanner, describeReadingElement, isNativeReadingExempt } from '@/voice/readingScanner';
import type { ParsedVoiceCommand, VoiceMode, VoiceScope } from '@/voice/types';

export interface AccessibilitySettings {
  fontSize: number;
  contrastMode: 'normal' | 'high' | 'dark';
  colorTheme: 'default' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'monochrome';
  lineHeight: number;
  letterSpacing: number;
  fontFamily: 'default' | 'dyslexia' | 'serif' | 'mono';
  cursorSize: 'normal' | 'large' | 'extra-large';
  focusIndicatorStyle: 'default' | 'thick' | 'colored' | 'animated';
  reducedMotion: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast' | 'off';
  parallaxEffects: boolean;
  autoplayMedia: boolean;
  speechEnabled: boolean;
  speechRate: number;
  speechVolume: number;
  speechVoice: string;
  speechPitch: number;
  audioInstructions: boolean;
  soundEffects: boolean;
  audioDescriptions: boolean;
  keyboardNavigation: 'standard' | 'enhanced' | 'custom';
  tabOrder: 'default' | 'logical' | 'visual';
  skipLinksVisible: boolean;
  stickyFocus: boolean;
  clickDelay: number;
  verboseMode: boolean;
  announceChanges: boolean;
  structuralNavigation: boolean;
  landmarkNavigation: boolean;
  readingMode: boolean;
  textJustification: 'left' | 'center' | 'justify';
  paragraphSpacing: number;
  highlightLinks: boolean;
  showTooltips: boolean;
  extendedTimeouts: boolean;
  timeoutWarnings: boolean;
  pauseAnimations: boolean;
  language: string;
  dateFormat: 'iso' | 'us' | 'eu' | 'local';
  numberFormat: 'default' | 'simplified';
  /* New settings */
  readingMask: boolean;
  readingMaskHeight: number;
  readingGuide: boolean;
  liveCaptions: boolean;
  voiceNavigation: boolean;
  voiceMode: VoiceMode;
  assistEnabled: boolean;
  screenReaderMode: boolean;
  wordSpacing: number;
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSettings: (settings: Partial<AccessibilitySettings>) => void;
  announceToScreenReader: (message: string, priority?: 'polite' | 'assertive') => void;
  speak: (text: string, options?: NarratorOptions) => void;
  stopSpeaking: () => void;
  pauseSpeaking: () => void;
  resumeSpeaking: () => void;
  isSpeaking: boolean;
  speechSupported: boolean;
  isLoading: boolean;
  currentCaption: string;
  resetToDefaults: () => void;
  exportSettings: () => string;
  importSettings: (settingsString: string) => boolean;
  assist: OPSISAssist;
}
export interface OPSISAssist {
  isListening: boolean; interimText: string; lastTranscript: string; error: string | null;
  isSupported: boolean; toggleListening: () => void; stopListening: () => void; stopSpeech: () => void;
  assistEnabled: boolean; setAssistEnabled: (enabled: boolean) => void;
  registerVoiceScope: (scope: VoiceScope, handler: (command: ParsedVoiceCommand) => boolean | void) => () => void;
  registerShortcut: (id: string, shortcut: AssistShortcut) => () => void;
}
export interface AssistShortcut {
  key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean;
  action: () => void; allowInEditable?: boolean;
}

const ASSIST_TUTORIAL =
  'OPSIS Assist tutorial. Use Up and Down Arrow to move through app content. ' +
  'Press Enter or Space to activate the current item. Speak a command at any time. ' +
  'Press Control Shift Space to turn OPSIS Assist off.';

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

/* ── Reading Mask overlay ────────────────────────────────── */
function ReadingMask({ height }: { height: number }) {
  const [maskY, setMaskY] = useState(300);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => setMaskY(e.clientY);
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  const band = Math.max(20, height);

  return (
    <div
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        background: `linear-gradient(
          to bottom,
          rgba(0,0,0,0.45) 0px,
          rgba(0,0,0,0.45) ${Math.max(0, maskY - band)}px,
          transparent ${Math.max(0, maskY - band)}px,
          transparent ${maskY + band}px,
          rgba(0,0,0,0.45) ${maskY + band}px,
          rgba(0,0,0,0.45) 100%
        )`,
      }}
    />
  );
}

/* ── Live Captions bar ───────────────────────────────────── */
function LiveCaptionsBar({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Live captions"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9997,
        background: 'rgba(0,0,0,0.87)',
        color: '#fff',
        fontSize: '1.1rem',
        lineHeight: 1.5,
        padding: '12px 24px',
        textAlign: 'center',
        borderTop: '3px solid hsl(221 83% 53%)',
        letterSpacing: '0.01em',
      }}
    >
      {text}
    </div>
  );
}

/* ── Reading Guide line ──────────────────────────────────── */
function ReadingGuideLine() {
  const [guideY, setGuideY] = useState(-100);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => setGuideY(e.clientY);
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  return (
    <div
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: guideY,
        height: 2,
        background: 'hsl(221 83% 53% / 0.5)',
        pointerEvents: 'none',
        zIndex: 9996,
        transition: 'top 0.05s linear',
      }}
    />
  );
}

/* ── Provider ────────────────────────────────────────────── */
export function AccessibilityProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const getDefaultSettings = (): AccessibilitySettings => ({
    fontSize: 16,
    contrastMode: 'normal',
    colorTheme: 'default',
    lineHeight: 1.6,
    letterSpacing: 0,
    wordSpacing: 0,
    fontFamily: 'default',
    cursorSize: 'normal',
    focusIndicatorStyle: 'default',
    reducedMotion: false,
    animationSpeed: 'normal',
    parallaxEffects: true,
    autoplayMedia: true,
    speechEnabled: false,
    speechRate: 10,
    speechVolume: 80,
    speechVoice: '',
    speechPitch: 10,
    audioInstructions: true,
    soundEffects: true,
    audioDescriptions: false,
    keyboardNavigation: 'enhanced',
    tabOrder: 'logical',
    skipLinksVisible: true,
    stickyFocus: false,
    clickDelay: 0,
    verboseMode: false,
    announceChanges: true,
    structuralNavigation: true,
    landmarkNavigation: true,
    readingMode: false,
    textJustification: 'left',
    paragraphSpacing: 1,
    highlightLinks: true,
    showTooltips: true,
    extendedTimeouts: false,
    timeoutWarnings: true,
    pauseAnimations: false,
    language: 'en-US',
    dateFormat: 'local',
    numberFormat: 'default',
    readingMask: false,
    readingMaskHeight: 40,
    readingGuide: false,
    liveCaptions: false,
    voiceNavigation: true,
    voiceMode: 'push-to-talk',
    assistEnabled: false,
    screenReaderMode: false,
  });

  const [settings, setSettings] = useState<AccessibilitySettings>(getDefaultSettings());
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechSynthesisObj, setSpeechSynthesisObj] = useState<SpeechSynthesis | null>(null);
  const [ariaLiveRegion, setAriaLiveRegion] = useState<HTMLElement | null>(null);
  const [currentCaption, setCurrentCaption] = useState('');
  const narratorRef = useRef<VoiceNarrator | null>(null);
  const [assistListening, setAssistListening] = useState(false);
  const [assistInterim, setAssistInterim] = useState('');
  const [assistTranscript, setAssistTranscript] = useState('');
  const [assistError, setAssistError] = useState<string | null>(null);
  const [readingCursorElement, setReadingCursorElement] = useState<HTMLElement | null>(null);
  const [showAssistQuestion, setShowAssistQuestion] = useState(false);
  const settingsRef = useRef(settings);
  const voiceScopesRef = useRef(new Map<VoiceScope, (command: ParsedVoiceCommand) => boolean | void>());
  const shortcutsRef = useRef(new Map<string, AssistShortcut>());
  const engineRef = useRef<BrowserSpeechEngine | null>(null);
  const desiredListeningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const transcriptCooldownRef = useRef(new Map<string, number>());
  const backoffRef = useRef(250);
  const scannerRef = useRef<ReadingScanner | null>(null);
  const startAssistRef = useRef<() => void>(() => {});
  const generationRef = useRef(0);
  const isSpeakingRef = useRef(false);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      setSpeechSynthesisObj(window.speechSynthesis);
      setSpeechSupported(true);
    }

    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(liveRegion);
    setAriaLiveRegion(liveRegion);

    const savedSettings = localStorage.getItem('opsis-accessibility-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // Versionless settings predate continuous Assist; retain all preferences
        // while converting the earlier experimental value if it exists.
        const migratedVoiceMode: VoiceMode =
          parsed.voiceMode === 'continuous' ? 'assist' :
          ['off', 'push-to-talk', 'assist'].includes(parsed.voiceMode) ? parsed.voiceMode :
          getDefaultSettings().voiceMode;
        const merged = { ...getDefaultSettings(), ...parsed, voiceMode: migratedVoiceMode };
        setSettings(merged);
        applyAccessibilitySettings(merged);
      } catch {
        /* ignore */
      }
    } else {
      const defaults = getDefaultSettings();
      setSettings(defaults);
      applyAccessibilitySettings(defaults);
    }

    if (userId) {
      fetch(`/api/settings/${userId}`)
        .then(response => response.ok ? response.json() : null)
        .then(remote => {
          if (!remote) return;
          setSettings(previous => {
            const merged: AccessibilitySettings = {
              ...previous,
              fontSize: remote.fontSize ?? previous.fontSize,
              contrastMode: remote.contrastMode ?? previous.contrastMode,
              speechRate: remote.speechRate ?? previous.speechRate,
              speechVolume: remote.speechVolume ?? previous.speechVolume,
              speechPitch: remote.speechPitch ?? previous.speechPitch,
              speechVoice: remote.speechVoice ?? previous.speechVoice,
              voiceMode: remote.voiceMode ?? previous.voiceMode,
              voiceNavigation: (remote.voiceMode ?? previous.voiceMode) !== 'off',
              audioInstructions: remote.audioInstructions ?? previous.audioInstructions,
              soundEffects: remote.soundEffects ?? previous.soundEffects,
              reducedMotion: remote.reducedMotion ?? previous.reducedMotion,
            };
            applyAccessibilitySettings(merged);
            localStorage.setItem('opsis-accessibility-settings', JSON.stringify(merged));
            return merged;
          });
        })
        .catch(() => {
          // Local settings remain fully functional when the server is unavailable.
        });
    }

    return () => {
      if (liveRegion && document.body.contains(liveRegion)) {
        document.body.removeChild(liveRegion);
      }
    };
  }, [userId]);

  useEffect(() => {
    narratorRef.current = new VoiceNarrator(speechSynthesisObj, (speaking, text) => {
      isSpeakingRef.current = speaking;
      setIsSpeaking(speaking);
      if (speaking && text) setCurrentCaption(text);
      if (!speaking) setCurrentCaption('');
    });
    return () => narratorRef.current?.cancel();
  }, [speechSynthesisObj]);

  const applyAccessibilitySettings = (s: AccessibilitySettings) => {
    const root = document.documentElement;

    root.style.fontSize = `${s.fontSize}px`;
    root.style.setProperty('--line-height', s.lineHeight.toString());
    root.style.setProperty('--letter-spacing', `${s.letterSpacing}px`);
    root.style.setProperty('--word-spacing', `${s.wordSpacing}px`);
    root.style.setProperty('--text-align', s.textJustification);
    root.style.setProperty('--paragraph-spacing', `${s.paragraphSpacing}rem`);

    root.classList.remove('high-contrast', 'dark');
    if (s.contrastMode === 'high') root.classList.add('high-contrast');
    else if (s.contrastMode === 'dark') root.classList.add('dark');

    root.classList.remove('protanopia', 'deuteranopia', 'tritanopia', 'monochrome');
    if (s.colorTheme !== 'default') root.classList.add(s.colorTheme);

    root.classList.remove('font-dyslexia', 'font-serif', 'font-mono');
    if (s.fontFamily !== 'default') root.classList.add(`font-${s.fontFamily}`);

    root.classList.remove('cursor-large', 'cursor-extra-large');
    if (s.cursorSize !== 'normal') root.classList.add(`cursor-${s.cursorSize}`);

    root.classList.remove('focus-thick', 'focus-colored', 'focus-animated');
    if (s.focusIndicatorStyle !== 'default') root.classList.add(`focus-${s.focusIndicatorStyle}`);

    root.classList.toggle('reduce-motion', s.reducedMotion);
    root.classList.remove('animation-slow', 'animation-fast', 'animation-off');
    if (s.animationSpeed !== 'normal') root.classList.add(`animation-${s.animationSpeed}`);

    root.classList.toggle('reading-mode', s.readingMode);
    root.classList.toggle('screen-reader-mode', s.screenReaderMode);
  };

  const announceToScreenReader = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (ariaLiveRegion) {
      ariaLiveRegion.setAttribute('aria-live', priority);
      ariaLiveRegion.textContent = message;
      setTimeout(() => { if (ariaLiveRegion) ariaLiveRegion.textContent = ''; }, 1000);
    }
  }, [ariaLiveRegion]);

  const speak = useCallback((text: string, options: NarratorOptions = {}) => {
    if (!settings.speechEnabled) return;
    narratorRef.current?.speak(text, {
      ...options,
      rate: options.rate ?? settings.speechRate / 10,
      volume: options.volume ?? settings.speechVolume / 100,
      pitch: options.pitch ?? settings.speechPitch / 10,
      voiceName: options.voiceName ?? settings.speechVoice,
      priority: options.priority ?? 'queue',
    });
  }, [settings.speechEnabled, settings.speechPitch, settings.speechRate, settings.speechVolume, settings.speechVoice]);
  const speakRef = useRef(speak);
  const announceRef = useRef(announceToScreenReader);
  useEffect(() => { speakRef.current = speak; announceRef.current = announceToScreenReader; }, [speak, announceToScreenReader]);

  const stopAssist = useCallback(() => {
    desiredListeningRef.current = false;
    generationRef.current += 1;
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    engineRef.current?.stop();
    engineRef.current = null;
    setAssistListening(false); setAssistInterim('');
  }, []);
  const startAssist = useCallback((force = false) => {
    const configured = settingsRef.current;
    if ((!force && !configured.assistEnabled && configured.voiceMode === 'off') || desiredListeningRef.current) return;
    if (!isSpeechRecognitionSupported()) {
      setAssistError('Voice input is unavailable in this browser. Keyboard controls remain available.');
      announceRef.current('Voice input is unavailable in this browser. Keyboard controls remain available.');
      return;
    }
    desiredListeningRef.current = true;
    const generation = ++generationRef.current;
    const continuous = configured.assistEnabled;
    const scheduleRecovery = () => {
      if (!continuous || !desiredListeningRef.current || !settingsRef.current.assistEnabled || restartTimerRef.current !== null) return;
      generationRef.current += 1;
      setAssistListening(false);
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        engineRef.current?.stop();
        engineRef.current = null;
        desiredListeningRef.current = false;
        startAssistRef.current();
      }, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, 4000);
    };
    const engine = new BrowserSpeechEngine(
      configured.language,
      text => { if (generation === generationRef.current) setAssistInterim(text); },
      result => {
        if (generation !== generationRef.current || isSpeakingRef.current) return;
        const transcript = result.transcript.trim();
        const key = transcript.toLocaleLowerCase();
        const now = Date.now();
        if (!transcript || now - (transcriptCooldownRef.current.get(key) ?? 0) < 1500) return;
        transcriptCooldownRef.current.set(key, now);
        setAssistTranscript(transcript); setAssistInterim('');
        const registrations = Array.from(voiceScopesRef.current.entries()).reverse();
        let handled = false;
        let lowConfidence = false;
        let matchedIntent: string | null = null;
        for (const [scope, handler] of registrations) {
          const match = matchVoiceCommand(transcript, scope, result.confidence ?? 1);
          lowConfidence ||= match.status === 'low-confidence';
          if (match.status === 'matched' && match.command && handler(match.command) !== false) {
            handled = true;
            matchedIntent = match.command.definition.id;
            break;
          }
        }

        logVoiceCommand({
          transcript,
          intent: matchedIntent,
          confidence: result.confidence ?? 1,
          result: handled ? 'matched' : lowConfidence ? 'low-confidence' : 'unknown',
        });
        if (!handled) {
          const message = lowConfidence ? `I heard ${transcript}. Please repeat.` : 'Command not understood. Say help for available commands.';
          setAssistError(message); announceRef.current(message);
          if (settingsRef.current.speechEnabled && settingsRef.current.audioInstructions) speakRef.current(message, { priority: 'interrupt' });
        } else {
          setAssistError(null);
          announceRef.current('Command completed.');
        }
      },
      () => { if (generation === generationRef.current) { backoffRef.current = 250; setAssistListening(true); setAssistError(null); } },
      () => {
        if (generation !== generationRef.current) return;
        setAssistListening(false); setAssistInterim('');
        scheduleRecovery();
      },
      message => {
        if (generation !== generationRef.current) return;
        if (/no speech/i.test(message) && continuous) {
          scheduleRecovery();
          return;
        }
        setAssistError(message); setAssistListening(false);
        if (/denied|no microphone|unavailable in this browser/i.test(message)) {
          desiredListeningRef.current = false;
        } else {
          scheduleRecovery();
        }
      },
      continuous ? 0 : 4000,
      continuous,
    );
    engineRef.current = engine; engine.start();
  }, []);
  startAssistRef.current = startAssist;
  const applyAssistEnabled = useCallback((enabled: boolean, includeTutorial = false) => {
    if (enabled && desiredListeningRef.current) stopAssist();
    setSettings(previous => {
      const next = { ...previous, assistEnabled: enabled };
      settingsRef.current = next;
      localStorage.setItem('opsis-accessibility-settings', JSON.stringify(next));
      return next;
    });
    const status = `OPSIS Assist ${enabled ? 'on' : 'off'}.`;
    const message = enabled && includeTutorial ? `${status} ${ASSIST_TUTORIAL}` : status;
    announceRef.current(message);
    if (settingsRef.current.speechEnabled && settingsRef.current.audioInstructions) {
      speakRef.current(message, { priority: 'interrupt' });
    }
  }, [stopAssist]);
  const toggleListening = useCallback(() => {
    if (settingsRef.current.assistEnabled) {
      applyAssistEnabled(false);
    } else if (desiredListeningRef.current) {
      stopAssist();
    } else {
      if (settingsRef.current.voiceMode === 'off') {
        setSettings(previous => {
          const next = { ...previous, voiceMode: 'push-to-talk' as VoiceMode, voiceNavigation: true };
          settingsRef.current = next;
          localStorage.setItem('opsis-accessibility-settings', JSON.stringify(next));
          return next;
        });
      }
      startAssist(true);
    }
  }, [applyAssistEnabled, startAssist, stopAssist]);
  const requestAssistEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      const tutorialKey = `opsis-assist-tutorial:${userId ?? 'anonymous'}`;
      if (!localStorage.getItem(tutorialKey)) {
        setShowAssistQuestion(true);
        return;
      }
    }
    applyAssistEnabled(enabled);
  }, [applyAssistEnabled, userId]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return Boolean(el?.closest('input, textarea, [contenteditable="true"], [role="textbox"], .monaco-editor'));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        requestAssistEnabled(!settingsRef.current.assistEnabled);
        return;
      }
      if (settingsRef.current.assistEnabled && !event.ctrlKey && !event.altKey && !event.metaKey &&
        ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key) && !isEditable(event.target) &&
        !isNativeReadingExempt(event.target as HTMLElement)) {
        const scanner = scannerRef.current;
        const element = event.key === 'Enter' || event.key === ' ' ? scanner?.activate() : scanner?.move(event.key === 'ArrowUp' ? -1 : 1);
        if (element) {
          event.preventDefault();
          setReadingCursorElement(element);
          element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          const description = describeReadingElement(element);
          announceRef.current(description);
          if (settingsRef.current.speechEnabled && settingsRef.current.audioInstructions) speakRef.current(description, { priority: 'drop-if-speaking' });
          return;
        }
      }
      for (const shortcut of Array.from(shortcutsRef.current.values())) {
        if (event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          !!event.ctrlKey === !!shortcut.ctrlKey && !!event.shiftKey === !!shortcut.shiftKey &&
          !!event.altKey === !!shortcut.altKey && !!event.metaKey === !!shortcut.metaKey &&
          (shortcut.allowInEditable || !isEditable(event.target))) {
          event.preventDefault(); shortcut.action(); return;
        }
      }
      if (event.key === 'Escape' && assistListening) stopAssist();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [assistListening, requestAssistEnabled, stopAssist]);
  useEffect(() => {
    if (settings.assistEnabled) {
      scannerRef.current ??= new ReadingScanner();
      scannerRef.current.start(() => {
        setReadingCursorElement(current => current && !current.isConnected ? null : current);
      });
      startAssist();
    }
    else stopAssist();
    return () => {
      // Scanner is route-aware and may refresh; recognition is intentionally not
      // stopped here so continuous Assist survives page/scope navigation.
      scannerRef.current?.stop();
      scannerRef.current = null;
    };
  }, [settings.assistEnabled, settings.voiceMode, startAssist, stopAssist]);
  useEffect(() => () => stopAssist(), [stopAssist]);
  const registerVoiceScope = useCallback((scope: VoiceScope, handler: (command: ParsedVoiceCommand) => boolean | void) => {
    voiceScopesRef.current.set(scope, handler);
    return () => { if (voiceScopesRef.current.get(scope) === handler) voiceScopesRef.current.delete(scope); };
  }, []);
  const registerShortcut = useCallback((id: string, shortcut: AssistShortcut) => {
    shortcutsRef.current.set(id, shortcut);
    return () => { if (shortcutsRef.current.get(id) === shortcut) shortcutsRef.current.delete(id); };
  }, []);
  const assist: OPSISAssist = useMemo(() => ({
    isListening: assistListening, interimText: assistInterim, lastTranscript: assistTranscript, error: assistError,
    isSupported: isSpeechRecognitionSupported(), toggleListening, stopListening: stopAssist, stopSpeech: () => narratorRef.current?.cancel(),
    assistEnabled: settings.assistEnabled, setAssistEnabled: requestAssistEnabled, registerVoiceScope, registerShortcut,
  }), [assistError, assistInterim, assistListening, assistTranscript, registerShortcut, registerVoiceScope, requestAssistEnabled, settings.assistEnabled, stopAssist, toggleListening]);

  useEffect(() => {
    const handleNarrationRequest = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (message && settings.speechEnabled && settings.audioInstructions) speak(message, { priority: 'queue' });
    };
    document.addEventListener('opsis:narrate', handleNarrationRequest);
    return () => document.removeEventListener('opsis:narrate', handleNarrationRequest);
  }, [speak]);

  const stopSpeaking = useCallback(() => {
    narratorRef.current?.cancel();
  }, []);

  const pauseSpeaking = useCallback(() => narratorRef.current?.pause(), []);
  const resumeSpeaking = useCallback(() => narratorRef.current?.resume(), []);

  const updateSettings = useCallback(async (newSettings: Partial<AccessibilitySettings>) => {
    setIsLoading(true);
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      applyAccessibilitySettings(updated);
      localStorage.setItem('opsis-accessibility-settings', JSON.stringify(updated));
      if (userId) {
        void fetch(`/api/settings/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fontSize: updated.fontSize,
            contrastMode: updated.contrastMode,
            speechRate: updated.speechRate,
            speechVolume: updated.speechVolume,
            speechPitch: updated.speechPitch,
            speechVoice: updated.speechVoice,
            voiceMode: updated.voiceMode,
            audioInstructions: updated.audioInstructions,
            soundEffects: updated.soundEffects,
            reducedMotion: updated.reducedMotion,
          }),
        });
      }
      if (newSettings.contrastMode && newSettings.contrastMode !== settings.contrastMode)
        announceToScreenReader(`Contrast mode: ${newSettings.contrastMode}`);
      if (newSettings.fontSize && newSettings.fontSize !== settings.fontSize)
        announceToScreenReader(`Font size: ${newSettings.fontSize}px`);
    } finally {
      setTimeout(() => setIsLoading(false), 250);
    }
  }, [settings, announceToScreenReader, userId]);

  const resetToDefaults = useCallback(() => {
    const d = getDefaultSettings();
    setSettings(d);
    applyAccessibilitySettings(d);
    localStorage.removeItem('opsis-accessibility-settings');
    announceToScreenReader('Accessibility settings reset to defaults.');
  }, [announceToScreenReader]);

  const exportSettings = useCallback(() => JSON.stringify(settings, null, 2), [settings]);

  const importSettings = useCallback((str: string) => {
    try {
      const imported = JSON.parse(str);
      const valid = { ...getDefaultSettings(), ...imported };
      setSettings(valid);
      applyAccessibilitySettings(valid);
      localStorage.setItem('opsis-accessibility-settings', JSON.stringify(valid));
      announceToScreenReader('Settings imported successfully.');
      return true;
    } catch {
      announceToScreenReader('Failed to import settings. Invalid format.');
      return false;
    }
  }, [announceToScreenReader]);

  return (
    <AccessibilityContext.Provider value={{
      settings, updateSettings, announceToScreenReader, speak, stopSpeaking, pauseSpeaking, resumeSpeaking, assist,
      isSpeaking, speechSupported, isLoading, currentCaption,
      resetToDefaults, exportSettings, importSettings,
    }}>
      {children}
      {settings.readingMask && <ReadingMask height={settings.readingMaskHeight} />}
      {settings.readingGuide && <ReadingGuideLine />}
      {settings.liveCaptions && <LiveCaptionsBar text={currentCaption} />}
      {readingCursorElement && (
        <div
          aria-hidden="true"
          className="fixed z-[9995] rounded border-2 border-primary bg-primary/10 pointer-events-none"
          style={{ ...(() => { const box = readingCursorElement.getBoundingClientRect(); return { top: box.top, left: box.left, width: box.width, height: box.height }; })() }}
        />
      )}
      {showAssistQuestion && (
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="assist-question-title" aria-describedby="assist-question-description" className="max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h2 id="assist-question-title" className="text-lg font-semibold">OPSIS Assist preference</h2>
             <p className="mt-2 text-sm">Do you already use a screen reader like VoiceOver, NVDA, or JAWS?</p>
            <p id="assist-question-description" className="mt-2 text-sm text-muted-foreground">OPSIS Assist is always announced through accessible status text. Choosing Yes keeps spoken narration off by default. You can change narration at any time in Accessibility Center.</p>
            <div className="mt-4 flex gap-2">
              <button autoFocus className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => {
                localStorage.setItem(`opsis-assist-tutorial:${userId ?? 'anonymous'}`, JSON.stringify({ asked: true, answer: 'yes' }));
                setSettings(previous => {
                  const next = { ...previous, speechEnabled: false };
                   settingsRef.current = next;
                  localStorage.setItem('opsis-accessibility-settings', JSON.stringify(next));
                  return next;
                });
                 applyAssistEnabled(true, true);
                setShowAssistQuestion(false);
              }}>Yes, keep narration off</button>
              <button className="rounded border px-3 py-2 text-sm" onClick={() => {
                localStorage.setItem(`opsis-assist-tutorial:${userId ?? 'anonymous'}`, JSON.stringify({ asked: true, answer: 'no' }));
                 applyAssistEnabled(true, true);
                setShowAssistQuestion(false);
              }}>No, keep my current setting</button>
            </div>
          </section>
        </div>
      )}
      <div className="sr-only" role="complementary" aria-label="OPSIS Assist status and tutorial">
        <p>OPSIS — Accessibility-first examination platform. WCAG 2.2 AA compliant.</p>
        <p role="status" aria-live="polite">OPSIS Assist is {settings.assistEnabled ? 'on' : 'off'}.</p>
        <p>Press Ctrl+Shift+Space to turn OPSIS Assist on or off. When Assist is off, the microphone button starts a short push-to-talk command session. Say help to hear commands in the current page.</p>
        <p>Use Tab for interactive elements. Alt+A opens Accessibility Center.</p>
      </div>
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextType {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error('useAccessibility must be used within an AccessibilityProvider');
  return context;
}
