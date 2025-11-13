# Story 3: User-Friendly Error Messages & Logging - Brownfield Addition

**Epic**: Epic 1 - Enhanced Transcription Error Handling (P1)
**Story ID**: STORY-3
**Estimated Effort**: 2-3 hours
**Priority**: High (P1 - Improves user experience and debugging)
**Dependencies**:
- Story 1 (AppError + basic USER_MESSAGES) must be completed first
- Story 2 (Retry logic) must be completed first
- P0 #2 (Pino structured logging from Sprint 1) - Provides automatic PII redaction
**Architecture Alignment**: **ENHANCES** USER_MESSAGES catalog from Story 1 with actionable error messages and suggested next steps

---

## User Story

As a **WhatsApp bot user and operator**,
I want **clear, actionable error messages when transcription fails and structured error logs for debugging**,
So that **I understand what went wrong and what to do next, and operators can quickly diagnose issues**.

---

## Story Context

### Existing System Integration:

- **Integrates with**: Transcription handler (`src/handlers/transcription.ts`) and AppError error handling from Stories 1 & 2
- **Technology**: Node.js/TypeScript, `AppError` with error codes, Pino logger (P0 #2), retry logic
- **Follows pattern**:
  - Error handling foundation from Story 1: `AppError` + `ErrorCode` + basic `USER_MESSAGES`
  - Pino structured logging from P0 #2 with **automatic PII redaction**
  - User messages via `message.reply()` using centralized USER_MESSAGES catalog
- **Touch points**:
  - `src/handlers/transcription.ts` - Catches AppError and sends user messages (will enhance with better messages)
  - `src/errors/user-messages.ts` - Basic message catalog from Story 1 (will ENHANCE with suggested actions)
  - `src/errors/error-codes.ts` - Error codes from Story 1 (already complete)
  - `src/utils/retry.ts` - Retry logic from Story 2 (already uses Pino for retry logging)
  - Pino logger instance - Structured logging from P0 #2 (automatically redacts PII - no additional work needed)

**Dependencies**:
- **Requires Story 1 completed** - Needs AppError + error codes + basic USER_MESSAGES
- **Requires Story 2 completed** - Retry messages already use Pino
- **Requires P0 #2 completed** - Pino logger provides automatic PII redaction

---

## Acceptance Criteria

### Functional Requirements:

1. **ENHANCE USER_MESSAGES from Story 1 with actionable messages**
   - Update `src/errors/user-messages.ts` (created in Story 1 with basic messages)
   - Enhance basic messages with suggested actions and next steps
   - Covers all error codes: TRANSCRIPTION_NETWORK, TRANSCRIPTION_VALIDATION, TRANSCRIPTION_PROVIDER, TRANSCRIPTION_SYSTEM, TRANSCRIPTION_RATE_LIMIT
   - Messages are concise, actionable, and include clear guidance

2. **Error messages include suggested actions (Architecture P1 #17 pattern)**
   - **TRANSCRIPTION_NETWORK**: "Network error while transcribing. Retrying... If this persists, check your connection."
   - **TRANSCRIPTION_VALIDATION**: "Audio format not supported. Please send voice notes in OGG format using WhatsApp's voice recorder."
   - **TRANSCRIPTION_RATE_LIMIT**: "Transcription service is busy. Please try again in 1 minute."
   - **TRANSCRIPTION_PROVIDER**: "Transcription service unavailable. Try switching providers with !config transcription mode."
   - **TRANSCRIPTION_SYSTEM**: "System error during transcription. Please contact support if this persists."
   - All messages follow Architecture P1 #17 pattern and include actionable next steps

3. **Handler uses USER_MESSAGES catalog**
   - Update `src/handlers/transcription.ts` to use `USER_MESSAGES[error.code]` for user messages
   - Replace generic "I couldn't understand" with specific messages from catalog
   - Follow Architecture P1 #17 pattern: catch AppError, use error.code to lookup message

4. **Structured logging via Pino (P0 #2 - automatic PII redaction)**
   - Use existing Pino logger from P0 #2 for all transcription error logging
   - **PII redaction is automatic** - P0 #2 configured PII redactor middleware
   - Log transcription errors with context: `logger.error({ provider, errorCode, duration, retryCount }, message)`
   - Only log errors (failures, retries) - not success cases
   - **No changes to Pino configuration needed** - PII redaction already active

5. **PII redaction verification (automatic from P0 #2)**
   - Verify P0 #2 PII redaction works correctly for transcription errors
   - Phone numbers, API keys, sensitive data automatically redacted by existing middleware
   - **No additional PII redaction code needed in this story**
   - Test that logs don't contain audio content, phone numbers, or API keys

6. **Retry messages already enhanced (Story 2 completed this)**
   - Story 2 already updated retry messages to use Pino and error codes
   - Retry logic already includes error code in messages
   - Final failure message already references error code via USER_MESSAGES
   - No additional work needed - Story 2 completed retry message enhancement

### Integration Requirements:

7. **Handler error mapping**
   - `transcribeMedia()` catches all error types from Story 1
   - Maps each error type to appropriate user message using catalog
   - Logs structured error data for debugging
   - No changes to provider implementations

8. **Existing functionality preserved**
   - Successful transcription works identically (no logging per requirement)
   - Error flow maintains backward compatibility
   - Retry logic from Story 2 still works with enhanced messages

9. **Performance guarantees**
   - Message formatting overhead negligible (<1ms)
   - Structured logging overhead minimal (<5ms per error)
   - No impact on happy path (success case)

### Quality Requirements:

10. **Change is covered by tests**
    - Unit tests for error message catalog (test all error types)
    - Unit tests for structured logging (test JSON and human-readable formats)
    - Integration tests for handler error mapping

11. **Documentation updated**
    - Document error message catalog in code comments
    - Update CLAUDE.md with error handling behavior
    - Add examples of error messages to user documentation

12. **No regression verified**
    - All 4 provider modes work (happy path unchanged)
    - Error messages appear correctly for each error type
    - Structured logs written to file and console

---

## Technical Implementation

### Enhanced User Message Catalog

**File**: `src/errors/user-messages.ts` (ENHANCE basic messages from Story 1)

```typescript
import { ErrorCode } from './error-codes';

/**
 * User-friendly error messages catalog
 *
 * ENHANCED by Story 3 with suggested actions and next steps
 * (Story 1 created basic messages, this story improves them)
 */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  // ENHANCED transcription error messages (Story 3)
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

// Note: Handler directly accesses USER_MESSAGES[error.code]
// This follows the error handling pattern created in Story 1
```

---

### Structured Logging via Pino (P0 #2 - Already Implemented)

**No custom logging code needed** - Use existing Pino logger from P0 #2

```typescript
// Use existing Pino logger instance from P0 #2
import { logger } from "../logging/logger";

// Example usage in transcription handler:
logger.error(
  {
    operation: 'transcription',
    provider: 'whisper-local',
    errorCode: ErrorCode.TRANSCRIPTION_NETWORK,
    duration: 2.5,
    retryCount: 2
  },
  'Network error during transcription'
);

// Pino from P0 #2 already provides:
// ✅ JSON format for file logs
// ✅ Configurable console format
// ✅ PII redaction
// ✅ Log levels (error, warn, info, debug)
// ✅ Structured context via first parameter
// ✅ Log rotation and file management
```

**Architecture Note:** Do NOT create custom logging in `src/cli/ui.ts`. The Pino logger from P0 #2 is the standard for all structured logging across the application per Architecture standards.

---

### Handler Integration

**File**: `src/handlers/transcription.ts` (Modified - Architecture Aligned)

```typescript
import { Message } from "whatsapp-web.js";
import config from "../config";
import { logger } from "../logging/logger"; // Pino logger from P0 #2
import { getConfig } from "./ai-config";
import { TranscriptionMode } from "../types/transcription-mode";
import { transcribeAudioLocal } from "../providers/whisper-local";
import { transcribeWhisperApi } from "../providers/whisper-api";
import { transcribeRequest } from "../providers/speech";
import { transcribeOpenAI } from "../providers/openai";
import { withRetry } from "../utils/retry";
import { AppError, ErrorCode } from "../errors/error-codes"; // Architecture P1 #17
import { USER_MESSAGES } from "../errors/user-messages"; // Architecture P1 #17

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
  const startTime = Date.now();

  logger.debug({ transcriptionMode }, 'Transcribing audio');

  // Select provider function
  let providerFn: (buffer: Buffer) => Promise<{ text: string; language: string }>;
  let providerName: string;

  switch (transcriptionMode) {
    case TranscriptionMode.Local:
      providerFn = transcribeAudioLocal;
      providerName = 'whisper-local';
      break;
    case TranscriptionMode.OpenAI:
      providerFn = transcribeOpenAI;
      providerName = 'openai';
      break;
    case TranscriptionMode.WhisperAPI:
      providerFn = (buffer) => transcribeWhisperApi(new Blob([buffer]));
      providerName = 'whisper-api';
      break;
    case TranscriptionMode.SpeechAPI:
      providerFn = (buffer) => transcribeRequest(new Blob([buffer]));
      providerName = 'speech-api';
      break;
    default:
      cli.print(`[Transcription] Unsupported transcription mode: ${transcriptionMode}`);
      return null;
  }

  let retryCount = 0;

  try {
    let res;

    // Apply retry logic if enabled
    if (config.transcriptionRetryEnabled) {
      res = await withRetry(
        () => providerFn(mediaBuffer),
        {
          maxRetries: config.transcriptionMaxRetries,
          backoffDelays: config.transcriptionBackoffDelays,
          rateLimitBackoffDelays: config.transcriptionRateLimitBackoffDelays,
          onRetry: (attempt, error, nextDelay) => {
            retryCount = attempt;

            // Enhanced retry message with error code (Architecture P1 #17)
            const errorCode = error instanceof AppError ? error.code : 'unknown';
            const userMessage = error instanceof AppError
              ? USER_MESSAGES[error.code] || 'Retrying transcription...'
              : 'Retrying transcription...';

            message.reply(`${userMessage} (${attempt}/${config.transcriptionMaxRetries})`);

            // Structured error logging via Pino (P0 #2)
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
      // No retry, direct call
      res = await providerFn(mediaBuffer);
    }

    const { text: transcribedText, language: transcribedLanguage } = res;

    if (transcribedText == null || transcribedText.length === 0) {
      message.reply("Transcription returned empty result. Please try recording a clearer voice message.");
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
    const duration = (Date.now() - startTime) / 1000;
    const errorCode = error instanceof AppError ? error.code : 'unknown';

    // Structured error logging via Pino (P0 #2)
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

    // Send user-friendly error message using USER_MESSAGES catalog (Architecture P1 #17)
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

export { transcribeMedia };
```

---

## Environment Variables

**No new environment variables needed** - Logging configuration already handled by Pino setup from P0 #2

```bash
# Note: Pino logging configuration from P0 #2 already includes:
# - LOG_LEVEL (default: info)
# - LOG_FILE_PATH (optional, for file output)
# - LOG_PRETTY (optional, for human-readable console output)
# No transcription-specific logging env vars needed
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/utils/error-messages.test.ts`

```typescript
import {
  getUserErrorMessage,
  getValidationErrorMessage,
  ERROR_MESSAGES,
} from '../../../src/utils/error-messages';
import {
  TranscriptionNetworkError,
  TranscriptionValidationError,
  TranscriptionRateLimitError,
  TranscriptionProviderError,
  TranscriptionSystemError,
} from '../../../src/types/transcription-errors';

describe('error-messages', () => {
  describe('getUserErrorMessage', () => {
    test('should return network error message on first attempt', () => {
      const error = new TranscriptionNetworkError('Timeout', 'test');
      const message = getUserErrorMessage(error, 0, 3);

      expect(message).toContain('Network error');
      expect(message).toContain('check your');
    });

    test('should include retry count during retries', () => {
      const error = new TranscriptionNetworkError('Timeout', 'test');
      const message = getUserErrorMessage(error, 2, 3);

      expect(message).toContain('(2/3)');
    });

    test('should show failure message after exhausting retries', () => {
      const error = new TranscriptionNetworkError('Timeout', 'test');
      const message = getUserErrorMessage(error, 4, 3);

      expect(message).toContain('failed after 3 attempts');
    });

    test('should return rate limit message', () => {
      const error = new TranscriptionRateLimitError('Quota exceeded', 'test');
      const message = getUserErrorMessage(error, 0, 3);

      expect(message).toContain('busy');
      expect(message).toContain('1 minute');
    });

    test('should return provider error message with action', () => {
      const error = new TranscriptionProviderError('API key invalid', 'test');
      const message = getUserErrorMessage(error, 0, 3);

      expect(message).toContain('unavailable');
      expect(message).toContain('!config');
    });

    test('should return system error message', () => {
      const error = new TranscriptionSystemError('Binary not found', 'test');
      const message = getUserErrorMessage(error, 0, 3);

      expect(message).toContain('System error');
      expect(message).toContain('support');
    });
  });

  describe('getValidationErrorMessage', () => {
    test('should detect empty buffer error', () => {
      const error = new TranscriptionValidationError('Audio buffer is empty', 'test');
      const message = getValidationErrorMessage(error);

      expect(message).toContain('empty or corrupted');
    });

    test('should detect format error', () => {
      const error = new TranscriptionValidationError('Invalid audio format', 'test');
      const message = getValidationErrorMessage(error);

      expect(message).toContain('format not supported');
      expect(message).toContain('OGG');
    });

    test('should detect size error', () => {
      const error = new TranscriptionValidationError('Audio file too large', 'test');
      const message = getValidationErrorMessage(error);

      expect(message).toContain('too long');
      expect(message).toContain('25MB');
    });
  });

  describe('ERROR_MESSAGES catalog', () => {
    test('should have messages for all error types', () => {
      const requiredTypes = ['network', 'ratelimit', 'validation', 'provider', 'system', 'unknown'];

      requiredTypes.forEach(type => {
        expect(ERROR_MESSAGES[type]).toBeDefined();
        expect(ERROR_MESSAGES[type].userMessage).toBeTruthy();
        expect(ERROR_MESSAGES[type].suggestedAction).toBeTruthy();
      });
    });

    test('all messages should include actionable guidance', () => {
      Object.values(ERROR_MESSAGES).forEach(msg => {
        expect(msg.suggestedAction.length).toBeGreaterThan(0);
      });
    });
  });
});
```

**File**: `tests/unit/cli/structured-logging.test.ts`

```typescript
import { logError, StructuredLogData } from '../../../src/cli/ui';
import fs from 'fs';

jest.mock('fs');

describe('structured logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should log error in JSON format to file', () => {
    const logData: StructuredLogData = {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'error',
      operation: 'transcription',
      provider: 'openai',
      errorType: 'network',
      duration: 2.5,
      retryCount: 2,
      message: 'Network timeout',
    };

    logError(logData);

    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('transcription-errors.log'),
      expect.stringContaining('"errorType":"network"'),
      'utf-8'
    );
  });

  test('should format human-readable message for console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const logData: StructuredLogData = {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'error',
      operation: 'transcription',
      provider: 'openai',
      errorType: 'network',
      duration: 2.5,
      retryCount: 2,
      message: 'Network timeout',
    };

    logError(logData);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[transcription\].*provider=openai.*error=network.*duration=2\.50s.*retries=2/)
    );

    consoleSpy.mockRestore();
  });
});
```

### Integration Tests

**File**: `tests/integration/handlers/error-messages.test.ts`

```typescript
import { transcribeMedia } from '../../../src/handlers/transcription';
import * as whisperLocal from '../../../src/providers/whisper-local';
import {
  TranscriptionNetworkError,
  TranscriptionValidationError,
} from '../../../src/types/transcription-errors';

jest.mock('../../../src/providers/whisper-local');

describe('transcribeMedia error messages', () => {
  test('should send user-friendly message for network error', async () => {
    jest.spyOn(whisperLocal, 'transcribeAudioLocal')
      .mockRejectedValue(new TranscriptionNetworkError('Timeout', 'whisper-local'));

    const mockMessage = {
      hasMedia: true,
      downloadMedia: jest.fn().mockResolvedValue({
        data: Buffer.from('fake-audio').toString('base64'),
        mimetype: 'audio/ogg',
      }),
      reply: jest.fn(),
    };

    await transcribeMedia(mockMessage as any);

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('Network error')
    );
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('check your')
    );
  });

  test('should send specific message for validation error', async () => {
    jest.spyOn(whisperLocal, 'transcribeAudioLocal')
      .mockRejectedValue(new TranscriptionValidationError('Invalid format', 'whisper-local'));

    const mockMessage = {
      hasMedia: true,
      downloadMedia: jest.fn().mockResolvedValue({
        data: Buffer.from('fake-audio').toString('base64'),
        mimetype: 'audio/ogg',
      }),
      reply: jest.fn(),
    };

    await transcribeMedia(mockMessage as any);

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('format not supported')
    );
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('OGG')
    );
  });
});
```

### Manual Testing Scenarios

1. **Network Error**:
   - Disconnect network during transcription
   - Verify message: "Network error. Retrying... (1/3)"
   - Verify structured log written to `logs/transcription-errors.log` with JSON format
   - Verify console shows human-readable format: `[transcription] provider=openai error=network...`

2. **Validation Error**:
   - Send invalid audio file
   - Verify message: "Audio format not supported. Please send voice notes in OGG format using WhatsApp's voice recorder."
   - Verify no retry attempts (fails fast)

3. **Rate Limit Error**:
   - Trigger rate limit
   - Verify message: "Service is busy. Please try again in 1 minute. Wait a moment and send your voice message again."

4. **Provider Error**:
   - Use invalid API key
   - Verify message includes "!config transcription mode" suggestion

5. **System Error**:
   - Rename whisper binary
   - Verify message: "System error. Please contact support if this persists. Try again later..."

6. **Log File Format**:
   - Check `logs/transcription-errors.log`
   - Verify JSON format with all fields: timestamp, level, operation, provider, errorType, duration, retryCount, message
   - Verify console shows human-readable format

---

## Definition of Done

- ✅ **AC 1-6**: Functional requirements met (error catalog, suggested actions, handler integration, structured logging, enhanced CLI, retry messages)
- ✅ **AC 7-9**: Integration requirements verified (handler mapping, existing functionality preserved, performance guarantees)
- ✅ **AC 10-12**: Quality requirements met (tests pass, docs updated, no regression)
- ✅ **Unit tests pass**: error-messages.test.ts (12+ test cases), structured-logging.test.ts (2+ test cases)
- ✅ **Integration tests pass**: error-messages integration tests (2+ test cases)
- ✅ **Manual testing completed**: All error scenarios produce correct messages
- ✅ **Log files verified**: JSON format in file, human-readable in console
- ✅ **User messages reviewed**: Concise, actionable, include next steps (per requirements Q1, Q3, Q4)
- ✅ **Documentation**: CLAUDE.md updated with error handling examples

---

## Risk Mitigation

**Primary Risk:** Error messages might expose sensitive technical details or confuse users.

**Mitigation:**
- All messages reviewed for user-friendliness (moderate technical detail per Q3: C)
- No internal paths, stack traces, or credentials in user messages
- Technical details only in structured logs (not user-facing)
- Suggested actions tested for clarity
- Fallback to generic "unknown error" message if error type not recognized
- Sensitive data (API keys, file paths) only in log files, not shown to users

**Rollback Plan:**
- Error catalog is separate module - can revert to generic messages
- Structured logging is additive - can disable by not calling `logError()`
- No breaking changes to error flow
- Log files are append-only, won't corrupt existing data

---

## Files to Create/Modify (Architecture Aligned)

### New Files:
- `tests/unit/errors/user-messages.test.ts` - Unit tests for transcription error messages (~40 lines)
- `tests/integration/handlers/transcription-errors.test.ts` - Integration tests for error handling (~50 lines)

### Modified Files (Architecture Aligned):
- `src/errors/user-messages.ts` - Add transcription error messages to existing USER_MESSAGES catalog (~15 lines added)
- `src/handlers/transcription.ts` - Use USER_MESSAGES[error.code] and Pino logger (~30 lines changed)
- **NO changes** to `src/cli/ui.ts` - Use Pino logger from P0 #2 instead
- **NO changes** to `src/config.ts` - Pino configuration already exists from P0 #2

---

## Environment Variables

Add this to your `.env` file:

```bash
# Logging Configuration (Story 3)
LOG_DIR=./logs
```

Add to `.env-example`:

```bash
# Logging Configuration
LOG_DIR=./logs  # Directory for structured log files
```

---

## Dependencies

- **Depends on**: Story 1 (Error categorization) - Must be completed first
- **Depends on**: Story 2 (Retry logic) - Enhances retry messages
- **No external dependencies**: Uses built-in Node.js fs module only

---

## Notes for Developer

- **Critical**: Never expose sensitive data (API keys, file paths, stack traces) in user messages
- **User Experience**: Keep messages concise but actionable per Q1: C
- **Logging**: JSON for machine parsing (log aggregation tools), human-readable for debugging per Q2: C
- **Testing**: Mock fs module to test log file writing without creating real files
- **Performance**: Structured logging should not impact transcription performance (<5ms overhead)
- **Accessibility**: Messages should be clear even for non-technical users
- **Log Rotation**: Consider implementing log rotation in future (not in this story) - logs will grow over time
- **Moderate Detail**: Per Q3: C, provide helpful context (formats, limits) without overwhelming users
- **Always Suggest Actions**: Per Q4: A, every error message must include what user should do next
