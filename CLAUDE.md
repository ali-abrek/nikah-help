@AGENTS.md

# Project-Specific Rules

## Working in This Project

- Package manager: **pnpm** (never npm/yarn for install/add)
- Node.js: 22.x LTS
- Before adding any package: `npm dist-tag ls <pkg>` to verify latest stable version
- After changes: `pnpm typecheck && pnpm lint`
- Before commit: `pnpm format:check`
- Full verification: `pnpm verify`

## Build & Test Commands

| Command                             | What                                 |
| ----------------------------------- | ------------------------------------ |
| `pnpm dev`                          | Dev server with Turbopack            |
| `pnpm build`                        | Production build                     |
| `pnpm typecheck`                    | TypeScript check                     |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                               |
| `pnpm format` / `pnpm format:check` | Prettier                             |
| `pnpm test:unit`                    | Vitest unit tests                    |
| `pnpm test:e2e`                     | Playwright E2E                       |
| `pnpm verify`                       | All checks at once                   |
| `pnpm db:typegen`                   | Regenerate `types/database.types.ts` |

## Testing Locally with Supabase

```bash
supabase start          # local Supabase stack
supabase status         # verify services
supabase db reset       # reset to fresh migrations
supabase migration new  # create new migration
```

## Key Project Files

| File                      | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `package.json`            | Dependencies, scripts                    |
| `tsconfig.json`           | TypeScript config (strict, paths: `@/*`) |
| `next.config.ts`          | Next.js 16 config                        |
| `postcss.config.mjs`      | PostCSS with `@tailwindcss/postcss`      |
| `vercel.json`             | Vercel deploy, cron jobs                 |
| `types/database.types.ts` | Generated Supabase types                 |
| `supabase/migrations/`    | DB schema migrations                     |
| `supabase/config.toml`    | Supabase CLI config                      |

## Feature Module Template

When creating a new feature:

```
features/<name>/
├── actions.ts          # 'use server' — thin SA wrappers
├── server/             # Pure business helpers
│   └── <helper>.ts
├── schemas.ts          # Zod schemas
├── components/         # UI components
├── hooks/              # Client hooks
└── types.ts            # Feature-specific types
```

Business logic goes in `server/` helpers so it's reusable from both Server Actions (MVP) and future Route Handlers (pre-native).
