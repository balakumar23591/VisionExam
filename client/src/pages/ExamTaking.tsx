import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuestionRenderer } from '@/components/QuestionRenderer';
import { VoiceControl } from '@/components/VoiceControl';
import type { CodeEditorVoiceActions } from '@/components/CodeEditor';
import { useAccessibility } from '@/components/AccessibilityProvider';
import { useOPSISAssist } from '@/hooks/useOPSISAssist';
import { buildHelpMessage } from '@/voice/commandRegistry';
import { apiRequest } from '@/lib/queryClient';
import type { ExamWithQuestions, ExamAttempt } from '@shared/schema';
import {
  AlertCircle, Clock, ChevronLeft, ChevronRight, Flag, CheckCircle2,
  Wifi, WifiOff, Save, Loader2, Mic, MicOff, Volume2, VolumeX,
  HelpCircle, X, BookOpen, AlertTriangle, Send, Eye, Keyboard,
  SkipForward, Zap, Shield, Info
} from 'lucide-react';

interface ExamTakingProps {
  currentUser: { id: string; username: string; role: string };
}

/* ── Auto-save status ─────────────────────── */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type SharedExamAction = 'nextQuestion' | 'previousQuestion' | 'flagQuestion' | 'stageSubmit' | 'confirmSubmit';
type ExamActionSource = 'voice' | 'keyboard' | 'button';

/* ── Timer urgency ────────────────────────── */
function timerColor(seconds: number, total: number): string {
  const pct = seconds / total;
  if (pct > 0.25) return 'text-emerald-400';
  if (pct > 0.10) return 'text-amber-400';
  return 'text-red-400';
}
function timerBg(seconds: number, total: number): string {
  const pct = seconds / total;
  if (pct > 0.25) return 'bg-emerald-950/60 border-emerald-700/40';
  if (pct > 0.10) return 'bg-amber-950/60 border-amber-700/40';
  return 'bg-red-950/60 border-red-700/40';
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function ExamTaking({ currentUser }: ExamTakingProps) {
  const [, params] = useRoute('/exam/:id');
  const [, setLocation] = useLocation();
  const {
    announceToScreenReader,
    speak,
    settings,
    updateSettings,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
  } = useAccessibility();

  /* ── Core state (PRESERVED) ─────────────── */
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [examAttemptId, setExamAttemptId] = useState<string | null>(null);

  /* ── UI state ───────────────────────────── */
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [direction, setDirection] = useState<1 | -1>(1); // for slide animation
  const [lastAction, setLastAction] = useState<string>('');

  const examId = params?.id;
  const mainRef = useRef<HTMLDivElement>(null);
  const codeVoiceActionsRef = useRef<CodeEditorVoiceActions | null>(null);
  const registerCodeVoiceActions = useCallback((actions: CodeEditorVoiceActions | null) => {
    codeVoiceActionsRef.current = actions;
  }, []);

  /* ── Network status ─────────────────────── */
  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  announceToScreenReader('Network connection restored.'); };
    const onOffline = () => { setIsOnline(false); announceToScreenReader('Network connection lost. Answers are saved locally.'); };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [announceToScreenReader]);

  /* ── Exam data query (PRESERVED) ────────── */
  const { data: exam, isLoading: examLoading } = useQuery<ExamWithQuestions>({
    queryKey: ['/api/exams', examId],
    enabled: !!examId,
  });

  /* ── Create attempt mutation (PRESERVED) ── */
  const createAttemptMutation = useMutation({
    mutationFn: async (examId: string) => {
      const response = await apiRequest('POST', '/api/attempts', {
        examId,
      });
      return response.json();
    },
    onSuccess: (attempt: ExamAttempt) => {
      setExamAttemptId(attempt.id);
      if (exam) {
        const secs = exam.duration * 60;
        setTimeRemaining(secs);
        setTotalTime(secs);
      }
    },
  });

  /* ── Update attempt mutation (PRESERVED) ── */
  const updateAttemptMutation = useMutation({
    mutationFn: async (data: { answers: Record<string, string> }) => {
      if (!examAttemptId) throw new Error('No exam attempt found');
      setSaveStatus('saving');
      const response = await apiRequest('PUT', `/api/attempts/${examAttemptId}`, data);
      return response.json();
    },
    onSuccess: () => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => {
      setSaveStatus('error');
    },
  });

  /* ── Submit exam mutation (PRESERVED) ───── */
  const submitExamMutation = useMutation({
    mutationFn: async () => {
      if (!examAttemptId || !exam) throw new Error('No exam attempt found');
      const response = await apiRequest('PUT', `/api/attempts/${examAttemptId}`, {
        answers,
        completedAt: new Date().toISOString(),
        timeSpent: exam.duration - Math.floor(timeRemaining / 60),
      });
      return response.json();
    },
    onSuccess: (attempt: ExamAttempt) => {
      announceToScreenReader('Exam submitted successfully. Redirecting to results.');
      setLocation(`/results/${attempt.id}`);
    },
  });

  /* ── Initialize exam (PRESERVED) ────────── */
  useEffect(() => {
    if (exam && !examAttemptId) createAttemptMutation.mutate(exam.id);
  }, [exam, examAttemptId]);

  /* ── Timer (PRESERVED) ──────────────────── */
  useEffect(() => {
    if (timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) { submitExamMutation.mutate(); return 0; }
        if (prev === 300) {
          announceToScreenReader('5 minutes remaining in the exam.');
          speak('5 minutes remaining in the exam.', { priority: 'interrupt' });
        }
        if (prev === 60) {
          announceToScreenReader('1 minute remaining. Please finish your answers.');
          speak('1 minute remaining. Please finish your answers.', { priority: 'interrupt' });
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [announceToScreenReader, speak, timeRemaining]);

  /* ── Auto-save (PRESERVED) ──────────────── */
  useEffect(() => {
    if (examAttemptId && Object.keys(answers).length > 0) {
      const t = setTimeout(() => updateAttemptMutation.mutate({ answers }), 2000);
      return () => clearTimeout(t);
    }
  }, [answers, examAttemptId]);

  /* ── Navigation (PRESERVED + enhanced) ──── */
  const nextQuestion = useCallback(() => {
    if (!exam || currentQuestionIndex >= exam.questions.length - 1) return;
    setDirection(1);
    setCurrentQuestionIndex(prev => prev + 1);
    const msg = `Question ${currentQuestionIndex + 2} of ${exam.questions.length}`;
    announceToScreenReader(msg);
    setLastAction(msg);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [exam, currentQuestionIndex, announceToScreenReader]);

  const previousQuestion = useCallback(() => {
    if (currentQuestionIndex <= 0) return;
    setDirection(-1);
    setCurrentQuestionIndex(prev => prev - 1);
    const msg = `Question ${currentQuestionIndex} of ${exam?.questions.length || 0}`;
    announceToScreenReader(msg);
    setLastAction(msg);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentQuestionIndex, exam, announceToScreenReader]);

  const flagQuestion = useCallback(() => {
    if (!exam) return;
    const qid = exam.questions[currentQuestionIndex].id;
    setFlaggedQuestions(prev => {
      const s = new Set(Array.from(prev));
      const wasFlagged = s.has(qid);
      if (wasFlagged) { s.delete(qid); } else { s.add(qid); }
      const msg = wasFlagged ? 'Question unflagged.' : 'Question flagged for review.';
      announceToScreenReader(msg);
      setLastAction(msg);
      return s;
    });
  }, [exam, currentQuestionIndex, announceToScreenReader]);

  const goToQuestion = useCallback((index: number) => {
    setDirection(index > currentQuestionIndex ? 1 : -1);
    setCurrentQuestionIndex(index);
    announceToScreenReader(`Navigated to question ${index + 1}`);
    setLastAction(`Jumped to Q${index + 1}`);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentQuestionIndex, announceToScreenReader]);

  const handleAnswerChange = useCallback((answer: string) => {
    if (!exam) return;
    const qid = exam.questions[currentQuestionIndex].id;
    setAnswers(prev => ({ ...prev, [qid]: answer }));
    announceToScreenReader('Answer recorded.');
    setLastAction('Answer saved');
  }, [exam, currentQuestionIndex, announceToScreenReader]);

  const handleSubmitExam = useCallback(() => {
    setShowSubmitDialog(true);
  }, []);

  const confirmSubmit = useCallback(() => {
    setShowSubmitDialog(false);
    announceToScreenReader('Submitting your exam, please wait.');
    submitExamMutation.mutate();
  }, [submitExamMutation, announceToScreenReader]);

  const dispatchExamAction = useCallback((action: SharedExamAction, source: ExamActionSource) => {
    const shouldSpeak = source === 'voice';
    const question = exam?.questions[currentQuestionIndex];

    switch (action) {
      case 'nextQuestion':
        if (exam && currentQuestionIndex < exam.questions.length - 1) {
          nextQuestion();
          if (shouldSpeak) speak(`Moving to question ${currentQuestionIndex + 2}.`, { priority: 'interrupt' });
        } else if (shouldSpeak) speak('You are already on the last question.', { priority: 'interrupt' });
        break;
      case 'previousQuestion':
        if (currentQuestionIndex > 0) {
          previousQuestion();
          if (shouldSpeak) speak(`Moving to question ${currentQuestionIndex}.`, { priority: 'interrupt' });
        } else if (shouldSpeak) speak('You are already on the first question.', { priority: 'interrupt' });
        break;
      case 'flagQuestion':
        if (shouldSpeak) {
          speak(
            flaggedQuestions.has(question?.id ?? '') ? 'Question unflagged.' : 'Question flagged for review.',
            { priority: 'interrupt' },
          );
        }
        flagQuestion();
        break;
      case 'stageSubmit':
        handleSubmitExam();
        if (shouldSpeak) {
          speak("You are about to submit your examination. This action cannot be undone. Say yes to confirm or no to cancel.", { priority: 'interrupt' });
        }
        break;
      case 'confirmSubmit':
        if (showSubmitDialog) confirmSubmit();
        else if (shouldSpeak) speak('No submission is waiting for confirmation. Say submit exam first.', { priority: 'interrupt' });
        break;
    }
  }, [
    confirmSubmit,
    currentQuestionIndex,
    exam,
    flaggedQuestions,
    flagQuestion,
    handleSubmitExam,
    nextQuestion,
    previousQuestion,
    showSubmitDialog,
    speak,
  ]);

  const voiceCommandHandler = useCallback((command: import('@/voice/types').ParsedVoiceCommand): boolean | void => {
    const question = exam?.questions[currentQuestionIndex];
    const answerOptions = Array.isArray(question?.options)
      ? question.options as Array<{ id: string; text: string }>
      : [];
    // Resolves a spoken option argument by id first ("select option b"), then falls back to a
    // 1-based position ("select option 2") so exams with any number of options are supported.
    const resolveOption = (argument?: string) => {
      const byId = answerOptions.find(item => item.id.toLowerCase() === argument?.toLowerCase());
      if (byId) return byId;
      const position = Number(argument);
      return Number.isInteger(position) && position >= 1 ? answerOptions[position - 1] : undefined;
    };

    // While a submit-exam confirmation is pending, nothing else should quietly slip through —
    // an unrelated or unclear response re-asks the confirmation question instead.
    if (showSubmitDialog && !['confirmSubmit', 'cancel', 'help', 'repeat'].includes(command.definition.id)) {
      speak("Please say yes to confirm submission, or no to cancel.", { priority: 'interrupt' });
      return true;
    }

    switch (command.definition.id) {
      case 'nextQuestion':
        dispatchExamAction('nextQuestion', 'voice');
        break;
      case 'previousQuestion':
        dispatchExamAction('previousQuestion', 'voice');
        break;
      case 'readQuestion':
        if (question) {
          const message = `Question ${currentQuestionIndex + 1}: ${question.text}`;
          speak(message, { priority: 'interrupt' });
          announceToScreenReader('Reading question aloud');
        }
        break;
      case 'readOption': {
        const option = resolveOption(command.argument);
        if (option) speak(`Option ${option.id.toUpperCase()}: ${option.text}`, { priority: 'interrupt' });
        else speak(`Option ${command.argument ?? ''} is not available for this question.`, { priority: 'interrupt' });
        break;
      }
      case 'readOptions': {
        if (!answerOptions.length) speak('This question has no listed options.', { priority: 'interrupt' });
        else speak(answerOptions.map(option => `Option ${option.id.toUpperCase()}: ${option.text}`).join('. '), { priority: 'interrupt' });
        break;
      }
      case 'selectOption': {
        const option = resolveOption(command.argument);
        if (option) {
          handleAnswerChange(option.id);
          speak(`Option ${option.id.toUpperCase()} selected.`, { priority: 'interrupt' });
        } else if (question?.type === 'true_false' && ['TRUE', 'FALSE'].includes(command.argument ?? '')) {
          handleAnswerChange(command.argument!.toLowerCase());
          speak(`${command.argument} selected.`, { priority: 'interrupt' });
        } else {
          speak(`Option ${command.argument ?? ''} is not available for this question.`, { priority: 'interrupt' });
        }
        break;
      }
      case 'clearAnswer': {
        if (!exam) break;
        const qid = exam.questions[currentQuestionIndex].id;
        setAnswers(prev => {
          const next = { ...prev };
          delete next[qid];
          return next;
        });
        speak('Answer cleared.', { priority: 'interrupt' });
        announceToScreenReader('Answer cleared.');
        break;
      }
      case 'readSelectedAnswer': {
        const selected = question ? answers[question.id] : undefined;
        if (!selected) {
          speak('No answer selected yet.', { priority: 'interrupt' });
        } else {
          const option = answerOptions.find(item => item.id.toLowerCase() === selected.toLowerCase());
          speak(option ? `Your answer is option ${option.id.toUpperCase()}: ${option.text}` : `Your answer is ${selected}.`, { priority: 'interrupt' });
        }
        break;
      }
      case 'submitAnswer': {
        const selected = question ? answers[question.id] : undefined;
        if (!selected) {
          speak('Please select an option before submitting your answer.', { priority: 'interrupt' });
        } else if (exam && currentQuestionIndex < exam.questions.length - 1) {
          speak('Answer saved. Moving to the next question.', { priority: 'interrupt' });
          nextQuestion();
        } else {
          speak('Answer saved. This was the last question. Say submit exam when you are ready to finish.', { priority: 'interrupt' });
        }
        break;
      }
      case 'readTimer': {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        speak(`Time remaining: ${minutes} minutes and ${seconds} seconds.`, { priority: 'interrupt' });
        break;
      }
      case 'flagQuestion':
        dispatchExamAction('flagQuestion', 'voice');
        break;
      case 'runTests': {
        if (codeVoiceActionsRef.current) {
          codeVoiceActionsRef.current.runTests();
          speak('Running the coding tests.', { priority: 'interrupt' });
        }
        else speak('Run tests is only available for a coding question.', { priority: 'interrupt' });
        break;
      }
      case 'readTestResults': {
        speak(codeVoiceActionsRef.current?.readTestResults() ?? 'There are no coding test results yet.', { priority: 'interrupt' });
        break;
      }
      case 'help':
        setShowHelpDialog(true);
        speak(buildHelpMessage('question'), { priority: 'interrupt' });
        break;
      case 'repeat':
        speak(lastAction || (question ? `Question ${currentQuestionIndex + 1}: ${question.text}` : 'There is nothing to repeat yet.'), { priority: 'interrupt' });
        break;
      case 'cancel':
        setShowSubmitDialog(false);
        stopSpeaking();
        announceToScreenReader('Voice action cancelled.');
        break;
      case 'pauseSpeech':
        pauseSpeaking();
        break;
      case 'resumeSpeech':
        resumeSpeaking();
        break;
      case 'increaseSpeechRate':
        updateSettings({ speechRate: Math.min(20, settings.speechRate + 1) });
        speak('Speech rate increased.', { priority: 'interrupt' });
        break;
      case 'decreaseSpeechRate':
        updateSettings({ speechRate: Math.max(5, settings.speechRate - 1) });
        speak('Speech rate decreased.', { priority: 'interrupt' });
        break;
      case 'stageSubmit':
        dispatchExamAction('stageSubmit', 'voice');
        break;
      case 'confirmSubmit':
        dispatchExamAction('confirmSubmit', 'voice');
        break;
      default:
        // Not recognized in this scope — let it fall through to the global handler
        // (e.g. navigation commands) instead of silently swallowing it.
        return false;
    }
  }, [
    answers,
    announceToScreenReader,
    currentQuestionIndex,
    dispatchExamAction,
    exam,
    handleAnswerChange,
    lastAction,
    nextQuestion,
    pauseSpeaking,
    resumeSpeaking,
    settings.speechRate,
    showSubmitDialog,
    speak,
    stopSpeaking,
    timeRemaining,
    updateSettings,
  ]);

  /* ── Keyboard shortcuts (PRESERVED) ─────── */
  const shortcuts = {
    next: { key: 'n', altKey: true, action: () => dispatchExamAction('nextQuestion', 'keyboard') },
    previous: { key: 'p', altKey: true, action: () => dispatchExamAction('previousQuestion', 'keyboard') },
    flag: { key: 'f', altKey: true, action: () => dispatchExamAction('flagQuestion', 'keyboard') },
    read: { key: 'r', altKey: true, action: () => {
        const qText = exam ? `Question ${currentQuestionIndex + 1}: ${exam.questions[currentQuestionIndex].text}` : '';
        if (qText) { speak(qText); setLastAction('Reading question'); }
      } },
    help: { key: 'h', altKey: true, action: () => setShowHelpDialog(true) },
  };
  const voice = useOPSISAssist('question', voiceCommandHandler, shortcuts);

  /* ── Format time ────────────────────────── */
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  /* ── Loading/error states ───────────────── */
  if (examLoading || !exam) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="h-12 w-12 rounded-full border-3 border-primary border-t-transparent"
          style={{ borderWidth: 3 }}
          aria-hidden="true"
        />
        <p className="text-muted-foreground font-medium" role="status">Loading exam…</p>
      </div>
    );
  }

  if (!exam.questions || exam.questions.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="text-center max-w-sm">
          <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Questions Available</h2>
          <p className="text-muted-foreground text-sm">This exam has no questions configured yet.</p>
        </div>
      </main>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / exam.questions.length) * 100;
  const answeredCount = Object.keys(answers).filter(k => exam.questions.some(q => q.id === k)).length;
  const unansweredCount = exam.questions.length - answeredCount;
  const isFlagged = flaggedQuestions.has(currentQuestion.id);
  const isUrgent = timeRemaining < totalTime * 0.10;
  const isWarning = timeRemaining < totalTime * 0.25 && !isUrgent;

  return (
    <div className="flex flex-col min-h-screen bg-[#F0F4F9] dark:bg-gray-950" role="application" aria-label="Examination interface">
      <VoiceControl
        mode={settings.voiceMode}
        isSupported={voice.isSupported}
        isListening={voice.isListening}
        interimText={voice.interimText}
        lastTranscript={voice.lastTranscript}
        error={voice.error}
        onToggle={voice.toggleListening}
        onStopSpeech={voice.stopSpeech}
        assistEnabled={voice.assistEnabled}
      />

      {/* ═══════════════════════════════════════
          STICKY HEADER
      ═══════════════════════════════════════ */}
      <header
        className="sticky top-0 z-40 bg-[#1a2235] dark:bg-gray-900 border-b border-white/10 shadow-xl"
        role="banner"
        aria-label="Exam header"
      >
        {/* Top row */}
        <div className="px-4 sm:px-6 h-14 flex items-center gap-4">

          {/* Left: exam title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-white text-sm font-semibold truncate leading-tight" data-testid="text-exam-title">
                {exam.title}
              </h1>
              <p className="text-white/50 text-[10px] leading-none mt-0.5">{currentUser.username}</p>
            </div>
          </div>

          {/* Center: question count */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/12"
            aria-label={`Question ${currentQuestionIndex + 1} of ${exam.questions.length}`}
            data-testid="text-question-progress"
          >
            <span className="text-white/60 text-xs">Q</span>
            <span className="text-white font-bold text-sm tabular-nums">{currentQuestionIndex + 1}</span>
            <span className="text-white/40 text-xs">/</span>
            <span className="text-white/60 text-xs">{exam.questions.length}</span>
          </div>

          {/* Center: Large Timer */}
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono font-bold text-lg tabular-nums transition-colors duration-500 ${timerBg(timeRemaining, totalTime)}`}
            aria-label={`Time remaining: ${formatTime(timeRemaining)}`}
            aria-live="off"
            data-testid="text-time-remaining"
          >
            <Clock
              className={`h-4 w-4 ${timerColor(timeRemaining, totalTime)} ${isUrgent ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
            <span className={`${timerColor(timeRemaining, totalTime)} ${isUrgent ? 'animate-pulse' : ''}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>

          {/* Right: indicators */}
          <div className="flex items-center gap-2">

            {/* Autosave */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs"
              aria-live="polite"
              aria-atomic="true"
            >
              {saveStatus === 'saving' ? (
                <><Loader2 className="h-3 w-3 text-blue-400 animate-spin" /><span className="text-blue-400">Saving</span></>
              ) : saveStatus === 'saved' ? (
                <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Saved</span></>
              ) : saveStatus === 'error' ? (
                <><AlertTriangle className="h-3 w-3 text-red-400" /><span className="text-red-400">Error</span></>
              ) : (
                <><Save className="h-3 w-3 text-white/30" /><span className="text-white/30">Auto-save</span></>
              )}
            </div>

            {/* Network */}
            <div
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isOnline ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}
              role="status"
              aria-label={isOnline ? 'Online' : 'Offline'}
            >
              {isOnline
                ? <Wifi className="h-3 w-3" aria-hidden="true" />
                : <WifiOff className="h-3 w-3 animate-pulse" aria-hidden="true" />}
              <span className="hidden md:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Voice status */}
            {voice.isListening && (
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-900/50 border border-red-500/40"
              >
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                <Mic className="h-3 w-3 text-red-400" aria-hidden="true" />
                <span className="text-red-400 text-xs font-medium">REC</span>
              </motion.div>
            )}

            {/* Help */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
              onClick={() => setShowHelpDialog(true)}
              aria-label="Keyboard help (Alt+H)"
              data-testid="button-exam-help"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Progress bar row */}
        <div className="px-0">
          <div className="relative h-1 bg-white/10">
            <motion.div
              className={`absolute inset-y-0 left-0 transition-colors duration-500 ${
                isUrgent ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-primary'
              }`}
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              aria-hidden="true"
            />
          </div>
          <div
            className="px-4 sm:px-6 py-1.5 flex items-center justify-between text-[11px] text-white/40"
            role="progressbar"
            aria-valuenow={currentQuestionIndex + 1}
            aria-valuemin={0}
            aria-valuemax={exam.questions.length}
            aria-label={`Progress: ${Math.round(progress)}% complete`}
            data-testid="text-progress-percentage"
          >
            <span>{answeredCount} of {exam.questions.length} answered</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════
          BODY: SIDEBAR + QUESTION
      ═══════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden" id="main-content">

        {/* ── LEFT SIDEBAR: Question Navigator ─── */}
        <AnimatePresence>
          {showNav && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden shrink-0"
              style={{ width: 220 }}
              role="navigation"
              aria-label="Question navigator"
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Navigator</h2>
              </div>

              {/* Question grid */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-4 gap-1.5" role="grid" aria-label="Question navigation grid">
                  {exam.questions.map((question, index) => {
                    const isAnswered = !!answers[question.id];
                    const isFlaggedQ = flaggedQuestions.has(question.id);
                    const isCurrent = index === currentQuestionIndex;
                    return (
                      <motion.button
                        key={question.id}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => goToQuestion(index)}
                        aria-label={`Question ${index + 1}${isCurrent ? ', current' : ''}${isFlaggedQ ? ', flagged' : ''}${isAnswered ? ', answered' : ', not answered'}`}
                        aria-current={isCurrent ? 'true' : undefined}
                        data-testid={`button-question-nav-${index + 1}`}
                        className={`
                          relative h-9 w-full rounded-lg text-xs font-semibold transition-all duration-150
                          focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2
                          ${isCurrent
                            ? 'bg-primary text-white shadow-md shadow-primary/30'
                            : isFlaggedQ
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
                            : isAnswered
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        {index + 1}
                        {isFlaggedQ && (
                          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-white dark:border-gray-900" aria-hidden="true" />
                        )}
                        {isAnswered && !isFlaggedQ && !isCurrent && (
                          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-900" aria-hidden="true" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-6 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Legend</p>
                  {[
                    { color: 'bg-primary', label: 'Current' },
                    { color: 'bg-emerald-500', label: 'Answered' },
                    { color: 'bg-amber-500', label: 'Flagged' },
                    { color: 'bg-gray-200 dark:bg-gray-700', label: 'Unanswered' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${l.color}`} aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">{l.label}</span>
                    </div>
                  ))}
                </div>

                {/* Quick stats */}
                <div className="mt-6 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{answeredCount}</div>
                      <div className="text-[10px] text-muted-foreground">Answered</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-400 tabular-nums">{unansweredCount}</div>
                      <div className="text-[10px] text-muted-foreground">Remaining</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar submit */}
              <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                <Button
                  onClick={() => dispatchExamAction('stageSubmit', 'button')}
                  className="w-full gap-2 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={submitExamMutation.isPending}
                  data-testid="button-submit-exam"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {submitExamMutation.isPending ? 'Submitting…' : 'Submit Exam'}
                </Button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── MAIN QUESTION AREA ──────────────── */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto"
          aria-label="Question area"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 pb-32">

            {/* Question header: number + flag badge */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-primary text-white text-sm font-bold shadow-sm shadow-primary/30" aria-hidden="true">
                  {currentQuestionIndex + 1}
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Question</p>
                  <p className="text-sm font-semibold text-foreground">
                    {currentQuestionIndex + 1} <span className="text-muted-foreground font-normal">of {exam.questions.length}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFlagged && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                  >
                    <Flag className="h-3 w-3" aria-hidden="true" />
                    Flagged for review
                  </motion.span>
                )}
                {answers[currentQuestion.id] && !isFlagged && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                  >
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Answered
                  </motion.span>
                )}
              </div>
            </div>

            {/* Animated question container */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentQuestion.id}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ x: d * 48, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit:  (d: number) => ({ x: d * -48, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden"
              >
                <QuestionRenderer
                  question={currentQuestion}
                  questionNumber={currentQuestionIndex + 1}
                  totalQuestions={exam.questions.length}
                  answer={answers[currentQuestion.id] || ''}
                  onAnswerChange={handleAnswerChange}
                  onNext={currentQuestionIndex < exam.questions.length - 1 ? () => dispatchExamAction('nextQuestion', 'button') : undefined}
                  onPrevious={currentQuestionIndex > 0 ? () => dispatchExamAction('previousQuestion', 'button') : undefined}
                  onFlag={() => dispatchExamAction('flagQuestion', 'button')}
                  attemptId={examAttemptId ?? undefined}
                  onCodeVoiceActionsReady={registerCodeVoiceActions}
                  isFirst={currentQuestionIndex === 0}
                  isLast={currentQuestionIndex === exam.questions.length - 1}
                  isFlagged={isFlagged}
                />
              </motion.div>
            </AnimatePresence>

            {/* Action feedback toast */}
            <AnimatePresence>
              {lastAction && (
                <motion.div
                  key={lastAction + Date.now()}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-foreground/5 border border-foreground/8 text-xs text-muted-foreground w-fit"
                  aria-live="polite"
                >
                  <Zap className="h-3 w-3 text-primary" aria-hidden="true" />
                  {lastAction}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════
          STICKY BOTTOM NAV BAR
      ═══════════════════════════════════════ */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg"
        role="contentinfo"
        aria-label="Exam navigation controls"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-3">

          {/* Previous */}
          <Button
            variant="outline"
            className="flex-1 sm:flex-none sm:min-w-[160px] h-12 gap-2 font-semibold text-sm border-2 hover:border-primary/50 hover:bg-primary/5 transition-all"
            onClick={() => dispatchExamAction('previousQuestion', 'button')}
            disabled={currentQuestionIndex === 0}
            aria-label="Previous question (Alt+P)"
            data-testid="button-prev-question"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            <span>Previous</span>
          </Button>

          {/* Center: Flag + accessibility actions */}
          <div className="flex items-center gap-2 flex-1 justify-center">
            <Button
              variant={isFlagged ? 'default' : 'outline'}
              size="sm"
              className={`h-10 px-3 gap-1.5 text-xs font-medium transition-all ${isFlagged ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : 'border-2 hover:border-amber-400 hover:text-amber-600'}`}
              onClick={() => dispatchExamAction('flagQuestion', 'button')}
              aria-pressed={isFlagged}
              aria-label={`${isFlagged ? 'Unflag' : 'Flag'} question for review (Alt+F)`}
              data-testid="button-flag-question"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              {isFlagged ? 'Flagged' : 'Flag'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-10 px-3 gap-1.5 text-xs font-medium border-2 hover:border-primary/50"
              onClick={() => {
                const txt = `Question ${currentQuestionIndex + 1}: ${currentQuestion.text}`;
                speak(txt);
                setLastAction('Reading question aloud');
              }}
              aria-label="Read question aloud (Alt+R)"
              data-testid="button-read-question"
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
              Read
            </Button>

            {/* Mobile question count */}
            <div className="lg:hidden text-xs text-muted-foreground font-medium px-2">
              {currentQuestionIndex + 1}/{exam.questions.length}
            </div>
          </div>

          {/* Next / Submit */}
          {currentQuestionIndex < exam.questions.length - 1 ? (
            <Button
              className="flex-1 sm:flex-none sm:min-w-[160px] h-12 gap-2 font-semibold text-sm shadow-sm shadow-primary/20 transition-all"
              onClick={() => dispatchExamAction('nextQuestion', 'button')}
              aria-label="Next question (Alt+N)"
              data-testid="button-next-question"
            >
              <span>Next</span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              className="flex-1 sm:flex-none sm:min-w-[160px] h-12 gap-2 font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/30 transition-all"
              onClick={() => dispatchExamAction('stageSubmit', 'button')}
              disabled={submitExamMutation.isPending}
              aria-label="Submit exam"
              data-testid="button-submit-exam"
            >
              {submitExamMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Submitting…</>
                : <><Send className="h-4 w-4" aria-hidden="true" />Submit Exam</>}
            </Button>
          )}
        </div>

        {/* Mobile question navigator (compact dots) */}
        <div className="lg:hidden px-4 pb-2 flex items-center justify-center gap-1 overflow-x-auto" aria-hidden="true">
          {exam.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => goToQuestion(i)}
              className={`h-2.5 rounded-full transition-all duration-200 ${
                i === currentQuestionIndex ? 'w-6 bg-primary'
                : answers[q.id] ? 'w-2.5 bg-emerald-400'
                : flaggedQuestions.has(q.id) ? 'w-2.5 bg-amber-400'
                : 'w-2.5 bg-gray-200 dark:bg-gray-700'
              }`}
              aria-label={`Go to question ${i + 1}`}
            />
          ))}
        </div>
      </footer>

      {/* ═══════════════════════════════════════
          SUBMIT CONFIRMATION DIALOG
      ═══════════════════════════════════════ */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="max-w-md" aria-describedby="submit-dialog-desc">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <Send className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </div>
              <DialogTitle className="text-xl">Submit Your Exam?</DialogTitle>
            </div>
            <DialogDescription id="submit-dialog-desc" className="text-sm leading-relaxed">
              You are about to submit <strong>{exam.title}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 my-4">
            {[
              { label: 'Answered', value: answeredCount, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Unanswered', value: unansweredCount, color: unansweredCount > 0 ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20' : 'text-muted-foreground bg-muted' },
              { label: 'Flagged', value: flaggedQuestions.size, color: flaggedQuestions.size > 0 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'text-muted-foreground bg-muted' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                <div className="text-xs mt-0.5 opacity-80">{s.label}</div>
              </div>
            ))}
          </div>

          {unansweredCount > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                You have <strong>{unansweredCount}</strong> unanswered {unansweredCount === 1 ? 'question' : 'questions'}.
                You can go back to answer them before submitting.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSubmitDialog(false)}
              className="flex-1"
              data-testid="button-cancel-submit"
            >
              Continue Exam
            </Button>
            <Button
              onClick={() => dispatchExamAction('confirmSubmit', 'button')}
              disabled={submitExamMutation.isPending}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
              data-testid="button-confirm-submit"
            >
              {submitExamMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
                : <><Send className="h-4 w-4" />Confirm Submit</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════
          HELP DIALOG
      ═══════════════════════════════════════ */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="help-dialog-desc">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <DialogTitle>Exam Help & Shortcuts</DialogTitle>
            </div>
            <DialogDescription id="help-dialog-desc" className="text-sm">
              Spoken commands and keyboard shortcuts for navigating and completing your exam.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="voice" className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="voice" className="flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Voice Commands
              </TabsTrigger>
              <TabsTrigger value="keyboard" className="flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                Keyboard Shortcuts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="voice" className="space-y-4 pt-3">
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                <strong className="text-foreground">Tip:</strong> Press <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono font-semibold">Ctrl + Shift + Space</kbd> to toggle OPSIS Assist voice listener, or speak naturally if continuous assist is on.
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Question Navigation</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"next question"</span> or <span className="font-semibold text-primary">"next"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Move to the next question</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"previous question"</span> or <span className="font-semibold text-primary">"previous"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Move to previous question</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Answering & Options</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"select option [A/B/C/D]"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Or say "choose A", "option B"</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"read options"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Reads all choices aloud</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"read option [A/B/C/D]"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Reads a single choice aloud</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"read my answer"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Hear currently selected answer</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"clear answer"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Unselects your answer</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"submit answer"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Saves answer and goes next</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Reading & Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"read question"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Reads question statement</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"read timer"</span> / <span className="font-semibold text-primary">"time remaining"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Reads time left</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"flag question"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Marks question for review</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"repeat"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Re-reads the last announcement</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Coding & Submission</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"run tests"</span> / <span className="font-semibold text-primary">"run code"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Executes coding question tests</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"read test results"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Announces passed test count</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"submit exam"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Opens submission confirmation</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"confirm submit"</span> or <span className="font-semibold text-primary">"yes"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Confirms final submission</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Speech Rate & Control</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"speak faster"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Speed up speech</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"speak slower"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Slow down speech</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50 border border-border/60">
                      <span className="font-semibold text-primary">"cancel"</span> / <span className="font-semibold text-primary">"stop"</span>
                      <p className="text-xs text-muted-foreground mt-0.5">Stop speaking</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="keyboard" className="pt-3">
              <div className="space-y-2 my-2">
                {[
                  { keys: ['Alt', 'N'], label: 'Next question' },
                  { keys: ['Alt', 'P'], label: 'Previous question' },
                  { keys: ['Alt', 'F'], label: 'Flag/unflag question' },
                  { keys: ['Alt', 'R'], label: 'Read question aloud' },
                  { keys: ['Alt', 'H'], label: 'Open this help dialog' },
                  { keys: ['Ctrl', 'M'], label: 'Toggle voice input (short answer)' },
                  { keys: ['Ctrl', 'Shift', 'Space'], label: 'Start or stop a voice command' },
                  { keys: ['Tab'], label: 'Move to next element' },
                  { keys: ['Enter', 'Space'], label: 'Activate buttons & select answers' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm text-foreground">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          <kbd className="inline-flex items-center px-2 py-0.5 rounded bg-muted border border-border text-xs font-mono font-semibold">{k}</kbd>
                          {i < s.keys.length - 1 && <span className="text-muted-foreground text-xs">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 p-3 mt-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  Compatible with NVDA, JAWS, VoiceOver, and Orca screen readers.
                  All questions are read automatically when navigating.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button onClick={() => setShowHelpDialog(false)} className="w-full">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
