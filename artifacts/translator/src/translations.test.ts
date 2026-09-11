import test from "node:test";
import assert from "node:assert/strict";
import { TRANSLATIONS, getT } from "./translations";
import { LANGUAGES } from "./lib/languages";

const REFERENCE_LOCALE = "mn";

test("every language the picker offers has its own UI translation", () => {
  const missing = LANGUAGES.map((lang) => lang.code).filter((code) => !TRANSLATIONS[code]);

  assert.deepEqual(missing, [], `locales missing from translations.ts: ${missing.join(", ")}`);
});

test("no locale is missing a key or left blank", () => {
  const expected = Object.keys(TRANSLATIONS[REFERENCE_LOCALE]).sort();

  for (const [code, strings] of Object.entries(TRANSLATIONS)) {
    assert.deepEqual(Object.keys(strings).sort(), expected, `${code} has a different key set`);

    for (const [key, value] of Object.entries(strings)) {
      assert.ok(value.trim().length > 0, `${code}.${key} is empty`);
    }
  }
});

test("an unknown language code falls back to Mongolian", () => {
  assert.equal(getT("xx"), TRANSLATIONS[REFERENCE_LOCALE]);
});
