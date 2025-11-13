# Epic 1: Enhanced Transcription Error Handling - Developer Quick Start Guide

**Epic:** Enhanced Transcription Error Handling (P1)
**Goal:** Add comprehensive error handling, retry logic, and user-friendly messages to transcription system
**Time Estimate:** 7-11 hours (1-2 days)
**Architecture:** Uses P1 #17 Error Handling Standards + P0 #2 Pino Logging

---

## 🚀 Quick Navigation

- [Before You Start](#before-you-start-5-minutes)
- [Story 1: Provider Error Handling (3-5 hours)](#story-1-provider-error-handling-3-5-hours)
- [Story 2: Retry Logic (2-3 hours)](#story-2-retry-logic-2-3-hours)
- [Story 3: User Messages (2-3 hours)](#story-3-user-messages-2-3-hours)
- [Quick Reference](#quick-reference)
- [Common Pitfalls](#common-pitfalls-to-avoid)

---

## Before You Start (5 minutes)

### ✅ Prerequisites Check

**CRITICAL:** Epic 1 depends on P0 #2 (Pino Logger). Verify it's implemented:

```bash
# 1. Check Pino logger exists
ls src/logger/index.ts
# Expected: File exists with Pino logger export

# 2. Verify error infrastructure exists
ls src/errors/error-codes.ts src/errors/user-messages.ts
# Expected: Both files exist from P1 #17

# 3. Test Pino logger works
node -e "const { logger } = require('./src/logger'); logger.info('test');"
# Expected: Logs JSON output with "test" message
```

**If any check fails:** Stop and implement P0 #2 first. Epic 1 cannot proceed without Pino logger.

---

### 📚 Key Concepts

**Architecture Pattern (P1 #17):**
```typescript
// ❌ OLD WAY (Don't do this):
class TranscriptionError extends Error { }
throw new TranscriptionError("Network error");

// ✅ NEW WAY (Architecture-aligned):
import { AppError, ErrorCode } from "../errors/error-codes";
throw new AppError(ErrorCode.TRANSCRIPTION_NETWORK, "Network error", { provider: "whisper-local" });
```

**Error Codes (Not Classes):**
```typescript
// ❌ OLD WAY:
if (error instanceof TranscriptionNetworkError)

// ✅ NEW WAY:
if (error instanceof AppError && error.code === ErrorCode.TRANSCRIPTION_NETWORK)
```

**Logging (Pino, Not Custom):**
```typescript
// ❌ OLD WAY:
console.log("Transcription error:", error);
cli.print("[Error] Network failure");

// ✅ NEW WAY:
import { logger } from "../logger";
logger.error({ provider, errorCode, duration }, "Transcription error");
```

---

### 🎯 What You'll Build

**Story 1:** Safe error handling in all providers (no crashes)
**Story 2:** Automatic retry with exponential backoff
**Story 3:** User-friendly error messages from centralized catalog

**End Result:** Users get helpful messages like:
- "Network error while transcribing. Retrying (2/3)..."
- "Audio format not supported. Please send voice notes in OGG format using WhatsApp's voice recorder."

Instead of:
- "I couldn't understand what you said." ❌

---

## Story 1: Provider Error Handling (3-5 hours)

### 🎯 Goal
Add error codes, wrap providers in try-catch, throw AppError instead of crashing

### Step 1: Add Error Codes (10 minutes)

**File:** `src/errors/error-codes.ts`

```typescript
// Find the existing ErrorCode enum and add these entries:

export enum ErrorCode {
  // ... existing codes ...

  // Transcription error codes (Epic 1 Story 1)
  TRANSCRIPTION_NETWORK = 'TRANSCRIPTION_NETWORK',
  TRANSCRIPTION_VALIDATION = 'TRANSCRIPTION_VALIDATION',
  TRANSCRIPTION_PROVIDER = 'TRANSCRIPTION_PROVIDER',
  TRANSCRIPTION_SYSTEM = 'TRANSCRIPTION_SYSTEM',
  // Note: TRANSCRIPTION_RATE_LIMIT added in Story 2
}
```

**Verify:**
```bash
grep "TRANSCRIPTION_NETWORK" src/errors/error-codes.ts
# Should output the line you just added
```

---

### Step 2: Create Safe Exec Utility (30 minutes)

**File:** `src/utils/safe-exec.ts` (NEW FILE)

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
 * Replaces risky execSync() with promise-based execution that won't crash the process
 */
export async function safeExec(
  command: string,
  options?: { timeout?: number; cwd?: string }
): Promise<SafeExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: options?.timeout || 30000, // 30s default
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

**Test:**
```bash
# Create test file
cat > tests/unit/utils/safe-exec.test.ts << 'EOF'
import { safeExec } from '../../../src/utils/safe-exec';

describe('safeExec', () => {
  test('should execute valid command successfully', async () => {
    const result = await safeExec('echo "test"');
    expect(result.success).toBe(true);
    expect(result.output).toContain('test');
  });

  test('should handle command not found error', async () => {
    const result = await safeExec('nonexistent_command_xyz');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
EOF

# Run test
npm test -- tests/unit/utils/safe-exec.test.ts
```

---

### Step 3: Refactor whisper-local.ts (1-2 hours)

**File:** `src/providers/whisper-local.ts`

**BEFORE (Example of what to change):**
```typescript
// ❌ OLD PATTERN (risky):
import { execSync } from 'child_process';
import * as cli from "../cli/ui";

async function transcribeAudioLocal(audioBuffer: Buffer) {
  // ... setup ...

  // RISKY: Can crash entire process
  const output = execSync(`whisper ${audioPath}`).toString();

  // Generic error handling
  if (!output) {
    cli.print("Error: No output");
    return null;
  }

  // ... rest ...
}
```

**AFTER (Architecture-aligned):**
```typescript
// ✅ NEW PATTERN:
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { safeExec } from "../utils/safe-exec";
import { AppError, ErrorCode } from "../errors/error-codes";
import { USER_MESSAGES } from "../errors/user-messages"; // Added in Story 3
import { logger } from "../logger"; // Pino from P0 #2

async function transcribeAudioLocal(
  audioBuffer: Buffer
): Promise<{ text: string; language: string }> {
  let audioPath: string | null = null;

  try {
    // 1. Validate input
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_VALIDATION,
        "Audio buffer is empty",
        { provider: "whisper-local", reason: "empty_buffer" }
      );
    }

    // 2. Write to temp file
    const tempdir = os.tmpdir();
    audioPath = path.join(tempdir, randomUUID() + ".wav");
    fs.writeFileSync(audioPath, audioBuffer);

    logger.debug({ audioPath, provider: "whisper-local" }, "Transcribing with local Whisper");

    // 3. Safe execution (won't crash process)
    const result = await safeExec(`whisper ${audioPath}`);

    if (!result.success) {
      // Check specific error types
      if (result.error?.message?.includes("command not found") ||
          result.error?.message?.includes("not recognized")) {
        throw new AppError(
          ErrorCode.TRANSCRIPTION_SYSTEM,
          "Whisper binary not found. Please install Whisper CLI.",
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
        `Whisper process failed: ${result.error?.message}`,
        {
          provider: "whisper-local",
          reason: "process_failed",
          originalError: result.error
        }
      );
    }

    // 4. Parse output
    const text = parseTextAfterTimeFrame(result.output || "");
    const language = parseDetectedLanguage(result.output || "");

    if (!text) {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_VALIDATION,
        "Could not parse transcription output",
        { provider: "whisper-local", reason: "parse_failed" }
      );
    }

    logger.info({ text, language, provider: "whisper-local" }, "Transcription success");

    return {
      text: text.trim(),
      language: language || "unknown",
    };

  } catch (error) {
    // Log error with Pino
    if (error instanceof AppError) {
      logger.warn(
        { code: error.code, details: error.details, provider: "whisper-local" },
        error.message
      );
      throw error; // Re-throw AppError as-is
    }

    // Wrap unknown errors
    logger.error({ error, provider: "whisper-local" }, "Unexpected error during transcription");
    throw new AppError(
      ErrorCode.TRANSCRIPTION_SYSTEM,
      "Unexpected error during transcription",
      { provider: "whisper-local", originalError: error }
    );

  } finally {
    // CRITICAL: Cleanup temp files even on error
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
      } catch (cleanupError) {
        logger.warn({ audioPath, error: cleanupError }, "Could not delete temp file");
      }
    }

    // Delete whisper artifacts
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

// Keep existing helper functions
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

**Key Changes:**
1. ✅ Import `AppError`, `ErrorCode`, `logger`
2. ✅ Replace `execSync` → `safeExec`
3. ✅ Throw `AppError` with specific error codes
4. ✅ Use Pino logger instead of `cli.print()`
5. ✅ Cleanup in `finally` block

---

### Step 4: Refactor Other Providers (1-2 hours)

Apply same pattern to:
- `src/providers/whisper-api.ts`
- `src/providers/openai.ts` (transcribeOpenAI function only)
- `src/providers/speech.ts`

**Pattern Template:**

```typescript
import { AppError, ErrorCode } from "../errors/error-codes";
import { logger } from "../logger";

async function transcribeXXX(audioBuffer: Buffer): Promise<{ text: string; language: string }> {
  try {
    // Validate input
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_VALIDATION,
        "Audio buffer is empty",
        { provider: "xxx" }
      );
    }

    // Make API call (wrap in try-catch if network operation)
    const response = await apiCall(audioBuffer);

    // Handle specific errors
    if (response.status === 429) {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_RATE_LIMIT, // Added in Story 2
        "Rate limit exceeded",
        { provider: "xxx" }
      );
    }

    // Parse and return
    return { text: response.text, language: response.language };

  } catch (error) {
    // Network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      throw new AppError(
        ErrorCode.TRANSCRIPTION_NETWORK,
        "Network error during transcription",
        { provider: "xxx", originalError: error }
      );
    }

    // Re-throw AppError
    if (error instanceof AppError) {
      logger.warn({ code: error.code, provider: "xxx" }, error.message);
      throw error;
    }

    // Wrap unknown errors
    logger.error({ error, provider: "xxx" }, "Unexpected error");
    throw new AppError(
      ErrorCode.TRANSCRIPTION_SYSTEM,
      "Unexpected error during transcription",
      { provider: "xxx", originalError: error }
    );
  }
}
```

---

### Step 5: Test Story 1 (30 minutes)

**Manual Testing:**

```bash
# 1. Test invalid audio format
# Send corrupted audio file via WhatsApp
# Expected: AppError with TRANSCRIPTION_VALIDATION thrown

# 2. Test network error
# Disconnect network, send voice message
# Expected: AppError with TRANSCRIPTION_NETWORK thrown

# 3. Test missing binary
# Rename whisper binary temporarily
# Expected: AppError with TRANSCRIPTION_SYSTEM thrown

# 4. Check logs
# Expected: Pino JSON logs with error codes, no console.log
tail -f logs/app.log
```

**Unit Tests:**

```bash
npm test -- tests/unit/providers/whisper-local.test.ts
# All tests should pass
```

---

## Story 2: Retry Logic (2-3 hours)

### 🎯 Goal
Add automatic retry with exponential backoff for transient errors

### Step 1: Add TRANSCRIPTION_RATE_LIMIT Code (5 minutes)

**File:** `src/errors/error-codes.ts`

```typescript
export enum ErrorCode {
  // ... existing codes ...
  TRANSCRIPTION_NETWORK = 'TRANSCRIPTION_NETWORK',
  TRANSCRIPTION_VALIDATION = 'TRANSCRIPTION_VALIDATION',
  TRANSCRIPTION_PROVIDER = 'TRANSCRIPTION_PROVIDER',
  TRANSCRIPTION_SYSTEM = 'TRANSCRIPTION_SYSTEM',

  // Story 2 addition:
  TRANSCRIPTION_RATE_LIMIT = 'TRANSCRIPTION_RATE_LIMIT',
}
```

---

### Step 2: Create Retry Utility (1 hour)

**File:** `src/utils/retry.ts` (NEW FILE)

```typescript
import { logger } from "../logger";
import { AppError, ErrorCode } from "../errors/error-codes";

export interface RetryOptions {
  maxRetries: number;
  backoffDelays: number[]; // e.g., [1000, 2000, 4000]
  rateLimitBackoffDelays: number[]; // e.g., [5000, 10000, 20000]
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

/**
 * Retry wrapper with exponential backoff for async operations
 *
 * Retry Policy:
 * - Retriable: TRANSCRIPTION_NETWORK, TRANSCRIPTION_PROVIDER, TRANSCRIPTION_SYSTEM, TRANSCRIPTION_RATE_LIMIT
 * - Non-retriable: TRANSCRIPTION_VALIDATION (fails fast)
 * - Rate limit errors use longer backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const result = await operation();

      if (attempt > 0) {
        logger.info({ attempt, maxRetries: options.maxRetries }, 'Operation succeeded after retry(s)');
      }

      return result;

    } catch (error) {
      lastError = error as Error;

      // Fail fast on validation errors (non-retriable)
      if (error instanceof AppError && error.code === ErrorCode.TRANSCRIPTION_VALIDATION) {
        logger.debug({ code: error.code }, 'Non-retriable error, failing fast');
        throw error;
      }

      // Check if retries exhausted
      if (attempt >= options.maxRetries) {
        logger.warn(
          { attempt, maxRetries: options.maxRetries, errorCode: error instanceof AppError ? error.code : 'unknown' },
          'Max retries exhausted'
        );
        throw error;
      }

      // Determine backoff delay based on error code
      const isRateLimit = error instanceof AppError && error.code === ErrorCode.TRANSCRIPTION_RATE_LIMIT;
      const delays = isRateLimit ? options.rateLimitBackoffDelays : options.backoffDelays;
      const baseDelay = delays[Math.min(attempt, delays.length - 1)];

      // Add jitter (±20%) to prevent thundering herd
      const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
      const delayWithJitter = Math.max(0, baseDelay + jitter);

      // Log retry attempt
      const errorCode = error instanceof AppError ? error.code : 'unknown';

      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries: options.maxRetries,
          errorCode,
          nextDelay: Math.round(delayWithJitter),
          isRateLimit
        },
        `Retry attempt ${attempt + 1}/${options.maxRetries}`
      );

      // Call onRetry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt + 1, error, delayWithJitter);
      }

      // Wait before retrying
      await sleep(delayWithJitter);
    }
  }

  throw lastError || new Error("Retry failed with unknown error");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

### Step 3: Add Retry Config (10 minutes)

**File:** `src/config.ts`

```typescript
// Add these exports to existing config.ts:

export const transcriptionRetryEnabled = process.env.TRANSCRIPTION_RETRY_ENABLED !== 'false';
export const transcriptionMaxRetries = parseInt(
  process.env.TRANSCRIPTION_MAX_RETRIES || '3',
  10
);
export const transcriptionBackoffDelays = (
  process.env.TRANSCRIPTION_BACKOFF_DELAYS || '1000,2000,4000'
)
  .split(',')
  .map((d) => parseInt(d.trim(), 10));

export const transcriptionRateLimitBackoffDelays = (
  process.env.TRANSCRIPTION_RATELIMIT_BACKOFF_DELAYS || '5000,10000,20000'
)
  .split(',')
  .map((d) => parseInt(d.trim(), 10));
```

**File:** `.env-example`

```bash
# Add these lines:

# Retry Configuration (Epic 1 Story 2)
TRANSCRIPTION_RETRY_ENABLED=true
TRANSCRIPTION_MAX_RETRIES=3
TRANSCRIPTION_BACKOFF_DELAYS=1000,2000,4000
TRANSCRIPTION_RATELIMIT_BACKOFF_DELAYS=5000,10000,20000
```

---

### Step 4: Integrate Retry in Handler (30 minutes)

**File:** `src/handlers/transcription.ts`

**BEFORE:**
```typescript
// ❌ OLD: Direct provider call (no retry)
const res = await providerFn(mediaBuffer);
```

**AFTER:**
```typescript
// ✅ NEW: Wrapped with retry logic

import { withRetry } from "../utils/retry";
import { AppError, ErrorCode } from "../errors/error-codes";
import { USER_MESSAGES } from "../errors/user-messages"; // Story 3

async function transcribeMedia(message: Message): Promise<string | null> {
  // ... existing setup ...

  let retryCount = 0;
  const startTime = Date.now();

  try {
    let res;

    if (config.transcriptionRetryEnabled) {
      res = await withRetry(
        () => providerFn(mediaBuffer),
        {
          maxRetries: config.transcriptionMaxRetries,
          backoffDelays: config.transcriptionBackoffDelays,
          rateLimitBackoffDelays: config.transcriptionRateLimitBackoffDelays,
          onRetry: (attempt, error, nextDelay) => {
            retryCount = attempt;

            // Send retry message to user
            const errorCode = error instanceof AppError ? error.code : 'unknown';
            message.reply(`Retrying transcription (${attempt}/${config.transcriptionMaxRetries})...`);

            // Log retry via Pino
            logger.warn(
              {
                operation: 'transcription',
                provider: providerName,
                errorCode,
                duration: (Date.now() - startTime) / 1000,
                retryCount: attempt,
              },
              `Retry attempt ${attempt}/${config.transcriptionMaxRetries}`
            );
          },
        }
      );
    } else {
      res = await providerFn(mediaBuffer);
    }

    const { text: transcribedText, language: transcribedLanguage } = res;

    // ... rest of success handling ...
    return transcribedText;

  } catch (error) {
    // Error handling in Story 3
    // For now, just throw
    throw error;
  }
}
```

---

### Step 5: Test Story 2 (30 minutes)

**Unit Tests:**

```bash
npm test -- tests/unit/utils/retry.test.ts
# Should pass all retry logic tests
```

**Manual Testing:**

```bash
# 1. Simulate network failure
# - Disconnect network
# - Send voice message
# - Expected: See "Retrying transcription (1/3)...", "Retrying (2/3)..."
# - Reconnect network
# - Expected: Transcription succeeds after retry

# 2. Check logs
# - Expected: Pino logs show retry attempts with error codes

# 3. Test validation error (no retry)
# - Send invalid audio
# - Expected: Fails immediately, no retry messages
```

---

## Story 3: User Messages (2-3 hours)

### 🎯 Goal
Add transcription messages to centralized catalog, use in handler

### Step 1: Add Messages to Catalog (15 minutes)

**File:** `src/errors/user-messages.ts`

```typescript
// Extend existing USER_MESSAGES object:

export const USER_MESSAGES = {
  // ... existing messages from P1 #17 ...
  [ErrorCode.FILE_TOO_LARGE]: "Your file is too large. Please send files under 20MB.",
  [ErrorCode.API_RATE_LIMIT]: "You're sending requests too quickly. Please wait 1 minute.",

  // Transcription error messages (Epic 1 Story 3):
  [ErrorCode.TRANSCRIPTION_NETWORK]:
    "Network error while transcribing. Retrying... If this persists, check your internet connection.",

  [ErrorCode.TRANSCRIPTION_RATE_LIMIT]:
    "Transcription service is busy. Please try again in 1 minute.",

  [ErrorCode.TRANSCRIPTION_VALIDATION]:
    "Audio format not supported. Please send voice notes in OGG format using WhatsApp's voice recorder.",

  [ErrorCode.TRANSCRIPTION_PROVIDER]:
    "Transcription service unavailable. Try switching providers with !config transcription mode.",

  [ErrorCode.TRANSCRIPTION_SYSTEM]:
    "System error during transcription. Please contact support if this persists.",
};
```

---

### Step 2: Update Handler Error Handling (1 hour)

**File:** `src/handlers/transcription.ts`

**Complete error handling section:**

```typescript
async function transcribeMedia(message: Message): Promise<string | null> {
  // ... existing setup and retry logic from Story 2 ...

  try {
    // ... transcription logic ...
    return transcribedText;

  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const errorCode = error instanceof AppError ? error.code : 'unknown';

    // Structured error logging via Pino
    logger.error(
      {
        operation: 'transcription',
        provider: providerName,
        errorCode,
        duration,
        retryCount,
        transcriptionMode,
        retryEnabled: config.transcriptionRetryEnabled,
      },
      error instanceof Error ? error.message : String(error)
    );

    // Send user-friendly error message using USER_MESSAGES catalog
    let userMessage: string;

    if (error instanceof AppError) {
      // Use centralized USER_MESSAGES catalog
      userMessage = USER_MESSAGES[error.code] || "Transcription failed. Please try again.";

      // Append retry info if retries were exhausted
      if (retryCount > 0) {
        userMessage += ` (Failed after ${retryCount} retry attempts)`;
      }
    } else {
      // Unknown error - generic message
      userMessage = "Transcription failed. Please try again.";
    }

    message.reply(userMessage);

    return null;
  }
}
```

---

### Step 3: Test Story 3 (1 hour)

**Manual Testing - All Error Scenarios:**

| Scenario | How to Test | Expected User Message |
|----------|-------------|----------------------|
| **Network Error** | Disconnect WiFi, send voice | "Network error while transcribing. Retrying... If this persists, check your internet connection." |
| **Invalid Audio** | Send corrupted file | "Audio format not supported. Please send voice notes in OGG format using WhatsApp's voice recorder." |
| **Rate Limit** | Send many requests rapidly | "Transcription service is busy. Please try again in 1 minute." |
| **Missing Binary** | Rename whisper binary | "System error during transcription. Please contact support if this persists." |
| **Invalid API Key** | Use wrong API key | "Transcription service unavailable. Try switching providers with !config transcription mode." |

**Verify Logging:**

```bash
# Check logs include all context
tail -f logs/app.log | grep transcription

# Expected JSON log format:
{
  "level": 50,
  "time": 1234567890,
  "operation": "transcription",
  "provider": "whisper-local",
  "errorCode": "TRANSCRIPTION_NETWORK",
  "duration": 2.5,
  "retryCount": 2,
  "msg": "Network error during transcription"
}
```

**Verify NO Custom Logging:**

```bash
# Should find ZERO instances:
grep -r "cli.print\|cli.logError\|console.log" src/handlers/transcription.ts src/utils/retry.ts src/providers/

# All logging should use Pino logger
```

---

## Quick Reference

### Error Code Decision Tree

```
Is the error retriable?
│
├─ YES → Network/Provider/System/RateLimit
│   │
│   ├─ Network issue? → TRANSCRIPTION_NETWORK
│   ├─ Rate limited? → TRANSCRIPTION_RATE_LIMIT
│   ├─ Provider down? → TRANSCRIPTION_PROVIDER
│   └─ System issue? → TRANSCRIPTION_SYSTEM
│
└─ NO → Validation error → TRANSCRIPTION_VALIDATION
```

---

### Code Patterns Cheat Sheet

**Throwing Errors:**
```typescript
// Pattern: throw new AppError(code, message, details)
throw new AppError(
  ErrorCode.TRANSCRIPTION_NETWORK,
  "Network timeout",
  { provider: "whisper-local", originalError: err }
);
```

**Catching Errors:**
```typescript
try {
  // operation
} catch (error) {
  if (error instanceof AppError) {
    logger.warn({ code: error.code }, error.message);
    throw error; // Re-throw
  }

  // Wrap unknown errors
  throw new AppError(
    ErrorCode.TRANSCRIPTION_SYSTEM,
    "Unexpected error",
    { originalError: error }
  );
}
```

**Checking Error Codes:**
```typescript
if (error instanceof AppError && error.code === ErrorCode.TRANSCRIPTION_VALIDATION) {
  // Fail fast - don't retry
}
```

**Logging with Pino:**
```typescript
// Pattern: logger.level({ context }, message)
logger.error({ provider, errorCode, duration }, "Transcription failed");
logger.warn({ attempt, maxRetries }, "Retrying...");
logger.info({ text, language }, "Success");
logger.debug({ config }, "Starting transcription");
```

---

### Import Checklist

Every file that throws errors or logs should have:

```typescript
import { AppError, ErrorCode } from "../errors/error-codes";
import { logger } from "../logger";

// Handler also needs:
import { USER_MESSAGES } from "../errors/user-messages";

// If using retry:
import { withRetry } from "../utils/retry";
```

---

### Testing Commands

```bash
# Run all Epic 1 tests
npm test -- tests/unit/utils/safe-exec.test.ts
npm test -- tests/unit/utils/retry.test.ts
npm test -- tests/unit/providers/

# Run integration tests
npm test -- tests/integration/handlers/transcription-retry.test.ts

# Check for anti-patterns
grep -r "class.*Error extends Error" src/
grep -r "console.log\|cli.print" src/providers/ src/handlers/transcription.ts
grep -r "throw new Error" src/providers/ src/handlers/transcription.ts

# Should all return zero results
```

---

## Common Pitfalls to Avoid

### ❌ Pitfall 1: Creating Custom Error Classes

**DON'T DO THIS:**
```typescript
class TranscriptionError extends Error { }
class TranscriptionNetworkError extends TranscriptionError { }
```

**DO THIS:**
```typescript
throw new AppError(ErrorCode.TRANSCRIPTION_NETWORK, message, details);
```

---

### ❌ Pitfall 2: Custom Error Message Functions

**DON'T DO THIS:**
```typescript
function getUserErrorMessage(error: TranscriptionError) {
  // Custom message logic
}
```

**DO THIS:**
```typescript
const userMessage = USER_MESSAGES[error.code];
```

---

### ❌ Pitfall 3: Custom Logging Code

**DON'T DO THIS:**
```typescript
import * as cli from "../cli/ui";
cli.print("[Error] Network failure");
cli.logError({ ... });
```

**DO THIS:**
```typescript
import { logger } from "../logger";
logger.error({ provider, errorCode }, "Network failure");
```

---

### ❌ Pitfall 4: Using instanceof for Error Types

**DON'T DO THIS:**
```typescript
if (error instanceof TranscriptionNetworkError)
```

**DO THIS:**
```typescript
if (error instanceof AppError && error.code === ErrorCode.TRANSCRIPTION_NETWORK)
```

---

### ❌ Pitfall 5: Forgetting Cleanup in Finally

**DON'T DO THIS:**
```typescript
try {
  const tempFile = createTempFile();
  await processFile(tempFile);
  deleteTempFile(tempFile); // ❌ Won't run if error thrown
}
```

**DO THIS:**
```typescript
let tempFile = null;
try {
  tempFile = createTempFile();
  await processFile(tempFile);
} finally {
  if (tempFile) deleteTempFile(tempFile); // ✅ Always runs
}
```

---

### ❌ Pitfall 6: Throwing Generic Errors

**DON'T DO THIS:**
```typescript
throw new Error("Network timeout");
```

**DO THIS:**
```typescript
throw new AppError(
  ErrorCode.TRANSCRIPTION_NETWORK,
  "Network timeout",
  { provider: "whisper-local" }
);
```

---

### ❌ Pitfall 7: Not Re-throwing AppError

**DON'T DO THIS:**
```typescript
catch (error) {
  logger.error(error);
  // ❌ Error lost, handler doesn't know what happened
}
```

**DO THIS:**
```typescript
catch (error) {
  if (error instanceof AppError) {
    logger.warn({ code: error.code }, error.message);
    throw error; // ✅ Re-throw so handler can use USER_MESSAGES
  }
}
```

---

## Verification Checklist (Quick)

Before considering Epic 1 complete, verify:

- [ ] No files in `src/types/transcription-errors.ts` or `src/utils/error-messages.ts`
- [ ] All error codes in `src/errors/error-codes.ts`
- [ ] All messages in `src/errors/user-messages.ts`
- [ ] All providers throw `AppError`
- [ ] All logging uses Pino `logger`
- [ ] No `console.log`, `cli.print`, or `cli.logError` in Epic 1 code
- [ ] Handler uses `USER_MESSAGES[error.code]`
- [ ] Retry logic checks `error.code`, not `instanceof`
- [ ] All tests pass
- [ ] Manual testing shows correct user messages

---

## Need Help?

**Architecture Questions:**
- Review `docs/architecture.md` section P1 #17 (Error Handling Standards)
- Review `docs/architecture.md` section P0 #2 (Pino Logging)

**Code Examples:**
- See refactored `whisper-local.ts` example above
- Check existing P1 #17 code for patterns

**Testing Issues:**
- See `docs/EPIC1-TESTING-CHECKLIST.md` section "Troubleshooting Guide"

**Common Errors:**
- "Cannot find module '../logger'" → P0 #2 not implemented, implement Pino first
- "USER_MESSAGES[code] undefined" → Error code not added to catalog
- Tests failing → Check that you're using `AppError`, not custom error classes

---

## Summary: The 3 Rules

1. **Use AppError + ErrorCode** (not custom error classes)
2. **Use USER_MESSAGES catalog** (not custom message functions)
3. **Use Pino logger** (not console.log or custom logging)

Follow these 3 rules and you'll be Architecture-aligned! 🎯

---

**Estimated Total Time:** 7-11 hours
**Difficulty:** Medium (requires understanding of Architecture patterns)
**Impact:** High (improves user experience and system reliability)

Good luck! 🚀
