import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import multer from "multer";
import type { ZodError } from "zod";
import {
  ScanBody,
  ScanResponse,
  SpeakBody,
  TranscribeBody,
  TranscribeResponse,
  TranslateBody,
  TranslateResponse,
} from "@workspace/api-zod";
import { createRateLimiter } from "../middlewares/rate-limit";

const router = Router();

// Every route below hits a paid OpenAI endpoint, so they share one IP budget.
const aiLimiter = createRateLimiter();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// The OpenAI client is created on first use, not at import time: without a key
// the constructor throws, which used to kill the whole process at boot — taking
// /api/healthz and the static client down with it.
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Returns null and answers 503 when the server has no API key configured, so a
// misconfigured deploy degrades to "AI features unavailable" instead of a crash loop.
function openaiOrFail(req: Request, res: Response): OpenAI | null {
  try {
    return getOpenAI();
  } catch (err) {
    req.log.error({ err }, "OpenAI client unavailable");
    res.status(503).json({ error: "AI service is not configured" });
    return null;
  }
}

// Request shapes — including the length caps that bound what one call can cost
// — come from lib/api-spec/openapi.yaml via the generated schemas, so the spec,
// the client hooks and this validation cannot drift apart.
function invalidRequest(res: Response, error: ZodError): void {
  const issue = error.issues[0];
  const field = issue?.path.join(".") || "body";
  res.status(400).json({ error: `Invalid ${field}: ${issue?.message ?? "invalid"}` });
}

// Whisper picks its decoder from the file name and content type, so an mp4
// recording (Safari) must not be uploaded as "audio.webm". Derived from the
// client-supplied mime type, but constrained to this whitelist so the name we
// hand to the API is never attacker-controlled.
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mpga": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

export function audioFileName(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return `audio.${AUDIO_EXTENSIONS[base] ?? "webm"}`;
}

export const LANG_NAMES: Record<string, string> = {
  mn: "Mongolian",
  en: "English",
  zh: "Chinese (Simplified)",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  th: "Thai",
  tr: "Turkish",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  ar: "Arabic",
  hi: "Hindi",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  pt: "Portuguese",
  pl: "Polish",
  uk: "Ukrainian",
};

// POST /api/transcribe — audio → text via Whisper
router.post("/transcribe", aiLimiter, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    // The file itself is validated by multer; the rest of the form is ours.
    const fields = TranscribeBody.pick({ lang: true }).safeParse(req.body);
    if (!fields.success) {
      invalidRequest(res, fields.error);
      return;
    }

    const langCode = fields.data.lang;

    const mimeType = req.file.mimetype || "audio/webm";
    const audioFile = new File([new Uint8Array(req.file.buffer)], audioFileName(mimeType), {
      type: mimeType,
    });

    const isMn = langCode === "mn";

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: langCode,
      prompt: isMn
        ? "Монгол хэл. Сайн байна уу. Баярлалаа. Та юу хэлэх вэ? Энэ юу вэ? Хэд вэ? Хаана байна вэ? Надад тусална уу. Би ойлгосонгүй. Дахин хэлнэ үү. Хэдэн төгрөг вэ? Хаашаа явах вэ? Буудал хаана байдаг вэ? Та англиар ярьдаг уу? Манай найз. Орчуулна уу."
        : undefined,
    });

    res.json(TranscribeResponse.parse({ text: transcription.text }));
  } catch (err) {
    req.log.error({ err }, "Transcription error");
    res.status(500).json({ error: "Transcription failed" });
  }
});

// POST /api/translate — text → translated text via GPT
router.post("/translate", aiLimiter, async (req, res) => {
  try {
    const body = TranslateBody.safeParse(req.body);
    if (!body.success) {
      invalidRequest(res, body.error);
      return;
    }

    const { text, fromLang, toLang } = body.data;

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    const fromName = LANG_NAMES[fromLang] || fromLang;
    const toName = LANG_NAMES[toLang] || toLang;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following text from ${fromName} to ${toName}. Return ONLY the translation, no explanations, no extra text.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
    });

    const translated = completion.choices[0]?.message?.content?.trim() || "";
    res.json(TranslateResponse.parse({ translated }));
  } catch (err) {
    req.log.error({ err }, "Translation error");
    res.status(500).json({ error: "Translation failed" });
  }
});

// POST /api/tts — text → audio via OpenAI TTS
router.post("/tts", aiLimiter, async (req, res) => {
  try {
    const body = SpeakBody.safeParse(req.body);
    if (!body.success) {
      invalidRequest(res, body.error);
      return;
    }

    const { text, speed } = body.data;

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
      speed: speed ?? 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "TTS error");
    res.status(500).json({ error: "TTS failed" });
  }
});

// POST /api/scan — image → detected text + translation via GPT-4o vision
router.post("/scan", aiLimiter, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No image provided" });
      return;
    }

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    const fields = ScanBody.pick({ toLang: true }).safeParse(req.body);
    if (!fields.success) {
      invalidRequest(res, fields.error);
      return;
    }

    const toLang = fields.data.toLang;
    const toName = LANG_NAMES[toLang] || toLang;

    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this image and extract ALL visible text from it. Then translate that text into ${toName}. 
Respond in this exact JSON format:
{"detected": "<original text from image>", "translated": "<translation in ${toName}>"}
If no text is found, respond: {"detected": "", "translated": "Текст олдсонгүй"}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Parse error" });
      return;
    }
    // The model was asked for this shape, but it is still model output.
    const parsed = ScanResponse.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      req.log.error({ err: parsed.error }, "Scan returned an unexpected shape");
      res.status(500).json({ error: "Scan failed" });
      return;
    }

    res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, "Scan error");
    res.status(500).json({ error: "Scan failed" });
  }
});

export default router;
