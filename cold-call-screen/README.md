# Cold call screen

A screen a caller keeps open beside a live cold call. It shows which of eight stages the call is in, what that stage is for, what prospects tend to say there, a tap for what happened, a box for the prospect's own words, and the outcome at the end. A second screen lists past calls and the stage each one reached.

## Stack

| Part     | Where    | Folder     |
|----------|----------|------------|
| Database | Supabase | `supabase/schema.sql` |
| Backend  | Render   | `backend/` (Node, Express) |
| Screen   | Vercel   | `frontend/` (plain HTML, CSS, JS, no build step) |

## Fill in before you submit

- **Vercel URL:** `https://________________.vercel.app`
- **Render health URL:** `https://________________.onrender.com/health`
- **GitHub repo:** `https://github.com/________________`
- **LLM used and for what:** ________________ is used only for "what prospects tend to say" at each stage, through `GET /stages/:stage/say`. If no key is set, the static lists in `backend/stages.js` are used instead.

## Stage content

The eight stage names, purposes and "what prospects tend to say" lines in `backend/stages.js` are **placeholders**. Replace them with what you took from the structure page and the 100 transcripts before you submit. Keep exactly eight stages numbered 1 to 8.

## 1. Supabase

1. Create a free project.
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it.
3. Open **Project Settings → API** and copy the **Project URL** and the **service_role** key. The service key stays on the backend only. Never put it in the frontend.

## 2. Backend on Render

1. Push this repo to GitHub.
2. In Render, choose **New → Web Service** and connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `CORS_ORIGIN` = your Vercel URL (add `http://localhost:5173` too if you run the frontend locally)
   - `ANTHROPIC_API_KEY` (optional)
   - `LLM_MODEL` = `claude-haiku-5-5` (optional)
5. Deploy. Open `/health` on the Render URL and confirm it returns `{"ok":true}`.

The free tier sleeps when idle. The first request after a sleep can take about a minute. The screen shows a "waking" message while it waits.

### Endpoints

| Method | Path | What it does |
|--------|------|--------------|
| GET  | `/health` | Liveness check |
| GET  | `/stages` | The eight stage definitions |
| GET  | `/stages/:stage/say` | What prospects tend to say at a stage (LLM or static) |
| POST | `/calls` | Start a call. Body: `prospect_name`, `company`, `caller_name` |
| GET  | `/calls` | List past calls, newest first. Optional `?limit=` |
| GET  | `/calls/:id` | One call with its stage results |
| POST | `/calls/:id/stages/:stage` | Save a stage. Body: `tap_choice`, `prospect_words`. Moves the call forward. |
| POST | `/calls/:id/close` | Close a call. Body: `outcome` (`meeting_booked`, `callback`, `not_interested`, `wrong_person`, `ended_early`) |

## 3. Frontend on Vercel

1. Edit `frontend/config.js` and set `API_BASE` to your Render URL, with no trailing slash.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Other
   - **Build Command:** leave empty
   - **Output Directory:** leave empty (`.`)
4. Deploy. The Vercel URL is the live screen.

## Run locally

```bash
# Backend
cd backend
cp .env.example .env      # fill in the Supabase values
npm install
npm start                 # http://localhost:3000

# Frontend (any static server)
cd ../frontend
npx serve .               # or: python3 -m http.server 5173
```

With `API_BASE` set to `http://localhost:3000` and `CORS_ORIGIN` including your local origin, the screen works end to end.

## How a call flows

1. Enter the prospect's name, company and yours, then **Start call**.
2. For each stage, read the purpose and the "what prospects tend to say" list.
3. Tap what happened, write the prospect's words, then **Save and next stage**. Stage pills let you jump back to reached stages.
4. After stage 8, choose the outcome. The call is saved and appears under **Past calls**.
5. **End call now** skips to the outcome at any point.

The active call ID is kept in `localStorage`, so a page refresh returns to the same call.
