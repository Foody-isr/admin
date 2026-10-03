'use strict';

// Bound both brace and parenthesis AST nesting before any recursive traversal.
const MAX_DEPTH = 100;

/** Reject syntax trees that would exhaust the JavaScript call stack. */
const assertDepth = depth => {
  if (depth > MAX_DEPTH) {
    const error = new SyntaxError(`Pattern nesting exceeds the maximum depth (${MAX_DEPTH})`);
    error.code = 'ERR_BRACES_MAX_DEPTH';
    throw error;
  }
};

module.exports = { MAX_DEPTH, assertDepth };
