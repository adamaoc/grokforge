/**
 * Modular greenfield-related prompt sections (extracted for better maintainability).
 * These were previously defined inside agent-harness-profile.ts.
 */

export const GREENFIELD_HARNESS_MARKER = 'Harness: greenfield plan'

export const GREENFIELD_SCAFFOLD_MANIFEST_MARKER = 'Harness: greenfield scaffold manifest'

export const GREENFIELD_PLAN_SECTIONS: readonly string[] = [
  GREENFIELD_HARNESS_MARKER,
  GREENFIELD_SCAFFOLD_MANIFEST_MARKER,
  'GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER',
  'This workspace is **empty or nearly empty**. Plan a concrete bootstrap the executor can run without guessing paths.',
  '**Project shape:** Pick one and state it explicitly in the plan summary and steps:',
  '- **Vite + React + TS (or similar):** list `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`; include **`npm create`** / **`npm install`** steps for the executor (**126** `run_command` after approval).',
  '- **Static site (vanilla):** list `index.html`, `styles.css`, `script.js` with external `<script src="script.js">` — no `package.json` unless the user asked for a build tool.',
  '**File list:** Every `filesLikelyTouched` entry and each step title must name **concrete paths** under workspace roots (e.g. `src/App.tsx`, `package.json`, `index.html`) — no vague “add components” without paths.',
  '**Dependencies:** When the app needs npm, include `package.json` in `filesLikelyTouched`, an install step, and name verification commands (`npm install`, `npm run typecheck`, `npm test`) in `verification` and in step titles where appropriate.',
  '**Verification:** Include at least one **command-shaped** string the executor can run via approvable `run_command` — not browser-only checks for local static assets.',
  '- **Static (`file_bootstrap`):** name a local serve command in `verification` and a step title (e.g. `npx --yes serve . -l 3000` or `python3 -m http.server 3000`), then manual browser UI check. User may substitute an equivalent serve command on their OS.',
  '- **npm / Vite / React (`cli_scaffold`):** `npm install` (if needed), then `npm run dev`, `npm run typecheck`, or `npm run build` in `verification` and step titles.',
  'Do **not** end with verification that is **only** “open in browser” when files are local HTML/CSS/JS — always include a preceding serve or build command.',
  '**Formatting:** Require real line breaks in HTML/CSS/JS — never one-line minified markup in the plan.',
  '**Tool budget:** Call `list_directory` once (plus retrieval if needed), then **stop discovery** and emit the `gf-plan` fence in your final answer — do not loop on more listing/search tools.',
]

export const GREENFIELD_EXECUTE_CLI_MARKER = 'Harness: greenfield execute CLI'

export const GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS: readonly string[] = [
  '## Greenfield execute (bootstrap)',
  GREENFIELD_EXECUTE_CLI_MARKER,
  GREENFIELD_SCAFFOLD_MANIFEST_MARKER,
  'When the approved plan mentions **npm**, **install**, **scaffold**, or **git init**, prefer **`run_command`** first (`npm create`, `npm install`, `git init`) — then **`read_file`** / **`propose_file_edits`** only for customization. Do not invent a full template tree by hand when a CLI scaffold exists.',
  'For **vanilla static** plans without a build step, prefer **one `propose_file_edits`** with every new file the plan lists (`index.html`, `styles.css`, `script.js`, etc.) when the combined payload is reasonably small.',
  'When the plan names **`script.js`** (or another JS path), use **external** `<script src="script.js">` in HTML — do **not** put all application logic in a crushed inline `<script>` block.',
  'For modifications to existing files, strongly prefer the **`edit`** tool (precise `edits[]` array) over full `propose_file_edits`. This produces much cleaner, higher-quality results.',
  'For **package.json** / **tsconfig.json** / **vite.config.***: emit **valid JSON** (double-quoted keys). Minified one-line JSON is acceptable if parseable; invalid JSON is rejected — prefer **`run_command`** (`npm create`, `npm init`) when the plan names a framework CLI.',
  'Each `write_file` (in propose_file_edits) must be a **complete**, **multi-line** file. Use real line breaks.',
  'HTML must use **plain UTF-8 text** in attributes and body copy — no HTML entity encoding (&#34;, &quot;) or JSON-style backslash-u escapes in the file body.',
  'In JavaScript (`script.js`, etc.): **one statement per line** with real line breaks — not a one-line stub. No glued `}function` / `}););`, no code after `//` on the same line, no orphan `)` lines; comments on their own lines only.',
  '**`script.js` must be runnable:** include state, DOM/update helpers, and event wiring the plan describes — never an empty file, a lone `// TODO`, or logic deferred to HTML when the plan lists external JS.',
  'After install/scaffold commands succeed, **`read_file`** new paths before editing; GrokForge refreshes the workspace index when commands create files.',
  'If GrokForge rejects one path in a multi-file proposal, retry with **complete bodies for the failed paths only** — other accepted files are already in the pending review.',
  'SCAFFOLD_COMMAND_GUIDANCE_MARKER',
  // Note: SCAFFOLD_COMMAND_EXAMPLES is imported separately in the profile for now
  'After a successful scaffold command, **`read_file`** `package.json`, vite config, and entry files — do not rely on `list_directory` alone to confirm React/TypeScript (or the requested stack).',
]

export const SCAFFOLD_STRATEGY_ROUTING_MARKER = 'Harness: greenfield scaffold strategy routing 128'

export const SCAFFOLD_STRATEGY_NUDGE_MARKER = 'Harness: scaffold strategy conflict'