import { describe, expect, it } from 'vitest'
import {
  assessProposalWriteContent,
  detectCorruptSourceLines,
  detectIncompleteHtmlDocument,
} from './agent-edit-corrupt-content'

const CORRUPT_SAMPLE = `<!DOCTYPE html>
<html>
<body>
)
)
)
)
);
)
)
</body>
</html>`

const CLEAN_TODO_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Todo</title></head>
<body>
  <ul id="todo-list"></ul>
  <script>
    const list = document.getElementById('todo-list');
    list.appendChild(document.createElement('li'));
  </script>
</body>
</html>`

describe('detectCorruptSourceLines', () => {
  it('flags many orphan close-paren lines', () => {
    const r = detectCorruptSourceLines(CORRUPT_SAMPLE)
    expect(r.corrupt).toBe(true)
    expect(r.reason).toMatch(/orphan closing parentheses/i)
  })

  it('allows clean todo HTML', () => {
    expect(detectCorruptSourceLines(CLEAN_TODO_HTML).corrupt).toBe(false)
  })

  it('flags truncated HTML opener without html tag', () => {
    expect(
      detectIncompleteHtmlDocument('<!DOCTYPE html> html lang="en"').incomplete,
    ).toBe(true)
    expect(
      assessProposalWriteContent('<!DOCTYPE html> html lang="en"').ok,
    ).toBe(false)
  })

  it('allows a few isolated closing parens in real JS', () => {
    const js = `function a() {
  return (
    1
  );
}
function b() {
  return (
    2
  );
}
`
    expect(detectCorruptSourceLines(js).corrupt).toBe(false)
  })
})
