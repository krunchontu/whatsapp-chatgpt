# Open Issues & Blockers

**Last Updated:** 2025-11-19
**Week:** Week 2 Day 1

This document tracks all open issues, blockers, and technical debt items discovered during development.

---

## 🔴 Critical Issues (Blockers)

_No critical blockers at this time._

---

## 🟡 High Priority Issues

### Issue #3: Sentry DSN Not Configured
**Status:** 🟡 High Priority (For Production)
**Created:** 2025-11-18 (Week 1 Day 4)
**Component:** Error Tracking
**Impact:** Production error tracking not functional

**Description:**
Sentry integration is complete, but requires `SENTRY_DSN` environment variable to be configured in production.

**Current State:**
- Sentry code implemented and tested (mocked)
- Auto-disables when DSN not set (safe)
- No production configuration yet

**Resolution Required:**
1. Create Sentry project at sentry.io
2. Obtain DSN from Sentry dashboard
3. Add to production `.env`:
   ```bash
   SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/123456
   SENTRY_ENABLED=true
   NODE_ENV=production
   ```
4. Test error capture in staging
5. Verify PII redaction works

**Expected Outcome:**
- Errors automatically captured in Sentry
- PII properly redacted
- Performance monitoring active

**Priority:** 🟡 **High - Required for production deployment**

---

## 🟢 Low Priority Issues

### Issue #4: No ESLint Rule for console.log
**Status:** 🟢 Low Priority
**Created:** 2025-11-18 (Week 1 Day 4)
**Component:** Code Quality
**Impact:** Risk of future console.log statements being added

**Description:**
All console.log statements have been manually replaced with structured logging, but there's no ESLint rule to prevent new console statements from being added.

**Current State:**
- All console statements removed (verified manually)
- CLI UI intentionally uses console.log (src/cli/ui.ts)
- No automated enforcement

**Resolution Suggestions:**
Add to `.eslintrc.js`:
```javascript
rules: {
  'no-console': ['error', {
    allow: ['warn', 'error'] // Only in specific directories
  }]
}
```

Or use a custom rule:
```javascript
rules: {
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.object.name='console'][callee.property.name!=/^(warn|error)$/]",
      message: 'Use logger instead of console.log. See src/lib/logger.ts'
    }
  ]
}
```

**Expected Outcome:**
- ESLint prevents console.log in new code
- CLI UI exceptions properly configured
- CI fails if console.log detected

**Priority:** 🟢 **Low - Nice to have for code quality**

---

### Issue #5: Logger Tests Don't Verify Actual Output
**Status:** 🟢 Low Priority
**Created:** 2025-11-18 (Week 1 Day 4)
**Component:** Testing
**Impact:** Cannot verify log format/content in tests

**Description:**
Current logger tests verify that logging doesn't throw errors, but don't actually inspect the logged output to verify:
- Correct JSON format
- PII redaction actually works
- Log levels are correct
- Context is included

**Current State:**
- Tests use `expect(() => logger.info(...)).not.toThrow()`
- No output capture or inspection
- Assumes Pino works correctly

**Resolution Suggestions:**
1. Mock `process.stdout.write` to capture logs
2. Parse JSON output
3. Verify structure and content

Example:
```typescript
it('should redact apiKey in actual output', () => {
  const logs: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk: any) => {
    logs.push(chunk.toString());
    return true;
  };

  logger.info({ apiKey: 'secret' }, 'Test');

  process.stdout.write = originalWrite;

  const logOutput = JSON.parse(logs[0]);
  expect(logOutput.apiKey).toBe('[REDACTED]');
});
```

**Expected Outcome:**
- Tests verify actual log output
- PII redaction validated
- Log format verified

**Priority:** 🟢 **Low - Can be added in Week 2**

---

### Issue #9: Test Database Foreign Key Violations
**Status:** 🟢 Low Priority
**Created:** 2025-11-19 (Week 2 Day 1)
**Component:** Testing Infrastructure
**Impact:** 27 tests failing due to test data setup issues

**Description:**
After fresh dependency installation and database recreation, 27 repository tests are failing with foreign key constraint violations. Tests attempt to create conversations and usage metrics without first creating the required user records.

**Current State:**
- 229/256 tests passing (89.5% pass rate)
- All core functionality tests passing (logger, Sentry, error handler, cleanup)
- Failures concentrated in:
  - `user.repository.test.ts` - Foreign key issues when creating test data
  - `conversation.repository.test.ts` - Requires valid userId before creating conversations
  - `usage.repository.test.ts` - Requires valid userId before creating usage metrics

**Root Cause:**
Test database was recreated fresh after reinstalling dependencies. Test setup methods need to ensure users are created before attempting to create dependent data (conversations, usage metrics).

**Resolution Steps:**
1. Review test setup in failing test files
2. Ensure `beforeEach` creates users before dependent data
3. Verify foreign key constraints are properly enforced
4. Add test utilities for common setup patterns

**Example Fix:**
```typescript
beforeEach(async () => {
  // Clean up database
  await prisma.usageMetric.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();  // Delete in correct order

  // Create test users FIRST
  testUser1 = await prisma.user.create({
    data: { phoneNumber: '+1234567890' }
  });

  // Now create dependent data
  testConversation = await prisma.conversation.create({
    data: {
      userId: testUser1.id,  // Valid foreign key
      // ...
    }
  });
});
```

**Expected Outcome:**
- 95%+ test pass rate (245+ / 256 tests passing)
- Clean test output without foreign key errors
- Proper test data setup patterns documented

**Priority:** 🟢 **Low - Test infrastructure issue, not code bug**

---

### Issue #10: Dependencies Require Manual Installation After Clone
**Status:** 🟢 Low Priority (Documentation)
**Created:** 2025-11-19 (Week 2 Day 1)
**Component:** Development Environment
**Impact:** Fresh clones require manual setup steps

**Description:**
After cloning the repository, developers need to manually run several setup commands to get the environment ready. This is expected behavior but should be documented clearly in onboarding materials.

**Required Setup Steps:**
1. Install dependencies: `npm install` or `PUPPETEER_SKIP_DOWNLOAD=true npm install`
2. Generate Prisma client: `npx prisma generate`
3. Set up database: `npx prisma db push`
4. Copy environment file: `cp .env-example .env` and configure
5. Run tests: `npm test`

**Current State:**
- Setup steps not documented in README
- Developers may encounter errors if steps are skipped
- Common issue: Puppeteer download failures due to network issues

**Resolution:**
Add to README.md:
```markdown
## Setup

### Prerequisites
- Node.js v22+
- npm or pnpm

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/your-org/whatsapp-chatgpt.git
   cd whatsapp-chatgpt
   \`\`\`

2. Install dependencies (skip Puppeteer browser download):
   \`\`\`bash
   PUPPETEER_SKIP_DOWNLOAD=true npm install
   \`\`\`

3. Generate Prisma client:
   \`\`\`bash
   npx prisma generate
   \`\`\`

4. Set up database:
   \`\`\`bash
   npx prisma db push
   \`\`\`

5. Configure environment:
   \`\`\`bash
   cp .env-example .env
   # Edit .env with your API keys
   \`\`\`

6. Run tests to verify setup:
   \`\`\`bash
   npm test
   \`\`\`
```

**Expected Outcome:**
- Clear onboarding documentation
- New developers can set up environment without issues
- Common pitfalls documented with solutions

**Priority:** 🟢 **Low - Documentation improvement**

---


## 📝 Technical Debt

### TD-1: Missing Type Definitions for handleDeleteConversation Export
**Status:** 📝 Technical Debt
**Created:** 2025-11-18 (Week 1 Day 4)
**Component:** Type Safety
**File:** `src/handlers/gpt.ts`

**Description:**
The file exports `handleDeleteConversation` but this function doesn't exist in that file. It seems to be mistakenly exported from `ai-config.ts`.

**Current Code:**
```typescript
// src/handlers/gpt.ts
export { handleMessageGPT, handleDeleteConversation, sendLocalFileMedia, sendUrlMedia };
```

**Issue:**
- `handleDeleteConversation` is not defined in gpt.ts
- Likely copy-paste error
- TypeScript may not catch this if function exists elsewhere

**Resolution:**
Remove from exports or move function to this file:
```typescript
export { handleMessageGPT, sendLocalFileMedia, sendUrlMedia };
```

**Priority:** 📝 **Technical Debt - Fix when refactoring**

---

### TD-2: Hardcoded Retry Configuration
**Status:** 📝 Technical Debt
**Created:** 2025-11-18 (Week 1 Day 4)
**Component:** Configuration
**Files:** `src/middleware/errorHandler.ts`

**Description:**
Retry attempts and backoff timings are hardcoded in error handler functions:
- Database retries: 3 attempts, 1-5 second backoff
- API retries: 2 attempts, 1-5 second backoff

**Current Code:**
```typescript
export async function handleDatabaseError<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3  // Hardcoded default
)
```

**Suggestion:**
Move to configuration:
```typescript
// src/config.ts
export default {
  // ...
  retry: {
    database: {
      maxAttempts: 3,
      minBackoffMs: 1000,
      maxBackoffMs: 5000,
    },
    api: {
      maxAttempts: 2,
      minBackoffMs: 1000,
      maxBackoffMs: 5000,
    },
  },
};
```

**Priority:** 📝 **Technical Debt - Good for Week 2 cleanup**

---

### TD-3: Missing Integration Tests for Full Error Flow
**Status:** 📝 Technical Debt
**Created:** 2025-11-18 (Week 1 Day 4)
**Component:** Testing

**Description:**
Current tests are unit tests with mocks. Missing integration tests for:
1. Logger → Sentry → Error Handler flow
2. Actual Sentry error capture (with test DSN)
3. Real exponential backoff timing
4. Real WhatsApp message error handling

**Current State:**
- 105+ unit tests with mocks
- No integration tests yet

**Planned For:**
- Week 1 Day 5 (Chunk 5.4: Integration Testing)
- Week 2 (End-to-end testing)

**Priority:** 📝 **Technical Debt - Planned for Day 5**

---

## ✅ Resolved Issues

### Issue #R1: Console.log Statements Throughout Codebase
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 4)
**Component:** Logging

**Description:**
50+ console.log/console.error statements scattered throughout codebase.

**Resolution:**
- Replaced all with structured logger calls
- Verified with `find src -type f -name "*.ts" ! -path "*/cli/*" -exec grep -l "console\." {} \;`
- Result: Zero console statements outside CLI UI

**Files Updated:** 15 files

---

### Issue #R2: Dependencies Not Installed
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 4)
**Component:** Build & Dependencies

**Description:**
New dependencies (@sentry/node, @sentry/profiling-node) not installed, blocking test execution.

**Resolution:**
- Ran `pnpm install` successfully
- 849 packages installed
- All dependencies now available
- Tests can run successfully

---

### Issue #R3: Test Suite Not Yet Executed
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 4)
**Component:** Testing

**Description:**
88 tests created but not executed due to missing dependencies.

**Resolution:**
- Dependencies installed
- All 88 tests executed successfully
- Test results: **88 passed, 0 failed**
- Test suites: **3 passed** (logger.test.ts, sentry.test.ts, errorHandler.test.ts)
- Fixed 1 assertion error in errorHandler.test.ts (expected message format)

**Test Summary:**
```
Test Suites: 3 passed, 3 total
Tests:       88 passed, 88 total
Time:        ~18s
```

---

### Issue #R4: Database Schema Not Created for Tests
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 5)
**Component:** Testing Infrastructure

**Description:**
Repository tests failing with "table does not exist" errors because database schema wasn't being created before test execution.

**Root Cause:**
- Tests used in-memory SQLite database (`file::memory:`)
- In-memory database doesn't persist across test processes
- No global setup to create schema before tests run

**Resolution:**
1. Changed test database from in-memory to file-based: `file:./test.db`
2. Updated `.env.test` and `.env` with new DATABASE_URL
3. Ran `pnpm db:push` to create schema in test.db
4. Created `jest.globalSetup.js` for future automation (not used yet)

**Results After Fix:**
```
Test Suites: 6 failed, 3 passed, 9 total
Tests:       16 failed, 240 passed, 256 total (93.75% pass rate)
Time:        ~19s
```

**Remaining failures:** 16 tests fail due to SQLite BigInt type mismatches (Issue #6), not database schema issues.

---

### Issue #R5: Test Failures Due to SQLite BigInt Type Mismatches
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 5)
**Component:** Testing
**Impact:** All BigInt-related test failures fixed

**Description:**
SQLite returned `BigInt` (e.g., `1n`) for numeric values from raw SQL queries, causing test assertions to fail. Additionally, date range calculations in getUserStats and getGlobalStats were off by one day, excluding today from the results.

**Root Causes:**
1. `connection.test.ts` expected `Number` but SQLite returned `BigInt` for raw SQL
2. `usage.repository.ts` getUserStats/getGlobalStats calculated date range incorrectly (started N days ago instead of N-1 days ago)

**Resolution:**
1. **BigInt Fix (connection.test.ts:40-42):**
   - Changed expected type from `number` to `bigint`
   - Changed assertion from `1` to `1n`
   - Updated comment to clarify SQLite behavior

2. **Date Range Fix (usage.repository.ts:252, 334):**
   - Changed `startDate.getDate() - days` to `startDate.getDate() - (days - 1)`
   - Now correctly includes today in the daily breakdown
   - Applied fix to both `getUserStats` and `getGlobalStats` functions

**Test Results:**
- **Before:** 240/256 tests passing (93.75%)
- **After:** 255/256 tests passing (99.6%) when run with `--runInBand`
- **Remaining:** 1 test failure unrelated to BigInt (error handling test)

**Files Modified:**
- `src/db/__tests__/connection.test.ts` - Fixed BigInt assertion
- `src/db/repositories/usage.repository.ts` - Fixed date range calculations (2 locations)

---

### Issue #R6: Jest Configuration Deprecated Options
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 5)
**Component:** Testing Configuration

**Description:**
Jest configuration used deprecated options that generated warnings during test execution.

**Problems Fixed:**
1. `coverageThresholds` typo (should be `coverageThreshold`)
2. `ts-jest` config under `globals` is deprecated
3. `isolatedModules` should be in transform config, not globals

**Resolution:**
Updated `jest.config.js`:
1. Changed `coverageThresholds` to `coverageThreshold` (line 29)
2. Moved `isolatedModules: true` from `globals` section to `transform` config (line 44)
3. Removed empty `globals` section entirely (lines 60-64)

**Result:**
- ✅ No more deprecation warnings
- ✅ Jest config follows current best practices
- ✅ Future-proof for Jest v30

**Files Modified:**
- `jest.config.js` - Fixed deprecated options

---

### Issue #R7: Test Database Not in .gitignore
**Status:** ✅ Resolved
**Resolved:** 2025-11-18 (Week 1 Day 5)
**Component:** Version Control

**Description:**
Test database file `test.db` was generated during test runs but not explicitly listed in `.gitignore`, risking accidental commits.

**Resolution:**
Added explicit entries to `.gitignore`:
- `test.db` (explicit entry for clarity)
- `test.db-journal` (explicit entry for clarity)
- Added comment noting these are covered by existing `*.db` pattern

**Result:**
- ✅ Test database files will never be committed
- ✅ Clean git status after running tests
- ✅ Clear documentation of test file exclusions

**Files Modified:**
- `.gitignore` - Added explicit test database entries with explanatory comment

---

## Issue Workflow

### Status Indicators
- 🔴 **Critical** - Blocks deployment/development
- 🟡 **High Priority** - Should be resolved soon
- 🟢 **Low Priority** - Nice to have, not urgent
- 📝 **Technical Debt** - Refactoring/improvement needed
- ✅ **Resolved** - Issue fixed and verified

### Priority Levels
1. **Critical (🔴):** Fix immediately before any deployment
2. **High (🟡):** Fix before next major milestone
3. **Low (🟢):** Fix when convenient
4. **Tech Debt (📝):** Plan for future sprint/week

---

## Next Actions

### Completed (Week 2 Day 1)
1. ✅ Reinstall dependencies after fresh environment setup
2. ✅ Generate Prisma client and set up test database
3. ✅ Execute full test suite (256 tests, 89.5% pass rate)
4. ✅ Analyze test failures and identify root causes
5. ✅ Document new issues (Issue #9, Issue #10)
6. ✅ Create Week 2 Day 1 plan and roadmap
7. ✅ Update PROGRESS.md with Week 1 completion and Week 2 start
8. ✅ Update ISSUES.md with new findings

### Immediate (Week 2 Day 1 Completion)
1. ⏳ Commit and push Week 2 Day 1 documentation
2. ⏳ Fix test database setup (Issue #9) - 27 tests
3. ⏳ Add setup documentation to README (Issue #10)

### Short Term (Week 2 Days 2-5)
1. Implement rate limiting system (Redis-based)
2. Implement RBAC (Owner/Admin/Operator roles)
3. Implement usage analytics and reporting
4. Obtain Sentry DSN for staging (Issue #3)
5. Add ESLint rule for console.log (Issue #4)
6. Enhance logger tests to verify output (Issue #5)

### Medium Term (Week 2-3)
1. Create integration tests (TD-3)
2. Move retry config to environment (TD-2)
3. Fix handleDeleteConversation export (TD-1)
4. Improve test coverage to >= 80%
5. Implement health check endpoints
6. Implement environment validation with Zod

---

**Document Owner:** Development Team
**Review Frequency:** Daily during active development
**Update Process:** Add new issues as discovered, update status regularly
