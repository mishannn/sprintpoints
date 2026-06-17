# Sprint Points

Sprint Points is a realtime estimation room for agile teams. Create a room, invite teammates with a link, vote privately, reveal estimates together, and keep the story queue visible during refinement or sprint planning.

It is built as a lightweight product: a static React frontend that can be hosted on GitHub Pages, backed by Supabase Cloud for storage and realtime sync.

## Product Highlights

- **Instant rooms**: facilitators can create a room without account setup in the app.
- **Invite-link collaboration**: participants join by room code or shared URL.
- **Private voting**: votes stay hidden until the facilitator reveals them.
- **Realtime updates**: participants, stories, votes, reveals, and resets sync across connected clients.
- **Story queue**: add, edit, delete, and archive stories; switch the active story; store the final estimate; and keep story details visible while voting.
- **Estimate references**: after choosing a rating, see active and archived stories with the same saved estimate directly under the vote cards.
- **Archive modal**: keep completed stories out of the active queue while retaining them as reference material, with unarchive support when a story should return to the queue.
- **Jira CSV workflow**: import stories from Jira-style CSV files with column mapping and optional link URL patterns, then export the room backlog back to CSV.
- **Revealed vote table**: after reveal, show each participant's vote alongside the aggregate distribution.
- **Spectator mode**: let stakeholders observe without affecting the vote count.
- **Sync feedback**: optimistic updates and loading states keep slow realtime writes visible to the facilitator and participants.
- **Setup guard**: missing Supabase configuration shows a setup-required screen instead of a broken room.
- **Static hosting ready**: deploy the frontend to GitHub Pages with a GitHub Actions workflow.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **UI**: Mantine, lucide-react icons
- **Backend**: Supabase Cloud Postgres
- **Realtime**: Supabase Realtime via `postgres_changes`
- **Hosting**: GitHub Pages

## How It Works

The frontend is a single-page app. Supabase stores room data in four tables:

- `rooms`: room metadata, card set, reveal state, active story
- `participants`: room members, spectator flag, heartbeat timestamp
- `issues`: story queue, descriptions, links, order, final estimates, and archive timestamps
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

Create a Supabase Cloud project, then apply the migrations:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

The migration files are:

```text
supabase/migrations/20260610160000_init_planning_poker.sql
supabase/migrations/20260610190000_add_issue_details.sql
supabase/migrations/20260617133000_allow_issue_delete.sql
supabase/migrations/20260617150000_add_issue_archive.sql
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
4. Add repository secrets or repository variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The workflow validates both values before building so a misconfigured Pages deploy fails early.

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
- Import stories from GitHub issues
- Timer for voting rounds
- Room history across planning sessions
- Facilitator handoff
- Optional authenticated workspaces

## Project Structure

```text
.
├── .github/workflows/deploy-pages.yml
├── public/.nojekyll
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── index.ts
│   ├── entities/room/model/
│   │   ├── roomApi.ts
│   │   ├── types.ts
│   │   └── voteStats.ts
│   ├── features/
│   │   ├── copy-invite/model/useCopyInviteLink.ts
│   │   ├── create-room/model/createRoom.ts
│   │   ├── join-room/model/joinRoom.ts
│   │   ├── manage-issues/model/
│   │   │   ├── issues.ts
│   │   │   └── jiraCsv.ts
│   │   ├── room-session/model/useRoomSession.ts
│   │   └── vote/model/voting.ts
│   ├── pages/
│   │   ├── lobby/ui/LobbyPage.tsx
│   │   ├── room/ui/RoomPage.tsx
│   │   └── setup-required/ui/SetupRequiredPage.tsx
│   ├── shared/
│   │   ├── api/supabase.ts
│   │   ├── config/cards.ts
│   │   ├── i18n/
│   │   └── lib/
│   ├── widgets/
│   │   ├── invite-card/ui/InviteCard.tsx
│   │   ├── room-sidebar/ui/
│   │   └── voting-table/ui/VotingTable.tsx
│   ├── main.tsx
│   └── types.ts
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260610160000_init_planning_poker.sql
│       ├── 20260610190000_add_issue_details.sql
│       ├── 20260617133000_allow_issue_delete.sql
│       └── 20260617150000_add_issue_archive.sql
├── .env.example
├── vite.config.ts
└── package.json
```

## License

MIT
