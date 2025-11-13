# Story 2: Retry Logic with Exponential Backoff - Brownfield Addition

**Epic**: Epic 1 - Enhanced Transcription Error Handling (P1)
**Story ID**: STORY-2
**Estimated Effort**: 2-3 hours
**Priority**: High (P1 - Improves reliability for transient failures)
**Dependencies**:
- Story 1 (Provider Error Handling with AppError) must be completed first
- P0 #2 (Pino structured logging from Sprint 1)
- P0 #10 (Unified Config System from Sprint 2) - Uses new config structure
**Architecture Alignment**: Handler-level retry for synchronous API calls (OpenAI Whisper, Whisper API, Speech API). Excludes heavy operations that will use job queue retry when P0 #6 is implemented.

---

## User Story

As a **WhatsApp bot user and operator**,
I want **transcription to automatically retry on transient failures with intelligent backoff**,
So that **temporary issues (network glitches, rate limits, provider hiccups) don't prevent successful transcription**.

---

## Story Context

### Existing System Integration:

- **Integrates with**: Transcription handler (`src/handlers/transcription.ts`) and `AppError` error handling from Story 1
- **Technology**: Node.js/TypeScript async/await, `AppError` with error codes, Pino logger (P0 #2), unified config (P0 #10)
- **Follows pattern**:
  - Async provider functions wrapped with error handling throwing `AppError` (Story 1)
  - Error handling foundation from Story 1 (AppError, ErrorCode, USER_MESSAGES)
  - Handler-level retry for synchronous API calls ONLY
  - Unified config system from P0 #10 for configuration
- **Touch points**:
  - `src/handlers/transcription.ts` - `transcribeMedia()` orchestrates provider calls (will wrap with retry logic)
  - `src/errors/error-codes.ts` - Error codes from Story 1 (will add TRANSCRIPTION_RATE_LIMIT)
  - `src/config/schema.ts` - Unified config schema from P0 #10 (will add retry config)
  - All provider functions (already throw `AppError` from Story 1)
  - Pino logger - Structured logging for retry telemetry (P0 #2)

**Synchronous Operations Scope (Handler Retry Applies)**:
- ✅ OpenAI Whisper API (immediate API call, no FFmpeg)
- ✅ Whisper API (immediate API call)
- ✅ Speech API (immediate API call)
- ❌ Local Whisper CLI (CPU-intensive, will use job queue in future P0 #6)
- ❌ FFmpeg operations (I/O-intensive, will use job queue in future P0 #6)

**Dependencies**:
- **Requires Story 1 completed** - Needs `AppError` + error code system
- **Requires P0 #2 completed** - Needs Pino logger for telemetry
- **Requires P0 #10 completed** - Needs unified config system
- **Future P0 #6 integration** - When transcription moves to job queue, replace handler retry with job queue retry

---

## Acceptance Criteria

### Functional Requirements:

1. **Retry utility with exponential backoff created**
   - Create `src/utils/retry.ts` with retry wrapper function
   - Supports configurable max retries and backoff delays
   - Returns result or throws after all retries exhausted
   - Includes jitter to prevent thundering herd

2. **Dual backoff strategy implemented**
   - **Standard backoff** (network/provider/system errors): 1s, 2s, 4s
   - **Rate limit backoff** (rate limit errors): 5s, 10s, 20s
   - Backoff delays configurable via environment variables

3. **Retry policy: Retry all except validation errors**
   - **Retriable error codes**: `TRANSCRIPTION_NETWORK`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_SYSTEM`, `TRANSCRIPTION_RATE_LIMIT`
   - **Non-retriable error codes**: `TRANSCRIPTION_VALIDATION` (fail fast immediately)
   - Rate limit errors use longer backoff strategy
   - Policy aligns with Architecture P1 #17 error handling standards

4. **Rate limit error code added**
   - Add `TRANSCRIPTION_RATE_LIMIT` to `src/errors/error-codes.ts`
   - Providers throw `AppError` with `TRANSCRIPTION_RATE_LIMIT` on 429 status, quota exceeded messages
   - Treated as retriable with longer backoff delays

5. **Environment variable configuration**
   - `TRANSCRIPTION_RETRY_ENABLED` (boolean, default: true)
   - `TRANSCRIPTION_MAX_RETRIES` (number, default: 3)
   - `TRANSCRIPTION_BACKOFF_DELAYS` (comma-separated ms, default: "1000,2000,4000")
   - `TRANSCRIPTION_RATELIMIT_BACKOFF_DELAYS` (comma-separated ms, default: "5000,10000,20000")

6. **Retry telemetry and user visibility**
   - Use Pino logger (P0 #2) for each retry attempt with structured data: provider, error code, attempt number, next delay
   - Reply to user with retry progress: "Retrying transcription (2/3)..."
   - Log final outcome via Pino: success after N retries, or failure after exhausting retries
   - Ensure PII redaction (no audio content, phone numbers in logs)

### Integration Requirements:

7. **Provider calls wrapped with retry logic**
   - `transcribeMedia()` in handler wraps provider calls with retry wrapper
   - Retry wrapper catches categorized errors and applies retry policy
   - Original provider implementations unchanged (no modifications to provider files)

8. **Existing transcription functionality preserved**
   - Successful transcription (no retries needed) works identically to before
   - Error responses maintain backward compatibility
   - Users see retry progress without breaking existing message flow

9. **Performance guarantees**
   - **Total timeout**: Max 10 seconds for all retries combined (worst case: 3 retries with 4s backoff)
   - **Retry overhead**: Negligible when no retries needed (<5ms)
   - **Non-blocking**: Retries don't block other message processing

### Quality Requirements:

10. **Change is covered by tests**
    - Unit tests for retry utility (test backoff, max retries, error categorization)
    - Integration tests for transcription handler with retry (mock provider failures)
    - Test retry telemetry (verify logs and user messages)

11. **Documentation updated**
    - Add retry configuration to environment variable docs
    - Document retry behavior in CLAUDE.md
    - Add code comments explaining retry strategy

12. **No regression verified**
    - All 4 provider modes work in happy path (no retries)
    - Retry logic activates correctly on network failures (simulated)
    - ValidationError still fails fast (no retries)

---

## Technical Implementation

### Retry Utility

**File**: `src/utils/retry.ts` (Architecture Aligned)

```typescript
import { logger } from "../logging/logger"; // Pino logger from P0 #2
import { AppError, ErrorCode } from "../errors/error-codes";

export interface RetryOptions {
  maxRetries: number;
  backoffDelays: number[]; // e.g., [1000, 2000, 4000]
  rateLimitBackoffDelays: number[]; // e.g., [5000, 10000, 20000]
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

/**
 * Retry wrapper with exponential backoff for async operations (Architecture Aligned)
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Promise with operation result
 * @throws AppError after all retries exhausted
 *
 * Retry Policy (aligns with Architecture P1 #17):
 * - Retriable error codes: TRANSCRIPTION_NETWORK, TRANSCRIPTION_PROVIDER, TRANSCRIPTION_SYSTEM, TRANSCRIPTION_RATE_LIMIT
 * - Non-retriable error codes: TRANSCRIPTION_VALIDATION (fails fast)
 * - Rate limit errors use longer backoff delays
 * - Includes jitter (±20%) to prevent thundering herd
 * - Uses Pino logger (P0 #2) for telemetry
 *
 * Note: This is for lightweight handler-level retries. Heavy/queued operations use P0 #6 job queue retry.
 *
 * Usage:
 * const result = await withRetry(
 *   () => transcribeAudioLocal(buffer),
 *   { maxRetries: 3, backoffDelays: [1000, 2000, 4000], rateLimitBackoffDelays: [5000, 10000, 20000] }
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      // Attempt the operation
      const result = await operation();

      // Success - log if retries were needed
      if (attempt > 0) {
        logger.info({ attempt, maxRetries: options.maxRetries }, 'Operation succeeded after retry(s)');
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // Check if error is non-retriable (TRANSCRIPTION_VALIDATION)
      if (error instanceof AppError && error.code === ErrorCode.TRANSCRIPTION_VALIDATION) {
        logger.debug({ code: error.code }, 'Non-retriable error, failing fast');
        throw error;
      }

      // Check if we've exhausted retries
      if (attempt >= options.maxRetries) {
        logger.warn(
          { attempt, maxRetries: options.maxRetries, errorCode: error instanceof AppError ? error.code : 'unknown' },
          'Max retries exhausted, giving up'
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

      // Log retry attempt with structured data (Pino from P0 #2)
      const errorCode = error instanceof AppError ? error.code : 'unknown';

      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries: options.maxRetries,
          errorCode,
          nextDelay: Math.round(delayWithJitter),
          isRateLimit
        },
        `Retry attempt ${attempt + 1}/${options.maxRetries} after ${errorCode}`
      );

      // Call onRetry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt + 1, error, delayWithJitter);
      }

      // Wait before retrying
      await sleep(delayWithJitter);
    }
  }

  // Should never reach here, but TypeScript requires it
  throw lastError || new Error("Retry failed with unknown error");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

### Rate Limit Error Code (Architecture Aligned)

**File**: `src/errors/error-codes.ts` (Addition)

```typescript
// Add to existing ErrorCode enum from P1 #17

export enum ErrorCode {
  // Existing codes...
  TRANSCRIPTION_NETWORK = 'TRANSCRIPTION_NETWORK',
  TRANSCRIPTION_VALIDATION = 'TRANSCRIPTION_VALIDATION',
  TRANSCRIPTION_PROVIDER = 'TRANSCRIPTION_PROVIDER',
  TRANSCRIPTION_SYSTEM = 'TRANSCRIPTION_SYSTEM',

  // Rate limit error (Story 2 addition)
  TRANSCRIPTION_RATE_LIMIT = 'TRANSCRIPTION_RATE_LIMIT',  // Retriable with longer backoff
}

// Usage in providers:
// When API returns 429 or quota exceeded:
// throw new AppError(
//   ErrorCode.TRANSCRIPTION_RATE_LIMIT,
//   USER_MESSAGES[ErrorCode.TRANSCRIPTION_RATE_LIMIT],
//   { provider: 'openai', originalError: error }
// );
```

---

### Configuration Updates (Unified Config from P0 #10)

**File**: `src/config/schema.ts` (Additions to unified config schema)

```typescript
import { z } from 'zod';

// Add to existing config schema from P0 #10
export const configSchema = z.object({
  // ... existing config from P0 #10 ...

  transcription: z.object({
    retryEnabled: z.boolean().default(true),
    maxRetries: z.number().int().positive().default(3),
    backoffDelays: z.array(z.number().positive()).default([1000, 2000, 4000]),
    rateLimitBackoffDelays: z.array(z.number().positive()).default([5000, 10000, 20000]),
  }),
});

export type Config = z.infer<typeof configSchema>;
```

**File**: `src/config/index.ts` (Load from env)

```typescript
// Unified config loader from P0 #10
export function loadConfig(): Config {
  return configSchema.parse({
    // ... other config ...

    transcription: {
      retryEnabled: process.env.TRANSCRIPTION_RETRY_ENABLED !== 'false',
      maxRetries: parseInt(process.env.TRANSCRIPTION_MAX_RETRIES || '3', 10),
      backoffDelays: (process.env.TRANSCRIPTION_BACKOFF_DELAYS || '1000,2000,4000')
        .split(',')
        .map(d => parseInt(d.trim(), 10)),
      rateLimitBackoffDelays: (process.env.TRANSCRIPTION_RATELIMIT_BACKOFF_DELAYS || '5000,10000,20000')
        .split(',')
        .map(d => parseInt(d.trim(), 10)),
    },
  });
}

// Export singleton config instance
export const config = loadConfig();
```

---

### Handler Integration

**File**: `src/handlers/transcription.ts` (Modified)

```typescript
import { Message } from "whatsapp-web.js";
import { config } from "../config"; // Unified config from P0 #10
import * as cli from "../cli/ui";
import { getConfig } from "./ai-config";
import { TranscriptionMode } from "../types/transcription-mode";
import { transcribeAudioLocal } from "../providers/whisper-local";
import { transcribeWhisperApi } from "../providers/whisper-api";
import { transcribeRequest } from "../providers/speech";
import { transcribeOpenAI } from "../providers/openai";
import { withRetry } from "../utils/retry";
import { TranscriptionValidationError } from "../types/transcription-errors";

async function transcribeMedia(message: Message): Promise<string | null> {
  if (!message.hasMedia) return null;
  const media = await message.downloadMedia();
  if (!media || !media.mimetype.startsWith("audio/")) return null;

  if (!getConfig("transcription", "enabled")) {
    cli.print("[Transcription] Received voice message but transcription is disabled.");
    return null;
  }

  const mediaBuffer = Buffer.from(media.data, "base64");
  const transcriptionMode = getConfig("transcription", "mode");
  cli.print(`[Transcription] Transcribing audio with "${transcriptionMode}" mode...`);

  // Select provider function
  let providerFn: (buffer: Buffer) => Promise<{ text: string; language: string }>;
  switch (transcriptionMode) {
    case TranscriptionMode.Local:
      providerFn = transcribeAudioLocal;
      break;
    case TranscriptionMode.OpenAI:
      providerFn = transcribeOpenAI;
      break;
    case TranscriptionMode.WhisperAPI:
      providerFn = (buffer) => transcribeWhisperApi(new Blob([buffer]));
      break;
    case TranscriptionMode.SpeechAPI:
      providerFn = (buffer) => transcribeRequest(new Blob([buffer]));
      break;
    default:
      cli.print(`[Transcription] Unsupported transcription mode: ${transcriptionMode}`);
      return null;
  }

  try {
    let res;

    // Apply retry logic if enabled (using unified config from P0 #10)
    if (config.transcription.retryEnabled) {
      res = await withRetry(
        () => providerFn(mediaBuffer),
        {
          maxRetries: config.transcription.maxRetries,
          backoffDelays: config.transcription.backoffDelays,
          rateLimitBackoffDelays: config.transcription.rateLimitBackoffDelays,
          onRetry: (attempt, error, nextDelay) => {
            // Notify user about retry
            message.reply(
              `Retrying transcription (${attempt}/${config.transcription.maxRetries})...`
            );
          },
        }
      );
    } else {
      // No retry, direct call
      res = await providerFn(mediaBuffer);
    }

    const { text: transcribedText, language: transcribedLanguage } = res;

    if (transcribedText == null || transcribedText.length === 0) {
      message.reply("I couldn't understand what you said.");
      return null;
    }

    cli.print(
      `[Transcription] Success: ${transcribedText} (language: ${transcribedLanguage})`
    );

    if (config.ttsTranscriptionResponse) {
      const reply = `You said: ${transcribedText}${
        transcribedLanguage ? " (language: " + transcribedLanguage + ")" : ""
      }`;
      message.reply(reply);
    }

    return transcribedText;
  } catch (error) {
    // Handle errors after retry exhaustion
    if (error instanceof TranscriptionValidationError) {
      // Story 3 will add user-friendly messages here
      message.reply("Invalid audio format. Please send voice notes in supported format.");
    } else {
      // Generic error message (Story 3 will enhance this)
      message.reply("Transcription failed after multiple attempts. Please try again later.");
    }

    cli.print(`[Transcription] Failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export { transcribeMedia };
```

---

## Environment Variables

Add these to your `.env` file:

```bash
# Retry Configuration (Story 2)
TRANSCRIPTION_RETRY_ENABLED=true
TRANSCRIPTION_MAX_RETRIES=3
TRANSCRIPTION_BACKOFF_DELAYS=1000,2000,4000
TRANSCRIPTION_RATELIMIT_BACKOFF_DELAYS=5000,10000,20000
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/utils/retry.test.ts`

```typescript
import { withRetry } from '../../../src/utils/retry';
import { AppError, ErrorCode } from '../../../src/errors/error-codes';

describe('withRetry (Architecture Aligned)', () => {
  test('should succeed on first attempt without retries', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const result = await withRetry(operation, {
      maxRetries: 3,
      backoffDelays: [100, 200, 400],
      rateLimitBackoffDelays: [500, 1000, 2000],
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('should retry on TRANSCRIPTION_NETWORK error and succeed', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError(ErrorCode.TRANSCRIPTION_NETWORK, 'Timeout', { provider: 'test' })
      )
      .mockResolvedValue('success');

    const result = await withRetry(operation, {
      maxRetries: 3,
      backoffDelays: [10, 20, 40],
      rateLimitBackoffDelays: [50, 100, 200],
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2); // 1 failure + 1 success
  });

  test('should fail fast on TRANSCRIPTION_VALIDATION error without retries', async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(
        new AppError(ErrorCode.TRANSCRIPTION_VALIDATION, 'Invalid format', { provider: 'test' })
      );

    await expect(
      withRetry(operation, {
        maxRetries: 3,
        backoffDelays: [10, 20, 40],
        rateLimitBackoffDelays: [50, 100, 200],
      })
    ).rejects.toThrow(AppError);

    expect(operation).toHaveBeenCalledTimes(1); // No retries
  });

  test('should use longer backoff for TRANSCRIPTION_RATE_LIMIT error', async () => {
    jest.useFakeTimers();

    const operation = jest
      .fn()
      .mockRejectedValue(
        new AppError(ErrorCode.TRANSCRIPTION_RATE_LIMIT, 'Rate limit', { provider: 'test' })
      );

    const promise = withRetry(operation, {
      maxRetries: 1,
      backoffDelays: [100],
      rateLimitBackoffDelays: [5000], // 5s for rate limit
    });

    // Fast-forward time
    jest.advanceTimersByTime(5000);
    await expect(promise).rejects.toThrow(AppError);

    jest.useRealTimers();
  });

  test('should exhaust retries and throw final error', async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(
        new AppError(ErrorCode.TRANSCRIPTION_NETWORK, 'Always fails', { provider: 'test' })
      );

    await expect(
      withRetry(operation, {
        maxRetries: 3,
        backoffDelays: [10, 20, 40],
        rateLimitBackoffDelays: [50, 100, 200],
      })
    ).rejects.toThrow(AppError);

    expect(operation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  test('should call onRetry callback on each retry', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError(ErrorCode.TRANSCRIPTION_NETWORK, 'Fail 1', { provider: 'test' })
      )
      .mockRejectedValueOnce(
        new AppError(ErrorCode.TRANSCRIPTION_NETWORK, 'Fail 2', { provider: 'test' })
      )
      .mockResolvedValue('success');

    const onRetry = jest.fn();

    await withRetry(operation, {
      maxRetries: 3,
      backoffDelays: [10, 20, 40],
      rateLimitBackoffDelays: [50, 100, 200],
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(AppError), expect.any(Number));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(AppError), expect.any(Number));
  });
});
```

### Integration Tests

**File**: `tests/integration/handlers/transcription-retry.test.ts`

```typescript
import { transcribeMedia } from '../../../src/handlers/transcription';
import * as whisperLocal from '../../../src/providers/whisper-local';
import { TranscriptionNetworkError } from '../../../src/types/transcription-errors';

// Mock providers
jest.mock('../../../src/providers/whisper-local');

describe('transcribeMedia with retry', () => {
  test('should retry and succeed after transient failure', async () => {
    const mockTranscribe = jest.spyOn(whisperLocal, 'transcribeAudioLocal')
      .mockRejectedValueOnce(new TranscriptionNetworkError('Network fail', 'whisper-local'))
      .mockResolvedValue({ text: 'Hello world', language: 'en' });

    const mockMessage = {
      hasMedia: true,
      downloadMedia: jest.fn().mockResolvedValue({
        data: Buffer.from('fake-audio').toString('base64'),
        mimetype: 'audio/ogg',
      }),
      reply: jest.fn(),
    };

    const result = await transcribeMedia(mockMessage as any);

    expect(result).toBe('Hello world');
    expect(mockTranscribe).toHaveBeenCalledTimes(2);
    expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('Retrying'));
  });
});
```

### Manual Testing Scenarios

1. **Happy Path (No Retries)**:
   - Send voice message
   - Verify transcription succeeds on first attempt
   - Verify no retry messages shown

2. **Transient Network Failure**:
   - Simulate network failure (disconnect WiFi briefly during transcription)
   - Verify retry attempts shown: "Retrying transcription (1/3)...", "Retrying transcription (2/3)..."
   - Verify eventual success or failure message

3. **Rate Limit Scenario**:
   - Trigger rate limit (send many voice messages rapidly to exhaust quota)
   - Verify longer backoff delays (5s/10s/20s observed in logs)
   - Verify retry messages

4. **ValidationError (No Retry)**:
   - Send invalid audio file
   - Verify immediate failure (no retries)
   - Verify error message appears quickly (<1s)

5. **Configuration Testing**:
   - Set `TRANSCRIPTION_RETRY_ENABLED=false` → verify no retries
   - Set `TRANSCRIPTION_MAX_RETRIES=1` → verify only 1 retry
   - Set custom backoff delays → verify delays respected

---

## Definition of Done

- ✅ **AC 1-6**: Functional requirements met (retry utility, dual backoff, retry policy, RateLimitError, config, telemetry)
- ✅ **AC 7-9**: Integration requirements verified (providers wrapped, existing functionality preserved, performance guarantees)
- ✅ **AC 10-12**: Quality requirements met (tests pass, docs updated, no regression)
- ✅ **Unit tests pass**: retry.test.ts covers all retry scenarios (6+ test cases)
- ✅ **Integration tests pass**: transcription-retry.test.ts verifies handler integration
- ✅ **Manual testing completed**: All scenarios in "Manual Testing Scenarios" passed
- ✅ **Performance verified**: Total retry time < 10s worst case (measured in tests)
- ✅ **Code review**: Retry logic reviewed for correctness, jitter implementation, edge cases
- ✅ **Documentation**: CLAUDE.md updated with retry behavior and configuration

---

## Risk Mitigation

**Primary Risk:** Retry logic could delay responses excessively if misconfigured (too many retries on non-retriable errors).

**Mitigation:**
- Conservative retry policy: Max 3 retries by default
- ValidationError fails fast (no wasted retries)
- Total timeout < 10s worst case (3 retries × ~3s max backoff)
- User sees retry progress, so they understand delays
- Retry can be disabled via `TRANSCRIPTION_RETRY_ENABLED=false`
- Jitter prevents all users retrying simultaneously (thundering herd prevention)

**Rollback Plan:**
- Set `TRANSCRIPTION_RETRY_ENABLED=false` to disable retry without code changes
- Revert commits if retry logic causes issues
- Original handler flow preserved (can remove retry wrapper easily)
- No database changes, pure code logic

---

## Files to Create/Modify

### New Files:
- `src/utils/retry.ts` - Retry wrapper with exponential backoff using AppError and Pino (~100 lines)
- `tests/unit/utils/retry.test.ts` - Unit tests for retry utility with AppError (6+ test cases)
- `tests/integration/handlers/transcription-retry.test.ts` - Integration tests

### Modified Files (Unified Config from P0 #10):
- `src/errors/error-codes.ts` - Add `TRANSCRIPTION_RATE_LIMIT` error code to existing enum (~1 line)
- `src/config/schema.ts` - Add transcription retry config to unified schema from P0 #10 (~10 lines)
- `src/config/index.ts` - Load retry config from env vars in unified config loader (~10 lines)
- `src/handlers/transcription.ts` - Wrap provider calls with retry logic, use config.transcription.* (~30 lines changed)
- `src/providers/whisper-api.ts` - Detect and throw AppError with TRANSCRIPTION_RATE_LIMIT on 429 responses (~5 lines)
- `src/providers/openai.ts` - Detect and throw AppError with TRANSCRIPTION_RATE_LIMIT on quota exceeded (~5 lines)
- `src/providers/speech.ts` - Detect and throw AppError with TRANSCRIPTION_RATE_LIMIT if applicable (~5 lines)

---

## Dependencies

- **Depends on**: Story 1 (Provider Error Handling) - Must be completed first
- **Blocks**: Story 3 (User Messages) - Story 3 will enhance retry messages
- **No external dependencies**: Uses built-in Node.js capabilities only

---

## Notes for Developer

- **Critical**: Ensure retry doesn't mask permanent failures - ValidationError must fail fast
- **Performance**: Use jitter (±20%) in backoff to prevent thundering herd when many users retry simultaneously
- **Testing**: Use fake timers (`jest.useFakeTimers()`) to test backoff delays without waiting real time
- **User Experience**: Reply to user on each retry attempt so they know the bot is working
- **Configuration**: All retry config via environment variables for easy tuning in production
- **Logging**: Log every retry attempt with error type and delay for debugging
- **Rate Limits**: Longer backoff for rate limits (5s/10s/20s) to give quota time to reset
