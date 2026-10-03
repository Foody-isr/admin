const assert = require('node:assert/strict');
const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const test = require('node:test');
const braces = require('braces');

function rejectsDepth(operation) {
  assert.throws(operation, error => (
    error instanceof SyntaxError && error.code === 'ERR_BRACES_MAX_DEPTH'
  ));
}

function nestedAst(depth) {
  const root = { type: 'root', nodes: [] };
  let parent = root;
  for (let index = 0; index < depth; index++) {
    const node = { type: 'paren', nodes: [], parent };
    parent.nodes.push(node);
    parent = node;
  }
  parent.nodes.push({ type: 'text', value: 'x', parent });
  return root;
}

test('all installed consumers resolve the patched local package', () => {
  const expected = realpathSync(require.resolve('../vendor/braces'));
  assert.equal(realpathSync(require.resolve('braces')), expected);
  for (const consumer of ['micromatch', 'chokidar']) {
    const consumerRequire = createRequire(require.resolve(consumer));
    assert.equal(realpathSync(consumerRequire.resolve('braces')), expected);
  }
});

for (const [name, operation] of Object.entries({
  default: input => braces(input),
  parse: input => braces.parse(input),
  compile: input => braces.compile(input),
  expand: input => braces.expand(input),
  stringify: input => braces.stringify(input),
})) {
  test(`${name} rejects the advisory's deeply nested input below the character limit`, () => {
    const input = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
    assert.ok(input.length < 10000);
    rejectsDepth(() => operation(input));
  });
  test(`${name} bounds parentheses and mixed nesting too`, () => {
    rejectsDepth(() => operation('('.repeat(101) + 'x' + ')'.repeat(101)));
    rejectsDepth(() => operation('{('.repeat(51) + 'a,b' + ')}'.repeat(51)));
    rejectsDepth(() => operation('{'.repeat(101)));
  });
}

for (const name of ['compile', 'expand', 'stringify']) {
  test(`${name} also bounds callers supplying an AST directly`, () => {
    rejectsDepth(() => braces[name](nestedAst(2000)));
    const internal = require(`../vendor/braces/lib/${name}`);
    rejectsDepth(() => internal(nestedAst(2000)));
  });
}

test('ordinary glob patterns, ranges and options retain upstream behavior', () => {
  assert.deepEqual(braces.expand('src/{app,lib}/*.{ts,tsx}'), [
    'src/app/*.ts', 'src/app/*.tsx', 'src/lib/*.ts', 'src/lib/*.tsx',
  ]);
  assert.deepEqual(braces.expand('{01..03}'), ['01', '02', '03']);
  assert.deepEqual(braces.expand('{a,a,b}', { nodupes: true }), ['a', 'b']);
  assert.deepEqual(braces('{a,b}'), ['(a|b)']);
  assert.equal(braces.stringify(braces.parse('src/{app,lib}')), 'src/{app,lib}');
  const micromatch = require('micromatch');
  assert.equal(micromatch.isMatch('src/app/page.tsx', 'src/{app,lib}/**/*.{ts,tsx}'), true);
  assert.equal(micromatch.isMatch('src/app/page.css', 'src/{app,lib}/**/*.{ts,tsx}'), false);
});

test('the depth boundary remains usable and literal braces do not count', () => {
  const valid = '{'.repeat(100) + 'x' + '}'.repeat(100);
  assert.equal(braces.stringify(valid), valid);
  assert.deepEqual(braces.expand(valid), [valid]);
  const parentheses = '('.repeat(100) + 'x' + ')'.repeat(100);
  assert.equal(braces.compile(parentheses), parentheses);
  const literal = '{'.repeat(500);
  assert.equal(braces.compile('"' + literal + '"'), literal);
  assert.equal(braces.compile('\\{'.repeat(500)), literal);
  rejectsDepth(() => braces.compile('{'.repeat(101), { maxDepth: Infinity }));
  assert.throws(() => braces.parse('x'.repeat(10001)), SyntaxError);
});
