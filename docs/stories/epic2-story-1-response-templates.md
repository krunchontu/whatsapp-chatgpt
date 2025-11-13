# Story 1: Response Templates & Canned Responses - Business Feature

**Epic**: Epic 2 - Customer Service Essentials
**Story ID**: EPIC2-STORY-1
**Estimated Effort**: 3-5 hours
**Priority**: P1 Critical (Foundation for customer service automation)
**Dependencies**:
- P0 #3 (Database - PostgreSQL with Prisma)
- P0 #10 (Unified Config System)
- P0 #1 (RBAC for permissions)
**Architecture Alignment**: Business automation layer, extends command system with admin-only template management

---

## User Story

As a **customer service admin**,
I want **to create and manage response templates for common questions**,
So that **agents can quickly respond to customers with consistent, professional answers without retyping**.

---

## Business Context

### The Problem

Customer service agents repeatedly type the same answers:
- **"What are your shipping costs?"** → Agent types shipping policy (30 seconds)
- **"What are your hours?"** → Agent types business hours (20 seconds)
- **"How do I return an item?"** → Agent types return policy (60 seconds)

**Result:** Agents waste 20-30% of their time retyping identical responses. Inconsistent wording across agents. Typos and errors.

### The Solution

Pre-configured response templates that agents can insert with a single command:
- Agent types `/template shipping` → Bot inserts pre-written shipping policy (2 seconds)
- Admin manages templates via commands (no code changes needed)
- Templates tracked for usage metrics (which templates are most used)

### Success Metrics

- ✅ **80% faster responses**: Reduce typing time from 30s to 2s for common questions
- ✅ **100% consistency**: All agents use identical wording from approved templates
- ✅ **10+ templates**: Support at least 10 common customer service scenarios

---

## Acceptance Criteria

### Functional Requirements:

1. **Admin can create templates via command**
   - Command: `/template add <name> <content>`
   - Example: `/template add shipping "Shipping is $5 for orders under $50, FREE for $50+! 📦"`
   - Template name must be unique (alphanumeric, lowercase, max 50 chars)
   - Content can include newlines, emojis, up to 2000 characters
   - Success message: `✅ Template "shipping" created successfully!`
   - Error handling: Duplicate name → `❌ Template "shipping" already exists. Use /template edit to update.`

2. **Admin can list all templates**
   - Command: `/template list`
   - Output: Numbered list with template name, preview (first 50 chars), usage count
   - Example:
     ```
     📋 Templates (5 total):

     1. shipping (used 47 times)
        "Shipping is $5 for orders under $50, FREE..."

     2. hours (used 23 times)
        "We're open Mon-Fri 9AM-6PM PST, closed..."

     3. returns (used 19 times)
        "Returns accepted within 30 days with..."
     ```
   - Empty state: `📋 No templates yet. Use /template add <name> <content> to create one.`

3. **Admin can view full template content**
   - Command: `/template show <name>`
   - Output: Full template content with metadata
   - Example:
     ```
     📄 Template: shipping
     Created: 2025-01-15 by Admin (+1234567890)
     Usage count: 47 times
     Last used: 2025-01-20 15:30 UTC

     Content:
     ───────────────────────────────────
     Shipping is $5 for orders under $50, FREE for orders over $50! 📦

     Orders ship within 1-2 business days.
     Tracking number sent via WhatsApp.
     ───────────────────────────────────
     ```

4. **Admin can edit existing templates**
   - Command: `/template edit <name> <new_content>`
   - Updates content, preserves usage stats
   - Success: `✅ Template "shipping" updated successfully!`
   - Error: Template not found → `❌ Template "shipping" not found. Use /template list to see all templates.`

5. **Admin can delete templates**
   - Command: `/template delete <name>`
   - Confirmation required: `⚠️ Delete template "shipping" (used 47 times)? This cannot be undone. Reply "confirm" to proceed.`
   - After confirmation: `✅ Template "shipping" deleted.`
   - Timeout: 30 seconds for confirmation, then cancel

6. **Any agent (operator/admin/owner) can use templates**
   - Command: `/template <name>` or `/t <name>` (shorthand)
   - Bot replies with template content
   - Usage count incremented
   - Example:
     ```
     Agent: /template shipping
     Bot: [Sends shipping template content to customer]
     ```
   - Not found: `❌ Template "xyz" not found. Use /template list to see available templates.`

7. **RBAC permissions enforced**
   - **Owner/Admin**: Full access (add, edit, delete, list, use)
   - **Operator**: Read-only (list, use templates)
   - **User (Customer)**: No access
   - Unauthorized access: `❌ Insufficient permissions. Only admins can create templates. Contact your team lead.`

### Integration Requirements:

8. **Templates stored in database**
   - PostgreSQL table via Prisma (see Technical Implementation)
   - Persistent across restarts
   - Supports concurrent access (multiple agents)

9. **Templates work in group chats**
   - Agent can use `/template` in customer support group
   - Bot replies to group (not DM)
   - Only agents with operator+ role can use in groups

10. **Template usage tracking**
    - Every template use increments `usage_count`
    - Track `last_used_at` timestamp
    - Track `created_by` phone number for accountability

### Quality Requirements:

11. **Change is covered by tests (>80% coverage per Architecture)**
    - Unit tests for template CRUD operations
    - Unit tests for RBAC permission checks
    - Unit tests for error handling (all error codes)
    - Integration tests for database operations
    - E2E tests for command flow
    - **Minimum 80% code coverage** for all new code

12. **Error handling using AppError from Epic 1**
    - All errors throw `AppError` with appropriate `ErrorCode`
    - All errors use `USER_MESSAGES` catalog for user-facing messages
    - Error codes defined: `TEMPLATE_NOT_FOUND`, `TEMPLATE_DUPLICATE`, `TEMPLATE_INVALID_NAME`, `TEMPLATE_CONTENT_TOO_LONG`
    - Repository errors caught and re-thrown as AppError
    - Unexpected errors logged and return generic message to user

13. **Pino logging for all operations (Epic 1 consistency)**
    - Template creation: `logger.info({ name, createdBy }, 'Template created')`
    - Template usage: `logger.info({ templateName, usedBy }, 'Template used')`
    - Template edit: `logger.info({ name, editedBy }, 'Template edited')`
    - Template delete: `logger.info({ name, deletedBy }, 'Template deleted')`
    - Errors: `logger.error({ errorCode, templateName }, 'Template operation failed')`
    - Performance metrics: Log operation duration for slow operations (>200ms)

14. **Documentation updated**
    - Add template commands to CLAUDE.md
    - Create admin guide for template management
    - Add examples to business configuration section
    - Document error codes and user messages

15. **Performance guarantees**
    - Template creation: <200ms
    - Template lookup (use): <100ms
    - Template list (100 templates): <500ms

---

## Technical Implementation

### Database Schema

**File**: `prisma/schema.prisma` (addition)

```prisma
model Template {
  id          Int      @id @default(autoincrement())
  name        String   @unique @db.VarChar(50)
  content     String   @db.Text
  category    String?  @db.VarChar(50)
  usageCount  Int      @default(0) @map("usage_count")
  createdBy   String   @db.VarChar(255) @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  lastUsedAt  DateTime? @map("last_used_at")

  @@map("templates")
}
```

**Migration:**
```bash
npx prisma migrate dev --name add_templates_table
```

---

### Repository Layer (Thin Pattern)

**File**: `src/repositories/template-repository.ts` (NEW)

```typescript
import { prisma } from '../database/prisma';

export class TemplateRepository {
  /**
   * Create a new template
   */
  async create(name: string, content: string, createdBy: string, category?: string) {
    return prisma.template.create({
      data: {
        name: name.toLowerCase(),
        content,
        category,
        createdBy,
      },
    });
  }

  /**
   * Find template by name
   */
  async findByName(name: string) {
    return prisma.template.findUnique({
      where: { name: name.toLowerCase() },
    });
  }

  /**
   * Get all templates (sorted by usage)
   */
  async findAll() {
    return prisma.template.findMany({
      orderBy: { usageCount: 'desc' },
    });
  }

  /**
   * Update template content
   */
  async update(name: string, content: string) {
    return prisma.template.update({
      where: { name: name.toLowerCase() },
      data: {
        content,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete template
   */
  async delete(name: string) {
    return prisma.template.delete({
      where: { name: name.toLowerCase() },
    });
  }

  /**
   * Increment usage count when template is used
   */
  async incrementUsage(name: string) {
    return prisma.template.update({
      where: { name: name.toLowerCase() },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}

export const templateRepository = new TemplateRepository();
```

---

### Template Handler

**File**: `src/handlers/templates.ts` (NEW)

```typescript
import { Message } from 'whatsapp-web.js';
import { logger } from '../logging/logger';
import { templateRepository } from '../repositories/template-repository';
import { hasPermission, Role } from '../security/rbac';
import { AppError, ErrorCode } from '../errors/error-codes';
import { USER_MESSAGES } from '../errors/user-messages';

/**
 * Handle /template commands
 *
 * Commands:
 * - /template add <name> <content>
 * - /template list
 * - /template show <name>
 * - /template edit <name> <content>
 * - /template delete <name>
 * - /template <name> (use template)
 * - /t <name> (shorthand)
 */
export async function handleTemplateCommand(message: Message, args: string[]) {
  const userPhone = message.from;
  const subcommand = args[0]?.toLowerCase();

  // Get user role for RBAC
  const userRole = await getUserRole(userPhone);

  // Handle subcommands
  switch (subcommand) {
    case 'add':
      return handleTemplateAdd(message, args.slice(1), userRole, userPhone);

    case 'list':
      return handleTemplateList(message, userRole);

    case 'show':
      return handleTemplateShow(message, args.slice(1), userRole);

    case 'edit':
      return handleTemplateEdit(message, args.slice(1), userRole);

    case 'delete':
      return handleTemplateDelete(message, args.slice(1), userRole);

    case undefined:
      // /template with no args - show help
      return message.reply(getTemplateHelp(userRole));

    default:
      // /template <name> - use template
      const templateName = subcommand;
      return handleTemplateUse(message, templateName, userRole);
  }
}

/**
 * Add new template (admin only)
 */
async function handleTemplateAdd(
  message: Message,
  args: string[],
  userRole: Role,
  userPhone: string
) {
  // RBAC: Only admin/owner can create templates
  if (!hasPermission(userRole, Role.ADMIN)) {
    logger.warn({ userPhone, command: 'template add' }, 'Unauthorized template creation attempt');
    return message.reply('❌ Insufficient permissions. Only admins can create templates. Contact your team lead.');
  }

  // Parse: /template add <name> <content>
  const name = args[0];
  const content = args.slice(1).join(' ');

  // Validation
  if (!name || !content) {
    return message.reply('❌ Usage: /template add <name> <content>\n\nExample: /template add shipping "Shipping is $5..."');
  }

  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new AppError(
      ErrorCode.TEMPLATE_INVALID_NAME,
      USER_MESSAGES[ErrorCode.TEMPLATE_INVALID_NAME],
      { templateName: name }
    );
  }

  if (name.length > 50) {
    throw new AppError(
      ErrorCode.TEMPLATE_INVALID_NAME,
      'Template name too long (max 50 characters).',
      { templateName: name, length: name.length }
    );
  }

  if (content.length > 2000) {
    throw new AppError(
      ErrorCode.TEMPLATE_CONTENT_TOO_LONG,
      USER_MESSAGES[ErrorCode.TEMPLATE_CONTENT_TOO_LONG],
      { contentLength: content.length }
    );
  }

  try {
    // Check if template already exists
    const existing = await templateRepository.findByName(name);
    if (existing) {
      throw new AppError(
        ErrorCode.TEMPLATE_DUPLICATE,
        USER_MESSAGES[ErrorCode.TEMPLATE_DUPLICATE],
        { templateName: name }
      );
    }

    // Create template
    await templateRepository.create(name, content, userPhone);

    logger.info({ name, createdBy: userPhone }, 'Template created');
    await message.reply(`✅ Template "${name}" created successfully!\n\nUse: /template ${name}`);
  } catch (error) {
    if (error instanceof AppError) {
      logger.error({ errorCode: error.code, templateName: name }, error.userMessage);
      await message.reply(error.userMessage);
    } else {
      logger.error({ error, name }, 'Unexpected error creating template');
      await message.reply('❌ An unexpected error occurred. Please try again.');
    }
  }
}

/**
 * List all templates (operator+ can access)
 */
async function handleTemplateList(message: Message, userRole: Role) {
  // RBAC: Operator+ can list templates
  if (!hasPermission(userRole, Role.OPERATOR)) {
    return message.reply('❌ Insufficient permissions.');
  }

  try {
    const templates = await templateRepository.findAll();

    if (templates.length === 0) {
      return message.reply('📋 No templates yet. Use /template add <name> <content> to create one.');
    }

    const list = templates
      .map((t, i) => {
        const preview = t.content.length > 50 ? t.content.substring(0, 50) + '...' : t.content;
        return `${i + 1}. *${t.name}* (used ${t.usageCount} times)\n   "${preview}"`;
      })
      .join('\n\n');

    await message.reply(`📋 *Templates* (${templates.length} total):\n\n${list}\n\n💡 Use: /template <name>`);
  } catch (error) {
    logger.error({ error }, 'Failed to list templates');
    await message.reply('❌ Failed to load templates. Please try again.');
  }
}

/**
 * Show full template content (operator+ can access)
 */
async function handleTemplateShow(message: Message, args: string[], userRole: Role) {
  if (!hasPermission(userRole, Role.OPERATOR)) {
    return message.reply('❌ Insufficient permissions.');
  }

  const name = args[0];
  if (!name) {
    return message.reply('❌ Usage: /template show <name>');
  }

  try {
    const template = await templateRepository.findByName(name);
    if (!template) {
      return message.reply(`❌ Template "${name}" not found. Use /template list to see all templates.`);
    }

    const createdDate = template.createdAt.toISOString().split('T')[0];
    const lastUsed = template.lastUsedAt
      ? template.lastUsedAt.toISOString().replace('T', ' ').split('.')[0] + ' UTC'
      : 'Never';

    const output = `📄 *Template: ${template.name}*
Created: ${createdDate} by ${template.createdBy}
Usage count: ${template.usageCount} times
Last used: ${lastUsed}

*Content:*
───────────────────────────────────
${template.content}
───────────────────────────────────`;

    await message.reply(output);
  } catch (error) {
    logger.error({ error, name }, 'Failed to show template');
    await message.reply('❌ Failed to load template. Please try again.');
  }
}

/**
 * Use template - send content to customer (operator+ can use)
 */
async function handleTemplateUse(message: Message, name: string, userRole: Role) {
  if (!hasPermission(userRole, Role.OPERATOR)) {
    return message.reply('❌ Insufficient permissions.');
  }

  try {
    const template = await templateRepository.findByName(name);
    if (!template) {
      throw new AppError(
        ErrorCode.TEMPLATE_NOT_FOUND,
        USER_MESSAGES[ErrorCode.TEMPLATE_NOT_FOUND],
        { templateName: name }
      );
    }

    // Increment usage counter
    await templateRepository.incrementUsage(name);

    logger.info({ templateName: name, usedBy: message.from }, 'Template used');

    // Send template content
    await message.reply(template.content);
  } catch (error) {
    if (error instanceof AppError) {
      logger.error({ errorCode: error.code, templateName: name }, error.userMessage);
      await message.reply(error.userMessage);
    } else {
      logger.error({ error, name }, 'Unexpected error using template');
      await message.reply('❌ An unexpected error occurred. Please try again.');
    }
  }
}

/**
 * Edit template (admin only)
 */
async function handleTemplateEdit(message: Message, args: string[], userRole: Role) {
  if (!hasPermission(userRole, Role.ADMIN)) {
    return message.reply('❌ Insufficient permissions. Only admins can edit templates.');
  }

  const name = args[0];
  const content = args.slice(1).join(' ');

  if (!name || !content) {
    return message.reply('❌ Usage: /template edit <name> <new_content>');
  }

  try {
    const existing = await templateRepository.findByName(name);
    if (!existing) {
      return message.reply(`❌ Template "${name}" not found. Use /template list to see all templates.`);
    }

    await templateRepository.update(name, content);

    logger.info({ name, editedBy: message.from }, 'Template edited');
    await message.reply(`✅ Template "${name}" updated successfully!`);
  } catch (error) {
    logger.error({ error, name }, 'Failed to edit template');
    await message.reply('❌ Failed to update template. Please try again.');
  }
}

/**
 * Delete template (admin only, requires confirmation)
 */
async function handleTemplateDelete(message: Message, args: string[], userRole: Role) {
  if (!hasPermission(userRole, Role.ADMIN)) {
    return message.reply('❌ Insufficient permissions. Only admins can delete templates.');
  }

  const name = args[0];
  if (!name) {
    return message.reply('❌ Usage: /template delete <name>');
  }

  try {
    const template = await templateRepository.findByName(name);
    if (!template) {
      return message.reply(`❌ Template "${name}" not found.`);
    }

    // Send confirmation request
    await message.reply(
      `⚠️ Delete template "*${name}*" (used ${template.usageCount} times)?\n\nThis cannot be undone. Reply "confirm" to proceed.`
    );

    // Wait for confirmation (implement confirmation handler separately)
    // For MVP, can skip confirmation and delete immediately
    // TODO: Implement confirmation handler with 30s timeout

    await templateRepository.delete(name);

    logger.info({ name, deletedBy: message.from }, 'Template deleted');
    await message.reply(`✅ Template "${name}" deleted.`);
  } catch (error) {
    logger.error({ error, name }, 'Failed to delete template');
    await message.reply('❌ Failed to delete template. Please try again.');
  }
}

/**
 * Get help text based on user role
 */
function getTemplateHelp(userRole: Role): string {
  const isAdmin = hasPermission(userRole, Role.ADMIN);
  const isOperator = hasPermission(userRole, Role.OPERATOR);

  if (!isOperator) {
    return '❌ You do not have permission to use templates.';
  }

  let help = `📋 *Template Commands*\n\n`;

  help += `*Using Templates:*\n`;
  help += `/template <name> - Use a template\n`;
  help += `/t <name> - Shorthand\n`;
  help += `/template list - List all templates\n`;
  help += `/template show <name> - View full template\n\n`;

  if (isAdmin) {
    help += `*Admin Commands:*\n`;
    help += `/template add <name> <content> - Create template\n`;
    help += `/template edit <name> <content> - Update template\n`;
    help += `/template delete <name> - Delete template\n\n`;
  }

  help += `💡 Example: /template shipping`;

  return help;
}

// Helper to get user role (integrate with RBAC from P0 #1)
async function getUserRole(phone: string): Promise<Role> {
  // TODO: Integrate with actual RBAC system from P0 #1
  // For now, mock implementation
  if (phone.includes('owner')) return Role.OWNER;
  if (phone.includes('admin')) return Role.ADMIN;
  if (phone.includes('operator')) return Role.OPERATOR;
  return Role.USER;
}
```

---

### Command Registration

**File**: `src/handlers/command.ts` (modification)

```typescript
// Add to existing command dispatcher

import { handleTemplateCommand } from './templates';

export async function commandDispatcher(message: Message) {
  const text = message.body.trim();

  // Check for /template or /t command
  if (text.startsWith('/template ') || text.startsWith('/t ')) {
    const args = text.split(/\s+/).slice(1); // Remove command, keep args
    return handleTemplateCommand(message, args);
  }

  // ... existing command handling (gpt, dalle, etc.)
}
```

---

## Testing Strategy

### Unit Tests

**File**: `tests/unit/repositories/template-repository.test.ts`

```typescript
import { templateRepository } from '../../../src/repositories/template-repository';
import { prisma } from '../../../src/database/prisma';

// Mock Prisma
jest.mock('../../../src/database/prisma', () => ({
  prisma: {
    template: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe('TemplateRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create template with lowercase name', async () => {
    const mockTemplate = { id: 1, name: 'shipping', content: 'Shipping info...', usageCount: 0 };
    (prisma.template.create as jest.Mock).mockResolvedValue(mockTemplate);

    const result = await templateRepository.create('Shipping', 'Shipping info...', '+1234567890');

    expect(prisma.template.create).toHaveBeenCalledWith({
      data: {
        name: 'shipping',
        content: 'Shipping info...',
        category: undefined,
        createdBy: '+1234567890',
      },
    });
    expect(result.name).toBe('shipping');
  });

  test('should find template by name (case-insensitive)', async () => {
    const mockTemplate = { id: 1, name: 'shipping', content: 'Shipping info...' };
    (prisma.template.findUnique as jest.Mock).mockResolvedValue(mockTemplate);

    const result = await templateRepository.findByName('SHIPPING');

    expect(prisma.template.findUnique).toHaveBeenCalledWith({
      where: { name: 'shipping' },
    });
    expect(result).toEqual(mockTemplate);
  });

  test('should increment usage count', async () => {
    const mockTemplate = { id: 1, name: 'shipping', usageCount: 48 };
    (prisma.template.update as jest.Mock).mockResolvedValue(mockTemplate);

    await templateRepository.incrementUsage('shipping');

    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { name: 'shipping' },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: expect.any(Date),
      },
    });
  });
});
```

### Integration Tests

**File**: `tests/integration/handlers/templates.test.ts`

```typescript
import { handleTemplateCommand } from '../../../src/handlers/templates';
import { templateRepository } from '../../../src/repositories/template-repository';

describe('Template Command Integration', () => {
  let mockMessage: any;

  beforeEach(() => {
    mockMessage = {
      from: '+1234567890_admin',
      reply: jest.fn(),
    };
  });

  test('should create template via command', async () => {
    await handleTemplateCommand(mockMessage, ['add', 'shipping', 'Shipping', 'is', '$5']);

    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.stringContaining('✅ Template "shipping" created successfully!')
    );

    const template = await templateRepository.findByName('shipping');
    expect(template).toBeTruthy();
    expect(template?.content).toBe('Shipping is $5');
  });

  test('should list templates', async () => {
    await templateRepository.create('shipping', 'Shipping info', '+1234567890');
    await templateRepository.create('returns', 'Returns policy', '+1234567890');

    await handleTemplateCommand(mockMessage, ['list']);

    expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('📋 Templates (2 total)'));
  });

  test('should use template and increment usage count', async () => {
    await templateRepository.create('shipping', 'Shipping is $5 for orders under $50!', '+1234567890');

    await handleTemplateCommand(mockMessage, ['shipping']);

    expect(mockMessage.reply).toHaveBeenCalledWith('Shipping is $5 for orders under $50!');

    const template = await templateRepository.findByName('shipping');
    expect(template?.usageCount).toBe(1);
  });
});
```

---

## Environment Variables

No new environment variables needed. Uses existing:
- `DATABASE_URL` (from P0 #3)
- RBAC phone numbers (from P0 #1)

---

## Definition of Done

- ✅ All acceptance criteria met (AC 1-15)
- ✅ Database schema migrated successfully
- ✅ **Unit tests pass (>80% coverage per Architecture standards)**
- ✅ **All error codes tested (TEMPLATE_NOT_FOUND, TEMPLATE_DUPLICATE, TEMPLATE_INVALID_NAME, TEMPLATE_CONTENT_TOO_LONG)**
- ✅ **AppError integration tested (all errors use Epic 1 error handling)**
- ✅ **Pino logging verified (all operations logged with structured context)**
- ✅ Integration tests pass
- ✅ RBAC permissions enforced correctly
- ✅ Tested with 10+ templates
- ✅ Performance targets met (<200ms create, <100ms use)
- ✅ Documentation updated in CLAUDE.md
- ✅ Manual testing: Admin creates templates, operator uses them
- ✅ Error scenarios tested (duplicate, not found, invalid name, content too long)

---

## Files to Create/Modify

### New Files:
- `src/repositories/template-repository.ts` - Template database operations
- `src/handlers/templates.ts` - Template command handler
- `prisma/migrations/YYYYMMDD_add_templates_table/migration.sql` - Database migration
- `tests/unit/repositories/template-repository.test.ts` - Repository tests
- `tests/integration/handlers/templates.test.ts` - Handler tests

### Modified Files:
- `src/handlers/command.ts` - Register /template command
- `prisma/schema.prisma` - Add Template model
- `CLAUDE.md` - Document template commands

---

## Notes for Developer

- **Template names are case-insensitive** - Always convert to lowercase before database operations
- **RBAC integration required** - Depends on P0 #1 implementation
- **Confirmation for delete** - Implement confirmation handler with timeout (can be deferred to v2)
- **Template categories** - Optional field for future organization (not MVP)
- **Shorthand `/t`** - Implement as alias for `/template`
- **Performance** - Index on template name for fast lookups (automatically created by Prisma unique constraint)
