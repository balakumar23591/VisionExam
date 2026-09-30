import { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import type { CodeEditorVoiceActions } from './CodeEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAccessibility } from './AccessibilityProvider';
import { Code, TestTube, Clock, MemoryStick, Target } from 'lucide-react';
import type { Question, ProgrammingLanguage, CodeExecutionResult, TestCase } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

interface CodingQuestionRendererProps {
  question: Question;
  currentAnswer: string;
  onAnswerChange: (answer: string) => void;
  questionNumber: number;
  totalQuestions: number;
  isReadOnly?: boolean;
  attemptId?: string;
  onVoiceActionsReady?: (actions: CodeEditorVoiceActions | null) => void;
}

export function CodingQuestionRenderer({
  question,
  currentAnswer,
  onAnswerChange,
  questionNumber,
  totalQuestions,
  isReadOnly = false,
  attemptId,
  onVoiceActionsReady,
}: CodingQuestionRendererProps) {
  const { announceToScreenReader } = useAccessibility();
  const [executionHistory, setExecutionHistory] = useState<CodeExecutionResult[]>([]);
  
  if (question.type !== 'coding' || !question.language) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <p className="text-red-600">Invalid coding question configuration.</p>
        </CardContent>
      </Card>
    );
  }

  const testCases: TestCase[] = (question.testCases as TestCase[]) || [];
  const language = question.language as ProgrammingLanguage;

  const handleCodeExecution = async (code: string, selectedLanguage: ProgrammingLanguage): Promise<CodeExecutionResult> => {
    try {
      announceToScreenReader('Submitting code for execution...');
      
      const payload: Record<string, unknown> = {
        questionId: question.id,
        code,
        language: selectedLanguage,
      };
      if (attemptId) payload.attemptId = attemptId;
      const response = await apiRequest('POST', '/api/code/execute', payload);
      
      const result = await response.json() as CodeExecutionResult;
      
      // Store execution history
      setExecutionHistory(prev => [...prev, result]);
      
      // Update answer with the latest code
      onAnswerChange(code);
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Code execution failed';
      announceToScreenReader(`Code execution error: ${errorMsg}`);
      
      return {
        status: 'error',
        output: '',
        error: errorMsg,
        testResults: [],
        executionTime: 0,
        memoryUsed: 0,
        passedTests: 0,
        totalTests: testCases.length
      };
    }
  };

  const getLanguageInfo = () => {
    const languageDisplayNames: Record<ProgrammingLanguage, string> = {
      javascript: 'JavaScript',
      python: 'Python',
      java: 'Java',
      cpp: 'C++',
      c: 'C',
      typescript: 'TypeScript',
      go: 'Go',
      rust: 'Rust'
    };
    
    return languageDisplayNames[language] || language.toUpperCase();
  };

  const getConstraintsDisplay = () => {
    const constraints = [];
    if (question.timeLimit) {
      constraints.push(`Time: ${question.timeLimit}s`);
    }
    if (question.memoryLimit) {
      constraints.push(`Memory: ${question.memoryLimit}MB`);
    }
    return constraints;
  };

  const lastExecution = executionHistory[executionHistory.length - 1];

  return (
    <div className="coding-question" data-testid={`coding-question-${question.id}`}>
      {/* Question Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center text-2xl">
              <Code className="h-6 w-6 mr-2" aria-hidden="true" />
              Question {questionNumber} of {totalQuestions}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center">
                <Target className="h-3 w-3 mr-1" />
                {question.points} {question.points === 1 ? 'point' : 'points'}
              </Badge>
              <Badge className="flex items-center">
                {getLanguageInfo()}
              </Badge>
            </div>
          </div>
          <CardDescription className="text-lg">
            Coding Problem - {getLanguageInfo()}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {/* Question Text */}
          <div className="prose dark:prose-invert max-w-none mb-6">
            <div className="whitespace-pre-wrap text-base leading-relaxed">{question.text}</div>
          </div>

          {/* Constraints */}
          {getConstraintsDisplay().length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                Constraints:
              </h4>
              <div className="flex gap-3">
                {question.timeLimit && (
                  <Badge variant="outline" className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {question.timeLimit}s timeout
                  </Badge>
                )}
                {question.memoryLimit && (
                  <Badge variant="outline" className="flex items-center">
                    <MemoryStick className="h-3 w-3 mr-1" />
                    {question.memoryLimit}MB memory
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Sample Test Cases (visible ones only) */}
          {testCases.filter(tc => !tc.isHidden).length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <TestTube className="h-4 w-4 mr-1" />
                Sample Test Cases:
              </h4>
              <div className="space-y-3">
                {testCases.filter(tc => !tc.isHidden).map((testCase, index) => (
                  <div key={testCase.id} className="bg-muted p-3 rounded-lg">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Input:</div>
                        <pre className="text-sm bg-background p-2 rounded border">{testCase.input}</pre>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Expected Output:</div>
                        <pre className="text-sm bg-background p-2 rounded border">{testCase.expectedOutput}</pre>
                      </div>
                    </div>
                    {testCase.description && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {testCase.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Summary */}
          {lastExecution && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Last Execution:</h4>
              <div className="flex items-center gap-3">
                <Badge variant={lastExecution.status === 'passed' ? 'default' : 'destructive'}>
                  {lastExecution.status.toUpperCase()}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {lastExecution.passedTests}/{lastExecution.totalTests} tests passed
                </span>
                <span className="text-sm text-muted-foreground">
                  {lastExecution.executionTime}ms
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Code Editor */}
      <CodeEditor
        language={language}
        initialCode={currentAnswer || question.starterCode || undefined}
        testCases={testCases}
        onCodeChange={onAnswerChange}
        onExecute={handleCodeExecution}
        readOnly={isReadOnly}
        questionId={question.id}
        className="mb-4"
        onVoiceActionsReady={onVoiceActionsReady}
      />

      {/* Instructions for Screen Readers */}
      <div className="sr-only">
        <p>
          This is a coding question worth {question.points} points. 
          Write your solution in the {getLanguageInfo()} editor above.
          Press F5 to run and test your code, or use the Run button.
          {testCases.length > 0 && ` There are ${testCases.length} test cases to validate your solution.`}
          {getConstraintsDisplay().length > 0 && ` Constraints: ${getConstraintsDisplay().join(', ')}.`}
        </p>
      </div>
    </div>
  );
}