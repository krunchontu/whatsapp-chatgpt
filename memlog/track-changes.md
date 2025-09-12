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
