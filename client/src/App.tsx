import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccessibilityProvider, useAccessibility } from "@/components/AccessibilityProvider";
import type { Exam, ExamAttemptWithDetails } from "@shared/schema";
import { Navigation } from "@/components/Navigation";
import { InternationalKeyboardHelp } from "@/components/InternationalKeyboardHelp";
import { QuickAccessibilityPanel } from "@/components/QuickAccessibilityPanel";
import Dashboard from "@/pages/Dashboard";
import ExamTaking from "@/pages/ExamTaking";
import Results from "@/pages/Results";
import Settings from "@/pages/Settings";
import Help from "@/pages/Help";
import AccessibilityCenter from "@/pages/AccessibilityCenter";
import ExamManagement from "./pages/ExamManagement";
import GradeAnswers from "./pages/GradeAnswers";
import AdminPortal from "@/pages/AdminPortal";
import AnalyticsDashboard from "@/pages/AnalyticsDashboard";
import NotFound from "@/pages/not-found";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOPSISAssist } from "@/hooks/useOPSISAssist";
import { buildHelpMessage } from "@/voice/commandRegistry";

const loginSchema = z.object({
  username: z.string().min(1, "Roll number/Username is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Roll number/Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

interface User {
  id: string;
  username: string;
  role: string;
}

function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const { toast } = useToast();

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const response = await apiRequest('POST', '/api/auth/login', data);
      return response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.reload();
    },
    onError: () => {
      toast({
        title: "Login Failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const response = await apiRequest('POST', '/api/auth/register', data);
      return response.json();
    },
    onSuccess: (data) => {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.reload();
    },
    onError: () => {
      toast({
        title: "Registration Failed",
        description: "Username already exists or invalid data",
        variant: "destructive",
      });
    },
  });

  const onLoginSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const onRegisterSubmit = (data: RegisterForm) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — branding */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(221 83% 53%) 0%, hsl(199 89% 48%) 100%)' }}
        aria-hidden="true"
      >
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
              <path d="M8 19V10l6-3 6 3v9l-6 3-6-3Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
              <circle cx="14" cy="14" r="2.5" fill="white"/>
            </svg>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">OPSIS</span>
        </div>

        {/* Tagline */}
        <div className="relative">
          <h1 className="text-white text-3xl font-bold leading-tight tracking-tight mb-4">
            Accessible exams,<br />for every student.
          </h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-xs">
            Full keyboard navigation, screen reader support, and audio assistance built for WCAG 2.1 AA compliance.
          </p>

          {/* Feature list */}
          <ul className="mt-8 space-y-3">
            {[
              'NVDA, JAWS, VoiceOver compatible',
              'OPSIS Assist reading cursor',
              'Text-to-speech built in',
              'VS Code–like code editor',
            ].map(f => (
              <li key={f} className="flex items-center gap-2.5 text-white/80 text-sm">
                <svg className="h-4 w-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-white/40 text-xs">
          © {new Date().getFullYear()} OPSIS · WCAG 2.1 AA
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
                <path d="M8 19V10l6-3 6 3v9l-6 3-6-3Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                <circle cx="14" cy="14" r="2.5" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-lg text-foreground tracking-tight">OPSIS</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-muted-foreground text-sm mb-7">
            {isLogin ? 'Sign in to your account to continue.' : 'Get started with OPSIS today.'}
          </p>

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-muted p-1 mb-6" role="tablist" aria-label="Login or Register">
            <button
              role="tab"
              aria-selected={isLogin}
              className={`flex-1 py-1.5 px-4 text-sm font-medium rounded-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                isLogin
                  ? 'bg-white shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setIsLogin(true)}
              data-testid="button-login-tab"
            >
              Sign In
            </button>
            <button
              role="tab"
              aria-selected={!isLogin}
              className={`flex-1 py-1.5 px-4 text-sm font-medium rounded-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                !isLogin
                  ? 'bg-white shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setIsLogin(false)}
              data-testid="button-register-tab"
            >
              Register
            </button>
          </div>

          {isLogin ? (
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="login-username" className="text-sm font-medium text-foreground">
                  Username / Roll Number
                </Label>
                <Input
                  id="login-username"
                  {...loginForm.register('username')}
                  className="mt-1.5 h-10 text-sm"
                  placeholder="e.g. S001 or instructor"
                  data-testid="input-login-username"
                  autoComplete="username"
                />
                {loginForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-destructive">
                    {loginForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="login-password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  {...loginForm.register('password')}
                  className="mt-1.5 h-10 text-sm"
                  placeholder="Enter your password"
                  data-testid="input-login-password"
                  autoComplete="current-password"
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-destructive">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-10 font-semibold mt-2"
                disabled={loginMutation.isPending}
                data-testid="button-login-submit"
              >
                {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="register-username" className="text-sm font-medium text-foreground">
                  Username / Roll Number
                </Label>
                <Input
                  id="register-username"
                  {...registerForm.register('username')}
                  className="mt-1.5 h-10 text-sm"
                  placeholder="Choose a username"
                  data-testid="input-register-username"
                  autoComplete="username"
                />
                {registerForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-destructive">
                    {registerForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="register-password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <Input
                  id="register-password"
                  type="password"
                  {...registerForm.register('password')}
                  className="mt-1.5 h-10 text-sm"
                  placeholder="Min. 8 characters"
                  data-testid="input-register-password"
                  autoComplete="new-password"
                />
                {registerForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-destructive">
                    {registerForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-10 font-semibold mt-2"
                disabled={registerMutation.isPending}
                data-testid="button-register-submit"
              >
                {registerMutation.isPending ? 'Creating account…' : 'Create Account'}
              </Button>
            </form>
          )}

          {import.meta.env.DEV && (
            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                Demo — Student: <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">S001</code> · Instructor: <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">instructor</code> · Password: <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">password123</code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Router({ currentUser, onLogout }: { currentUser: User; onLogout: () => void }) {
  const isStaff = currentUser.role === 'instructor' || currentUser.role === 'admin';

  return (
    <Switch>
      <Route path="/" component={() =>
        isStaff
          ? <AdminPortal currentUser={currentUser} onLogout={onLogout} />
          : <Dashboard currentUser={currentUser} />
      } />
      <Route path="/admin" component={() =>
        isStaff
          ? <AdminPortal currentUser={currentUser} onLogout={onLogout} />
          : <Dashboard currentUser={currentUser} />
      } />
      <Route path="/exam/:id" component={() => <ExamTaking currentUser={currentUser} />} />
      <Route path="/results/:id" component={() => <Results currentUser={currentUser} />} />
      <Route path="/settings" component={() => <Settings currentUser={currentUser} />} />
      <Route path="/help" component={() => <Help currentUser={currentUser} />} />
      <Route path="/accessibility" component={() => <AccessibilityCenter currentUser={currentUser} />} />
      {isStaff && (
        <Route path="/exams" component={() => <ExamManagement currentUser={currentUser} />} />
      )}
      {isStaff && (
        <Route path="/grade" component={() => <GradeAnswers currentUser={currentUser} />} />
      )}
      {isStaff && (
        <Route path="/analytics" component={() => <AnalyticsDashboard currentUser={currentUser} />} />
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function AppAssistShortcuts({
  setOpen,
  currentUser,
}: {
  setOpen: Dispatch<SetStateAction<boolean>>;
  currentUser: { id: string; role: string };
}) {
  const [, setLocation] = useLocation();
  const {
    speak,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    updateSettings,
    settings,
    announceToScreenReader,
    assist,
  } = useAccessibility();

  const navigationCommandHandler = (command: import('@/voice/types').ParsedVoiceCommand): boolean | void => {
    switch (command.definition.id) {
      case 'help':
        speak(buildHelpMessage('global'), { priority: 'interrupt' });
        break;
      case 'repeat':
        speak('You are on the OPSIS portal. Say start exam to begin an exam, or say open settings to configure options.', { priority: 'interrupt' });
        break;
      case 'cancel':
        stopSpeaking();
        announceToScreenReader('Speech cancelled.');
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
      case 'navigateHome':
        setLocation('/');
        speak('Opening the dashboard.', { priority: 'interrupt' });
        break;
      case 'openProfile':
        setLocation('/accessibility');
        speak('Opening your profile.', { priority: 'interrupt' });
        break;
      case 'openAccessibilityProfile':
        setLocation('/accessibility');
        speak('Opening your accessibility profile.', { priority: 'interrupt' });
        break;
      case 'openSettings':
        setLocation('/settings');
        speak('Opening settings.', { priority: 'interrupt' });
        break;
      case 'goBack':
        window.history.back();
        speak('Going back.', { priority: 'interrupt' });
        break;
      case 'enableVoiceCommands':
        speak('Voice commands enabled.', { priority: 'interrupt' });
        assist.setAssistEnabled(true);
        break;
      case 'disableVoiceCommands':
        speak('Voice commands disabled.', { priority: 'interrupt' });
        assist.setAssistEnabled(false);
        break;
      case 'openExamination':
      case 'startExam': {
        void (async () => {
          try {
            const [exams, attempts] = await Promise.all([
              queryClient.fetchQuery<Exam[]>({ queryKey: ['/api/exams'] }),
              queryClient.fetchQuery<ExamAttemptWithDetails[]>({ queryKey: ['/api/attempts/user', currentUser.id] }),
            ]);
            // Mirrors Dashboard.tsx's upcomingExams filter: exams the student hasn't completed yet.
            const completedIds = new Set(attempts.filter(a => a.completedAt).map(a => a.examId));
            const available = exams.filter(exam => !completedIds.has(exam.id));
            if (available.length === 1) {
              setLocation(`/exam/${available[0].id}`);
              speak(`Starting ${available[0].title}.`, { priority: 'interrupt' });
            } else if (available.length === 0) {
              setLocation('/');
              speak('There are no open exams right now.', { priority: 'interrupt' });
            } else {
              setLocation('/');
              speak(`You have ${available.length} open exams: ${available.map(e => e.title).join(', ')}. Open the dashboard to choose one.`, { priority: 'interrupt' });
            }
          } catch {
            speak('I could not load your exams. Please open the dashboard.', { priority: 'interrupt' });
            setLocation('/');
          }
        })();
        break;
      }
      default:
        return false;
    }
  };

  useOPSISAssist('global', navigationCommandHandler, {
    accessibility: { key: 'a', altKey: true, action: () => setLocation('/accessibility') },
    accessibilityF11: { key: 'F11', action: () => setOpen(open => !open) },
    escape: { key: 'Escape', action: () => setOpen(false), allowInEditable: true },
  });
  return null;
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authorizationError, setAuthorizationError] = useState('');
  const [isQuickPanelOpen, setIsQuickPanelOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (active) setCurrentUser(data?.user ?? null);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    const handleUnauthorized = () => {
      localStorage.removeItem('user');
      setCurrentUser(null);
    };
    const handleForbidden = (event: Event) => {
      setAuthorizationError((event as CustomEvent<string>).detail || 'You do not have permission to perform that action.');
    };
    window.addEventListener('opsis:unauthorized', handleUnauthorized);
    window.addEventListener('opsis:forbidden', handleForbidden);
    return () => {
      active = false;
      window.removeEventListener('opsis:unauthorized', handleUnauthorized);
      window.removeEventListener('opsis:forbidden', handleForbidden);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch {
      // Clear client state even if the session has already expired.
    }
    localStorage.removeItem('user');
    localStorage.removeItem('opsis-accessibility-settings');
    setCurrentUser(null);
  };

  if (authLoading) {
    return <div className="min-h-screen grid place-items-center" role="status">Checking your session…</div>;
  }

  if (!currentUser) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AuthForm />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AccessibilityProvider userId={currentUser.id}>
          <AppAssistShortcuts setOpen={setIsQuickPanelOpen} currentUser={currentUser} />
          <div className="min-h-screen bg-background text-foreground">
            {/* Skip Links */}
            <div className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50">
              <a href="#main-content" className="bg-primary text-white px-4 py-2 rounded focus-visible:outline-2 focus-visible:outline-white">
                Skip to main content
              </a>
              <a href="#navigation" className="bg-primary text-white px-4 py-2 rounded ml-2 focus-visible:outline-2 focus-visible:outline-white">
                Skip to navigation
              </a>
            </div>

            <Navigation currentUser={currentUser} onLogout={handleLogout} />
            {authorizationError && (
              <div role="alert" className="mx-auto mt-4 flex max-w-4xl items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <span>{authorizationError}</span>
                <Button variant="ghost" size="sm" onClick={() => setAuthorizationError('')}>Dismiss</Button>
              </div>
            )}
            <Router currentUser={currentUser} onLogout={handleLogout} />
            <InternationalKeyboardHelp />
            
            {/* Floating Accessibility Button */}
            <div className="fixed bottom-5 right-5 z-[9999]">
              <Button
                onClick={() => setIsQuickPanelOpen(true)}
                className="h-12 w-12 rounded-full bg-primary hover:bg-primary/90 shadow-lg border border-primary/20 focus-visible:outline-2 focus-visible:outline-white transition-all duration-200 hover:scale-105 hover:shadow-xl"
                aria-label="Quick accessibility settings — Alt+A or F11"
                title="Quick Accessibility Settings (Alt+A or F11)"
                data-testid="button-quick-accessibility"
              >
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6M12 9v10M9 19h6"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 13l-2 2M17 13l2 2"/>
                </svg>
              </Button>
            </div>
            
            {/* Quick Accessibility Panel */}
            <QuickAccessibilityPanel 
              isOpen={isQuickPanelOpen}
              onClose={() => setIsQuickPanelOpen(false)}
            />

            {/* Footer */}
            <footer role="contentinfo" id="footer" className="border-t border-border mt-16 bg-card">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  {/* Brand */}
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                        <path d="M8 19V10l6-3 6 3v9l-6 3-6-3Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                        <circle cx="14" cy="14" r="2.5" fill="white"/>
                      </svg>
                    </div>
                    <span className="font-semibold text-sm text-foreground">OPSIS</span>
                    <span className="text-muted-foreground/50 text-xs">·</span>
                    <span className="text-xs text-muted-foreground">WCAG 2.1 AA</span>
                  </div>

                  {/* Keyboard shortcuts */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <span><kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border mr-1">Alt+A</kbd>Accessibility</span>
                    <span><kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border mr-1">Ctrl+Shift+Space</kbd>Assist</span>
                    <span><kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border mr-1">F5</kbd>Run code</span>
                    <span><kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border mr-1">Esc</kbd>Close</span>
                  </div>

                  {/* Copyright */}
                  <p className="text-xs text-muted-foreground">
                    © {new Date().getFullYear()} OPSIS
                  </p>
                </div>
              </div>
            </footer>
          </div>
          <Toaster />
        </AccessibilityProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
