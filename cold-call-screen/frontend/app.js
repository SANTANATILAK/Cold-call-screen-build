const API = (window.API_BASE || '').replace(/\/$/, '');
const TAPS = ['Covered as written', 'Skipped', 'Prospect cut in', 'Prospect asked a question'];
const OUTCOMES = [
  ['meeting_booked', 'Meeting booked'],
  ['callback', 'Asked to call back'],
  ['not_interested', 'Not interested'],
  ['wrong_person', 'Wrong person'],
  ['ended_early', 'Call ended early'],
];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES);

const app = document.getElementById('app');
let stages = [];
let call = null; // { id, prospect_name, company, current_stage, status, results: [] }
let stageNo = 1; // the stage currently on screen

// ---------- plumbing ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function stageName(no) {
  return stages.find((s) => s.no === no)?.name || '';
}

function showError(msg) {
  const box = document.createElement('div');
  box.className = 'error';
  box.textContent = msg;
  app.prepend(box);
  setTimeout(() => box.remove(), 6000);
}

function setNav(hash) {
  document.querySelectorAll('nav a').forEach((a) =>
    a.classList.toggle('on', a.getAttribute('href') === hash)
  );
}

async function route() {
  const hash = location.hash || '#/live';
  setNav(hash);
  try {
    if (hash === '#/calls') return await renderCalls();
    return await renderLive();
  } catch (e) {
    showError(e.message);
  }
}

// ---------- live call ----------

async function renderLive() {
  if (!call) {
    const savedId = localStorage.getItem('activeCallId');
    if (savedId) {
      try {
        const existing = await api(`/calls/${savedId}`);
        call = existing.status === 'open' ? existing : null;
      } catch {
        call = null;
      }
      if (!call) localStorage.removeItem('activeCallId');
    }
  }
  if (!call) return renderStart();
  stageNo = call.current_stage;
  return renderStage();
}

function renderStart() {
  app.innerHTML = `
    <section class="card narrow">
      <h1>Start a call</h1>
      <form id="start">
        <label>Prospect name<input name="prospect_name" required autocomplete="off" /></label>
        <label>Company<input name="company" autocomplete="off" /></label>
        <label>Your name<input name="caller_name" autocomplete="off" /></label>
        <button class="primary" type="submit">Start call</button>
      </form>
    </section>`;

  document.getElementById('start').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      call = await api('/calls', { method: 'POST', body });
      localStorage.setItem('activeCallId', call.id);
      stageNo = 1;
      renderStage();
    } catch (err) {
      showError(err.message);
    }
  };
}

function renderStage() {
  const def = stages.find((s) => s.no === stageNo);
  if (!def) return showError('Stages not loaded. Refresh the page.');

  const saved = (call.results || []).find((r) => r.stage === stageNo);
  let selectedTap = saved?.tap_choice || null;
  const isLast = stageNo === 8;

  app.innerHTML = `
    <section class="card">
      <div class="meta">
        <span>${esc(call.prospect_name)}${call.company ? ' · ' + esc(call.company) : ''}</span>
        <button class="link" id="endnow">End call now</button>
      </div>

      <div class="progress">
        ${stages.map((s) => `
          <button class="pill ${s.no === stageNo ? 'on' : ''} ${s.no < call.current_stage ? 'done' : ''}"
                  data-no="${s.no}" title="${esc(s.name)}"
                  ${s.no > call.current_stage ? 'disabled' : ''}>${s.no}</button>`).join('')}
      </div>

      <h2>Stage ${def.no} of 8: ${esc(def.name)}</h2>
      <p class="purpose">${esc(def.purpose)}</p>

      <h3>What prospects tend to say</h3>
      <ul class="says" id="says"><li class="muted">Loading…</li></ul>

      <h3>What happened</h3>
      <div class="taps">
        ${TAPS.map((t) => `<button class="tap ${selectedTap === t ? 'on' : ''}" data-tap="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>

      <h3>Prospect's own words</h3>
      <textarea id="words" rows="4" placeholder="Write down what they actually said">${esc(saved?.prospect_words || '')}</textarea>

      <div class="row">
        <button class="ghost" id="back" ${stageNo === 1 ? 'disabled' : ''}>Back</button>
        <button class="primary" id="save">${isLast ? 'Save and choose outcome' : 'Save and next stage'}</button>
      </div>
    </section>`;

  // Stage pills: jump to any reached stage.
  app.querySelectorAll('.pill').forEach((b) =>
    b.onclick = () => { stageNo = Number(b.dataset.no); renderStage(); }
  );

  // Tap choices.
  app.querySelectorAll('.tap').forEach((b) =>
    b.onclick = () => {
      selectedTap = b.dataset.tap;
      app.querySelectorAll('.tap').forEach((x) => x.classList.toggle('on', x === b));
    }
  );

  document.getElementById('back').onclick = () => { stageNo -= 1; renderStage(); };
  document.getElementById('endnow').onclick = () => renderClose();

  // What prospects say: load for this stage. Ignore late answers if the caller moved on.
  const requested = stageNo;
  api(`/stages/${requested}/say`)
    .then((r) => {
      if (requested !== stageNo) return;
      document.getElementById('says').innerHTML =
        r.items.map((i) => `<li>${esc(i)}</li>`).join('') +
        (r.source === 'llm' ? '<li class="muted">Suggested by an LLM. Check against the transcripts.</li>' : '');
    })
    .catch(() => {
      if (requested === stageNo) {
        document.getElementById('says').innerHTML = '<li class="muted">Could not load. The stage guidance still applies.</li>';
      }
    });

  document.getElementById('save').onclick = async (e) => {
    if (!selectedTap) return showError('Tap what happened first.');
    e.target.disabled = true;
    try {
      await api(`/calls/${call.id}/stages/${stageNo}`, {
        method: 'POST',
        body: { tap_choice: selectedTap, prospect_words: document.getElementById('words').value },
      });
      call = await api(`/calls/${call.id}`);
      if (isLast) return renderClose();
      stageNo += 1;
      return renderStage();
    } catch (err) {
      e.target.disabled = false;
      showError(err.message);
    }
  };
}

function renderClose() {
  app.innerHTML = `
    <section class="card narrow">
      <div class="meta"><span>${esc(call.prospect_name)}${call.company ? ' · ' + esc(call.company) : ''}</span></div>
      <h2>How did the call end?</h2>
      <div class="taps col">
        ${OUTCOMES.map(([v, l]) => `<button class="tap" data-out="${v}">${esc(l)}</button>`).join('')}
      </div>
    </section>`;

  app.querySelectorAll('[data-out]').forEach((b) =>
    b.onclick = async () => {
      try {
        await api(`/calls/${call.id}/close`, { method: 'POST', body: { outcome: b.dataset.out } });
        localStorage.removeItem('activeCallId');
        call = null;
        location.hash = '#/calls';
        route();
      } catch (err) {
        showError(err.message);
      }
    }
  );
}

// ---------- past calls ----------

async function renderCalls() {
  const rows = await api('/calls?limit=100');
  app.innerHTML = `
    <section class="card">
      <h1>Past calls</h1>
      ${rows.length ? `
        <div class="table-wrap">
        <table>
          <thead>
            <tr><th>When</th><th>Prospect</th><th>Company</th><th>Stage reached</th><th>Status</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${new Date(r.created_at).toLocaleString()}</td>
                <td>${esc(r.prospect_name)}</td>
                <td>${esc(r.company || '')}</td>
                <td>${r.current_stage} of 8 · ${esc(stageName(r.current_stage))}</td>
                <td>${esc(r.status)}</td>
                <td>${esc(OUTCOME_LABEL[r.outcome] || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        </div>` : '<p class="muted">No calls yet.</p>'}
    </section>`;
}

// ---------- boot ----------

window.addEventListener('hashchange', route);

(async function boot() {
  if (!API) {
    app.innerHTML = '<section class="card"><h1>Set the backend URL</h1><p>Edit frontend/config.js and set API_BASE to your Render URL.</p></section>';
    return;
  }
  app.innerHTML = '<section class="card"><p class="muted">Connecting to the backend. The free server can take up to a minute to wake…</p></section>';

  for (let i = 0; i < 20; i++) {
    try { await api('/health'); break; }
    catch { await new Promise((r) => setTimeout(r, 3000)); }
  }

  try {
    stages = await api('/stages');
  } catch (e) {
    return showError('Could not load stages: ' + e.message);
  }
  route();
})();
