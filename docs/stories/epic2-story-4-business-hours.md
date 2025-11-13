# Story 4: Business Hours & Auto-Responder - Business Feature

**Epic**: Epic 2 - Customer Service Essentials
**Story ID**: EPIC2-STORY-4
**Estimated Effort**: 3-5 hours
**Priority**: P1 High (24/7 customer experience)
**Dependencies**:
- P0 #6 (Job Queue - BullMQ for message queuing)
- P0 #10 (Unified Config System)
- Epic 1 (Error Handling - AppError, ErrorCode, USER_MESSAGES)
**Architecture Alignment**: Business automation, off-hours message handling

---

## User Story

As a **small business owner**,
I want **the bot to auto-respond when I'm closed and queue messages for when I open**,
So that **customers know when to expect a response and don't feel ignored, while I maintain work-life balance**.

---

## Business Context

**Problem:** Customers message 24/7, expect instant responses. Small businesses can't afford 24/7 staffing.

**Solution:** Configure business hours, auto-respond outside hours, queue messages, process when business opens.

**Example:**
```
[Customer messages at 11 PM]
Customer: "I need help!"

Bot: "👋 Thanks for contacting Acme Support!

     We're currently closed. Our business hours:
     Monday-Friday: 9 AM - 6 PM PST
     Saturday-Sunday: Closed

     Your message has been queued. We'll respond when we open at 9 AM PST (in ~10 hours).

     For urgent issues, call: +1-555-123-4567"
```

**Success Metrics:**
- ✅ **100% off-hours coverage**: All messages receive auto-response
- ✅ **Zero lost messages**: All queued messages processed when open
- ✅ **<1min processing**: Queued messages processed within 1 minute of opening

---

## Acceptance Criteria

### Functional Requirements:

1. **Business hours configured per day of week**
   - Database table: `business_hours` (day_of_week, open_time, close_time, timezone, is_active)
   - Admin command: `/hours set monday 9:00 18:00 America/Los_Angeles`
   - Support multiple timezones
   - Holiday override: `/hours override 2025-12-25 closed "Christmas Day"`

2. **Real-time business hours check**
   - Every incoming message checks if business is open
   - Uses timezone from config (not user timezone)
   - Checks current day/time against business_hours table
   - <50ms check time (must be fast)

3. **Auto-responder for off-hours messages**
   - If closed: Send auto-response with hours, estimated response time
   - Auto-response template configurable: `OFF_HOURS_MESSAGE` in config
   - Include emergency contact info (phone number, email) if configured

4. **Message queuing for off-hours**
   - Messages received when closed → queued in BullMQ
   - Queue: `off-hours-messages` with customer info, message content, timestamp
   - Queue persisted (survives bot restart)

5. **Automatic processing when business opens**
   - Scheduled job checks every 5 minutes if business just opened
   - If opened: Process all queued messages from queue
   - Notify agent: "You have 15 queued messages from last night"
   - Rate limit: Process max 50 messages/minute (prevent API overload)

6. **Manual queue processing**
   - Admin command: `/hours process` - Manually process queued messages
   - Shows count: "Processing 15 queued messages..."
   - Progress updates every 5 messages

### Integration Requirements:

7. **Business hours check is first in message flow**
   - Before FAQ, forms, templates, GPT - check hours first
   - If closed: Auto-respond and queue, skip all other handlers
   - If open: Continue normal message flow

8. **Works with all message types**
   - Text messages: Queued with full content
   - Voice messages: Queued (transcription happens when processed)
   - Images/documents: Queued with media reference

### Quality Requirements:

9. **Error handling using AppError from Epic 1**
   - Error codes: `BUSINESS_HOURS_CONFIG_ERROR`, `BUSINESS_HOURS_QUEUE_ERROR`
   - Config validation: Ensure open_time < close_time, valid timezone
   - Queue failures logged and alerted to admin

10. **Pino logging for all operations (Epic 1 consistency)**
    - Hours check: `logger.debug({ isOpen, timezone, currentTime }, 'Business hours check')`
    - Message queued: `logger.info({ chatId, queuedMessageId }, 'Message queued (off-hours)')`
    - Queue processed: `logger.info({ processedCount, duration }, 'Queued messages processed')`
    - Errors: `logger.error({ errorCode }, 'Business hours operation failed')`

11. **Tests (>80% coverage)**
    - Unit tests for timezone logic (test multiple timezones)
    - Unit tests for day-of-week checks (Monday-Sunday)
    - Integration tests for queue operations
    - E2E test for complete off-hours flow

12. **Performance**
    - Hours check: <50ms
    - Queue message: <200ms
    - Process 50 messages: <60s

---

## Technical Implementation

### Database Schema

```prisma
model BusinessHours {
  id         Int      @id @default(autoincrement())
  dayOfWeek  Int      @map("day_of_week") // 0=Sunday, 6=Saturday
  openTime   String   @map("open_time") @db.Time
  closeTime  String   @map("close_time") @db.Time
  timezone   String   @default("UTC") @db.VarChar(50)
  isActive   Boolean  @default(true) @map("is_active")

  @@unique([dayOfWeek])
  @@map("business_hours")
}

model HolidayOverride {
  id      Int      @id @default(autoincrement())
  date    DateTime @db.Date
  isClosed Boolean @map("is_closed")
  reason  String?  @db.VarChar(255)

  @@unique([date])
  @@map("holiday_overrides")
}
```

### Business Hours Service

```typescript
// src/services/business-hours.ts
import { prisma } from '../database/prisma';
import { DateTime } from 'luxon';
import { logger } from '../logging/logger';

export class BusinessHoursService {
  async isOpen(): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return true; // Default to open if not configured

    const now = DateTime.now().setZone(config.timezone);
    const dayOfWeek = now.weekday % 7; // Convert to 0=Sunday

    // Check holiday override
    const holiday = await prisma.holidayOverride.findUnique({
      where: { date: now.toISODate() },
    });
    if (holiday?.isClosed) {
      logger.debug({ date: now.toISODate(), reason: holiday.reason }, 'Closed (holiday)');
      return false;
    }

    // Check business hours
    const hours = await prisma.businessHours.findUnique({
      where: { dayOfWeek },
    });

    if (!hours || !hours.isActive) {
      logger.debug({ dayOfWeek }, 'Closed (no hours configured)');
      return false;
    }

    const currentTime = now.toFormat('HH:mm:ss');
    const isOpen = currentTime >= hours.openTime && currentTime <= hours.closeTime;

    logger.debug({ isOpen, dayOfWeek, currentTime, openTime: hours.openTime, closeTime: hours.closeTime }, 'Business hours check');

    return isOpen;
  }

  async getNextOpenTime(): Promise<DateTime> {
    // Calculate next opening time for auto-response message
    // ... implementation
  }
}

export const businessHoursService = new BusinessHoursService();
```

### Message Queue Integration

```typescript
// src/handlers/business-hours.ts
import { Message } from 'whatsapp-web.js';
import { businessHoursService } from '../services/business-hours';
import { offHoursQueue } from '../queue/off-hours-queue';
import { logger } from '../logging/logger';

export async function checkBusinessHours(message: Message): Promise<boolean> {
  const isOpen = await businessHoursService.isOpen();

  if (!isOpen) {
    const nextOpenTime = await businessHoursService.getNextOpenTime();
    const hoursUntilOpen = nextOpenTime.diff(DateTime.now(), 'hours').hours;

    await message.reply(
      `👋 Thanks for contacting us!\n\n` +
      `We're currently closed. We'll be open ${nextOpenTime.toFormat('EEEE h:mm a zzz')} ` +
      `(in ~${Math.ceil(hoursUntilOpen)} hours).\n\n` +
      `Your message has been queued and we'll respond when we open.\n\n` +
      `For urgent issues, call: ${config.emergencyPhone}`
    );

    // Queue message for processing when open
    await offHoursQueue.add('process-message', {
      chatId: message.from,
      messageBody: message.body,
      hasMedia: message.hasMedia,
      timestamp: Date.now(),
    });

    logger.info({ chatId: message.from }, 'Message queued (off-hours)');

    return false; // Stop processing, message queued
  }

  return true; // Business is open, continue normal flow
}
```

---

## Definition of Done

- ✅ All acceptance criteria met (AC 1-12)
- ✅ Business hours configurable for all days
- ✅ Timezone support tested (3+ timezones)
- ✅ Queue integration tested
- ✅ Auto-response tested
- ✅ **Error handling using AppError**
- ✅ **Pino logging verified**
- ✅ **Tests pass (>80% coverage)**
- ✅ Performance targets met
- ✅ Documentation updated

---

## Files to Create/Modify

### New Files:
- `src/services/business-hours.ts`
- `src/handlers/business-hours.ts`
- `src/queue/off-hours-queue.ts`
- `src/repositories/business-hours-repository.ts`
- `tests/unit/services/business-hours.test.ts`

### Modified Files:
- `src/handlers/message.ts` - Add business hours check first
- `prisma/schema.prisma` - Add BusinessHours and HolidayOverride models
- `src/errors/error-codes.ts` - Add business hours error codes
- `CLAUDE.md` - Document business hours configuration
