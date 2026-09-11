import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import multer from "multer";

const router = Router();
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

const LANG_NAMES: Record<string, string> = {
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
router.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided" });
      return;
    }

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    const langCode = (req.body.lang as string) || "mn";

    const audioFile = new File([new Uint8Array(req.file.buffer)], "audio.webm", {
      type: req.file.mimetype || "audio/webm",
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

    res.json({ text: transcription.text });
  } catch (err: any) {
    req.log.error({ err }, "Transcription error");
    res.status(500).json({ error: err.message || "Transcription failed" });
  }
});

// POST /api/translate — text → translated text via GPT
router.post("/translate", async (req, res) => {
  try {
    const { text, fromLang, toLang } = req.body as {
      text: string;
      fromLang: string;
      toLang: string;
    };

    if (!text || !fromLang || !toLang) {
      res.status(400).json({ error: "Missing text, fromLang, or toLang" });
      return;
    }

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
    res.json({ translated });
  } catch (err: any) {
    req.log.error({ err }, "Translation error");
    res.status(500).json({ error: err.message || "Translation failed" });
  }
});

// POST /api/tts — text → audio via OpenAI TTS
router.post("/tts", async (req, res) => {
  try {
    const { text, lang, speed } = req.body as { text: string; lang: string; speed?: number };

    if (!text) {
      res.status(400).json({ error: "Missing text" });
      return;
    }

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
      speed: speed && speed >= 0.25 && speed <= 4.0 ? speed : 1.0,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err: any) {
    req.log.error({ err }, "TTS error");
    res.status(500).json({ error: err.message || "TTS failed" });
  }
});

// POST /api/scan — image → detected text + translation via GPT-4o vision
router.post("/scan", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No image provided" });
      return;
    }

    const openai = openaiOrFail(req, res);
    if (!openai) return;

    const toLang = (req.body.toLang as string) || "mn";
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
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err: any) {
    req.log.error({ err }, "Scan error");
    res.status(500).json({ error: err.message || "Scan failed" });
  }
});

export default router;
