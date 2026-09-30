# OPSIS VisionExam 🎙️💻

OPSIS VisionExam is an accessible, full-stack online examination and programming assessment platform. Engineered specifically for visually impaired and blind students, OPSIS pairs a VS Code-like coding environment (powered by Monaco Editor) with continuous voice navigation, text-to-speech (TTS) narration, screen reader compatibility (NVDA, JAWS, VoiceOver, Orca), and international keyboard shortcuts conforming to WCAG 2.1 AA.

---

## Table of Contents
1. [Quick Start Tutorial](#quick-start-tutorial)
2. [How OPSIS Assist Voice Commands Work](#how-opsis-assist-voice-commands-work)
3. [Voice Commands Reference](#voice-commands-reference)
   - [Global Navigation & App Commands](#1-global-navigation--app-commands)
   - [Exam Question Navigation](#2-exam-question-navigation)
   - [Answering Questions](#3-answering-questions)
   - [Question Narration & Timer](#4-question-narration--timer)
   - [Coding Questions & Execution](#5-coding-questions--execution)
   - [Exam Submission Flow](#6-exam-submission-flow)
   - [Text-to-Speech (TTS) Speech Rate & Playback](#7-text-to-speech-tts-controls)
4. [Keyboard Shortcuts Reference](#keyboard-shortcuts-reference)
5. [Accessibility Features](#accessibility-features)
6. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## Quick Start Tutorial

### Prerequisites
- **Node.js**: v20 or higher
- **npm**: v9 or higher
- **Python**: 3.10+ (required for Python coding questions)
- **Browser**: Google Chrome, Microsoft Edge, or any Chromium browser (recommended for Web Speech Recognition API)

### 1. Installation
Clone the repository and install the dependencies:
```bash
cd VisionExam
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory (copied from `.env.example`):
```env
SESSION_SECRET=your-random-64-character-session-secret
PORT=5000
NODE_ENV=development
```

### 3. Run the Development Server
```bash
npm run dev
```
Open your browser and navigate to:
**[http://localhost:5000](http://localhost:5000)**

### 4. Taking an Exam (Step-by-Step)
1. **Log in or Register**:
   - Register a new account or log in with your credentials.
   - New student accounts will land on the **Student Dashboard**.
2. **Enable Voice Assistance**:
   - Toggle **OPSIS Assist** using the accessibility button in the bottom corner or press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd>.
   - Alternatively, say: *"enable voice commands"* or *"turn on voice commands"*.
3. **Start an Exam**:
   - Say *"start exam"* or click on an open exam from the dashboard.
4. **Answer Questions**:
   - Listen to the automatic question narration.
   - Multiple choice: Say *"select option B"* or *"choose option A"*.
   - Need to hear choices again? Say *"read options"*.
   - Advance to the next question: Say *"next question"* or *"next"*.
5. **Coding Questions**:
   - Write your solution in the accessible code editor.
   - Say *"run tests"* or *"run code"* (or press <kbd>F5</kbd>) to execute against automated test cases.
   - Say *"read test results"* to hear test pass/fail counts.
6. **Submit Your Exam**:
   - Say *"submit exam"*.
   - When prompted for confirmation, say *"confirm submit"* or *"yes"*.

---

## How OPSIS Assist Voice Commands Work

OPSIS features a real-time voice command parser and speech engine:
- **Continuous vs. Push-to-Talk**: With OPSIS Assist active, the microphone continuously listens for commands. You can also trigger push-to-talk using <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd>.
- **Contextual Scopes**: Commands are scoped based on the active screen:
  - `global`: Always available (Dashboard, Settings, Profile, or during an exam).
  - `question`: Active during examination questions.
  - `editor`: Active when working on a coding question.
  - `results`: Active on the score and results page.
- **Natural Language Matching**: Common phrases and synonyms are recognized automatically without needing to speak robotic commands.
- **Safety First for Destructive Actions**: Submitting an exam requires a two-step confirmation (*"submit exam"* followed by *"yes"* or *"confirm submit"*).

---

## Voice Commands Reference

### 1. Global Navigation & App Commands
*Available across the entire application (Dashboard, Profile, Settings, and Exams).*

| Command Intent | Exact Spoken Phrases You Can Say | What It Does |
| :--- | :--- | :--- |
| **Help** | `"help"`, `"what can i say"`, `"voice commands"`, `"give me help"`, `"help me"`, `"commands"`, `"show commands"`, `"list commands"`, `"available commands"` | Spoken list of all available voice commands for the current screen. |
| **Dashboard** | `"go home"`, `"take me home"`, `"open dashboard"`, `"go to dashboard"`, `"dashboard"`, `"home"` | Navigates to the main Dashboard screen. |
| **Start Exam** | `"start exam"`, `"open examination"`, `"open exam"`, `"begin exam"`, `"take exam"` | Opens and starts your assigned examination. |
| **Settings** | `"open settings"`, `"go to settings"`, `"settings"` | Opens accessibility and application preferences. |
| **Profile** | `"open profile"`, `"go to profile"`, `"profile"` | Opens your user profile. |
| **Accessibility Profile** | `"open accessibility profile"`, `"go to accessibility profile"`, `"accessibility profile"`, `"accessibility settings"` | Opens the accessibility customization panel. |
| **Go Back** | `"go back"` | Returns to the previous page (or previous question during an exam). |
| **Enable Voice** | `"enable voice commands"`, `"turn on voice commands"` | Activates continuous speech listening. |
| **Disable Voice** | `"disable voice commands"`, `"turn off voice commands"` | Turns off continuous voice listening. |

---

### 2. Exam Question Navigation
*Available during an exam.*

| Command Intent | Exact Spoken Phrases You Can Say | What It Does |
| :--- | :--- | :--- |
| **Next Question** | `"next"`, `"next question"`, `"go to next question"`, `"go next"`, `"skip ahead"`, `"next one"`, `"move to next question"`, `"go forward"`, `"continue"` | Navigates forward to the next exam question. |
| **Previous Question**| `"previous"`, `"previous question"`, `"go back"`, `"go to previous question"`, `"previous one"`, `"move to previous question"`, `"go back question"` | Navigates backward to the previous exam question. |
| **Flag Question** | `"flag question"`, `"flag this question"`, `"mark question for review"`, `"flag"`, `"mark question"`, `"unflag question"` | Marks/unmarks the current question for later review. |

---

### 3. Answering Questions
*Supported for Multiple Choice, True/False, and Short Answer questions.*

| Command Intent | Spoken Phrases / Pattern | What It Does |
| :--- | :--- | :--- |
| **Select Option** | `"select option A"`, `"select option B"`, `"choose option C"`, `"pick option D"`, `"option A"`, `"choose 1"`, `"answer true"`, `"answer false"` | Selects the corresponding answer choice. |
| **Clear Answer** | `"clear answer"`, `"clear my answer"`, `"remove answer"`, `"clear option"`, `"reset answer"` | Deselects the current answer choice. |
| **Check My Answer** | `"read my answer"`, `"read selected answer"`, `"what did i select"`, `"what is my answer"`, `"check my answer"` | Reads aloud the choice you currently have selected. |
| **Save and Advance** | `"submit answer"`, `"save answer"`, `"confirm answer"`, `"save and next"`, `"save and continue"` | Confirms current selection and automatically moves to the next question. |

---

### 4. Question Narration & Timer
*Listen to instructions, questions, and monitor your remaining exam time.*

| Command Intent | Exact Spoken Phrases You Can Say | What It Does |
| :--- | :--- | :--- |
| **Read Question** | `"read question"`, `"read this question"`, `"what is the question"`, `"read the question"`, `"read current question"`, `"what is this question"` | Reads the question text aloud using Text-to-Speech. |
| **Read All Options** | `"read the options"`, `"read options"`, `"what are the options"`, `"read all options"`, `"read choices"`, `"what are the choices"`, `"read the choices"` | Reads all answer choices (A, B, C, D...) aloud. |
| **Read Single Option**| `"read option A"`, `"read option B"`, `"read option 1"`, `"check option C"` | Reads a specific choice aloud without selecting it. |
| **Read Timer** | `"read timer"`, `"time remaining"`, `"how much time is left"`, `"check time"`, `"check timer"`, `"remaining time"`, `"how much time"`, `"what is the time"` | Reads remaining time in minutes and seconds. |
| **Repeat Announcement**| `"repeat"`, `"say that again"`, `"repeat that"`, `"repeat again"` | Repeats the last spoken announcement or question. |

---

### 5. Coding Questions & Execution
*Available for questions containing Monaco Code Editor (JavaScript, TypeScript, Python).*

| Command Intent | Exact Spoken Phrases You Can Say | What It Does |
| :--- | :--- | :--- |
| **Run Tests** | `"run tests"`, `"run the tests"`, `"execute tests"`, `"run code"`, `"test code"` | Executes your code against automated test cases in a secure sandbox. |
| **Read Test Results** | `"read test results"`, `"read the test results"`, `"what were the test results"`, `"test results"` | Announces how many tests passed, failed, or timed out. |

---

### 6. Exam Submission Flow
*Guarded with two-step voice confirmation to avoid accidental submissions.*

| Step | Exact Spoken Phrases | Action |
| :--- | :--- | :--- |
| **1. Request Submit** | `"submit exam"`, `"finish exam"`, `"end exam"`, `"complete exam"`, `"finish the exam"`, `"submit the exam"` | Opens the exam submission modal and reviews answered/unanswered counts. |
| **2. Confirm Submit** | `"confirm submit"`, `"confirm submission"`, `"yes submit"`, `"yes"` | Finalizes and submits your exam attempt. |
| **Cancel Submission** | `"cancel"`, `"no"`, `"stop"` | Closes the submission prompt and returns to your exam. |

---

### 7. Text-to-Speech (TTS) Controls
*Control the narrator's speed and playback anytime.*

| Command Intent | Spoken Phrases | Action |
| :--- | :--- | :--- |
| **Pause Speech** | `"pause speech"`, `"pause speaking"`, `"pause"` | Temporarily pauses speech narration. |
| **Resume Speech** | `"resume speech"`, `"resume speaking"`, `"resume"`, `"continue speaking"` | Resumes paused speech narration. |
| **Increase Speed** | `"speak faster"`, `"speech faster"`, `"increase speech rate"`, `"talk faster"`, `"faster"` | Speeds up the voice narrator. |
| **Decrease Speed** | `"speak slower"`, `"speech slower"`, `"decrease speech rate"`, `"talk slower"`, `"slower"` | Slows down the voice narrator. |
| **Stop Narration** | `"cancel"`, `"stop"`, `"be quiet"`, `"stop talking"`, `"silence"` | Immediately silences the voice narrator. |

---

## Keyboard Shortcuts Reference

OPSIS provides full keyboard accessibility conforming to international blind user standards (**WCAG 2.1 AA**, **Section 508**, and **EN 301 549**).

### Exam Navigation Shortcuts
*(On macOS, use <kbd>Option</kbd> in place of <kbd>Alt</kbd>)*

| Shortcut | Description |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>N</kbd> | Next question |
| <kbd>Alt</kbd> + <kbd>P</kbd> | Previous question |
| <kbd>Alt</kbd> + <kbd>R</kbd> | Read question aloud |
| <kbd>Alt</kbd> + <kbd>F</kbd> | Flag or unflag current question |
| <kbd>Alt</kbd> + <kbd>H</kbd> | Open the Help & Voice Commands dialog |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> | Toggle OPSIS Assist voice listener |
| <kbd>Ctrl</kbd> + <kbd>M</kbd> | Toggle speech-to-text dictation (Short Answer questions) |
| <kbd>Alt</kbd> + <kbd>A</kbd> or <kbd>F11</kbd> | Open the Quick Accessibility panel |
| <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> | Move focus forward / backward |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Activate buttons and select options |
| <kbd>Escape</kbd> | Dismiss open dialogs or cancel actions |

### Code Editor Shortcuts (Monaco)
| Shortcut | Description |
| :--- | :--- |
| <kbd>F5</kbd> | Run code & execute tests |
| <kbd>F9</kbd> | Reset code editor to initial starter template |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save current code draft |
| <kbd>Alt</kbd> + <kbd>F1</kbd> | Monaco Accessibility Help |

---

## Accessibility Features

- **Text-to-Speech (TTS) Engine**: Integrated with Web Speech Synthesis API. Supports customizable rate, pitch, volume, and voice selection.
- **Reading Mask & Line Focus**: Adjustable horizontal focus band for cognitive and low-vision accessibility.
- **High Contrast Themes**: 7 high-contrast color schemes including High Contrast Dark, High Contrast Light, Yellow on Black, and Cyberpunk.
- **Adjustable Font Sizing**: Seamless text scaling up to 200% without breaking layouts.
- **Dyslexia-Friendly Fonts**: Integrated OpenDyslexic and clean sans-serif typography.
- **Live ARIA Announcements**: Live regions (`aria-live="polite"` and `aria-live="assertive"`) ensure screen readers stay synced with timers and question transitions.

---

## Troubleshooting & FAQs

### Q1: Why did I get `"Command not understood. Say help for available commands."`?
This response occurs when:
1. **Background noise or low confidence**: The microphone picked up speech that didn't match any registered commands. Say `"help"` to listen to the commands available in your current screen.
2. **Context mismatch**: Commands like `"select option A"` or `"run tests"` only work during an exam, not on the login or dashboard pages.
3. **Saying `"help"` now works anywhere**: Simply say `"help"` or `"what can I say"` at any time to hear valid commands for your screen.

### Q2: My browser is not recognizing speech or asking for microphone permission.
- Ensure you are using **Google Chrome** or **Microsoft Edge**.
- Check that microphone permissions are allowed for `http://localhost:5000` (click the lock/tune icon in the browser address bar).
- Verify that your microphone is properly selected in your operating system's sound settings.

### Q3: How do I test the voice commands without a microphone?
- You can run the built-in automated test suite:
  ```bash
  npm run test:voice
  ```
- All voice matching rules, option parsers, and command buses are validated with automated test cases.

### Q4: How do I run security and code runner tests?
- Run:
  ```bash
  npm run test:security
  ```
- Validates JavaScript VM isolation, TypeScript transpilation, and Python sandbox execution.

---

## License
MIT License. Built for universal educational accessibility.
