import test from "node:test";
import assert from "node:assert/strict";
import { extensionForMime, pickRecordingMimeType } from "./audio-format";

test("maps each browser's recording format to a matching extension", () => {
  assert.equal(extensionForMime("audio/mp4"), "mp4"); // Safari / iOS
  assert.equal(extensionForMime("audio/webm;codecs=opus"), "webm"); // Chrome
  assert.equal(extensionForMime("audio/ogg;codecs=opus"), "ogg"); // Firefox
  assert.equal(extensionForMime("audio/mpeg"), "mp3");
  assert.equal(extensionForMime("AUDIO/WAV"), "wav");
});

test("falls back to webm when the browser reports nothing useful", () => {
  assert.equal(extensionForMime(""), "webm");
  assert.equal(extensionForMime("application/octet-stream"), "webm");
});

test("picks no explicit format where MediaRecorder is unavailable", () => {
  // Node has no MediaRecorder, same as an old browser: the caller then lets the
  // browser choose instead of forcing an unsupported mime type.
  assert.equal(pickRecordingMimeType(), undefined);
});
