# Epic 1: Enhanced Transcription Error Handling - Brownfield Enhancement

**Priority:** P1 (High Impact - User-Visible Value)
**Target Deployment:** Sprint 2-3 (Week 2-3, must complete before Epic 2)
**Dependencies:** P0 #2 (Structured Logging with Pino - Sprint 1), P0 #10 (Unified Config System - Sprint 2)
**Timeline:**
- **Can start:** Sprint 2 Week 1 (after P0 #10 completes)
- **Should complete:** Sprint 3 Week 1 (before Epic 2 Sprint 3-4)
**Architecture Alignment:** Creates error handling foundation (AppError, ErrorCode, USER_MESSAGES) that becomes the P1 #17 standard referenced by Architecture

## Epic Goal

Improve transcription reliability and user experience by implementing comprehensive error handling, retry logic, and actionable error messages across all transcription providers (Local, OpenAI, WhisperAPI, SpeechAPI).

**Why This Matters for Customer Service (Epic 2 Dependency):**

Epic 2 transforms this bot into a customer service platform. Reliable transcription is **critical** because many customers send voice messages instead of text (especially in global markets with lower typing literacy or mobile-first users).

**Impact if transcription fails:**
- ❌ Lost customer inquiries = bad customer experience
- ❌ Customers repeat their question in text, creating extra work
- ❌ Businesses lose competitive advantage (competitors have working voice support)
- ❌ Voice-first markets (India, Southeast Asia, Latin America) can't use the platform

**Epic 1 ensures:** Zero transcription failures from preventable errors, 90% auto-recovery from transient issues, clear error messages when failures occur.

## Epic Description

### Existing System Context:

- **Current functionality**: Voice message transcription via 4 provider modes (Local Whisper, OpenAI Whisper, WhisperAPI, SpeechAPI)
- **Technology stack**: Node.js/TypeScript, FFmpeg, multiple API providers, whatsapp-web.js, Pino logging (P0 #2)
- **Integration points**:
  - `src/handlers/transcription.ts` - Main transcription logic
  - `src/providers/whisper-*.ts`, `openai.ts`, `speech.ts` - Provider implementations
  - `src/handlers/message.ts` - Message handler that calls transcription
  - `src/commands/transcription.ts` - Configuration commands
  - `src/queue/job-queue.ts` - Job queue for heavy operations (P0 #6)

### Enhancement Details:

**What's being added/changed:**
1. **Error handling foundation** - Creates `AppError` class, `ErrorCode` enum, and `USER_MESSAGES` catalog that becomes the standard referenced by Architecture as "P1 #17"
2. **Comprehensive error handling** using new `AppError` pattern with transcription-specific error codes
3. **Retry logic for synchronous operations** - Handler-level retry (max 3 attempts, <10s total) for immediate API calls (OpenAI Whisper, Whisper API, Speech API)
4. **User-friendly error messages** via centralized error message catalog
5. **Structured logging** using Pino (P0 #2) with PII redaction for debugging

**How it integrates:**
- Creates `AppError` + `ErrorCode` + `USER_MESSAGES` pattern that Architecture will reference as "P1 #17 standard"
- Integrates with Pino structured logger from P0 #2 (no custom logging utilities)
- Uses unified config system from P0 #10 (Sprint 2) for retry configuration
- **Synchronous operations scope**: Immediate API calls (no FFmpeg, no local Whisper CLI)
- **Future P0 #6 integration**: When transcription moves to job queue, job queue retry will replace handler retry
- Stores errors in `src/errors/` directory
- Maintains backward compatibility - existing API contracts unchanged

**Success criteria:**
- ✅ Zero process crashes from transcription errors (eliminate execSync failures)
- ✅ 90% of transient failures auto-recover via coordinated retry logic
- ✅ Users receive actionable error messages using Architecture's user message catalog
- ✅ All transcription errors logged via Pino with provider, error code, and duration
- ✅ Existing functionality unaffected (all current test cases pass)
- ✅ Follows Architecture P1 #17 error handling standards

---

## Stories

### Story 1: **Provider Error Handling & Safe Execution**

**Description:** Add comprehensive try-catch blocks to all transcription providers, replace risky `execSync` with safe execution wrapper, and throw `AppError` with transcription-specific error codes per Architecture P1 #17 standards.

**Scope:**
- Refactor `src/providers/whisper-local.ts` to use safe process execution
- Add error handling to `src/providers/whisper-api.ts`, `openai.ts` (transcription), `speech.ts`
- Add transcription error codes to `src/errors/error-codes.ts` (TRANSCRIPTION_NETWORK, TRANSCRIPTION_VALIDATION, etc.)
- Ensure no process crashes from provider failures
- Use Pino logger (P0 #2) for all error logging

**Files to modify:**
- `src/providers/whisper-local.ts`
- `src/providers/whisper-api.ts`
- `src/providers/openai.ts`
- `src/providers/speech.ts`
- `src/errors/error-codes.ts` (extend existing from P1 #17)
- `src/utils/safe-exec.ts` (new)

### Story 2: **Retry Logic with Exponential Backoff**

**Description:** Implement lightweight handler-level retry for immediate transcription failures. This complements (not replaces) job queue retry from P0 #6. Handler retries are for quick network glitches; job queue handles heavy/queued operations.

**Scope:**
- Create `src/utils/retry.ts` with retry wrapper for synchronous transcription attempts
- Configure retry policies (max 3 retries, 1s/2s/4s backoff) for non-queued operations
- Identify retriable vs non-retriable error codes (use `ErrorCode` from P1 #17)
- Add retry telemetry via Pino logger (log retry attempts with error codes)
- Document relationship with P0 #6 job queue retry (handler retry = fast path, queue retry = heavy ops)

**Files to modify:**
- `src/utils/retry.ts` (new)
- `src/handlers/transcription.ts`
- `src/config.ts` (add TRANSCRIPTION_RETRY_ENABLED, TRANSCRIPTION_MAX_RETRIES)

### Story 3: **User-Friendly Error Messages & Logging**

**Description:** Add transcription error messages to centralized user message catalog (P1 #17 `src/errors/user-messages.ts`). Use Pino structured logger (P0 #2) for all transcription error logging with PII redaction.

**Scope:**
- Add transcription error codes to `src/errors/user-messages.ts` (extend USER_MESSAGES catalog from P1 #17)
- Update `src/handlers/transcription.ts` to map `AppError` codes to user messages using Architecture pattern
- Use Pino logger for structured error logging with context (provider, error code, duration, retry count)
- Include suggested actions in error messages per P1 #17 standards (e.g., "Try again in 1 minute" for rate limits)
- Ensure PII redaction (no audio content, phone numbers in logs)

**Files to modify:**
- `src/handlers/transcription.ts`
- `src/errors/error-codes.ts` (add transcription codes)
- `src/errors/user-messages.ts` (add transcription messages to existing catalog)
- No changes to `src/cli/ui.ts` - use Pino logger from P0 #2 instead

---

## Compatibility Requirements

- ✅ **Existing APIs remain unchanged** - `transcribeMedia()` signature preserved
- ✅ **Configuration backward compatible** - All `!config transcription` commands work identically
- ✅ **Provider contracts unchanged** - Return types `{ text: string; language: string }` preserved
- ✅ **Performance impact minimal** - Retry adds <2s worst case (only on failures)
- ✅ **No database schema changes** - Pure code enhancement

---

## Risk Mitigation

**Primary Risk:** Retry logic could delay responses for users if misconfigured (e.g., too many retries on non-retriable errors)

**Mitigation:**
- Conservative retry policy: Max 3 attempts, total timeout <10s
- Fail fast on non-retriable errors (invalid audio format, missing API keys)
- Log retry attempts prominently so users see "Retrying transcription (2/3)..."

**Rollback Plan:**
- All changes are additive wrappers around existing providers
- Can disable retry logic via feature flag `TRANSCRIPTION_RETRY_ENABLED=false`
- Revert commits maintain original provider code paths

---

## Definition of Done

- ✅ All 3 stories completed with acceptance criteria met
- ✅ Existing transcription functionality verified (all 4 provider modes tested)
- ✅ Integration points working correctly (message handler, commands)
- ✅ Zero process crashes during error scenarios (tested with invalid audio, network failures)
- ✅ Error messages reviewed and user-friendly (no technical stack traces in user messages)
- ✅ Structured logging implemented and verified in debug log
- ✅ Retry logic tested with mock failures
- ✅ No regression in existing features (transcription still works in happy path)
- ✅ Documentation updated (`docs/transcription.md` or CLAUDE.md with error handling notes)

---

## Estimated Effort

- **Story 1**: 3-5 hours (provider refactoring, safe execution wrapper)
- **Story 2**: 2-3 hours (retry utility, integration)
- **Story 3**: 2-3 hours (error messages, logging enhancement)
- **Total**: 7-11 hours (approximately 1-2 days for a developer)

---

## Dependencies

- None - This is a self-contained enhancement to the transcription system
- No external library additions required (using built-in Node.js capabilities)

---

## Technical Notes

### Error Codes to Add (Architecture P1 #17 Pattern):

Add to `src/errors/error-codes.ts`:

```typescript
export enum ErrorCode {
  // Existing codes from P1 #17...

  // Transcription-specific codes (Epic 1)
  TRANSCRIPTION_NETWORK = 'TRANSCRIPTION_NETWORK',           // Retriable
  TRANSCRIPTION_RATE_LIMIT = 'TRANSCRIPTION_RATE_LIMIT',     // Retriable with delay
  TRANSCRIPTION_VALIDATION = 'TRANSCRIPTION_VALIDATION',     // Non-retriable
  TRANSCRIPTION_PROVIDER = 'TRANSCRIPTION_PROVIDER',         // Non-retriable
  TRANSCRIPTION_SYSTEM = 'TRANSCRIPTION_SYSTEM',             // Non-retriable
}
```

### Retry Strategy:

```typescript
// Handler-level retry (Story 2) - for immediate/lightweight operations
const delays = [1000, 2000, 4000]; // 1s, 2s, 4s
const maxRetries = 3;

// Retriable error codes: TRANSCRIPTION_NETWORK, TRANSCRIPTION_RATE_LIMIT (with longer delay)
// Non-retriable (fail fast): TRANSCRIPTION_VALIDATION, TRANSCRIPTION_PROVIDER, TRANSCRIPTION_SYSTEM

// Note: Heavy/queued transcription jobs use P0 #6 job queue retry instead
```

### Example User Messages (Architecture P1 #17 Pattern):

Add to `src/errors/user-messages.ts`:

```typescript
export const USER_MESSAGES = {
  // Existing messages from P1 #17...

  // Transcription error messages (Epic 1)
  [ErrorCode.TRANSCRIPTION_NETWORK]:
    "Network error while transcribing. Retrying... If this persists, check your connection.",
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
