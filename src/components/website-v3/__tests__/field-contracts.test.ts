import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { FIELD_CONTRACTS } from "../field-contracts";

test("every statically rendered field ID has a registered contract", () => {
  const ids = new Set(FIELD_CONTRACTS.map((contract) => contract.id));
  const sources = sourceFiles(resolve(process.cwd(), "src/components/website-v3"));
  const rendered = new Set<string>();
  sources.forEach((source) => {
    for (const match of Array.from(
      source.matchAll(/(?:data-field-id|fieldId)="([^"]+)"/g),
    )) {
      if (!match[1].includes("${")) rendered.add(match[1]);
    }
  });
  const sectionInspector = sources.find((source) =>
    source.includes("function contentFieldsFor"),
  );
  assert.ok(sectionInspector);
  for (const match of Array.from(
    sectionInspector.matchAll(/\{ key: "([^"]+)"/g),
  )) {
    rendered.add(`section.content.${match[1]}`);
  }

  rendered.forEach((id) => assert.equal(ids.has(id), true, id));
  assert.equal(ids.has("section.page_id"), true);
  assert.equal(ids.size, FIELD_CONTRACTS.length, "field IDs must be unique");
  FIELD_CONTRACTS.forEach((contract) => {
    assert.notEqual(contract.testValue, undefined, `${contract.id}: testValue`);
    assert.ok(contract.editor.tab, `${contract.id}: editor tab`);
    assert.ok(contract.preview.expected.length > 0, `${contract.id}: preview expected`);
    assert.ok(contract.public.expected.length > 0, `${contract.id}: public expected`);
  });
});

test("every custom contract selector is backed by a foodyweb renderer hook", () => {
  const webSources = [
    ...sourceFiles(resolve(process.cwd(), "../foodyweb/components")),
    ...sourceFiles(resolve(process.cwd(), "../foodyweb/lib")),
  ].join("\n");
  assert.match(webSources, /websiteV3PageFieldHooks/);
  assert.match(webSources, /websiteV3SectionFieldHooks/);
  FIELD_CONTRACTS.forEach((contract) => {
    if (contract.id === "page.seo.title") {
      assert.equal(contract.preview.selector, "title");
      assert.equal(contract.preview.assertion, "text");
      assert.equal(contract.public.selector, "title");
      return;
    }
    if (contract.id === "page.seo.description") {
      assert.equal(contract.preview.selector, 'meta[name="description"]');
      assert.equal(contract.preview.name, "content");
      assert.equal(contract.public.selector, 'meta[name="description"]');
      return;
    }
    if (contract.id === "page.seo.share_image_url") {
      assert.equal(contract.preview.selector, 'meta[property="og:image"]');
      assert.equal(contract.preview.name, "content");
      assert.equal(contract.public.selector, 'meta[property="og:image"]');
      return;
    }
    [contract.preview.selector, contract.public.selector].forEach((selector) => {
      if (contract.editor.kind === "action") return;
      const expected = `data-field-${contract.id
        .replace(/[._]/g, "-")
        .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
      assert.equal(selector, `[${expected}]`, contract.id);
      assert.equal(contract.preview.name, expected, contract.id);
      assert.equal(contract.public.name, expected, contract.id);
    });
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") || path.endsWith(".ts")
      ? [readFileSync(path, "utf8")]
      : [];
  });
}
