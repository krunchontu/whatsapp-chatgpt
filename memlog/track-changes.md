[2025-09-12]
### Refactor message handling
- Extracted timestamp filtering into `src/handlers/timestamp.ts`.
- Moved media transcription logic to `src/handlers/transcription.ts`.
- Centralized command dispatch in `src/handlers/command.ts`.
- Simplified `src/handlers/message.ts` to coordinate helpers.
Verification:
- `npm test` *(fails: Missing script "test")*
- `npm run format`
- `npm run format:check`
[2025-09-12]
### Tidy .gitignore
- Removed redundant and unrelated patterns to simplify the file.
Verification:
- `git status --ignored`
- `npm run format:check` *(fails: Code style issues found in 11 files)*
- `npm test` *(fails: Missing script "test")*
[2025-09-12]
### Remove backup repository
- Deleted `whatsapp-chatgpt-backup.git` directory.
- Added `*-backup.git/` to `.gitignore` to prevent committing backup repos.
Verification:
- `git status --short`
- `npm run format:check` *(fails: Code style issues found in 11 files)*
- `npm test` *(fails: Missing script "test")*
[2025-09-12]
### Configurable session storage path
- Replaced hard-coded sessionPath with `process.env.SESSION_PATH ?? "./session"` in `src/constants.ts`.
- Ensured the session directory exists before starting the client in `src/index.ts`.
- Documented the `SESSION_PATH` environment variable in `README.md`.
Verification:
- `npm run format`
- `npm run format:check` *(fails: Code style issues found in 11 files)*
- `npm test` *(fails: Missing script "test")*
[2025-09-12]
### Environment-based moderation config
- Replaced literal `customModerationParams` with `getEnvCustomModerationParams()` in `src/config.ts`.
- Documented the `CUSTOM_MODERATION_PARAMS` environment variable.
Verification:
- `npm run format`
- `npm run format:check` *(fails: Code style issues found in 10 files)*
- `npm test` *(fails: Missing script "test")*
