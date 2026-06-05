/**
 * Code Quality Contract for agent edits (inspired by Pi multi-edit discipline
 * and Hermes structured patch + post-write linting).
 *
 * The goal is to make producing clean, readable, maintainable code the
 * default behavior instead of something the model has to remember under pressure.
 */

export const CODE_QUALITY_CONTRACT_MARKER = '## Code Quality Contract'

/**
 * Core rules that should be injected into executor profiles, iterative Work
 * sections, and the key tool descriptions.
 */
export const CODE_QUALITY_CONTRACT: readonly string[] = [
  CODE_QUALITY_CONTRACT_MARKER,
  'Every file you write or edit must be **runnable and readable as a human developer would write it**.',
  '',
  '**Formatting rules (non-negotiable):',
  '- One logical statement per line. Never glue statements together.',
  '- Use real line breaks (standard \\n in JSON). Never output a file as a single line.',
  '- Preserve original indentation, comments, and formatting for every unchanged section.',
  '- For JavaScript/TypeScript/TSX/JSX: no `}function`, no `}););`, no code after `//` on the same line, no orphan `)` lines.',
  '- For Markdown/HTML: proper blank lines after headings, no glued `## HeadingText`.',
  '',
  '**When using `propose_file_edits` or full `write_file`:',
  '- Send the **complete** file (or complete logical component/section) from the latest `read_file` `rawContent`.',
  '- Make minimal, precise changes to the parts that need editing. Do not rewrite unrelated code.',
  '- The result after your edit must look like clean, professional source code.',
  '',
  '**When using `search_replace` / multi-edit tools:',
  '- Provide sufficiently large, unique `oldText` contexts so replacements are unambiguous.',
  '- The `newText` must maintain the same formatting style and readability as the surrounding code.',
  '',
  'GrokForge will reject proposals that are crushed, minified, or unreadable even if the logic is correct. Clean code is part of a successful edit.',
  '',
  '**Zero tolerance on medium-to-large files:** For any file over ~80 lines (or any substantial component), GrokForge applies **strict formatting enforcement**. Even one glued statement (`}function`, `}););`, code after `//` on the same line, or a run of lines without proper breaks will cause immediate rejection. You will be instructed to re-read `rawContent` and produce a clean version. There is no "we will fix formatting later" — it must be correct on the first proposal for larger files.',
  '',
  '**First-proposal reliability (critical for new files and large writes):**',
  'Before emitting any `propose_file_edits` write_file or large replacement, mentally execute the generated code and check for common issues:',
  '- JavaScript: DOM elements referenced by id/class actually exist in the HTML you are writing in the same proposal; event listeners are attached after DOM is ready (DOMContentLoaded, defer, or script at end of body); no reference errors (variables declared before use, correct function names); balanced braces/quotes; no missing semicolons that would break in strict contexts.',
  '- Event handlers and logic: buttons actually call the functions you defined; loops and conditionals have correct termination; state updates cause visible changes.',
  '- Static vanilla sites: external scripts load after HTML (or use defer); no inline script that runs too early and fails to find elements.',
  'If any issue is found during this mental review, fix it in the proposal before sending. The goal is working, bug-free code on the first proposal — not "we will fix it later".',
] as const

/** One-line version suitable for tool descriptions. */
export const CODE_QUALITY_CONTRACT_SHORT =
  'Every edit (especially propose_file_edits on files >80 lines) must produce clean, readable code on the FIRST attempt: one statement per line, real line breaks, zero glued statements. GrokForge strictly rejects crushed/minified output on medium+ files — re-read rawContent and fix formatting before proposing. Self-review before emitting.'

/** JS/TS specific formatting rules for error messages. */
export const JAVASCRIPT_CODE_QUALITY_RULES =
  'JavaScript/TypeScript must use one statement per line with proper formatting on the first proposal. No `}function`, no `}););`, no code after // on the same line, no orphan ) lines. On files > ~80 lines: zero tolerance — any glued or minified output triggers hard rejection. Before proposing, mentally verify: DOM elements exist, events attach correctly, no reference errors. Re-read rawContent and emit clean multi-line source. The output must be readable, runnable source code on first attempt, not minified or crushed.'

/**
 * Returns the full contract as a single string block, suitable for injection
 * into system prompts.
 */
export function getCodeQualityContractBlock(): string {
  return CODE_QUALITY_CONTRACT.join('\n')
}
