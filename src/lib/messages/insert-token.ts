// Pure string-splice math behind the token-insertion chips in the template
// editor (TemplateEditor.tsx). Separated out so it can be unit-tested with
// plain node:test, the same way render.ts/registry.ts already are in this
// feature — no DOM, no React, no jsdom needed. The component keeps every
// DOM-y part (reading el.selectionStart/selectionEnd, el.focus(),
// requestAnimationFrame, setSelectionRange) and calls this for the actual
// string arithmetic.

export interface TokenInsertion {
  /** `body` after the token has been spliced in. */
  next: string;
  /** Where the caret should land afterward: immediately after the inserted token. */
  caret: number;
}

/**
 * Insert `token` into `body`, replacing the `[start, end)` selection
 * (`start === end` for a plain cursor with nothing selected). Mirrors what
 * `textarea.setRangeText(token, start, end)` does to the value, expressed as
 * pure string math.
 */
export function spliceToken(body: string, start: number, end: number, token: string): TokenInsertion {
  const next = body.slice(0, start) + token + body.slice(end);
  return { next, caret: start + token.length };
}
