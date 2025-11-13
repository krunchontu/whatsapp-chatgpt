# Story 2: Quick Forms for Customer Data Collection - Business Feature

**Epic**: Epic 2 - Customer Service Essentials
**Story ID**: EPIC2-STORY-2
**Estimated Effort**: 5-8 hours
**Priority**: P1 Critical (Essential for structured customer data)
**Dependencies**:
- P0 #3 (Database - PostgreSQL with Prisma)
- P0 #10 (Unified Config System)
- Epic 1 (Error Handling - AppError, ErrorCode, USER_MESSAGES)
- Epic 2 Story 1 (Templates - foundation for command system)
**Architecture Alignment**: Business automation layer, conversational forms in WhatsApp

---

## User Story

As a **customer service team**,
I want **to collect structured data from customers through conversational forms**,
So that **I can gather necessary information (name, email, order number) without manual back-and-forth, reducing response time and data entry errors**.

---

## Business Context

### The Problem

Customer service agents waste time collecting basic information:
- **Agent:** "What's your order number?"
- **Customer:** "ORD-12345"
- **Agent:** "What's your email?"
- **Customer:** "jane@example.com"
- **Agent:** _(Manually types into CRM)_

**Result:** 5-10 minutes wasted per inquiry, typos in data entry, inconsistent information collection, frustrated customers who have to repeat information.

### The Solution

Automated conversational forms in WhatsApp:
- Bot initiates multi-step form collection
- Validates input in real-time (email format, order number format)
- Stores structured data in database
- Agents receive pre-filled information, ready to help

**Example Flow:**
```
Bot: "What's your order number? (e.g., ORD-12345)"
Customer: "ORD-98765"
Bot: "✅ Order number: ORD-98765
     What's your email?"
Customer: "jane@example.com"
Bot: "✅ Email: jane@example.com
     Looking up your order..."
```

### Success Metrics

- ✅ **<10% form abandonment rate**: 90%+ of customers complete forms
- ✅ **50% time savings**: Reduce data collection from 5-10 min to 1-2 min
- ✅ **Zero data entry errors**: Validation ensures correct formats
- ✅ **100% data capture**: All required fields collected before proceeding

---

## Acceptance Criteria

### Functional Requirements:

1. **Forms can be triggered via command or keyword**
   - Admin command: `/form <form_type>` (e.g., `/form order_tracking`)
   - Keyword trigger: "track order" → auto-initiates order tracking form
   - Keyword configured per form type in config

2. **Multi-step form collection**
   - Bot asks one question at a time
   - Waits for user response before next question
   - Shows progress: "Step 2 of 4" (optional, configurable)
   - Supports 3-10 fields per form

3. **Real-time input validation**
   - Email: Validates format (user@domain.com)
   - Phone: Validates format (E.164 or local format)
   - Order number: Validates pattern (configurable regex)
   - Number: Validates numeric input
   - Date: Validates date format (YYYY-MM-DD or MM/DD/YYYY)
   - On invalid input: Bot explains error and prompts retry
   - Max 3 retry attempts per field, then escalate or cancel

4. **Form field types supported**
   - `text` - Free text (max length configurable)
   - `email` - Email validation
   - `phone` - Phone number validation
   - `number` - Numeric only
   - `date` - Date validation
   - `choice` - Multiple choice (buttons or quick replies)
   - `confirm` - Yes/No confirmation

5. **Form timeout and cancellation**
   - Timeout: 5 minutes of inactivity → form auto-cancelled
   - Manual cancel: User types "cancel" or "/form cancel"
   - On timeout/cancel: Save partial submission for analytics
   - User can restart: "/form restart" or trigger keyword again

6. **Form submission and storage**
   - All field data validated before submission
   - Data stored in database as JSONB (flexible schema)
   - Submission includes: chat_id, form_type, data, submitted_at timestamp
   - Unique submission ID returned for reference

7. **Form confirmation**
   - After all fields collected, show summary:
     ```
     ✅ Please confirm:
     Order Number: ORD-98765
     Email: jane@example.com
     [Confirm] [Edit] [Cancel]
     ```
   - User can confirm, edit specific field, or cancel
   - On confirm: Submit to database, proceed with next action

### Integration Requirements:

8. **Form data accessible to other handlers**
   - After submission, form data available in message context
   - Other handlers (FAQ, template, GPT) can reference collected data
   - Example: GPT handler can say "I see your order ORD-98765, let me check status..."

9. **Form definitions configurable**
   - Form definitions stored in config or database
   - Admin can create/edit forms without code changes
   - Form structure: name, fields[], trigger_keywords[], success_message
   - Example form definition:
     ```json
     {
       "name": "order_tracking",
       "fields": [
         {"name": "order_number", "type": "text", "pattern": "^ORD-\\d{5}$", "prompt": "What's your order number?"},
         {"name": "email", "type": "email", "prompt": "What's your email address?"}
       ],
       "trigger_keywords": ["track order", "order status"],
       "success_message": "Thanks! Looking up order {order_number}..."
     }
     ```

10. **Works in both DM and group chats**
    - Forms work in private DMs (default)
    - In group chats: Bot DMs user to collect info (privacy)
    - After form complete in DM, bot resumes in group chat

### Quality Requirements:

11. **Change is covered by tests (>80% coverage per Architecture)**
    - Unit tests for form validation logic (all field types)
    - Unit tests for timeout/cancellation
    - Unit tests for error handling (all error codes)
    - Integration tests for database storage
    - E2E tests for complete form flow
    - **Minimum 80% code coverage** for all new code

12. **Error handling using AppError from Epic 1**
    - All errors throw `AppError` with appropriate `ErrorCode`
    - All errors use `USER_MESSAGES` catalog for user-facing messages
    - Error codes defined: `FORM_VALIDATION_ERROR`, `FORM_TIMEOUT`, `FORM_CANCELLED`, `FORM_STORAGE_ERROR`
    - Validation errors specific: "Invalid email format" vs generic "Invalid input"
    - Unexpected errors logged and return generic message to user

13. **Pino logging for all operations (Epic 1 consistency)**
    - Form initiated: `logger.info({ formType, chatId }, 'Form initiated')`
    - Field collected: `logger.debug({ formType, chatId, field, valid }, 'Field collected')`
    - Validation failed: `logger.warn({ formType, chatId, field, invalidInput }, 'Validation failed')`
    - Form submitted: `logger.info({ formType, chatId, submissionId }, 'Form submitted')`
    - Form timeout: `logger.warn({ formType, chatId, fieldsCollected }, 'Form timeout')`
    - Errors: `logger.error({ errorCode, formType, chatId }, 'Form operation failed')`
    - Performance: Log form completion time (should be <2 minutes average)

14. **Documentation updated**
    - Add form commands to CLAUDE.md
    - Create admin guide for form configuration
    - Document form field types and validation rules
    - Document error codes and user messages

15. **Performance guarantees**
    - Field validation: <100ms
    - Form submission: <500ms
    - Average form completion: <2 minutes (user-dependent)
    - No memory leaks (form state cleared after timeout/completion)

---

## Technical Implementation

### Database Schema

**File**: `prisma/schema.prisma` (addition)

```prisma
model FormSubmission {
  id          String   @id @default(uuid())
  chatId      String   @map("chat_id") @db.VarChar(255)
  formType    String   @map("form_type") @db.VarChar(50)
  data        Json     // JSONB for flexible field storage
  submittedAt DateTime @default(now()) @map("submitted_at")

  @@index([chatId])
  @@index([formType])
  @@map("form_submissions")
}

model FormDefinition {
  id              Int      @id @default(autoincrement())
  name            String   @unique @db.VarChar(100)
  fields          Json     // Array of field definitions
  triggerKeywords String[] @map("trigger_keywords")
  successMessage  String   @map("success_message") @db.Text
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("form_definitions")
}
```

**Migration:**
```bash
npx prisma migrate dev --name add_forms_tables
```

---

### Form State Management

**File**: `src/handlers/forms/form-state.ts` (NEW)

```typescript
import { logger } from '../../logging/logger';

interface FormField {
  name: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'date' | 'choice' | 'confirm';
  prompt: string;
  pattern?: string;  // Regex for validation
  choices?: string[];  // For choice fields
  required?: boolean;
  maxLength?: number;
}

interface FormDefinition {
  name: string;
  fields: FormField[];
  triggerKeywords: string[];
  successMessage: string;
}

interface FormState {
  chatId: string;
  formType: string;
  currentFieldIndex: number;
  collectedData: Record<string, any>;
  retryCount: number;
  startedAt: Date;
  lastActivityAt: Date;
}

// In-memory form state (consider Redis for multi-instance)
const activeFor ms = new Map<string, FormState>();

export class FormStateManager {
  /**
   * Start a new form session
   */
  startForm(chatId: string, formType: string): FormState {
    const state: FormState = {
      chatId,
      formType,
      currentFieldIndex: 0,
      collectedData: {},
      retryCount: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    activeForms.set(chatId, state);
    logger.info({ formType, chatId }, 'Form session started');

    return state;
  }

  /**
   * Get active form for chat
   */
  getForm(chatId: string): FormState | undefined {
    const state = activeForms.get(chatId);
    if (state) {
      // Check timeout (5 minutes)
      const inactiveTime = Date.now() - state.lastActivityAt.getTime();
      if (inactiveTime > 5 * 60 * 1000) {
        logger.warn({ formType: state.formType, chatId }, 'Form timeout');
        this.cancelForm(chatId, 'timeout');
        return undefined;
      }
    }
    return state;
  }

  /**
   * Update collected data for current field
   */
  setFieldValue(chatId: string, fieldName: string, value: any): void {
    const state = activeForms.get(chatId);
    if (state) {
      state.collectedData[fieldName] = value;
      state.lastActivityAt = new Date();
      logger.debug({ formType: state.formType, chatId, field: fieldName }, 'Field value collected');
    }
  }

  /**
   * Move to next field
   */
  nextField(chatId: string): void {
    const state = activeForms.get(chatId);
    if (state) {
      state.currentFieldIndex++;
      state.retryCount = 0; // Reset retry count for new field
      state.lastActivityAt = new Date();
    }
  }

  /**
   * Increment retry count for current field
   */
  incrementRetry(chatId: string): number {
    const state = activeForms.get(chatId);
    if (state) {
      state.retryCount++;
      return state.retryCount;
    }
    return 0;
  }

  /**
   * Complete and remove form
   */
  completeForm(chatId: string): FormState | undefined {
    const state = activeForms.get(chatId);
    if (state) {
      const duration = Date.now() - state.startedAt.getTime();
      logger.info(
        { formType: state.formType, chatId, duration, fieldsCollected: Object.keys(state.collectedData).length },
        'Form completed'
      );
      activeForms.delete(chatId);
    }
    return state;
  }

  /**
   * Cancel form (timeout or user requested)
   */
  cancelForm(chatId: string, reason: 'timeout' | 'user' | 'error'): FormState | undefined {
    const state = activeForms.get(chatId);
    if (state) {
      logger.warn(
        { formType: state.formType, chatId, reason, fieldsCollected: Object.keys(state.collectedData).length },
        'Form cancelled'
      );
      activeForms.delete(chatId);
    }
    return state;
  }

  /**
   * Check if form is active for chat
   */
  hasActiveForm(chatId: string): boolean {
    return this.getForm(chatId) !== undefined;
  }
}

export const formStateManager = new FormStateManager();
```

---

### Form Validation

**File**: `src/handlers/forms/form-validator.ts` (NEW)

```typescript
import { AppError, ErrorCode } from '../../errors/error-codes';
import { USER_MESSAGES } from '../../errors/user-messages';

export interface ValidationResult {
  valid: boolean;
  value: any;
  error?: string;
}

export class FormValidator {
  /**
   * Validate field value based on field type
   */
  static validate(fieldType: string, value: string, pattern?: string): ValidationResult {
    value = value.trim();

    switch (fieldType) {
      case 'email':
        return this.validateEmail(value);

      case 'phone':
        return this.validatePhone(value);

      case 'number':
        return this.validateNumber(value);

      case 'date':
        return this.validateDate(value);

      case 'text':
        return this.validateText(value, pattern);

      case 'choice':
        return { valid: true, value }; // Validated against choices in handler

      case 'confirm':
        return this.validateConfirm(value);

      default:
        return { valid: true, value };
    }
  }

  private static validateEmail(value: string): ValidationResult {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return {
        valid: false,
        value,
        error: 'Invalid email format. Please enter a valid email (e.g., name@example.com).',
      };
    }
    return { valid: true, value: value.toLowerCase() };
  }

  private static validatePhone(value: string): ValidationResult {
    // Remove common formatting characters
    const cleaned = value.replace(/[\s\-\(\)]/g, '');

    // Check if it's a valid phone number (10-15 digits, optional + prefix)
    const phoneRegex = /^\+?\d{10,15}$/;
    if (!phoneRegex.test(cleaned)) {
      return {
        valid: false,
        value,
        error: 'Invalid phone number. Please enter a valid phone number (e.g., +1234567890 or 1234567890).',
      };
    }

    return { valid: true, value: cleaned };
  }

  private static validateNumber(value: string): ValidationResult {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return {
        valid: false,
        value,
        error: 'Invalid number. Please enter a numeric value.',
      };
    }
    return { valid: true, value: num };
  }

  private static validateDate(value: string): ValidationResult {
    // Support MM/DD/YYYY or YYYY-MM-DD
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return {
        valid: false,
        value,
        error: 'Invalid date. Please enter a valid date (e.g., 01/15/2025 or 2025-01-15).',
      };
    }
    return { valid: true, value: date.toISOString().split('T')[0] }; // Return YYYY-MM-DD
  }

  private static validateText(value: string, pattern?: string): ValidationResult {
    if (pattern) {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        return {
          valid: false,
          value,
          error: `Invalid format. Please match the required pattern.`,
        };
      }
    }
    return { valid: true, value };
  }

  private static validateConfirm(value: string): ValidationResult {
    const normalized = value.toLowerCase();
    if (normalized === 'yes' || normalized === 'y' || normalized === 'confirm') {
      return { valid: true, value: true };
    }
    if (normalized === 'no' || normalized === 'n' || normalized === 'cancel') {
      return { valid: true, value: false };
    }
    return {
      valid: false,
      value,
      error: 'Please respond with "yes" or "no".',
    };
  }
}
```

---

### Form Handler

**File**: `src/handlers/forms.ts` (NEW)

```typescript
import { Message } from 'whatsapp-web.js';
import { logger } from '../logging/logger';
import { formStateManager } from './forms/form-state';
import { FormValidator } from './forms/form-validator';
import { formRepository } from '../repositories/form-repository';
import { AppError, ErrorCode } from '../errors/error-codes';
import { USER_MESSAGES } from '../errors/user-messages';

/**
 * Handle form-related commands and messages
 */
export async function handleFormCommand(message: Message, args: string[]) {
  const chatId = message.from;
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'cancel':
      return handleFormCancel(message);

    case 'restart':
      return handleFormRestart(message, args.slice(1));

    default:
      // /form <form_type> - start a form
      const formType = subcommand;
      return handleFormStart(message, formType);
  }
}

/**
 * Start a new form
 */
async function handleFormStart(message: Message, formType: string) {
  const chatId = message.from;

  if (!formType) {
    return message.reply('❌ Usage: /form <form_type>\n\nExample: /form order_tracking');
  }

  try {
    // Check if form already active
    if (formStateManager.hasActiveForm(chatId)) {
      return message.reply('❌ You already have an active form. Type "cancel" to cancel it or complete it first.');
    }

    // Load form definition
    const formDef = await formRepository.getFormDefinition(formType);
    if (!formDef || !formDef.isActive) {
      throw new AppError(
        ErrorCode.FORM_VALIDATION_ERROR,
        `Form type "${formType}" not found.`,
        { formType }
      );
    }

    // Start form session
    formStateManager.startForm(chatId, formType);

    // Ask first question
    const firstField = formDef.fields[0];
    await message.reply(`📋 ${firstField.prompt}`);
  } catch (error) {
    if (error instanceof AppError) {
      logger.error({ errorCode: error.code, formType, chatId }, error.userMessage);
      await message.reply(error.userMessage);
    } else {
      logger.error({ error, formType, chatId }, 'Unexpected error starting form');
      await message.reply('❌ An unexpected error occurred. Please try again.');
    }
  }
}

/**
 * Process user response to form field
 */
export async function handleFormResponse(message: Message) {
  const chatId = message.from;
  const userInput = message.body.trim();

  // Check for cancellation
  if (userInput.toLowerCase() === 'cancel') {
    return handleFormCancel(message);
  }

  const formState = formStateManager.getForm(chatId);
  if (!formState) {
    return; // No active form
  }

  try {
    // Load form definition
    const formDef = await formRepository.getFormDefinition(formState.formType);
    if (!formDef) {
      throw new AppError(ErrorCode.FORM_VALIDATION_ERROR, 'Form definition not found.', { formType: formState.formType });
    }

    const currentField = formDef.fields[formState.currentFieldIndex];

    // Validate input
    const validation = FormValidator.validate(currentField.type, userInput, currentField.pattern);

    if (!validation.valid) {
      // Validation failed
      const retryCount = formStateManager.incrementRetry(chatId);

      if (retryCount >= 3) {
        // Max retries exceeded
        formStateManager.cancelForm(chatId, 'error');
        return message.reply(
          `❌ Maximum retry attempts exceeded for field "${currentField.name}". Form cancelled.\n\nType /form ${formState.formType} to start again.`
        );
      }

      return message.reply(`❌ ${validation.error}\n\nPlease try again (${retryCount}/3).`);
    }

    // Valid input - store it
    formStateManager.setFieldValue(chatId, currentField.name, validation.value);

    // Move to next field or complete form
    formStateManager.nextField(chatId);

    if (formState.currentFieldIndex >= formDef.fields.length) {
      // All fields collected - show confirmation
      return showConfirmation(message, formState, formDef);
    } else {
      // Ask next question
      const nextField = formDef.fields[formState.currentFieldIndex];
      await message.reply(`✅ Got it!\n\n${nextField.prompt}`);
    }
  } catch (error) {
    if (error instanceof AppError) {
      logger.error({ errorCode: error.code, chatId, formType: formState.formType }, error.userMessage);
      await message.reply(error.userMessage);
      formStateManager.cancelForm(chatId, 'error');
    } else {
      logger.error({ error, chatId, formType: formState.formType }, 'Unexpected error processing form response');
      await message.reply('❌ An unexpected error occurred. Form cancelled.');
      formStateManager.cancelForm(chatId, 'error');
    }
  }
}

/**
 * Show confirmation before submitting
 */
async function showConfirmation(message: Message, formState: any, formDef: any) {
  const summary = Object.entries(formState.collectedData)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  await message.reply(`✅ Please confirm:\n\n${summary}\n\nReply "confirm" to submit or "cancel" to cancel.`);

  // Wait for confirmation (handled in next message)
}

/**
 * Cancel active form
 */
async function handleFormCancel(message: Message) {
  const chatId = message.from;
  const formState = formStateManager.cancelForm(chatId, 'user');

  if (!formState) {
    return message.reply('❌ No active form to cancel.');
  }

  logger.info({ formType: formState.formType, chatId }, 'Form cancelled by user');
  await message.reply('✅ Form cancelled.');
}

/**
 * Restart form
 */
async function handleFormRestart(message: Message, args: string[]) {
  const chatId = message.from;

  // Cancel any active form
  formStateManager.cancelForm(chatId, 'user');

  // Start new form
  const formType = args[0];
  return handleFormStart(message, formType);
}

/**
 * Submit form to database
 */
async function submitForm(chatId: string, formState: any, formDef: any) {
  try {
    const submissionId = await formRepository.createSubmission(chatId, formState.formType, formState.collectedData);

    formStateManager.completeForm(chatId);

    logger.info({ formType: formState.formType, chatId, submissionId }, 'Form submitted successfully');

    // Return success message (with placeholders replaced)
    let successMessage = formDef.successMessage;
    Object.entries(formState.collectedData).forEach(([key, value]) => {
      successMessage = successMessage.replace(`{${key}}`, String(value));
    });

    return successMessage;
  } catch (error) {
    logger.error({ error, formType: formState.formType, chatId }, 'Failed to submit form');
    throw new AppError(ErrorCode.FORM_STORAGE_ERROR, USER_MESSAGES[ErrorCode.FORM_STORAGE_ERROR], { chatId });
  }
}
```

---

### Repository Layer

**File**: `src/repositories/form-repository.ts` (NEW)

```typescript
import { prisma } from '../database/prisma';

export class FormRepository {
  /**
   * Get form definition by name
   */
  async getFormDefinition(name: string) {
    return prisma.formDefinition.findUnique({
      where: { name },
    });
  }

  /**
   * Get all active form definitions
   */
  async getAllFormDefinitions() {
    return prisma.formDefinition.findMany({
      where: { isActive: true },
    });
  }

  /**
   * Create form submission
   */
  async createSubmission(chatId: string, formType: string, data: Record<string, any>) {
    const submission = await prisma.formSubmission.create({
      data: {
        chatId,
        formType,
        data,
      },
    });

    return submission.id;
  }

  /**
   * Get submissions for a chat
   */
  async getSubmissionsByChat(chatId: string) {
    return prisma.formSubmission.findMany({
      where: { chatId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Get latest submission by chat and form type
   */
  async getLatestSubmission(chatId: string, formType: string) {
    return prisma.formSubmission.findFirst({
      where: { chatId, formType },
      orderBy: { submittedAt: 'desc' },
    });
  }
}

export const formRepository = new FormRepository();
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/handlers/forms/form-validator.test.ts`

```typescript
import { FormValidator } from '../../../../src/handlers/forms/form-validator';

describe('FormValidator', () => {
  describe('email validation', () => {
    test('should accept valid email', () => {
      const result = FormValidator.validate('email', 'test@example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    test('should reject invalid email', () => {
      const result = FormValidator.validate('email', 'invalid-email');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid email format');
    });
  });

  describe('phone validation', () => {
    test('should accept valid phone', () => {
      const result = FormValidator.validate('phone', '+1234567890');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('+1234567890');
    });

    test('should clean phone formatting', () => {
      const result = FormValidator.validate('phone', '(123) 456-7890');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('1234567890');
    });
  });

  describe('number validation', () => {
    test('should accept valid number', () => {
      const result = FormValidator.validate('number', '42');
      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });

    test('should reject non-numeric', () => {
      const result = FormValidator.validate('number', 'abc');
      expect(result.valid).toBe(false);
    });
  });

  describe('pattern validation', () => {
    test('should validate order number pattern', () => {
      const result = FormValidator.validate('text', 'ORD-12345', '^ORD-\\d{5}$');
      expect(result.valid).toBe(true);
    });

    test('should reject incorrect pattern', () => {
      const result = FormValidator.validate('text', 'ABC-123', '^ORD-\\d{5}$');
      expect(result.valid).toBe(false);
    });
  });
});
```

---

## Environment Variables

No new environment variables needed. Uses existing:
- `DATABASE_URL` (from P0 #3)

---

## Definition of Done

- ✅ All acceptance criteria met (AC 1-15)
- ✅ Database schema migrated successfully (form_submissions, form_definitions tables)
- ✅ **Unit tests pass (>80% coverage per Architecture standards)**
- ✅ **All error codes tested (FORM_VALIDATION_ERROR, FORM_TIMEOUT, FORM_CANCELLED, FORM_STORAGE_ERROR)**
- ✅ **AppError integration tested (all error scenarios use Epic 1 error handling)**
- ✅ **Pino logging verified (all operations logged with structured context)**
- ✅ Integration tests pass (database operations, form flow)
- ✅ E2E tests pass (complete form submission from start to finish)
- ✅ Timeout mechanism tested (forms auto-cancel after 5 minutes)
- ✅ All field types validated (email, phone, number, date, text, choice, confirm)
- ✅ Performance targets met (<100ms validation, <500ms submission)
- ✅ Form abandonment tested (<10% rate in testing)
- ✅ Documentation updated in CLAUDE.md
- ✅ Manual testing: Complete forms with all field types, test validation, test timeout

---

## Files to Create/Modify

### New Files:
- `src/handlers/forms.ts` - Form command handler and flow orchestration
- `src/handlers/forms/form-state.ts` - In-memory form state management
- `src/handlers/forms/form-validator.ts` - Field validation logic
- `src/repositories/form-repository.ts` - Form database operations
- `prisma/migrations/YYYYMMDD_add_forms_tables/migration.sql` - Database migration
- `tests/unit/handlers/forms/form-validator.test.ts` - Validator tests
- `tests/unit/handlers/forms/form-state.test.ts` - State management tests
- `tests/integration/handlers/forms.test.ts` - Form flow tests

### Modified Files:
- `src/handlers/command.ts` - Register /form command
- `src/handlers/message.ts` - Route form responses to form handler
- `prisma/schema.prisma` - Add FormSubmission and FormDefinition models
- `src/errors/error-codes.ts` - Add form error codes (FORM_VALIDATION_ERROR, FORM_TIMEOUT, FORM_CANCELLED, FORM_STORAGE_ERROR)
- `src/errors/user-messages.ts` - Add form error messages
- `CLAUDE.md` - Document form commands and configuration

---

## Notes for Developer

- **Form state is in-memory** - Use Redis for multi-instance deployment
- **Timeout is 5 minutes** - Configurable via constant
- **Max 3 retries per field** - Prevents infinite validation loops
- **Confirmation step optional** - Can be disabled per form in config
- **Group chat privacy** - Forms in group trigger DM to user
- **Form definitions** - Start with hardcoded, migrate to database admin UI later
- **Performance** - State cleanup on timeout prevents memory leaks
- **Testing** - Mock time for timeout tests (Jest fake timers)
