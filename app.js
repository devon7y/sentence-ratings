"use strict";
/* Sentence ratings. One sentence at a time, two keys. Everything a rater does is logged in the browser
   (localStorage) after every key press and leaves it only as a file the rater downloads. */

const STUDY = "sentence-ratings-1";
const APP = "1.0.0";
const MIN_RT = 250;   // ms after a sentence is painted during which a press is ignored
const BLANK = 200;    // ms of blank screen between two sentences
const KEY_NO = "z", KEY_YES = "/";
const PARTS = {
  1: { no: "Not a construct", yes: "Construct",
       question: "Does this sentence describe the construct in a person, in its own terms?" },
  2: { no: "Not useful", yes: "Useful",
       question: "Does this sentence name content of the construct that no item asks about?" },
};
const INSTRUCTIONS = {
  1: [
    ["h", "Part 1. Construct or not a construct"],
    ["p", "You will see a construct's name, its definition and one sentence."],
    ["p", "Does the sentence describe the construct in a person, in its own terms?"],
    ["k", KEY_NO, "Not a construct: it only names the construct, uses the word in another sense, discusses or defines it, or is mostly about something else."],
    ["k", KEY_YES, "Construct: it says what the construct is like for a particular person or for people in general."],
  ],
  2: [
    ["h", "Part 2. Useful or not useful"],
    ["p", "You will see a construct's name and definition, all the items of one scale, and one sentence. The sentences of one scale come together. Before the first of them you see the items alone, to read them."],
    ["p", "Does the sentence name content of the construct that no item asks about?"],
    ["k", KEY_NO, "Not useful: it describes content the scale already has, or it is not a description of the construct."],
    ["k", KEY_YES, "Useful: it describes the construct and names something the scale lacks."],
  ],
};
const MECHANICS = [
  "Sentences come one at a time. Answer with the z key or the / key. There is no feedback.",
  "Backspace returns to the sentence you just answered, so you can change that answer.",
  "p pauses. i shows these instructions again.",
  "Your answers are saved in this browser after every key press. You can close the page and come back later on the same computer and browser. \"Save log file\" at the top right downloads everything so far.",
];

/* ---------- order of trials: fixed by the stimulus file's seed and the rater's ID ---------- */

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function groupByScale(trials) {          // scales in order of first appearance, each with its trials
  const order = [], map = {};
  for (const t of trials) { if (!map[t.scale]) { map[t.scale] = []; order.push(t.scale); } map[t.scale].push(t.id); }
  return order.map((s) => ({ scale: s, ids: map[s] }));
}
function buildSchedule(stim, rater) {
  const steps = [];
  // Part 1: every pair, shuffled
  steps.push({ type: "instructions", part: 1 });
  stim.practice.forEach((t, k) => steps.push({ type: "trial", part: 1, phase: "practice", id: t.id, pos: k + 1, of: stim.practice.length }));
  steps.push({ type: "message", part: 1, text: "The warm-up is over. Part 1 starts now." });
  const o1 = shuffle(stim.trials.map((t) => t.id), mulberry32(hash32(`${stim.seed}|${rater}|part1`)));
  o1.forEach((id, k) => steps.push({ type: "trial", part: 1, phase: "main", id, pos: k + 1, of: o1.length }));
  steps.push({ type: "message", part: 1, text: "Part 1 is finished. You can save the log file now (top right) and take a break. Part 2 follows." });
  // Part 2: the sentences of a scale together; scales shuffled, sentences shuffled within a scale
  steps.push({ type: "instructions", part: 2 });
  let pos = 0;
  groupByScale(stim.practice).forEach((g, b, all) => {
    steps.push({ type: "scale", part: 2, phase: "practice", scale: g.scale, block: b + 1, blocks: all.length });
    g.ids.forEach((id, k) => steps.push({ type: "trial", part: 2, phase: "practice", id, pos: ++pos, of: stim.practice.length,
      scale: g.scale, block: b + 1, in_block: k + 1, block_size: g.ids.length }));
  });
  steps.push({ type: "message", part: 2, text: "The warm-up is over. Part 2 starts now." });
  const rnd2 = mulberry32(hash32(`${stim.seed}|${rater}|part2`));
  const groups = shuffle(groupByScale(stim.trials).sort((x, y) => (x.scale < y.scale ? -1 : 1)), rnd2);
  pos = 0;
  groups.forEach((g, b) => {
    const ids = shuffle(g.ids.slice().sort(), rnd2);
    steps.push({ type: "scale", part: 2, phase: "main", scale: g.scale, block: b + 1, blocks: groups.length });
    ids.forEach((id, k) => steps.push({ type: "trial", part: 2, phase: "main", id, pos: ++pos, of: stim.trials.length,
      scale: g.scale, block: b + 1, in_block: k + 1, block_size: ids.length }));
  });
  steps.push({ type: "done" });
  return steps;
}

/* ---------- the log a rater downloads ---------- */

function buildExport(state, stim, steps) {
  const byId = {};
  for (const t of stim.trials.concat(stim.practice)) byId[t.id] = t;
  const trials = [], screens = [];
  steps.forEach((s, i) => {
    const att = state.answers[i];
    if (!att || !att.length) return;
    const last = att[att.length - 1];
    if (s.type === "trial") {
      const t = byId[s.id], sc = stim.scales[t.scale];
      trials.push({ rater: state.rater, step: i, part: s.part, phase: s.phase, pos: s.pos, of: s.of,
        block: s.block || null, in_block: s.in_block || null, block_size: s.block_size || null,
        id: s.id, construct: t.construct, instrument: sc.instrument, row: t.row, characters: t.text.length,
        items_shown: s.part === 2 ? sc.items.length : 0, attempts: att.length,
        earlier_responses: att.slice(0, -1).map((a) => a.response), ...last });
    } else {
      screens.push({ rater: state.rater, step: i, type: s.type, part: s.part || null, phase: s.phase || null,
        scale: s.scale || null, block: s.block || null, shown: att.length, ...last });
    }
  });
  return {
    format: "sentence-ratings-log", format_version: 1, exported_iso: new Date().toISOString(),
    study: STUDY, app: APP, rater: state.rater, created_iso: state.created_iso, completed_iso: state.completed_iso || null,
    complete: steps[state.step] && steps[state.step].type === "done",
    stimuli: state.stimuli, keys: { [KEY_NO]: "no", [KEY_YES]: "yes" }, labels: PARTS,
    min_rt_ms: MIN_RT, blank_ms: BLANK, step: state.step, steps_total: steps.length,
    sessions: state.sessions, schedule: steps, trials, screens, answers: state.answers,
    events_columns: ["epoch_ms", "perf_ms", "session", "type", "step", "detail"], events: state.events,
  };
}

if (typeof module !== "undefined") module.exports = { buildSchedule, buildExport, hash32, mulberry32, shuffle };

/* ---------- the page ---------- */

if (typeof document !== "undefined") (function () {
  const PREFIX = "sr1:";
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let stim, steps, state, session = 0;
  let cur = null;          // the screen now shown: { step, kind, onset, accepting, ... }
  let mode = "start";      // start | run | blank | paused | instructions | done

  const now = () => Math.round(performance.now() * 10) / 10;
  function ev(type, step, detail) { if (state) state.events.push([Date.now(), now(), session, type, step == null ? null : step, detail == null ? null : detail]); }
  function persist() {
    try { localStorage.setItem(PREFIX + state.rater, JSON.stringify(state)); $("warn").textContent = ""; }
    catch (e) { $("warn").textContent = "Saving in the browser failed. Use \"Save log file\" now and do not close this page."; ev("storage_error", state.step, String(e)); }
  }
  async function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return null;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function download() {
    const data = buildExport(state, stim, steps);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `ratings_${state.rater.replace(/[^A-Za-z0-9_-]/g, "_")}_${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    ev("download", state.step, a.download); persist();
  }

  /* ----- start screen ----- */
  function startScreen(note) {
    mode = "start"; $("progress").textContent = ""; $("tools").textContent = "";
    const m = $("main"); m.className = ""; m.textContent = "";
    m.appendChild(el("h1", null, "Sentence ratings"));
    if (note) m.appendChild(el("p", null, note));
    m.appendChild(el("p", null, "Use a computer with a keyboard, and the same computer and browser every time."));
    const saved = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    for (const k of saved) {
      let s; try { s = JSON.parse(localStorage.getItem(k)); } catch (e) { continue; }
      if (!s || s.study !== STUDY) continue;
      const b = el("button", null, `Continue as ${s.rater}`); b.onclick = () => begin(s.rater);
      const p = el("p"); p.appendChild(b); p.appendChild(document.createTextNode(` (saved in this browser, at step ${s.step + 1})`)); m.appendChild(p);
    }
    const p = el("p"); p.appendChild(el("span", null, "Rater ID: "));
    const inp = el("input"); inp.type = "text"; inp.id = "rater"; inp.autocomplete = "off"; p.appendChild(inp);
    p.appendChild(document.createTextNode(" "));
    const go = el("button", null, "Start"); p.appendChild(go); m.appendChild(p);
    const start = () => { const r = inp.value.trim(); if (r) begin(r); };
    go.onclick = start; inp.onkeydown = (e) => { if (e.key === "Enter") start(); };
    const q = el("p", "hint"); q.appendChild(document.createTextNode("To continue from a saved log file on another computer, load it here: "));
    const f = el("input"); f.type = "file"; f.accept = ".json,application/json";
    f.onchange = () => { const file = f.files[0]; if (!file) return; file.text().then((t) => importLog(t)).catch(() => startScreen("That file could not be read.")); };
    q.appendChild(f); m.appendChild(q);
  }
  function importLog(text) {
    let d; try { d = JSON.parse(text); } catch (e) { return startScreen("That file is not a log file."); }
    if (!d || d.format !== "sentence-ratings-log" || d.study !== STUDY || !d.rater) return startScreen("That file is not a log file of this study.");
    if (d.stimuli && d.stimuli.sha256 && stim.sha256 && d.stimuli.sha256 !== stim.sha256) return startScreen("That log file was made with a different set of sentences.");
    let have = null; try { have = JSON.parse(localStorage.getItem(PREFIX + d.rater)); } catch (e) { have = null; }
    if (have && have.step > d.step) return startScreen("This browser already holds a later state for that rater than the file. Nothing was changed.");
    const s = { study: STUDY, app: d.app, rater: d.rater, created_iso: d.created_iso, completed_iso: d.completed_iso, stimuli: d.stimuli,
      step: d.step, sessions: d.sessions, answers: d.answers, events: d.events, last: null, can_undo: false };
    s.events.push([Date.now(), now(), null, "import", d.step, d.exported_iso]);
    localStorage.setItem(PREFIX + d.rater, JSON.stringify(s));
    begin(d.rater);
  }

  /* ----- a rater begins or continues ----- */
  function begin(rater) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(PREFIX + rater)); } catch (e) { s = null; }
    if (s && s.stimuli && s.stimuli.sha256 && stim.sha256 && s.stimuli.sha256 !== stim.sha256)
      return startScreen("The sentences on this site have changed since this rater started. Nothing was overwritten.");
    state = s || { study: STUDY, app: APP, rater, created_iso: new Date().toISOString(), completed_iso: null,
      stimuli: { seed: stim.seed, n: stim.n, sha256: stim.sha256 }, step: 0, sessions: [], answers: {}, events: [], last: null, can_undo: false };
    steps = buildSchedule(stim, rater);
    session = state.sessions.length + 1;
    state.sessions.push({ session, start_iso: new Date().toISOString(), start_epoch_ms: Date.now(), app: APP,
      user_agent: navigator.userAgent, language: navigator.language, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: [screen.width, screen.height], window: [window.innerWidth, window.innerHeight], pixel_ratio: window.devicePixelRatio,
      resumed_at_step: state.step });
    state.can_undo = false;
    ev("session_start", state.step);
    const t = $("tools"); t.textContent = "";
    const a = el("a", null, "Save log file"); a.onclick = download; t.appendChild(a);
    persist(); show();
  }

  /* ----- screens ----- */
  function record(extra) {                       // one more answer for the screen now shown
    const a = Object.assign({ session, shown_iso: cur.shown_iso, epoch_ms: Date.now(), iso: new Date().toISOString(),
      onset_perf_ms: cur.onset, ignored_presses: cur.ignored, lost_focus: cur.blurred, pauses: cur.pauses,
      instructions_opened: cur.instr, items_scrolls: cur.scrolls }, extra);
    (state.answers[cur.step] = state.answers[cur.step] || []).push(a);
  }
  function arm() {                               // the clock starts with the first painted frame
    cur.accepting = false; cur.onset = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!cur || mode !== "run") return;
      cur.onset = now(); cur.accepting = true; ev("onset", cur.step);
    }));
  }
  function header(t, sc, withItems) {
    const box = el("div");
    box.appendChild(el("div", "label", "Construct")); box.appendChild(el("div", "construct", t.construct));
    box.appendChild(el("div", "label", "Definition")); box.appendChild(el("div", "definition", stim.constructs[t.construct]));
    return box;
  }
  function itemsList(sc, columns) {
    const ol = el("ol", "items" + (columns && sc.items.length > 12 ? " cols" : ""));
    for (const it of sc.items) ol.appendChild(el("li", null, it));
    return ol;
  }
  function keysLine(part) {
    const k = el("div", "keys");
    const a = el("span"); a.appendChild(el("b", null, KEY_NO)); a.appendChild(document.createTextNode(PARTS[part].no));
    const b = el("span"); b.appendChild(el("b", null, KEY_YES)); b.appendChild(document.createTextNode(PARTS[part].yes));
    k.appendChild(a); k.appendChild(b); return k;
  }
  function instructionsBox(part, foot) {
    const box = el("div");
    for (const row of INSTRUCTIONS[part]) {
      if (row[0] === "h") box.appendChild(el("h1", null, row[1]));
      else if (row[0] === "p") box.appendChild(el("p", null, row[1]));
      else { const p = el("p", "keys"); p.style.border = "0"; p.style.display = "block"; p.appendChild(el("b", null, row[1])); p.appendChild(document.createTextNode(row[2])); box.appendChild(p); }
    }
    const ul = el("ul", "plain"); for (const m of MECHANICS) ul.appendChild(el("li", null, m)); box.appendChild(ul);
    box.appendChild(el("p", "hint", foot));
    return box;
  }
  function show() {
    const i = state.step, s = steps[i], m = $("main");
    m.textContent = ""; m.className = "";
    cur = { step: i, kind: s.type, shown_iso: new Date().toISOString(), onset: null, accepting: false,
            ignored: 0, blurred: false, pauses: 0, instr: 0, scrolls: 0 };
    mode = "run";
    ev("shown", i, s.type);
    if (s.type === "instructions") {
      $("progress").textContent = `Part ${s.part}`;
      m.appendChild(instructionsBox(s.part, "Press the space bar to begin."));
    } else if (s.type === "message") {
      $("progress").textContent = `Part ${s.part}`;
      m.appendChild(el("p", null, s.text)); m.appendChild(el("p", "hint", "Press the space bar to go on."));
    } else if (s.type === "scale") {
      const sc = stim.scales[s.scale];
      $("progress").textContent = `Part 2 · scale ${s.block} of ${s.blocks}` + (s.phase === "practice" ? " (warm-up)" : "");
      m.className = "wide";
      m.appendChild(el("p", null, "A new scale. Read its items, then press the space bar."));
      m.appendChild(header({ construct: sc.construct }));
      m.appendChild(el("div", "label", "Items of the scale")); m.appendChild(itemsList(sc, true));
    } else if (s.type === "trial") {
      const t = stim.byId[s.id], sc = stim.scales[t.scale];
      $("progress").textContent = `Part ${s.part} · ${s.pos} of ${s.of}` + (s.phase === "practice" ? " (warm-up)" : "");
      const right = el("div");
      right.appendChild(header(t));
      right.appendChild(el("div", "label", "Sentence")); right.appendChild(el("div", "sentence", t.text));
      right.appendChild(el("div", "question", PARTS[s.part].question)); right.appendChild(keysLine(s.part));
      if (s.part === 2) {
        m.className = "wide";
        const two = el("div", "two"), left = el("div", "itemsbox");
        left.appendChild(el("div", "label", "Items of the scale")); left.appendChild(itemsList(sc, false));
        left.addEventListener("scroll", () => { if (cur) cur.scrolls++; }, { passive: true });
        two.appendChild(left); two.appendChild(right); m.appendChild(two);
      } else m.appendChild(right);
    } else if (s.type === "done") {
      mode = "done"; $("progress").textContent = "Finished";
      if (!state.completed_iso) { state.completed_iso = new Date().toISOString(); ev("completed", i); }
      m.appendChild(el("h1", null, "Finished"));
      m.appendChild(el("p", null, "Thank you. Save the log file and send it on."));
      const b = el("button", null, "Save log file"); b.onclick = download; m.appendChild(b);
      persist(); return;
    }
    window.scrollTo(0, 0);
    arm(); persist();
  }
  function advance() {                           // a blank screen, then the next step
    state.step = cur.step + 1; persist();
    mode = "blank"; cur = null; $("main").textContent = "";
    setTimeout(show, BLANK);
  }
  function undo() {
    if (!state.can_undo || state.last == null) return;
    ev("undo", cur ? cur.step : state.step, state.last);
    state.step = state.last; state.can_undo = false; persist(); show();
  }
  function overlay(kind) {                       // pause, or the instructions again: the sentence is hidden
    const s = steps[cur.step];
    mode = kind; cur.accepting = false;
    if (kind === "paused") cur.pauses++; else cur.instr++;
    ev(kind, cur.step);
    const m = $("main");
    for (const c of Array.from(m.children)) c.style.display = "none";
    const box = el("div"); box.id = "overlay";
    if (kind === "paused") { box.appendChild(el("h1", null, "Paused")); box.appendChild(el("p", "hint", "Press the space bar to continue.")); }
    else box.appendChild(instructionsBox(s.part || 1, "Press the space bar to return."));
    m.appendChild(box); persist();
  }
  function closeOverlay() {
    const m = $("main"); const box = $("overlay"); if (box) box.remove();
    for (const c of Array.from(m.children)) c.style.display = "";
    ev("resumed", cur.step); mode = "run"; arm(); persist();
  }

  /* ----- keys ----- */
  document.addEventListener("keydown", (e) => {
    if (mode === "start" || mode === "done" || !state) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const handled = [KEY_NO, KEY_YES, " ", "Backspace", "p", "i"].includes(key);
    if (handled) e.preventDefault();
    if (e.repeat) return;
    if (mode === "blank") { if (handled) ev("key_ignored", state.step, [key, e.code, "blank"]); return; }
    if (mode === "paused" || mode === "instructions") { if (key === " ") closeOverlay(); return; }
    if (!cur) return;
    const s = steps[cur.step], t = now();
    if (key === "Backspace") { undo(); return; }
    if (s.type !== "trial") {
      if (key === " " && cur.accepting) {
        const rt = Math.round((e.timeStamp - cur.onset) * 10) / 10;
        record({ key, code: e.code, response: "continue", rt_ms: rt, key_perf_ms: t, key_event_ms: Math.round(e.timeStamp * 10) / 10 });
        ev("continue", cur.step, rt); advance();
      } else if (key === "i" && s.part) overlay("instructions");
      return;
    }
    if (key === "p") { overlay("paused"); return; }
    if (key === "i") { overlay("instructions"); return; }
    if (key !== KEY_NO && key !== KEY_YES) { ev("other_key", cur.step, [key, e.code]); return; }
    const rt = cur.onset == null ? null : Math.round((e.timeStamp - cur.onset) * 10) / 10;
    if (!cur.accepting || rt < MIN_RT) { cur.ignored++; ev("key_ignored", cur.step, [key, e.code, rt]); return; }
    const response = key === KEY_YES ? "yes" : "no";
    record({ key, code: e.code, response, label: PARTS[s.part][response], rt_ms: rt, key_perf_ms: t, key_event_ms: Math.round(e.timeStamp * 10) / 10 });
    ev("response", cur.step, [response, rt]);
    state.last = cur.step; state.can_undo = true;
    advance();
  });
  window.addEventListener("blur", () => { if (cur) cur.blurred = true; ev("blur", state ? state.step : null); if (state) persist(); });
  window.addEventListener("focus", () => { ev("focus", state ? state.step : null); });
  document.addEventListener("visibilitychange", () => { if (cur && document.hidden) cur.blurred = true; ev(document.hidden ? "hidden" : "visible", state ? state.step : null); if (state) persist(); });
  window.addEventListener("resize", () => { ev("resize", state ? state.step : null, [window.innerWidth, window.innerHeight]); });
  window.addEventListener("beforeunload", () => { if (state) { ev("unload", state.step); persist(); } });

  /* ----- load the sentences ----- */
  fetch("stimuli.json", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(async (text) => {
      stim = JSON.parse(text); stim.sha256 = await sha256(text);
      stim.byId = {}; for (const t of stim.trials.concat(stim.practice)) stim.byId[t.id] = t;
      startScreen();
    })
    .catch((e) => { $("main").textContent = "The sentences could not be loaded (" + e + "). Reload the page."; });
})();
