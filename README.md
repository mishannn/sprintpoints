# Planning Poker

Planning Poker is a realtime estimation room for agile teams. Create a room, invite teammates with a link, vote privately, reveal estimates together, and keep the story queue visible during refinement or sprint planning.

It is built as a lightweight product: a static React frontend that can be hosted on GitHub Pages, backed by Supabase Cloud for storage and realtime sync.

## Product Highlights

- **Instant rooms**: facilitators can create a room without account setup in the app.
- **Invite-link collaboration**: participants join by room code or shared URL.
- **Private voting**: votes stay hidden until the facilitator reveals them.
- **Realtime updates**: participants, stories, votes, reveals, and resets sync across connected clients.
- **Story queue**: add stories, switch the active story, and store the final estimate.
- **Spectator mode**: let stakeholders observe without affecting the vote count.
- **Static hosting ready**: deploy the frontend to GitHub Pages with a GitHub Actions workflow.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **UI**: CSS, lucide-react icons
- **Backend**: Supabase Cloud Postgres
- **Realtime**: Supabase Realtime via `postgres_changes`
- **Hosting**: GitHub Pages

## How It Works

The frontend is a single-page app. Supabase stores room data in four tables:

- `rooms`: room metadata, card set, reveal state, active story
- `participants`: room members, spectator flag, heartbeat timestamp
- `issues`: story queue and final estimates
- `votes`: one vote per participant per story

The app subscribes to Supabase realtime changes and reloads room state when any relevant table changes.

## Requirements

- Node.js 24+
- npm 11+
- Supabase Cloud project
- Supabase CLI if you want to apply migrations from your machine

## Quick Start

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set your Supabase values:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Start the frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

## Supabase Setup

Create a Supabase Cloud project, then apply the migration:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The migration file is:

```text
supabase/migrations/20260610160000_init_planning_poker.sql
```

You can also run the migration manually in the Supabase SQL Editor.

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `VITE_BASE_PATH` | No | Override Vite base path, useful for custom domains |

The anon key is safe to expose in the browser when Row Level Security policies are configured correctly. This project includes permissive policies for invite-link rooms.

## Development Commands

```bash
npm run dev
```

Runs the local development server.

```bash
npm run build
```

Type-checks and builds the production frontend into `dist`.

```bash
npm run preview
```

Serves the production build locally.

## Deploy to GitHub Pages

The repository includes:

```text
.github/workflows/deploy-pages.yml
```

It builds the Vite frontend and publishes `dist` to GitHub Pages on every push to `main`.

In GitHub:

1. Open repository **Settings**.
2. Go to **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Add repository secrets:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

For standard GitHub project pages, the app automatically uses `/<repository-name>/` as the Vite base path. For a custom domain, add a repository variable:

```bash
VITE_BASE_PATH=/
```

Then push to `main`.

## Security Model

This project is optimized for fast, anonymous room-based collaboration. The included Row Level Security policies allow public anonymous clients to read and write room data.

That is acceptable for lightweight planning rooms, but it is not a strict authorization model. For a hardened production SaaS version, move facilitator-only actions to Supabase Edge Functions or introduce authenticated users with ownership-aware RLS policies.

Recommended hardening path:

- Require authenticated users for room creation.
- Store facilitator ownership in the database.
- Restrict reveal, reset, story creation, and estimate updates to the room owner.
- Add rate limiting around room creation and voting.
- Add retention jobs to delete inactive rooms.

## Product Roadmap

- Custom card decks per room
- Import stories from Jira or GitHub issues
- Export estimates as CSV
- Timer for voting rounds
- Room history and completed story archive
- Facilitator handoff
- Optional authenticated workspaces

## Project Structure

```text
.
├── .github/workflows/deploy-pages.yml
├── public/.nojekyll
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   ├── supabase.ts
│   └── types.ts
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 20260610160000_init_planning_poker.sql
├── .env.example
├── vite.config.ts
└── package.json
```

## License

MIT
