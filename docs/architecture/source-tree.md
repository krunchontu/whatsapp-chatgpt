# Source Tree

### Existing Project Structure (Relevant Parts)

```
whatsapp-chatgpt/
├── src/
│   ├── cli/
│   │   └── ui.ts                   # CLI output utilities
│   ├── commands/                   # Existing command modules
│   │   ├── chat.ts
│   │   ├── general.ts
│   │   ├── gpt.ts
│   │   ├── stable-diffusion.ts
│   │   ├── transcription.ts
│   │   ├── translate.ts
│   │   └── tts.ts
│   ├── config/
│   │   └── puppeteer.ts            # Puppeteer browser args
│   ├── events/                     # WhatsApp event handlers
│   │   ├── authFailure.ts
│   │   ├── authenticated.ts
│   │   ├── browser.ts
│   │   ├── loading.ts
│   │   ├── message.ts              # MESSAGE_RECEIVED, MESSAGE_CREATE
│   │   ├── qr.ts
│   │   └── ready.ts
│   ├── handlers/                   # Business logic
│   │   ├── ai-config.ts            # Runtime AI config (TO BE REFACTORED P0 #10)
│   │   ├── command.ts              # Command dispatcher
│   │   ├── dalle.ts
│   │   ├── gpt.ts
│   │   ├── langchain.ts
│   │   ├── message.ts              # Main message handler
│   │   ├── moderation.ts
│   │   ├── timestamp.ts
│   │   ├── transcription.ts
│   │   └── translate.ts
│   ├── providers/                  # External service integrations
│   │   ├── aws.ts                  # AWS Polly
│   │   ├── browser-agent.ts
│   │   ├── openai.ts               # OpenAI API client
│   │   ├── speech.ts
│   │   ├── whisper-api.ts
│   │   └── whisper-local.ts
│   ├── types/                      # TypeScript types
│   │   ├── ai-config.ts
│   │   ├── aws-polly-engine.ts
│   │   ├── commands.ts
│   │   ├── dalle-config.ts
│   │   ├── transcription-mode.ts
│   │   └── tts-mode.ts
│   ├── config.ts                   # Environment-based config (TO BE MERGED P0 #10)
│   ├── constants.ts
│   ├── index.ts                    # Application entrypoint
│   └── utils.ts
├── docs/                           # User documentation
│   ├── architecture.md             # THIS FILE
│   ├── README.md
│   └── pages/
│       ├── configure-prefix.md
│       ├── docker.md
│       ├── gpt.md
│       ├── installation.md
│       └── ...
├── .env                            # Environment variables (not in git)
├── .env-example
├── docker-compose.yml
├── Dockerfile
├── package.json
└── CLAUDE.md                       # Project overview for AI agents
```

### New File Organization (P0 + P1)

```
whatsapp-chatgpt/
├── src/
│   ├── api/                        # 🆕 P0 #5 HTTP API
│   │   ├── health-server.ts        # Health check endpoints
│   │   └── index.ts
│   ├── commands/                   # Enhanced
│   │   ├── [existing files]
│   │   ├── audit.ts                # 🆕 P0 #4 Audit log viewer
│   │   ├── read.ts                 # 🆕 P1 #14 TTS read command
│   │   └── slash-tools.ts          # 🆕 P1 #12 Slash commands
│   ├── config/                     # 🆕 P0 #10 Unified config
│   │   ├── index.ts                # Main config export
│   │   ├── schema.ts               # Zod validation schema
│   │   ├── runtime-settings.ts     # Non-secret runtime settings
│   │   └── puppeteer.ts            # Existing
│   ├── errors/                     # 🆕 P1 #17 Error taxonomy
│   │   ├── error-codes.ts          # Error code enum
│   │   ├── user-messages.ts        # User-friendly messages
│   │   └── index.ts
│   ├── handlers/                   # Enhanced
│   │   ├── [existing files - refactored to use new logger, config]
│   │   ├── file-iq.ts              # 🆕 P1 #13 File IQ
│   │   ├── group-admin.ts          # 🆕 P1 #16 Group moderation
│   │   ├── memory.ts               # 🆕 P1 #11 Conversation memory
│   │   ├── privacy.ts              # 🆕 P0 #3 /export, /wipe, /retention
│   │   └── usage.ts                # 🆕 P1 #15 /usage metrics
│   ├── logging/                    # 🆕 P0 #2 Structured logging
│   │   ├── logger.ts               # Pino logger instance
│   │   ├── pii-redactor.ts         # PII redaction middleware
│   │   └── log-levels.ts           # Log level configuration
│   ├── middleware/                 # 🆕 P0 #6 Middleware
│   │   ├── rate-limiter.ts         # Rate limiting
│   │   └── usage-tracker.ts        # 🆕 P1 #15 Track API usage
│   ├── queue/                      # 🆕 P0 #6 Job queue
│   │   ├── job-queue.ts            # BullMQ wrapper
│   │   ├── workers.ts              # Job processors
│   │   └── index.ts
│   ├── repositories/               # 🆕 Thin repository pattern
│   │   ├── base-repository.ts      # Abstract base
│   │   ├── audit-repository.ts     # 🆕 P0 #4 Audit logs
│   │   ├── conversation-repository.ts  # 🆕 P1 #11 Conversation memory
│   │   ├── file-repository.ts      # 🆕 P1 #13 File metadata
│   │   ├── moderation-repository.ts    # 🆕 P1 #16 Group settings
│   │   ├── retention-repository.ts # 🆕 P0 #3 Retention policies
│   │   ├── usage-repository.ts     # 🆕 P1 #15 Usage metrics
│   │   └── index.ts
│   ├── security/                   # 🆕 P0 #1, #4 Security
│   │   ├── rbac.ts                 # Role-based access control
│   │   ├── session.ts              # Admin session tokens
│   │   └── audit-logger.ts         # Audit log writer
│   ├── storage/                    # 🆕 P0 #3 Storage utilities
│   │   └── retention-manager.ts    # TTL enforcement
│   ├── utils/                      # Enhanced utilities
│   │   ├── temp-file-manager.ts    # 🆕 P0 #7 Temp file lifecycle
│   │   └── [existing utils.ts]
│   └── [existing files - refactored]
├── prisma/                         # 🆕 Database schema
│   ├── schema.prisma               # Prisma schema definition
│   └── migrations/                 # Migration history
│       ├── 20250124_init_p0/
│       └── 20250131_add_p1_features/
├── docs/
│   ├── architecture.md             # THIS FILE
│   └── migration.md                # 🆕 !config migration guide
├── tests/                          # 🆕 Test suite
│   ├── unit/
│   │   ├── repositories/
│   │   ├── security/
│   │   └── logging/
│   ├── integration/
│   │   ├── database/
│   │   ├── queue/
│   │   └── whatsapp/
│   └── e2e/
│       └── commands/
├── .env
├── .env-example                    # 🔄 Updated with new vars
├── docker-compose.yml              # 🔄 Add postgres, redis services
├── Dockerfile                      # 🔄 Update permissions, add migrations
└── package.json                    # 🔄 Add new dependencies
```

### File Naming Conventions

**Integration Guidelines:**
- **Existing pattern:** kebab-case for files (e.g., `ai-config.ts`)
- **New files:** Follow existing pattern for consistency
- **Repositories:** Suffix with `-repository.ts` (e.g., `audit-repository.ts`)
- **Handlers:** Suffix with `.ts`, descriptive name (e.g., `file-iq.ts`, not `file-handler.ts`)
- **Types:** Match the domain (e.g., `error-codes.ts` for error taxonomy)

**Import/Export Patterns:**
- **Barrel exports:** Use `index.ts` in each directory for clean imports
  ```typescript
  // src/repositories/index.ts
  export * from './audit-repository';
  export * from './conversation-repository';
  export * from './file-repository';

  // Usage
  import { AuditRepository, ConversationRepository } from './repositories';
  ```
- **Named exports preferred:** Avoid default exports for better refactoring

---
