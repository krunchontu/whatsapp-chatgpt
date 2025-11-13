# Story 5: Human Escalation & Agent Handoff - Business Feature

**Epic**: Epic 2 - Customer Service Essentials
**Story ID**: EPIC2-STORY-5
**Estimated Effort**: 8-13 hours
**Priority**: P1 Critical (Safety net for complex issues)
**Dependencies**:
- P0 #6 (Job Queue - BullMQ for escalation notifications)
- P0 #1 (RBAC - Operator role for agents)
- P1 #11 (Per-Chat Memory - Conversation context for handoff)
- Epic 1 (Error Handling - AppError, ErrorCode, USER_MESSAGES)
- Epic 2 Stories 1-4 (Templates, Forms, FAQ, Business Hours)
**Architecture Alignment**: Implements P1 #16 (Group Admin Copilot), human-AI collaboration

---

## User Story

As a **customer with a complex issue**,
I want **to be escalated to a human agent when the bot can't help**,
So that **I get the support I need without frustration**.

As a **customer service agent**,
I want **to be notified of escalations with full context**,
So that **I can quickly help customers without asking them to repeat information**.

---

## Business Context

**Problem:**
- Bot can't handle complex issues (refunds, complaints, technical problems)
- Customers get frustrated repeating themselves
- No visibility into escalations (agents don't know who needs help)

**Solution:**
- Auto-detect escalation triggers (keywords, frustrated tone, explicit request)
- Transfer conversation to human agent with full context
- Agent sees conversation history, customer info, previous interactions
- Agent can resolve and hand back to bot

**Example:**
```
Customer: "This is ridiculous! I want a refund NOW!"

Bot: [Detects frustrated tone + "refund" keyword]
Bot: "I understand this is frustrating. Let me connect you with Sarah from our support team who can help resolve this.

     Transferring to Sarah..."

[Escalation created, Sarah notified]

Sarah (Agent): "Hi! I'm Sarah from support. I've reviewed your conversation and I apologize for the inconvenience. Let me help you with that refund..."
```

**Success Metrics:**
- ✅ **95% escalation accuracy**: Escalate when needed, don't over-escalate
- ✅ **<5min agent response**: Agents notified and respond quickly
- ✅ **100% context transfer**: Agents see full conversation history
- ✅ **80% first-contact resolution**: Issues resolved in first agent interaction

---

## Acceptance Criteria

### Functional Requirements:

1. **Automatic escalation trigger detection**
   - **Keyword triggers**: "refund", "manager", "speak to human", "cancel order", "complaint"
   - **Sentiment analysis**: Detect frustrated/angry tone using GPT
   - **Explicit request**: User says "I want to talk to someone" or "escalate"
   - **Bot confidence**: After 3 failed FAQ/form attempts, auto-escalate
   - **Timeout**: If conversation >10 minutes with no resolution, suggest escalation

2. **Manual escalation command**
   - User command: `/escalate` or customer types "escalate"
   - Agent command: `/escalate <chatId>` - Agent forces escalation for specific chat

3. **Escalation creation and storage**
   - Create escalation record in database: chatId, customerPhone, reason, status (pending/assigned/resolved), context (JSON)
   - Context includes: conversation history (last 10 messages), customer info (from forms), previous FAQ matches
   - Escalation assigned unique ID for tracking

4. **Agent notification**
   - Push notification to available agents (operator role)
   - Notification methods:
     - WhatsApp group: Post escalation to agent group with [Accept] button
     - Webhook: POST to external system (e.g., Slack, Teams, custom dashboard)
     - SMS/Email: Fallback if no agent responds in 5 minutes
   - Include summary: Customer name, issue type, urgency level

5. **Agent assignment**
   - First agent to click [Accept] is assigned
   - Other agents notified: "Escalation #123 assigned to Sarah"
   - Round-robin auto-assignment if no agent accepts in 2 minutes

6. **Conversation handoff to agent**
   - Bot stops responding to customer
   - Agent messages sent directly to customer via WhatsApp
   - Customer sees: "You're now chatting with Sarah (Support Agent)"
   - Agent has access to conversation history and customer context

7. **Agent interface**
   - **Option A (MVP)**: Agent uses WhatsApp directly, bot relays messages
   - **Option B (Future)**: Web dashboard with chat interface
   - Agent can:
     - View conversation history
     - See customer info (forms, previous tickets)
     - Send messages to customer
     - Use templates (/template in agent chat)
     - Mark escalation as resolved

8. **Escalation resolution**
   - Agent command: `/resolve <escalationId> <note>`
   - Updates escalation status to "resolved"
   - Logs resolution note and time
   - Bot resumes normal operation for customer
   - Customer sees: "Your issue has been resolved. I'm back to assist you!"

9. **Escalation SLA tracking**
   - Track time from creation to agent assignment
   - Track time from assignment to resolution
   - Alert if SLA exceeded (configurable, default: 15 min assignment, 60 min resolution)
   - Log all SLA breaches for reporting

### Integration Requirements:

10. **Escalation integrated into message flow**
    - Check escalation triggers in message handler (after business hours check)
    - If active escalation exists for chat: Route to agent, not bot
    - If escalation resolved: Resume normal bot flow

11. **Conversation context from P1 #11**
    - Use per-chat memory to retrieve conversation history
    - Include in escalation context for agent visibility

12. **Works with all previous stories**
    - FAQ failed → suggest escalation: "I couldn't find an answer. Would you like to speak with our team?"
    - Form abandoned → escalate: "Having trouble? Let me connect you with an agent."
    - Template not helpful → escalate

### Quality Requirements:

13. **Error handling using AppError from Epic 1**
    - Error codes: `ESCALATION_NO_AGENT`, `ESCALATION_CREATION_ERROR`, `ESCALATION_HANDOFF_ERROR`
    - No agent available: Queue escalation, notify customer of wait time
    - Notification failure: Log error, fall back to next notification method

14. **Pino logging for all operations (Epic 1 consistency)**
    - Trigger detected: `logger.info({ chatId, trigger, reason }, 'Escalation triggered')`
    - Escalation created: `logger.info({ escalationId, chatId, reason }, 'Escalation created')`
    - Agent assigned: `logger.info({ escalationId, agentPhone }, 'Agent assigned')`
    - Resolved: `logger.info({ escalationId, resolutionTime, note }, 'Escalation resolved')`
    - SLA breach: `logger.warn({ escalationId, slaBreach }, 'SLA exceeded')`

15. **Tests (>80% coverage)**
    - Unit tests for trigger detection (keywords, sentiment)
    - Unit tests for agent assignment logic (round-robin, manual)
    - Integration tests for escalation flow (create, assign, resolve)
    - E2E test for complete escalation journey

16. **Performance**
    - Trigger detection: <500ms
    - Escalation creation: <1s
    - Agent notification: <5s
    - Context retrieval: <2s (for 50-message history)

---

## Technical Implementation

### Database Schema

```prisma
model Escalation {
  id             String   @id @default(uuid())
  chatId         String   @map("chat_id") @db.VarChar(255)
  customerPhone  String   @map("customer_phone") @db.VarChar(50)
  reason         String   @db.VarChar(255)
  trigger        String?  @db.VarChar(100) // What triggered escalation
  status         String   @default("pending") @db.VarChar(20) // pending, assigned, resolved
  assignedAgent  String?  @map("assigned_agent") @db.VarChar(255)
  context        Json     // Conversation history, customer info
  resolutionNote String?  @map("resolution_note") @db.Text
  createdAt      DateTime @default(now()) @map("created_at")
  assignedAt     DateTime? @map("assigned_at")
  resolvedAt     DateTime? @map("resolved_at")
  slaBreached    Boolean  @default(false) @map("sla_breached")

  @@index([chatId])
  @@index([status])
  @@index([assignedAgent])
  @@map("escalations")
}
```

### Escalation Trigger Detection

```typescript
// src/services/escalation-detector.ts
import { Message } from 'whatsapp-web.js';
import { logger } from '../logging/logger';

interface TriggerResult {
  shouldEscalate: boolean;
  reason: string;
  trigger: string;
}

export class EscalationDetector {
  // Escalation keywords
  private static KEYWORDS = [
    'refund', 'manager', 'supervisor', 'speak to human', 'talk to person',
    'cancel order', 'complaint', 'unacceptable', 'furious', 'angry',
    'terrible', 'awful', 'worst', 'ridiculous'
  ];

  /**
   * Detect if message should trigger escalation
   */
  static async detect(message: Message, conversationHistory: any[]): Promise<TriggerResult> {
    const text = message.body.toLowerCase();

    // 1. Check explicit escalation request
    if (text.includes('/escalate') || text === 'escalate') {
      return { shouldEscalate: true, reason: 'User requested escalation', trigger: 'explicit' };
    }

    // 2. Check keywords
    const matchedKeyword = this.KEYWORDS.find(kw => text.includes(kw));
    if (matchedKeyword) {
      return { shouldEscalate: true, reason: `Keyword detected: "${matchedKeyword}"`, trigger: 'keyword' };
    }

    // 3. Check sentiment (using GPT)
    const sentiment = await this.analyzeSentiment(text);
    if (sentiment === 'frustrated' || sentiment === 'angry') {
      return { shouldEscalate: true, reason: 'Frustrated tone detected', trigger: 'sentiment' };
    }

    // 4. Check conversation length (>10 messages without resolution)
    if (conversationHistory.length > 10) {
      const lastBot Message = conversationHistory[conversationHistory.length - 1];
      if (!lastBotMessage.resolved) {
        return { shouldEscalate: true, reason: 'Long conversation without resolution', trigger: 'timeout' };
      }
    }

    return { shouldEscalate: false, reason: '', trigger: '' };
  }

  /**
   * Analyze message sentiment using GPT
   */
  private static async analyzeSentiment(text: string): Promise<'neutral' | 'frustrated' | 'angry'> {
    // Use GPT to classify sentiment
    const prompt = `Classify the sentiment of this customer message as either "neutral", "frustrated", or "angry":\n\n"${text}"\n\nSentiment:`;

    // ... call GPT API ...
    // For brevity, simplified implementation

    return 'neutral';
  }
}
```

### Escalation Service

```typescript
// src/services/escalation-service.ts
import { prisma } from '../database/prisma';
import { conversationMemory } from '../services/conversation-memory'; // P1 #11
import { notifyAgents } from './agent-notification';
import { logger } from '../logging/logger';
import { AppError, ErrorCode } from '../errors/error-codes';
import { USER_MESSAGES } from '../errors/user-messages';

export class EscalationService {
  /**
   * Create escalation
   */
  async create(chatId: string, customerPhone: string, reason: string, trigger: string) {
    // Retrieve conversation context
    const history = await conversationMemory.getHistory(chatId, 10);
    const customerInfo = await this.getCustomerInfo(chatId); // From forms, previous tickets

    const escalation = await prisma.escalation.create({
      data: {
        chatId,
        customerPhone,
        reason,
        trigger,
        status: 'pending',
        context: {
          history,
          customerInfo,
        },
      },
    });

    logger.info({ escalationId: escalation.id, chatId, reason, trigger }, 'Escalation created');

    // Notify available agents
    try {
      await notifyAgents(escalation);
    } catch (error) {
      logger.error({ error, escalationId: escalation.id }, 'Failed to notify agents');
      throw new AppError(
        ErrorCode.ESCALATION_CREATION_ERROR,
        USER_MESSAGES[ErrorCode.ESCALATION_CREATION_ERROR]
      );
    }

    return escalation;
  }

  /**
   * Assign agent to escalation
   */
  async assign(escalationId: string, agentPhone: string) {
    const escalation = await prisma.escalation.update({
      where: { id: escalationId },
      data: {
        status: 'assigned',
        assignedAgent: agentPhone,
        assignedAt: new Date(),
      },
    });

    logger.info({ escalationId, agentPhone }, 'Escalation assigned');

    return escalation;
  }

  /**
   * Resolve escalation
   */
  async resolve(escalationId: string, agentPhone: string, note: string) {
    const escalation = await prisma.escalation.update({
      where: { id: escalationId },
      data: {
        status: 'resolved',
        resolutionNote: note,
        resolvedAt: new Date(),
      },
    });

    const resolutionTime = escalation.resolvedAt.getTime() - escalation.createdAt.getTime();

    logger.info({ escalationId, agentPhone, resolutionTime, note }, 'Escalation resolved');

    return escalation;
  }

  /**
   * Get active escalation for chat
   */
  async getActive(chatId: string) {
    return prisma.escalation.findFirst({
      where: {
        chatId,
        status: { in: ['pending', 'assigned'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getCustomerInfo(chatId: string) {
    // Retrieve from form submissions, previous tickets, etc.
    return {};
  }
}

export const escalationService = new EscalationService();
```

### Agent Notification

```typescript
// src/services/agent-notification.ts
import { Escalation } from '@prisma/client';
import { whatsappClient } from '../whatsapp-client';
import { logger } from '../logging/logger';
import { getOperatorPhones } from '../security/rbac';

export async function notifyAgents(escalation: Escalation) {
  const agentPhones = await getOperatorPhones(); // From RBAC

  const message = `🚨 *New Escalation #${escalation.id.substring(0, 8)}*\n\n` +
                  `Customer: ${escalation.customerPhone}\n` +
                  `Reason: ${escalation.reason}\n` +
                  `Trigger: ${escalation.trigger}\n\n` +
                  `Reply "/accept ${escalation.id}" to handle this escalation.`;

  for (const agentPhone of agentPhones) {
    try {
      await whatsappClient.sendMessage(agentPhone, message);
      logger.info({ escalationId: escalation.id, agentPhone }, 'Agent notified');
    } catch (error) {
      logger.error({ error, agentPhone }, 'Failed to notify agent');
    }
  }

  // Also post to agent group if configured
  if (config.agentGroupChatId) {
    await whatsappClient.sendMessage(config.agentGroupChatId, message);
  }
}
```

---

## Definition of Done

- ✅ All acceptance criteria met (AC 1-16)
- ✅ Trigger detection tested (keywords, sentiment, timeout)
- ✅ Agent notification tested (WhatsApp, fallback methods)
- ✅ Assignment logic tested (manual, round-robin)
- ✅ Conversation handoff tested
- ✅ Resolution flow tested
- ✅ SLA tracking tested
- ✅ **Error handling using AppError**
- ✅ **Pino logging verified**
- ✅ **Tests pass (>80% coverage)**
- ✅ Performance targets met
- ✅ Documentation updated

---

## Files to Create/Modify

### New Files:
- `src/services/escalation-detector.ts` - Trigger detection logic
- `src/services/escalation-service.ts` - Escalation CRUD operations
- `src/services/agent-notification.ts` - Agent notification system
- `src/handlers/escalation.ts` - Escalation command handler
- `src/repositories/escalation-repository.ts`
- `tests/unit/services/escalation-detector.test.ts`
- `tests/integration/services/escalation-service.test.ts`

### Modified Files:
- `src/handlers/message.ts` - Add escalation trigger check, route to agent if active escalation
- `prisma/schema.prisma` - Add Escalation model
- `src/errors/error-codes.ts` - Add escalation error codes
- `src/errors/user-messages.ts` - Add escalation error messages
- `CLAUDE.md` - Document escalation system

---

## Notes for Developer

- **Sentiment analysis** - Use GPT-4 for best accuracy, fallback to keyword-only
- **Agent notification** - WhatsApp API rate limits apply (consider batching)
- **Conversation routing** - Use chat state to track active escalations
- **Web dashboard** - Phase 2 feature, MVP uses WhatsApp for agents
- **SLA monitoring** - Background job checks escalations every 5 minutes
- **Round-robin** - Track agent availability and load for fair distribution
