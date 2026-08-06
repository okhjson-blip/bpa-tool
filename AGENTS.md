# Repository workflow

- Preserve user changes that are unrelated to the current task.
- Never commit credentials, access tokens, API keys, `.env` files, or other secrets.
- After implementing a requested change, run the relevant tests and production build.
- If verification succeeds, stage only files changed for the current task.
- Create a concise commit describing the completed work.
- Push the current branch to `origin` after the commit succeeds.
- Never force-push, rewrite published history, or bypass protected-branch rules.
- If a push is rejected because the branch is protected, create a `codex/<task-name>` branch and push it instead.
- Report the branch name, commit hash, verification result, and push result to the user.
