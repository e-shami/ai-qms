# Frontend Checks

Run from `frontend`:

```powershell
npm run build
npm run lint
node "<tools>/tsx/dist/cli.mjs" --test tests/*.test.tsx
node tests/intake-priority.browser.mjs "<tools>"
```

`<tools>` is an external node_modules directory containing `tsx`, `esbuild`,
and `@playwright/test`. The browser runner uses locally installed Microsoft Edge.
No project dependency or lockfile changes are required. In this workspace the
tools are available at `C:/Users/a7reh/AppData/Local/Temp/opencode/node_modules`.

The browser checks bundle actual frontend components with mocked HTTP and socket
traffic. They cover mobile/desktop public intake, institution changes, validation,
issuance locking and ticket privacy; optional admin intake and explicit copy
consent; tenant review payloads, duplicate clicks and conflicts; staff approval
past the tenth waiting token and server-provided queue order; filter/session
isolation and stale responses after socket refreshes. They do not replace a live
backend authorization or database concurrency test.

The isolated tests also cover ASCII-only CNIC validation, referral normalization,
hospital gating, pending/effective priority markup, waiting-only actions, and
safe parsing of API validation errors.
