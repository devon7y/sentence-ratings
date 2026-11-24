# Sentence ratings

A two-key rating task that runs entirely in the browser. Nothing is sent anywhere: every key press is saved in the
browser (localStorage) and the rater downloads the log as one JSON file.

- `index.html`, `app.js`: the page.
- `stimuli.json`: the constructs and definitions, the scales and their items, 750 sentence-scale pairs and five
  warm-up pairs.

## Task

Part 1 shows a construct, its definition and a sentence. Part 2 shows the construct, its definition, the items of
one scale and a sentence, with the sentences of a scale together. `z` and `/` are the two answers. Backspace returns
to the sentence just answered, `p` pauses, `i` shows the instructions. The order of the sentences is fixed by the
stimulus file's seed and the rater's ID.

## The log file

| Field | What it holds |
|---|---|
| `rater`, `created_iso`, `completed_iso`, `complete` | who, when started, when finished |
| `stimuli` | the seed, the number of pairs and the SHA-256 of `stimuli.json` |
| `keys`, `labels`, `min_rt_ms`, `blank_ms` | the key mapping, the response labels of each part, the 250 ms in which a press is ignored, the 200 ms blank between sentences |
| `sessions` | one entry per page load: time, browser, language, time zone, screen and window size, pixel ratio, the step resumed at |
| `schedule` | the rater's whole order: every screen with its part, pair, position, scale block and position in the block |
| `trials` | one row per answered sentence: `part`, `phase` (practice or main), `pos`, `block`, `in_block`, `block_size`, `id`, `construct`, `instrument`, `row` (the sentence's row in its region), `characters`, `items_shown`, `key`, `code`, `response` (yes or no), `label`, `rt_ms` (from the first painted frame to the key press), `iso`, `epoch_ms`, `session`, `ignored_presses`, `lost_focus`, `pauses`, `instructions_opened`, `items_scrolls`, `attempts` and `earlier_responses` when a sentence was answered again |
| `screens` | the same for the instruction, message and scale screens (`rt_ms` of a scale screen is the time spent reading its items) |
| `answers` | every answer to every screen, earlier attempts included, keyed by step |
| `events` | every event in order, as `[epoch_ms, perf_ms, session, type, step, detail]`: `session_start`, `shown`, `onset`, `response`, `continue`, `key_ignored`, `other_key`, `undo`, `paused`, `instructions`, `resumed`, `blur`, `focus`, `hidden`, `visible`, `resize`, `download`, `import`, `completed`, `unload`, `storage_error` |
