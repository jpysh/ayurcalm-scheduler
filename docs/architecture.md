# Architecture map

Moved out of CLAUDE.md (6 Oct) so every session does not load it. Read it when you need to find where something lives.

```
src/                    React 18 + Vite + TypeScript + Tailwind + shadcn/ui
  lib/apiBase.ts        THE API base URL. One definition. Do not add another.
  main.tsx              Global fetch wrapper: attaches the JWT, handles 401
  pages/AdminDashboard  The shell: shared data, the day's warnings, Verify, and
                        which screen is showing
  components/BottomBar  The phone frame (#66): one hamburger bottom right, its sheet
                        holds the inbox, the screen's +, search, change day, print and
                        the screens; WeekStrip is the day's date bar
  pages/tabs/           One file per screen: its tab, dialogs and useXScreen()
                        state hook. Shared types and helpers: tabs/shared.ts
  pages/SetupWizard     First-run flow, shown until settings.setup_complete
server/                 Express + Prisma + Zod, serves ../dist in production
  src/index.ts          Middleware order matters — see below
  src/auth.ts           bcrypt + JWT login, requireAuth
  src/settings.ts       Centre settings, requireAdmin, public support endpoint
  src/users.ts          User management, change-password
  src/seed.ts           Demo and test dataset (120 patients, 4 months of
                        appointments, residents with diet plans). Settings →
                        Reset demo data rebuilds it from today
  src/dietTemplateSeed.ts  The starting diet plans, seeded by name
  src/availability.ts      When a therapist is not free — events, absences, the
                        more-specific-event rule. Pure, and tested
  src/appointmentGuard.ts  Whether one appointment may sit where it is put
  src/replan.ts            `planDay` — the one planner: an absent therapist's
                        whole day, or whatever Verify found wrong, in one pass
  src/dayCheck.ts          What is wrong with a day and the one plan that fixes
                        it. The header and Verify read it and decide nothing
  src/dietResolution.ts    What one patient eats on one day — pure, and tested
  src/dietTemplates.ts     Diet plan CRUD, admin-only writes
  src/patientDiet.ts       A patient's meals by date: the segments of a stay, kept contiguous
  src/attention.ts         What needs the admin beyond the day (#288): the rules, their
                        defaults, today's counts and the patient and team items
                        the pill lists. The admin's changes are the only thing stored
  src/catalogues.ts        Packages and accommodation types (reference lists, never billing)
  src/mcp.ts               The AI assistant's door at /mcp (#119, spec #102):
                        grouped tools that call the functions above and
                        decide nothing. src/mcpb/proxy.cjs is the Claude
                        Desktop extension Settings hands out
  src/scripts/          resetPassword.ts — lockout recovery
```
