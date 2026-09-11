// Safari records audio/mp4, Chrome and Firefox audio/webm. Whisper rejects a
// file whose name and content-type don't match its actual bytes, so record in
// whatever the browser supports and label the upload with that same format
// instead of always claiming "audio.webm".
export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base.includes("mp4") || base.includes("m4a") || base.includes("aac")) return "mp4";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("wav")) return "wav";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  return "webm";
}
