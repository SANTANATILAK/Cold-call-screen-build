import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { STAGES } from './stages.js';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  CORS_ORIGIN,
  ANTHROPIC_API_KEY,
  LLM_MODEL = 'claude-haiku-5-5',
  PORT = 3000,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const OUTCOMES = ['meeting_booked', 'callback', 'not_interested', 'wrong_person', 'ended_early'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const app = express();
app.use(cors({ origin: CORS_ORIGIN ? CORS_ORIGIN.split(',').map((s) => s.trim()) : '*' }));
app.use(express.json({ limit: '50kb' }));

// ---------- helpers ----------

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });

const fail = (res, code, msg) => res.status(code).json({ error: msg });

const stageNum = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
};

const clip = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);

async function loadCall(id) {
  const { data: call, error } = await db.from('calls').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!call) return null;
  const { data: results, error: e2 } = await db
    .from('stage_results')
    .select('*')
    .eq('call_id', id)
    .order('stage');
  if (e2) throw e2;
  return { ...call, results };
}

// "What prospects tend to say" per stage.
// Uses an LLM if ANTHROPIC_API_KEY is set, otherwise the static list in stages.js.
// Results are cached in memory so each stage is generated once per server run.
const sayCache = new Map();

async function saysFor(stage) {
  const def = STAGES[stage - 1];
  const fallback = { source: 'static', items: def.typical_prospect_says };
  if (!ANTHROPIC_API_KEY) return fallback;
  if (sayCache.has(stage)) return sayCache.get(stage);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content:
              `You are coaching a cold caller on a live call. Stage: "${def.name}". ` +
              `Purpose of this stage: ${def.purpose} ` +
              `List 4 short, realistic things a prospect might say at this point. ` +
              `One per line. No numbering, no commentary.`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM responded ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || '').join('');
    const items = text.split('\n').map((s) => s.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 6);
    const out = { source: 'llm', items: items.length ? items : fallback.items };
    sayCache.set(stage, out);
    return out;
  } catch (err) {
    console.error('LLM fallback:', err.message);
    return fallback;
  }
}

// ---------- routes ----------

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/stages', (_req, res) => res.json(STAGES));

app.get('/stages/:stage/say', wrap(async (req, res) => {
  const stage = stageNum(req.params.stage);
  if (!stage) return fail(res, 400, 'Stage must be 1 to 8');
  res.json(await saysFor(stage));
}));

app.post('/calls', wrap(async (req, res) => {
  const prospect_name = clip(req.body?.prospect_name, 120);
  if (!prospect_name) return fail(res, 400, 'prospect_name is required');

  const { data, error } = await db
    .from('calls')
    .insert({
      prospect_name,
      company: clip(req.body?.company, 120),
      caller_name: clip(req.body?.caller_name, 120),
    })
    .select()
    .single();
  if (error) throw error;
  res.status(201).json({ ...data, results: [] });
}));

app.get('/calls', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { data, error } = await db
    .from('calls')
    .select('id, prospect_name, company, caller_name, current_stage, status, outcome, created_at, closed_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  res.json(data);
}));

app.get('/calls/:id', wrap(async (req, res) => {
  if (!UUID.test(req.params.id)) return fail(res, 404, 'Not found');
  const call = await loadCall(req.params.id);
  if (!call) return fail(res, 404, 'Not found');
  res.json(call);
}));

// Save what happened at one stage, and move the call forward.
app.post('/calls/:id/stages/:stage', wrap(async (req, res) => {
  const id = req.params.id;
  const stage = stageNum(req.params.stage);
  if (!UUID.test(id) || !stage) return fail(res, 400, 'Bad call id or stage');

  const { data: call, error } = await db.from('calls').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!call) return fail(res, 404, 'Not found');
  if (call.status !== 'open') return fail(res, 409, 'Call is already closed');

  const { error: e1 } = await db.from('stage_results').upsert(
    {
      call_id: id,
      stage,
      tap_choice: clip(req.body?.tap_choice, 80),
      prospect_words: clip(req.body?.prospect_words, 2000),
    },
    { onConflict: 'call_id,stage' }
  );
  if (e1) throw e1;

  const next = Math.max(call.current_stage, Math.min(stage + 1, 8));
  const { error: e2 } = await db.from('calls').update({ current_stage: next }).eq('id', id);
  if (e2) throw e2;

  res.json({ ok: true, current_stage: next });
}));

app.post('/calls/:id/close', wrap(async (req, res) => {
  const id = req.params.id;
  const outcome = req.body?.outcome;
  if (!UUID.test(id)) return fail(res, 404, 'Not found');
  if (!OUTCOMES.includes(outcome)) return fail(res, 400, 'Unknown outcome');

  const { data, error } = await db
    .from('calls')
    .update({ status: 'closed', outcome, closed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return fail(res, 409, 'Call not found or already closed');
  res.json(data);
}));

app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
