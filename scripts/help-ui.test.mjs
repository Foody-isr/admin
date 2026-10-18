import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkUIEvidence } from './check-help-ui.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foody-help-ui-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), typeof text === 'string' ? text : JSON.stringify(text)); };
  write('docs/help/ui-evidence.json', { schemaVersion: 1, repository: 'Foody-isr/admin', ref: 'a'.repeat(40),
    observations: [{ id: 'item-list', source: 'src/items.tsx', required: ['<ListToolbar'], forbidden: ['<ArticlesKpiRow'] }],
    guides: [{ article: 'menu/items', required: {fr: ['liste'], he: ['רשימה'], en: ['list']}, forbidden: {fr: ['trois onglets'], he: ['שלוש לשוניות'], en: ['three tabs']} }] });
  write('src/items.tsx', '<ListToolbar />');
  for (const [lang, text] of Object.entries({fr: 'Une liste continue', he: 'רשימה רציפה', en: 'A continuous list'})) write('src/content/help/' + lang + '/menu/items.mdx', text);
  return {root, write};
}
test('current continuous-list guidance and rendered-route evidence pass together', t => {
  const {root}=fixture(t); assert.deepEqual(checkUIEvidence(root, root), []);
});
test('old three-tab instructions fail even when source hashes and article URLs are valid', t => {
  const {root,write}=fixture(t); write('src/content/help/en/menu/items.mdx','A list in three tabs');
  assert.ok(checkUIEvidence(root,root).some(error=>error.includes('obsolete UI')));
});
test('missing translated current-screen wording fails independently for Hebrew', t => {
  const {root,write}=fixture(t); write('src/content/help/he/menu/items.mdx','מדריך ישן');
  assert.ok(checkUIEvidence(root,root).some(error=>error.includes('he missing')));
});
test('a KPI component present on the rendered route invalidates the documented no-KPI screen', t => {
  const {root,write}=fixture(t); write('src/items.tsx','<ListToolbar /><ArticlesKpiRow />');
  assert.ok(checkUIEvidence(root,root).some(error=>error.includes('no longer holds')));
});
test('removing a reviewed current control forces another UI/guide review', t => {
  const {root,write}=fixture(t); write('src/items.tsx','<DifferentScreen />');
  assert.ok(checkUIEvidence(root,root).some(error=>error.includes('UI changed')));
});
