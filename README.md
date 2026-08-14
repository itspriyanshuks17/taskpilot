# TaskPilot

A self-hosted task & calendar tracker: a static site (GitHub Pages) backed by a free Supabase database, with a GitHub Actions cron job that emails you a daily digest of tasks due today or overdue.

```
┌─────────────┐      reads/writes       ┌──────────────┐
│  GitHub     │ ───────────────────────▶│   Supabase    │
│  Pages site │                         │  (Postgres)   │
└─────────────┘                         └───────┬──────┘
                                                  │ queried daily
                                          ┌───────▼───────┐
                                          │ GitHub Actions │
                                          │  cron job      │──▶ Resend API ──▶ your inbox
                                          └────────────────┘
```

## 1. Create the database (Supabase — free)

1. Go to [supabase.com](https://supabase.com) → sign up → **New project**. Pick any name/region, set a database password (save it somewhere).
2. Once the project is ready, open **SQL Editor** → **New query**, paste the contents of [`supabase-schema.sql`](./supabase-schema.sql), and click **Run**.
3. Go to **Project Settings → API**. You'll need three values later:
   - **Project URL**
   - **anon public** key — used by the website (safe to expose; the table is set up for single-user personal use)
   - **service_role** key — used only by the GitHub Actions script, kept secret. Never put this in the website.

## 2. Set up email (Resend — free, 100 emails/day)

1. Go to [resend.com](https://resend.com) → sign up.
2. Create an **API key** (Dashboard → API Keys).
3. You can send immediately from `onboarding@resend.dev` for testing. To send from your own address/domain, verify a domain under **Domains** and update `RESEND_FROM` later.

## 3. Push this project to GitHub

```bash
cd taskpilot
git init
git add .
git commit -m "Initial commit: TaskPilot"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 4. Add GitHub Actions secrets (for the reminder emails)

In your repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret name            | Value                                  |
|-------------------------|-----------------------------------------|
| `SUPABASE_URL`          | Your Supabase Project URL               |
| `SUPABASE_SERVICE_KEY`  | Your Supabase **service_role** key      |
| `RESEND_API_KEY`        | Your Resend API key                     |
| `NOTIFY_EMAIL`          | The email address you want reminders sent to |

The workflow in `.github/workflows/send-reminders.yml` runs daily at 07:30 UTC. Edit the `cron` line to change the time (cron is always in UTC — e.g. for 8:00 AM IST use `30 2 * * *`). You can also trigger it manually anytime from the **Actions** tab → **Send Task Reminders** → **Run workflow**, which is the fastest way to test it.

## 5. Enable GitHub Pages

**Settings → Pages → Source: Deploy from a branch → Branch: `main` / root**. After a minute your site is live at `https://<your-username>.github.io/<your-repo>/`.

## 6. Connect the website to Supabase

Open your live site — you'll see a one-time setup screen. Paste your Supabase **Project URL** and **anon public** key (from step 1.3). These are saved only in your browser's local storage, not in the repo. You can update them anytime from the ⚙ settings icon.

## Using it

- **+ New Task** — add a title, due date, optional time, priority, and notes.
- **Today / Upcoming / Calendar / All Tasks** — switch views from the left nav.
- Click the circle on a task to mark it done; click the task itself to edit or delete it.
- The top strip shows live counts: due today, overdue, due in the next 7 days, and completed.
- Every morning (per your cron schedule), if you have anything due today or still overdue, you'll get one email listing them. No email is sent on days with nothing due.

## Notes & limits

- This is built for **single-user personal use**. The database table's security policy (`RLS`) allows full read/write with the anon key, which is fine for a private tracker but would not be safe for a multi-user app.
- Resend's free tier caps at 100 emails/day — a once-daily digest uses at most 1.
- If you ever want reminders more than once a day (e.g. also at 6 PM for anything still undone), just add a second `cron` line in the workflow file.
