import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { transform } from "esbuild";
import type { CodeExecutionResult, TestCase, TestResult } from "@shared/schema";

const execFileAsync = promisify(execFile);
const MAX_CODE_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 8 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;

function normalizeOutput(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value)?.trim() ?? String(value).trim();
}

function parseInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function findJavaScriptFunctionName(code: string): string | null {
  return code.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/)?.[1]
    ?? code.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/)?.[1]
    ?? null;
}

function findPythonFunctionName(code: string): string | null {
  return code.match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/m)?.[1] ?? null;
}

async function runJavaScriptTest(
  code: string,
  language: "javascript" | "typescript",
  testCase: TestCase,
  timeoutMs: number,
  memoryMb: number,
): Promise<TestResult> {
  const started = Date.now();
  const functionName = findJavaScriptFunctionName(code);
  if (!functionName) throw new Error("Define a named function for the solution");
  const runnableCode = language === "typescript"
    ? (await transform(code, { loader: "ts", target: "es2022" })).code
    : code;
  // Resolve to the real path: on macOS, os.tmpdir() lives under a symlink (/var -> /private/var),
  // and Node's --allow-fs-read permission check resolves symlinks internally, so granting the
  // symlinked path would deny access to the very script we just wrote. realpath is a no-op
  // wherever tmpdir() isn't a symlink (e.g. Linux), so this doesn't change behavior there.
  const directory = await realpath(await mkdtemp(join(tmpdir(), "opsis-js-")));
  const scriptPath = join(directory, "runner.mjs");
  const runner = `import vm from "node:vm";
const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
vm.runInContext(${JSON.stringify(`
  globalThis.__opsisInput = JSON.parse(${JSON.stringify(JSON.stringify(parseInput(testCase.input)))});
  globalThis.__opsisResult = undefined;
  globalThis.console = Object.freeze({ log() {} });
  delete globalThis.constructor;
  Object.setPrototypeOf(globalThis, null);
`)}, context);
const script = new vm.Script(${JSON.stringify(`${runnableCode}\n;__opsisResult = ${functionName}(__opsisInput);`)}, { filename: "submission.js" });
script.runInContext(context, { timeout: ${timeoutMs} });
console.log("__OPSIS_RESULT__" + JSON.stringify(context.__opsisResult));
`;
  await writeFile(scriptPath, runner, { mode: 0o600 });
  try {
    const heapMb = Math.min(Math.max(32, memoryMb), 256);
    let stdout: string;
    if (process.platform === "win32") {
      const res = await execFileAsync(process.execPath, [
        `--max-old-space-size=${heapMb}`,
        scriptPath,
      ], {
        cwd: directory,
        env: { PATH: process.env.PATH ?? "" },
        timeout: timeoutMs + 500,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      stdout = res.stdout;
    } else {
      const command = `ulimit -t ${Math.max(1, Math.ceil(timeoutMs / 1000))}; ulimit -v 1048576; ulimit -f 128; exec node --max-old-space-size=${heapMb} --experimental-permission --allow-fs-read="$1" "$1"`;
      const res = await execFileAsync("bash", ["-c", command, "opsis", scriptPath], {
        cwd: directory,
        env: { PATH: process.env.PATH ?? "" },
        timeout: timeoutMs + 500,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      stdout = res.stdout;
    }
    const resultLine = stdout.split(/\r?\n/).findLast(line => line.startsWith("__OPSIS_RESULT__"));
    if (!resultLine) throw new Error("The solution did not return a result");
    const encoded = resultLine.slice("__OPSIS_RESULT__".length);
    let parsed: unknown;
    try { parsed = JSON.parse(encoded); } catch { parsed = encoded; }
    const actualOutput = normalizeOutput(parsed);
    const expectedOutput = normalizeOutput(testCase.expectedOutput);
    return {
      testCaseId: testCase.id,
      passed: actualOutput === expectedOutput,
      actualOutput,
      expectedOutput,
      executionTime: Date.now() - started,
      isHidden: testCase.isHidden,
      error: actualOutput === expectedOutput ? undefined : "Output did not match",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runPythonTest(code: string, testCase: TestCase, timeoutMs: number, memoryMb: number): Promise<TestResult> {
  const started = Date.now();
  const functionName = findPythonFunctionName(code);
  if (!functionName) throw new Error("Define a named function for the solution");
  const directory = await mkdtemp(join(tmpdir(), "opsis-code-"));
  const scriptPath = join(directory, "submission.py");
  const harness = `import ast
import json

__opsis_code = ${JSON.stringify(code)}
__opsis_tree = ast.parse(__opsis_code, filename="submission.py", mode="exec")
for __opsis_node in ast.walk(__opsis_tree):
    if isinstance(__opsis_node, (ast.Import, ast.ImportFrom, ast.ClassDef, ast.Global, ast.Nonlocal)):
        raise PermissionError("Imports, classes, and global declarations are not allowed")
    if isinstance(__opsis_node, ast.Attribute) and __opsis_node.attr.startswith("__"):
        raise PermissionError("Dunder attribute access is not allowed")
    if isinstance(__opsis_node, ast.Name) and __opsis_node.id in {"open", "exec", "eval", "compile", "__import__", "globals", "locals", "vars", "getattr", "setattr", "delattr"}:
        raise PermissionError("Unsafe built-in access is not allowed")

__opsis_safe_names = {
    "abs", "all", "any", "bool", "dict", "enumerate", "Exception", "filter",
    "float", "int", "len", "list", "map", "max", "min", "pow", "print",
    "range", "reversed", "round", "set", "sorted", "str", "sum", "tuple",
    "ValueError", "zip"
}
__opsis_builtins = __builtins__ if isinstance(__builtins__, dict) else __builtins__.__dict__
__opsis_safe_builtins = {name: __opsis_builtins[name] for name in __opsis_safe_names}
__opsis_namespace = {"__builtins__": __opsis_safe_builtins}
exec(compile(__opsis_tree, "submission.py", "exec"), __opsis_namespace, __opsis_namespace)

__opsis_input = json.loads(${JSON.stringify(JSON.stringify(testCase.input))})
try:
    __opsis_input = json.loads(__opsis_input)
except Exception:
    pass
__opsis_result = __opsis_namespace[${JSON.stringify(functionName)}](__opsis_input)
print("__OPSIS_RESULT__" + json.dumps(__opsis_result, separators=(",", ":")))
`;
  await writeFile(scriptPath, harness, { mode: 0o600 });

  try {
    let stdout: string;
    if (process.platform === "win32") {
      const res = await execFileAsync("python", ["-B", "-I", "-S", scriptPath], {
        cwd: directory,
        env: { ...process.env },
        timeout: timeoutMs + 1000,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      stdout = res.stdout;
    } else {
      const command = `ulimit -t ${Math.max(1, Math.ceil(timeoutMs / 1000))}; ulimit -v ${Math.max(32768, memoryMb * 1024)}; ulimit -f 128; exec python3 -B -I -S "$1"`;
      const res = await execFileAsync("bash", ["-c", command, "opsis", scriptPath], {
        cwd: directory,
        env: { PATH: process.env.PATH ?? "" },
        timeout: timeoutMs + 1000,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      stdout = res.stdout;
    }
    const resultLine = stdout.split(/\r?\n/).findLast(line => line.startsWith("__OPSIS_RESULT__"));
    if (!resultLine) throw new Error("The solution did not return a result");
    const encoded = resultLine.slice("__OPSIS_RESULT__".length);
    let parsed: unknown;
    try { parsed = JSON.parse(encoded); } catch { parsed = encoded; }
    const actualOutput = normalizeOutput(parsed);
    const expectedOutput = normalizeOutput(testCase.expectedOutput);
    return {
      testCaseId: testCase.id,
      passed: actualOutput === expectedOutput,
      actualOutput,
      expectedOutput,
      executionTime: Date.now() - started,
      isHidden: testCase.isHidden,
      error: actualOutput === expectedOutput ? undefined : "Output did not match",
    };
  } finally {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {
      // Best-effort cleanup on Windows
    }
  }
}

export async function executeCode(
  code: string,
  language: string,
  testCases: TestCase[],
  timeLimitSeconds = 3,
  memoryLimitMb = 128,
): Promise<CodeExecutionResult> {
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) throw new Error("Code exceeds the 64 KB limit");
  if (!["javascript", "typescript", "python"].includes(language)) {
    throw new Error(`${language} execution is not supported`);
  }
  if (!testCases.length || testCases.some(testCase => Buffer.byteLength(testCase.input) > MAX_INPUT_BYTES)) {
    throw new Error("Invalid or oversized test cases");
  }

  const timeoutMs = Math.min(Math.max(timeLimitSeconds * 1000, 250), 5000);
  const started = Date.now();
  const results: TestResult[] = [];
  let topLevelError: string | undefined;
  let status: CodeExecutionResult["status"] = "failed";

  for (const testCase of testCases) {
    try {
      results.push(language === "python"
        ? await runPythonTest(code, testCase, timeoutMs, memoryLimitMb)
        : await runJavaScriptTest(code, language as "javascript" | "typescript", testCase, timeoutMs, memoryLimitMb));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      topLevelError = message;
      const timedOut = /timed out|Script execution timed out|SIGTERM/i.test(message);
      status = timedOut ? "timeout" : "error";
      results.push({
        testCaseId: testCase.id,
        passed: false,
        actualOutput: "",
        expectedOutput: testCase.expectedOutput,
        executionTime: timeoutMs,
        isHidden: testCase.isHidden,
        error: timedOut ? "Execution timed out" : message,
      });
      break;
    }
  }

  const passedTests = results.filter(result => result.passed).length;
  if (!topLevelError) status = passedTests === testCases.length ? "passed" : "failed";
  return {
    status,
    output: `${passedTests}/${testCases.length} tests passed`,
    error: topLevelError,
    testResults: results,
    executionTime: Date.now() - started,
    memoryUsed: 0,
    passedTests,
    totalTests: testCases.length,
  };
}