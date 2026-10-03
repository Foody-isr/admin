# Foody security patch of braces 3.0.3

Temporary private fork for GHSA-vfj7-8cjw-p6xm / CVE-2026-93687. There was no
patched upstream release on 2026-10-03. The root npm override replaces every
transitive `braces` installation with this reviewed source; it is not an audit
exception. Keep the upstream MIT license and attribution in this directory.

Source: https://registry.npmjs.org/braces/-/braces-3.0.3.tgz
Verified SHA-512 (base64):
`yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==`
Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
Upstream report: https://github.com/micromatch/braces/issues/70

The runtime is unchanged except for `lib/depth.js` and calls to its guard in
`parse`, `compile`, `expand`, and `stringify`. The parser caps combined brace and
parenthesis nesting at 100 levels, including malformed input. Recursive walkers
also guard directly supplied ASTs. Excess nesting throws a bounded `SyntaxError`
with code `ERR_BRACES_MAX_DEPTH`, consistent with the existing input-length
validation. Options cannot disable the safety limit. Normal patterns, escaping,
ranges, expansion limits and public exports retain upstream behavior.

`npm run test:dependencies` runs in CI before the unchanged npm security audit.
It verifies actual consumer resolution, the advisory reproducer, mixed nesting,
AST input and common glob behavior. The package is explicitly named
`@foody/braces` to distinguish this local patch from an upstream release. Registry
advisories cannot audit our local changes; keep these regression tests and review
future upstream braces advisories against this fork.

Once upstream publishes a verified fix, replace the override with that release,
remove this fork, and retain equivalent dependency regression coverage.
