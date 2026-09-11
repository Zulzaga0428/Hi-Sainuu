import test from "node:test";
import assert from "node:assert/strict";
import { TranslateBody } from "@workspace/api-zod";
import { audioFileName, LANG_NAMES } from "./translate";

test("names the upload after the format the browser actually recorded", () => {
  // Safari records mp4; handing Whisper an "audio.webm" full of mp4 bytes fails.
  assert.equal(audioFileName("audio/mp4"), "audio.mp4");
  assert.equal(audioFileName("audio/mp4;codecs=mp4a.40.2"), "audio.mp4");
  assert.equal(audioFileName("audio/webm;codecs=opus"), "audio.webm");
  assert.equal(audioFileName("audio/ogg"), "audio.ogg");
  assert.equal(audioFileName("AUDIO/WAV"), "audio.wav");
});

test("falls back to webm for anything unrecognised", () => {
  assert.equal(audioFileName("audio/octet-stream"), "audio.webm");
  assert.equal(audioFileName(""), "audio.webm");
});

test("ignores a client-supplied name and stays inside the whitelist", () => {
  assert.equal(audioFileName("../../etc/passwd"), "audio.webm");
  assert.equal(audioFileName("audio/webm; name=../../evil.sh"), "audio.webm");
});

test("every language in the spec has an English name to translate into", () => {
  // The codes live in lib/api-spec/openapi.yaml and reach here through the
  // generated enum; LANG_NAMES is what the model is actually told to translate
  // to. A code missing a name would silently ask GPT for, say, "uk".
  const codes = TranslateBody.shape.toLang.options;
  const unnamed = codes.filter((code) => !LANG_NAMES[code]);

  assert.deepEqual(unnamed, [], `language codes with no English name: ${unnamed.join(", ")}`);
});
