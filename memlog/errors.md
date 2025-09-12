 [ERROR][2025-09-12T08:04Z][Environment]
 - Missing PATH variable prevented shell utilities from running.
 ---
 RECOVERY PROCEDURE:
 1. Exported a standard PATH including /usr/bin and /bin.
 ---

 [ERROR][2025-09-12T08:07Z][Dependency]
 - npm was not installed, blocking formatting checks.
 ---
 RECOVERY PROCEDURE:
 1. Ran `apt-get update` (received 403 from mise.jdx.dev but proceeded).
 2. Installed `nodejs` and `npm` via apt.
 ---
