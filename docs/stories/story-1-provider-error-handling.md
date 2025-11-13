# Story 1: Provider Error Handling & Safe Execution - Brownfield Addition

**Epic**: Epic 1 - Enhanced Transcription Error Handling (P1)
**Story ID**: STORY-1
**Estimated Effort**: 3-5 hours
**Priority**: High (P1 - Foundation for retry logic and user messages)
**Dependencies**: P0 #2 (Pino structured logging from Sprint 1)
**Architecture Alignment**: **CREATES** error handling foundation (AppError, ErrorCode, basic USER_MESSAGES) that Architecture references as "P1 #17 standard"

---

## User Story

As a **WhatsApp bot stakeholder** (end users, system operators, and developers),
I want **all transcription providers to handle errors gracefully without crashing the bot process**,
So that **the bot remains reliable and operational even when transcription failures occur**.

---

## Story Context

### Existing System Integration:

- **Integrates with**: Transcription system (`src/handlers/transcription.ts`) and 4 provider implementations
- **Technology**: Node.js/TypeScript, FFmpeg, OpenAI API, custom Whisper API, Speech API, local Whisper CLI, Pino logger (P0 #2)
- **Follows pattern**:
  - Async provider functions returning `{ text: string; language: string }` or throwing `AppError` on failure
  - Architecture P1 #17 error handling with `AppError` + `ErrorCode` pattern
  - Pino structured logging from P0 #2 (replaces console.log)
- **Touch points**:
  - `src/handlers/transcription.ts` - `transcribeMedia()` orchestrates provider calls
  - `src/providers/whisper-local.ts` - Local Whisper via CLI (uses risky `execSync`)
  - `src/providers/whisper-api.ts` - Custom Whisper API
  - `src/providers/openai.ts` - OpenAI Whisper API
  - `src/providers/speech.ts` - Speech API
  - `src/handlers/message.ts` - Calls transcription on voice messages
  - `src/errors/error-codes.ts` - Application-wide error codes (P1 #17)
  - Pino logger instance - Structured logging with PII redaction (P0 #2)

---

## Acceptance Criteria

### Functional Requirements:

1. **Error handling foundation created (NEW - Architecture "P1 #17")**
   - Create `src/errors/error-codes.ts` with:
     - `AppError` class extending `Error` with `code`, `userMessage`, and `details` properties
     - `ErrorCode` enum with transcription-specific error codes
   - Create `src/errors/user-messages.ts` with:
     - `USER_MESSAGES` object mapping error codes to basic user-friendly messages
   - This becomes the standard that Architecture documents reference as "P1 #17 pattern"

2. **All transcription providers wrapped in try-catch blocks**
   - `whisper-local.ts`, `whisper-api.ts`, `openai.ts` (transcription function only), `speech.ts` all have comprehensive error handling
   - No uncaught exceptions escape provider functions

3. **Safe process execution replaces risky `execSync`**
   - `src/providers/whisper-local.ts` uses safe execution wrapper instead of `execSync`
   - Process failures (command not found, non-zero exit codes) are caught and handled
   - Temp file cleanup occurs even when process fails

4. **Error codes defined in new error system**
   - Transcription error codes in `ErrorCode` enum:
     - `TRANSCRIPTION_NETWORK` - Network timeouts, connection failures (retriable)
     - `TRANSCRIPTION_VALIDATION` - Invalid audio format, file too large (non-retriable)
     - `TRANSCRIPTION_PROVIDER` - API key invalid, provider-specific failures (retriable)
     - `TRANSCRIPTION_SYSTEM` - Out of memory, disk full, binary not found (retriable)
   - All providers throw `AppError` with appropriate error code

5. **Basic user messages defined**
   - Create basic USER_MESSAGES for each error code in `src/errors/user-messages.ts`
   - Simple, clear messages (Story 3 will enhance with suggested actions)
   - Example: `USER_MESSAGES[ErrorCode.TRANSCRIPTION_NETWORK] = "Network error during transcription"`

6. **Structured error handling from providers**
   - Providers throw `AppError` with error code, user message from USER_MESSAGES, and optional details
   - Error details include: provider name, original error (for debugging), operation context
   - Pattern: `throw new AppError(ErrorCode.TRANSCRIPTION_NETWORK, USER_MESSAGES[ErrorCode.TRANSCRIPTION_NETWORK], { provider, originalError })`

### Integration Requirements:

7. **Existing transcription functionality continues to work unchanged**
   - All 4 transcription modes (Local, OpenAI, WhisperAPI, SpeechAPI) work in happy path
   - Successful transcription returns same format: `{ text: string; language: string }`

8. **New functionality follows existing async/await pattern**
   - Provider functions remain async
   - Error handling doesn't break existing promise chains
   - `transcribeMedia()` in handler can still process provider responses

9. **Integration with message handler maintains current behavior**
   - Voice messages are still auto-detected and processed
   - Existing error message flow preserved (users still see error responses)
   - No changes to `src/handlers/message.ts` required in this story

### Quality Requirements:

10. **Change is covered by appropriate tests (>80% coverage per Architecture)**
    - Unit tests for AppError class and error code mapping
    - Unit tests for safe-exec utility (test process failures, cleanup)
    - Unit tests for each provider with error scenarios (network failure, invalid input)
    - Error categorization tests (ensure correct error types thrown)
    - Minimum 80% code coverage for new code per Architecture Testing Strategy

11. **Documentation is updated**
    - Add comments in `safe-exec.ts` explaining usage
    - Document error types and AppError pattern in `src/errors/error-codes.ts`
    - Update CLAUDE.md with error handling pattern

12. **No regression in existing functionality verified**
    - All 4 provider modes tested manually with real voice messages
    - Error messages still appear to users when transcription fails
    - No process crashes during error scenarios

---

## Technical Implementation

### Error Handling Foundation (NEW - Creates "P1 #17 Standard")

**File**: `src/errors/error-codes.ts` (NEW FILE - Creates foundation)

```typescript
/**
 * Application Error Codes
 *
 * This file defines the error handling foundation that Architecture references as "P1 #17 standard"
 */

export enum ErrorCode {
  // Transcription-specific codes (Epic 1 Story 1)
  TRANSCRIPTION_NETWORK = 'TRANSCRIPTION_NETWORK',         // Retriable in Story 2
  TRANSCRIPTION_VALIDATION = 'TRANSCRIPTION_VALIDATION',   // Non-retriable (fail fast)
  TRANSCRIPTION_PROVIDER = 'TRANSCRIPTION_PROVIDER',       // Retriable in Story 2
  TRANSCRIPTION_SYSTEM = 'TRANSCRIPTION_SYSTEM',           // Retriable in Story 2
}

/**
 * Custom Application Error with error code and user message
 *
 * This becomes the standard error class for structured error handling
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public userMessage: string,
    public details?: Record<string, any>
  ) {
    super(userMessage);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Usage in providers:
// throw new AppError(
//   ErrorCode.TRANSCRIPTION_NETWORK,
//   USER_MESSAGES[ErrorCode.TRANSCRIPTION_NETWORK],
//   { provider: 'whisper-local', originalError: error }
// );
```

---

### Basic User Messages (NEW - Creates catalog)

**File**: `src/errors/user-messages.ts` (NEW FILE)

```typescript
import { ErrorCode } from './error-codes';

/**
 * User-friendly error messages catalog
 *
 * Maps error codes to basic user messages
 * Story 3 will enhance these with suggested actions
 */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.TRANSCRIPTION_NETWORK]:
    "Network error during transcription",

  [ErrorCode.TRANSCRIPTION_VALIDATION]:
    "Audio format not supported",

  [ErrorCode.TRANSCRIPTION_PROVIDER]:
    "Transcription service unavailable",

  [ErrorCode.TRANSCRIPTION_SYSTEM]:
    "System error during transcription",
};
```

---

### Safe Execution Wrapper

**File**: `src/utils/safe-exec.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SafeExecResult {
  success: boolean;
  output?: string;
  error?: Error;
  exitCode?: number;
}

/**
 * Safe wrapper for executing shell commands with error handling
 *
 * @param command - The command to execute
 * @param options - Optional exec options (timeout, cwd, etc.)
 * @returns Promise<SafeExecResult> - Result object with success flag
 *
 * Usage:
 * const result = await safeExec('whisper audio.wav');
 * if (!result.success) {
 *   // Handle error
 * }
 */
export async function safeExec(
  command: string,
  options?: { timeout?: number; cwd?: string }
): Promise<SafeExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: options?.timeout || 30000, // 30s default timeout
      cwd: options?.cwd || process.cwd(),
    });

    return {
      success: true,
      output: stdout || stderr,
      exitCode: 0,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error,
      exitCode: error.code || -1,
    };
  }
}
```

---

### Provider Refactoring Pattern

**Example: `src/providers/whisper-local.ts` (After - Architecture Aligned)**

```typescript
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { safeExec } from "../utils/safe-exec";
import { AppError, ErrorCode } from "../errors/error-codes";
import { USER_MESSAGES } from "../errors/user-messages";
import { logger } from "../logging/logger"; // Pino logger from P0 #2

async function transcribeAudioLocal(
  audioBuffer: Buffer
): Promise<{ text: string; language: string }> {
  let audioPath: string | null = null;

  try {
    // Validate input
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_VALIDATION,
        USER_MESSAGES[ErrorCode.TRANSCRIPTION_VALIDATION],
        { provider: "whisper-local", reason: "empty_buffer" }
      );
    }

    // Write audio buffer to tempdir
    const tempdir = os.tmpdir();
    audioPath = path.join(tempdir, randomUUID() + ".wav");
    fs.writeFileSync(audioPath, audioBuffer);

    logger.debug({ audioPath, provider: "whisper-local" }, "Transcribing with local Whisper");

    // Transcribe audio using safe execution
    const result = await safeExec(`whisper ${audioPath}`);

    if (!result.success) {
      // Check if whisper binary not found
      if (result.error?.message?.includes("command not found") ||
          result.error?.message?.includes("not recognized")) {
        throw new AppError(
          ErrorCode.TRANSCRIPTION_SYSTEM,
          USER_MESSAGES[ErrorCode.TRANSCRIPTION_SYSTEM],
          {
            provider: "whisper-local",
            reason: "binary_not_found",
            originalError: result.error
          }
        );
      }

      // Generic system error
      throw new AppError(
        ErrorCode.TRANSCRIPTION_SYSTEM,
        USER_MESSAGES[ErrorCode.TRANSCRIPTION_SYSTEM],
        {
          provider: "whisper-local",
          reason: "process_failed",
          originalError: result.error
        }
      );
    }

    // Parse transcription output
    const text = parseTextAfterTimeFrame(result.output || "");
    const language = parseDetectedLanguage(result.output || "");

    if (!text) {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_VALIDATION,
        USER_MESSAGES[ErrorCode.TRANSCRIPTION_VALIDATION],
        { provider: "whisper-local", reason: "parse_failed" }
      );
    }

    logger.info({ text, language, provider: "whisper-local" }, "Transcription success");

    return {
      text: text.trim(),
      language: language || "unknown",
    };
  } catch (error) {
    // Log error with structured logging (Pino from P0 #2)
    if (error instanceof AppError) {
      logger.warn(
        { code: error.code, details: error.details, provider: "whisper-local" },
        error.userMessage
      );
      throw error; // Re-throw AppError as-is
    }

    // Wrap unknown errors
    logger.error({ error, provider: "whisper-local" }, "Unexpected error during transcription");
    throw new AppError(
      ErrorCode.TRANSCRIPTION_SYSTEM,
      USER_MESSAGES[ErrorCode.TRANSCRIPTION_SYSTEM],
      { provider: "whisper-local", originalError: error }
    );
  } finally {
    // Cleanup: Delete temp file and whisper artifacts
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
      } catch (cleanupError) {
        logger.warn({ audioPath, error: cleanupError }, "Could not delete temp file");
      }
    }

    // Delete whisper created tmp files
    const extensions = [".wav.srt", ".wav.txt", ".wav.vtt"];
    for (const extension of extensions) {
      try {
        fs.readdirSync(process.cwd()).forEach((file) => {
          if (file.endsWith(extension)) {
            fs.unlinkSync(path.join(process.cwd(), file));
          }
        });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }
}

function parseDetectedLanguage(text: string): string | null {
  const languageLine = text.split("\n")[1];
  const languageMatch = languageLine?.match(/Detected language:\s(.+)/);
  return languageMatch ? languageMatch[1].trim() : null;
}

function parseTextAfterTimeFrame(text: string): string | null {
  const textMatch = text.match(/\[(\d{2}:\d{2}\.\d{3})\s-->\s(\d{2}:\d{2}\.\d{3})\]\s(.+)/);
  return textMatch ? textMatch[3].trim() : null;
}

export { transcribeAudioLocal };
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/utils/safe-exec.test.ts`

```typescript
import { safeExec } from '../../../src/utils/safe-exec';

describe('safeExec', () => {
  test('should execute valid command successfully', async () => {
    const result = await safeExec('echo "test"');
    expect(result.success).toBe(true);
    expect(result.output).toContain('test');
    expect(result.exitCode).toBe(0);
  });

  test('should handle command not found error', async () => {
    const result = await safeExec('nonexistent_command_xyz');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should respect timeout', async () => {
    const result = await safeExec('sleep 10', { timeout: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('timeout');
  });
});
```

**File**: `tests/unit/providers/whisper-local.test.ts`

```typescript
import { transcribeAudioLocal } from '../../../src/providers/whisper-local';
import { AppError, ErrorCode } from '../../../src/errors/error-codes';

describe('transcribeAudioLocal - Error Handling (Architecture Aligned)', () => {
  test('should throw AppError with TRANSCRIPTION_VALIDATION for empty buffer', async () => {
    await expect(transcribeAudioLocal(Buffer.from([]))).rejects.toThrow(AppError);

    try {
      await transcribeAudioLocal(Buffer.from([]));
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.TRANSCRIPTION_VALIDATION);
    }
  });

  test('should throw AppError with TRANSCRIPTION_SYSTEM when whisper binary not found', async () => {
    // Mock safeExec to simulate command not found
    // ... test implementation
    // Expect error.code === ErrorCode.TRANSCRIPTION_SYSTEM
  });

  test('should cleanup temp files even on failure', async () => {
    // ... test temp file cleanup in finally block
  });
});
```

### Manual Testing Scenarios

1. **Happy Path (All Providers)**:
   - Send voice message via WhatsApp
   - Verify transcription succeeds for: Local, OpenAI, WhisperAPI, SpeechAPI

2. **Error Scenarios**:
   - **Invalid audio**: Send corrupted audio file → expect ValidationError
   - **Network failure**: Disconnect network during API call → expect NetworkError
   - **Missing binary**: Rename whisper binary → expect SystemError
   - **API key invalid**: Use wrong API key → expect ProviderError

3. **Regression Testing**:
   - Verify error messages still appear to users
   - Verify no process crashes during errors
   - Verify temp files are cleaned up

---

## Definition of Done

- ✅ **AC 1-4**: Functional requirements met (try-catch, safe exec, error categorization, structured errors)
- ✅ **AC 5-7**: Integration requirements verified (existing functionality works, patterns followed, handler unchanged)
- ✅ **AC 8**: Tests pass (safe-exec tests, provider error tests, error categorization tests)
- ✅ **AC 9**: Documentation updated (comments in safe-exec.ts, transcription-errors.ts, CLAUDE.md)
- ✅ **AC 10**: No regression verified (all 4 modes work, error messages appear, no crashes)
- ✅ **Manual testing completed**: All scenarios in "Manual Testing Scenarios" passed
- ✅ **Code review**: Changes reviewed for error handling completeness
- ✅ **Deployed to test environment**: Verified in non-production before release

---

## Risk Mitigation

**Primary Risk:** Changing error handling behavior could break existing error message flow or cause unexpected exceptions in the handler.

**Mitigation:**
- Keep handler (`transcribeMedia()`) unchanged in this story
- Providers still return null on catastrophic failure (catch categorized errors in handler)
- Add comprehensive error scenario tests before deployment
- Deploy to test environment first to verify error handling

**Rollback Plan:**
- Revert commits for safe-exec and provider changes
- Original provider code preserved in git history
- Feature can be disabled via environment variable: `TRANSCRIPTION_ERROR_HANDLING_ENABLED=false`

---

## Files to Create/Modify

### New Files (Creates "P1 #17 Standard"):
- `src/errors/error-codes.ts` - **NEW**: AppError class, ErrorCode enum, transcription error codes
- `src/errors/user-messages.ts` - **NEW**: USER_MESSAGES catalog with basic error messages
- `src/utils/safe-exec.ts` - Safe process execution wrapper
- `tests/unit/errors/error-codes.test.ts` - Tests for AppError class
- `tests/unit/errors/user-messages.test.ts` - Tests for USER_MESSAGES catalog
- `tests/unit/utils/safe-exec.test.ts` - Tests for safe-exec utility
- `tests/unit/providers/whisper-local.test.ts` - Provider error handling tests

### Modified Files:
- `src/providers/whisper-local.ts` - Replace execSync with safe-exec, add try-catch-finally, throw AppError
- `src/providers/whisper-api.ts` - Add try-catch, network error handling, throw AppError
- `src/providers/openai.ts` - Add try-catch to `transcribeOpenAI()`, throw AppError
- `src/providers/speech.ts` - Add try-catch, network error handling, throw AppError
- `src/handlers/transcription.ts` - Catch AppError and use logger.warn, message.reply with userMessage from catalog

---

## Dependencies

- **Blocks**: Story 2 (Retry Logic) - Retry logic depends on error categorization
- **Blocks**: Story 3 (User Messages) - User-friendly messages depend on error types
- **Required**: None - Can start immediately

---

## Notes for Developer

- **Critical**: Ensure temp file cleanup in `finally` block - files must be deleted even on errors
- **Performance**: Try-catch overhead is negligible (<1ms); safe-exec comparable to execSync
- **Testing**: Use network mocking libraries to simulate API failures
- **Pattern**: Follow existing async/await patterns in `openai.ts` provider
