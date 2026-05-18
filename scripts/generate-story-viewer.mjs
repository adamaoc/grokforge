import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const tasksDir = join(repoRoot, 'project_tasks')
const readmePath = join(tasksDir, 'README.md')
const outputPath = join(tasksDir, 'stories.html')

const readme = readFileSync(readmePath, 'utf8')

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inlineMarkdown(value) {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return html
}

function statusClass(status) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

function parseStatuses(markdown) {
  const statuses = new Map()

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(\d{3})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|$/)
    if (!match) continue

    const [, id, title, rawStatus] = match
    if (id === '---') continue

    const statusRaw = rawStatus.replace(/\*\*/g, '').trim()
    let status
    if (/^done\b/i.test(statusRaw)) status = 'Done'
    else if (/^closed\b/i.test(statusRaw)) status = 'Closed'
    else if (/^not started\b/i.test(statusRaw)) status = 'Not started'
    else continue

    if (!['Done', 'Closed', 'Not started'].includes(status)) continue

    statuses.set(id, {
      title: title.trim().replace(/\s+/g, ' '),
      status,
    })
  }

  return statuses
}

function getStoryFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{3}-.+\.md$/.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort()
}

function headingFromMarkdown(markdown, fallback) {
  const firstHeading = markdown.match(/^#\s+(.+)$/m)
  return firstHeading ? firstHeading[1].trim() : fallback
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/)
  const output = []
  let paragraph = []
  let listType = null
  let inCode = false
  let codeBuffer = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const closeList = () => {
    if (!listType) return
    output.push(`</${listType}>`)
    listType = null
  }

  const openList = (type) => {
    if (listType === type) return
    closeList()
    output.push(`<${type}>`)
    listType = type
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushParagraph()
      closeList()

      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
        codeBuffer = []
        inCode = false
      } else {
        inCode = true
      }

      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      continue
    }

    if (!trimmed) {
      flushParagraph()
      closeList()
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = Math.min(heading[1].length + 1, 5)
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    if (unordered) {
      flushParagraph()
      openList('ul')

      const task = unordered[1].match(/^\[( |x|X)\]\s+(.+)$/)
      if (task) {
        const checked = task[1].toLowerCase() === 'x' ? ' checked' : ''
        output.push(`<li><input type="checkbox" disabled${checked}> ${inlineMarkdown(task[2])}</li>`)
      } else {
        output.push(`<li>${inlineMarkdown(unordered[1])}</li>`)
      }

      continue
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      openList('ol')
      output.push(`<li>${inlineMarkdown(ordered[1])}</li>`)
      continue
    }

    const blockquote = trimmed.match(/^>\s+(.+)$/)
    if (blockquote) {
      flushParagraph()
      closeList()
      output.push(`<blockquote>${inlineMarkdown(blockquote[1])}</blockquote>`)
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()
  closeList()

  return output.join('\n')
}

const statuses = parseStatuses(readme)
const storyPaths = [
  ...getStoryFiles(tasksDir),
  ...getStoryFiles(join(tasksDir, 'post-mvp')),
]

const stories = storyPaths.map((filePath) => {
  const markdown = readFileSync(filePath, 'utf8')
  const file = relative(tasksDir, filePath)
  const id = basename(filePath).slice(0, 3)
  const statusRecord = statuses.get(id)
  const title = statusRecord?.title ?? headingFromMarkdown(markdown, basename(filePath, '.md'))
  const status = statusRecord?.status ?? 'Post-MVP'
  const postMvp = file.startsWith('post-mvp/')

  return {
    id,
    title,
    status,
    postMvp,
    file,
    body: renderMarkdown(markdown),
  }
})

const counts = stories.reduce((acc, story) => {
  acc.set(story.status, (acc.get(story.status) ?? 0) + 1)
  return acc
}, new Map())

const generatedAt = new Date().toISOString().slice(0, 10)

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GrokForge Stories</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09090b;
      --panel: #18181b;
      --panel-2: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --line: #3f3f46;
      --accent: #00ff9f;
      --accent-soft: rgba(0, 255, 159, 0.12);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 56px;
    }

    header {
      display: grid;
      gap: 14px;
      margin-bottom: 28px;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 3.5rem);
      line-height: 1;
      letter-spacing: 0;
    }

    .lede {
      max-width: 720px;
      margin: 0;
      color: var(--muted);
      font-size: 1rem;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0 0;
    }

    .story-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }

    .story-filters label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      color: var(--muted);
      font-size: 0.9rem;
      user-select: none;
    }

    .story-filters input[type="checkbox"] {
      width: 16px;
      height: 16px;
    }

    body.stories-hide-done .story-list details[data-status="done"],
    body.stories-hide-done .story-list details[data-status="closed"] {
      display: none;
    }

    .pill,
    .status {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 10px;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 650;
    }

    .status {
      color: var(--text);
    }

    .status-done {
      border-color: rgba(0, 255, 159, 0.35);
      background: var(--accent-soft);
      color: #9dffd8;
    }

    .status-not-started {
      border-color: rgba(161, 161, 170, 0.32);
      color: #d4d4d8;
    }

    .status-closed {
      border-color: rgba(251, 191, 36, 0.35);
      background: rgba(251, 191, 36, 0.1);
      color: #fde68a;
    }

    .status-post-mvp {
      border-color: rgba(125, 211, 252, 0.35);
      background: rgba(125, 211, 252, 0.1);
      color: #bae6fd;
    }

    .story-list {
      display: grid;
      gap: 10px;
    }

    details {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      overflow: clip;
    }

    details[open] {
      border-color: color-mix(in srgb, var(--accent) 36%, var(--line));
    }

    summary {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      cursor: pointer;
      list-style: none;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary::before {
      content: "+";
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--muted);
      font-weight: 700;
    }

    details[open] summary::before {
      content: "-";
      color: var(--accent);
      border-color: rgba(0, 255, 159, 0.36);
    }

    .story-title {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: baseline;
      min-width: 0;
    }

    .story-id {
      color: var(--accent);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .story-name {
      overflow-wrap: anywhere;
      font-weight: 720;
    }

    .story-body {
      border-top: 1px solid var(--line);
      padding: 18px 22px 24px;
      background: #111113;
    }

    .story-body h2,
    .story-body h3,
    .story-body h4,
    .story-body h5 {
      margin: 1.4em 0 0.45em;
      line-height: 1.18;
      letter-spacing: 0;
    }

    .story-body h2:first-child {
      margin-top: 0;
    }

    .story-body p,
    .story-body ul,
    .story-body ol,
    .story-body blockquote,
    .story-body pre {
      margin: 0.7em 0;
    }

    .story-body ul,
    .story-body ol {
      padding-left: 1.35rem;
    }

    .story-body li + li {
      margin-top: 0.25em;
    }

    .story-body code {
      border: 1px solid var(--line);
      border-radius: 5px;
      background: var(--panel-2);
      padding: 0.12em 0.35em;
      color: #e4e4e7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
    }

    .story-body pre {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0b0b0d;
      padding: 14px;
    }

    .story-body pre code {
      border: 0;
      background: transparent;
      padding: 0;
    }

    .story-body a,
    .story-link {
      color: #9dffd8;
      text-decoration: none;
    }

    .story-body a:hover,
    .story-link:hover {
      text-decoration: underline;
    }

    .source-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
      color: var(--muted);
      font-size: 0.85rem;
    }

    input[type="checkbox"] {
      accent-color: var(--accent);
      vertical-align: middle;
    }

    @media (max-width: 720px) {
      main {
        width: min(100% - 20px, 1120px);
        padding-top: 20px;
      }

      summary {
        grid-template-columns: auto 1fr;
      }

      summary .status {
        grid-column: 2;
        justify-self: start;
      }

      .story-body {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>GrokForge Stories</h1>
      <p class="lede">A static viewer generated from <code>project_tasks/README.md</code> and the story Markdown files. Open a row to read the full story without leaving the overview.</p>
      <div class="meta">
        <span class="pill">${stories.length} stories</span>
        ${[...counts.entries()]
          .map(([status, count]) => `<span class="pill">${escapeHtml(status)}: ${count}</span>`)
          .join('\n        ')}
        <span class="pill">Generated ${generatedAt}</span>
      </div>
      <div class="story-filters">
        <label>
          <input type="checkbox" id="stories-show-done" checked />
          Show done and closed stories
        </label>
      </div>
    </header>

    <section class="story-list" aria-label="Project stories">
      ${stories
        .map(
          (story) => `<details id="story-${story.id}" data-status="${statusClass(story.status)}">
        <summary>
          <span class="story-title"><span class="story-id">${story.id}</span><span class="story-name">${escapeHtml(story.title)}</span></span>
          <span class="status status-${statusClass(story.status)}">${escapeHtml(story.status)}</span>
        </summary>
        <div class="story-body">
          <div class="source-row">
            <span>${story.postMvp ? 'Post-MVP' : 'MVP sequence'}</span>
            <a class="story-link" href="${encodeURI(story.file)}">${escapeHtml(story.file)}</a>
          </div>
          ${story.body}
        </div>
      </details>`,
        )
        .join('\n      ')}
    </section>
  </main>
  <script>
    (function () {
      var el = document.getElementById('stories-show-done')
      if (!el) return
      function apply() {
        document.body.classList.toggle('stories-hide-done', !el.checked)
      }
      el.addEventListener('change', apply)
      apply()
    })()
  </script>
</body>
</html>
`

writeFileSync(outputPath, html)
console.log(`Wrote ${relative(repoRoot, outputPath)} with ${stories.length} stories.`)
