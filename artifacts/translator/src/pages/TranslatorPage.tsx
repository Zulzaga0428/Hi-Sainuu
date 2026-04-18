import { useState, useRef } from "react";
import { Mic, MicOff, Globe, ChevronDown, RefreshCw, Volume2, X, Camera, Keyboard, Send } from "lucide-react";

const LANGUAGES = [
  { code: "mn", label: "Монгол", flag: "🇲🇳" },
  { code: "en", label: "Англи", flag: "🇺🇸" },
  { code: "zh", label: "Хятад", flag: "🇨🇳" },
  { code: "ru", label: "Орос", flag: "🇷🇺" },
  { code: "ja", label: "Япон", flag: "🇯🇵" },
  { code: "ko", label: "Солонгос", flag: "🇰🇷" },
  { code: "th", label: "Тайланд", flag: "🇹🇭" },
];

type Turn = {
  id: number;
  speaker: "A" | "B";
  original: string;
  translated: string;
  langFrom: string;
  langTo: string;
  imageUrl?: string;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiTranscribe(audioBlob: Blob, lang: string): Promise<string> {
  const form = new FormData();
  form.append("audio", audioBlob, "audio.webm");
  form.append("lang", lang);
  const res = await fetch(`${BASE}/api/transcribe`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Дуу таниж чадсангүй");
  const data = await res.json();
  return data.text as string;
}

async function apiTranslate(text: string, fromLang: string, toLang: string): Promise<string> {
  const res = await fetch(`${BASE}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, fromLang, toLang }),
  });
  if (!res.ok) throw new Error("Орчуулж чадсангүй");
  const data = await res.json();
  return data.translated as string;
}

async function playTTS(text: string, lang: string) {
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
}

export default function TranslatorPage() {
  const [langA, setLangA] = useState("mn");
  const [langB, setLangB] = useState("en");
  const [activeSpeaker, setActiveSpeaker] = useState<"A" | "B">("A");
  const [recording, setRecording] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showLangPicker, setShowLangPicker] = useState<"A" | "B" | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);

  const getLang = (code: string) => LANGUAGES.find((l) => l.code === code)!;

  const startRecording = async () => {
    setError("");
    setShowTextInput(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setStatus("Дуу бичиж байна...");
    } catch {
      setError("Микрофонд хандах зөвшөөрөл өгнө үү");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setStatus("Боловсруулж байна...");
    }
  };

  const processAudio = async (blob: Blob) => {
    const fromCode = activeSpeaker === "A" ? langA : langB;
    const toCode = activeSpeaker === "A" ? langB : langA;
    try {
      setStatus("Дуу таниж байна (Whisper)...");
      const original = await apiTranscribe(blob, fromCode);
      setStatus("Орчуулж байна (GPT)...");
      const translated = await apiTranslate(original, fromCode, toCode);
      const newTurn: Turn = { id: Date.now(), speaker: activeSpeaker, original, translated, langFrom: fromCode, langTo: toCode };
      setTurns((prev) => [...prev, newTurn]);
      if (toCode !== "mn") {
        setStatus("Дуу гаргаж байна...");
        await playTTS(translated, toCode);
      }
      setActiveSpeaker((s) => (s === "A" ? "B" : "A"));
      setStatus("");
    } catch (err: any) {
      setError(err.message || "Алдаа гарлаа");
      setStatus("");
    }
  };

  const sendTextMessage = async () => {
    const text = textDraft.trim();
    if (!text || status) return;
    const fromCode = activeSpeaker === "A" ? langA : langB;
    const toCode = activeSpeaker === "A" ? langB : langA;
    setError("");
    setTextDraft("");
    try {
      setStatus("Орчуулж байна...");
      const translated = await apiTranslate(text, fromCode, toCode);
      const newTurn: Turn = { id: Date.now(), speaker: activeSpeaker, original: text, translated, langFrom: fromCode, langTo: toCode };
      setTurns((prev) => [...prev, newTurn]);
      if (toCode !== "mn") {
        setStatus("Дуу гаргаж байна...");
        await playTTS(translated, toCode);
      }
      setActiveSpeaker((s) => (s === "A" ? "B" : "A"));
      setStatus("");
    } catch (err: any) {
      setError(err.message || "Алдаа гарлаа");
      setStatus("");
    }
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || status) return;
    e.target.value = "";
    const imageUrl = URL.createObjectURL(file);
    const toLangCode = activeSpeaker === "A" ? langB : langA;
    setError("");
    setShowTextInput(false);
    try {
      setStatus("Зураг уншиж байна...");
      const form = new FormData();
      form.append("image", file);
      form.append("toLang", toLangCode);
      const res = await fetch(`${BASE}/api/scan`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Зураг уншиж чадсангүй");
      const data = await res.json();
      if (!data.detected) {
        setError("Зурагнаас текст олдсонгүй");
        setStatus("");
        URL.revokeObjectURL(imageUrl);
        return;
      }
      const newTurn: Turn = {
        id: Date.now(),
        speaker: activeSpeaker,
        original: data.detected,
        translated: data.translated,
        langFrom: "auto",
        langTo: toLangCode,
        imageUrl,
      };
      setTurns((prev) => [...prev, newTurn]);
      if (toLangCode !== "mn") {
        setStatus("Дуу гаргаж байна...");
        await playTTS(data.translated, toLangCode);
      }
      setActiveSpeaker((s) => (s === "A" ? "B" : "A"));
      setStatus("");
    } catch (err: any) {
      setError(err.message || "Алдаа гарлаа");
      setStatus("");
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleMicPress = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const toggleTextInput = () => {
    setShowTextInput((v) => {
      if (!v) setTimeout(() => textInputRef.current?.focus(), 100);
      return !v;
    });
  };

  const clearAll = () => {
    setTurns([]);
    setActiveSpeaker("A");
    setStatus("");
    setError("");
    setShowTextInput(false);
    setTextDraft("");
  };

  const currentFromLang = activeSpeaker === "A" ? getLang(langA) : getLang(langB);
  const currentToLang = activeSpeaker === "A" ? getLang(langB) : getLang(langA);

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="bg-primary px-4 pt-10 pb-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Hi Сайн уу" className="w-8 h-8 rounded-lg object-cover" />
            <h1 className="text-lg font-bold tracking-tight">Hi Сайн уу</h1>
          </div>
          {turns.length > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1 text-white/70 text-sm hover:text-white">
              <RefreshCw size={14} />
              Цэвэрлэх
            </button>
          )}
        </div>

        {/* Language pair selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLangPicker(showLangPicker === "A" ? null : "A")}
            className="flex-1 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl py-3 px-4"
          >
            <span className="text-xl">{getLang(langA).flag}</span>
            <span className="font-semibold text-sm">{getLang(langA).label}</span>
            <ChevronDown size={14} className="text-white/70" />
          </button>
          <div className="text-white/50 text-lg font-light">↔</div>
          <button
            onClick={() => setShowLangPicker(showLangPicker === "B" ? null : "B")}
            className="flex-1 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl py-3 px-4"
          >
            <span className="text-xl">{getLang(langB).flag}</span>
            <span className="font-semibold text-sm">{getLang(langB).label}</span>
            <ChevronDown size={14} className="text-white/70" />
          </button>
        </div>

        {/* Language picker dropdown */}
        {showLangPicker && (
          <div className="mt-2 bg-white rounded-xl p-2 shadow-lg">
            {LANGUAGES.filter((l) => showLangPicker === "A" ? l.code !== langB : l.code !== langA).map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  if (showLangPicker === "A") setLangA(lang.code);
                  else setLangB(lang.code);
                  setShowLangPicker(null);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-foreground text-sm"
              >
                <span className="text-lg">{lang.flag}</span>
                <span className="font-medium">{lang.label}</span>
                {((showLangPicker === "A" && lang.code === langA) || (showLangPicker === "B" && lang.code === langB)) && (
                  <span className="ml-auto text-primary text-xs font-semibold">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {turns.length === 0 && !status && (
          <div className="text-center text-muted-foreground py-16">
            <Globe size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Ярилцлага эхлэхэд товч дарна уу</p>
            <p className="text-xs mt-1 opacity-70">
              {getLang(langA).flag} {getLang(langA).label} ↔ {getLang(langB).flag} {getLang(langB).label}
            </p>
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className={`flex ${turn.speaker === "A" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl shadow-sm overflow-hidden ${turn.speaker === "A" ? "bg-white border border-border" : "bg-primary text-white"}`}>
              {turn.imageUrl && (
                <img src={turn.imageUrl} alt="scanned" className="w-full max-h-40 object-cover" />
              )}
              <div className="px-4 py-3">
                <div className="text-xs font-semibold mb-1 opacity-60">
                  {turn.langFrom === "auto" ? "📷 Зурагнаас" : `${getLang(turn.langFrom).flag} ${getLang(turn.langFrom).label}`}
                </div>
                <p className="text-sm font-medium">{turn.original}</p>
                <div className={`mt-2 pt-2 border-t ${turn.speaker === "A" ? "border-border" : "border-white/20"}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="text-xs font-semibold opacity-60">
                      {getLang(turn.langTo).flag} {getLang(turn.langTo).label}
                    </div>
                    {turn.langTo !== "mn" && (
                      <button onClick={() => playTTS(turn.translated, turn.langTo)} className="opacity-50 hover:opacity-100 ml-1">
                        <Volume2 size={12} />
                      </button>
                    )}
                  </div>
                  <p className={`text-sm ${turn.speaker === "A" ? "text-primary" : "text-white/90"}`}>
                    {turn.translated}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom controls */}
      <div className="px-4 pb-6 pt-4 border-t border-border bg-background">
        <div className="text-center mb-3">
          <span className="text-xs text-muted-foreground">
            {currentFromLang.flag} {currentFromLang.label} → {currentToLang.flag} {currentToLang.label}
          </span>
        </div>

        {error && (
          <div className="text-center text-sm text-destructive font-medium mb-3 bg-destructive/10 rounded-xl py-2 px-3">
            {error}
          </div>
        )}
        {status && (
          <div className="text-center text-sm text-primary font-medium mb-3 animate-pulse">
            {status}
          </div>
        )}

        {/* Speaker toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveSpeaker("A")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${activeSpeaker === "A" ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary"}`}
          >
            {getLang(langA).flag} Би
          </button>
          <button
            onClick={() => setActiveSpeaker("B")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${activeSpeaker === "B" ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary"}`}
          >
            {getLang(langB).flag} Гадаад хүн
          </button>
        </div>

        {/* Text input area — shown when keyboard button is active */}
        {showTextInput && (
          <div className="mb-4 flex gap-2 items-end">
            <textarea
              ref={textInputRef}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendTextMessage();
                }
              }}
              placeholder={`${currentFromLang.flag} ${currentFromLang.label}-аар бичнэ үү...`}
              rows={2}
              className="flex-1 resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
            <button
              onClick={sendTextMessage}
              disabled={!textDraft.trim() || !!status}
              className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-all flex-shrink-0"
            >
              <Send size={16} />
            </button>
            <button
              onClick={() => { setShowTextInput(false); setTextDraft(""); }}
              className="w-10 h-10 rounded-xl border border-border text-muted-foreground flex items-center justify-center hover:text-foreground transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Hidden camera input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraCapture}
        />

        {/* Keyboard + Mic + Camera */}
        <div className="flex items-center justify-center gap-6">
          {/* Text / keyboard button */}
          <button
            onClick={toggleTextInput}
            disabled={recording}
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all disabled:opacity-40 ${showTextInput ? "bg-primary border-primary text-white" : "bg-white border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
          >
            <Keyboard size={20} />
          </button>

          {/* Record button */}
          <button
            onClick={handleMicPress}
            disabled={!!status && !recording}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 ${recording ? "bg-destructive animate-pulse scale-110" : "bg-primary hover:bg-primary/90"}`}
          >
            {recording ? <MicOff size={32} className="text-white" /> : <Mic size={32} className="text-white" />}
          </button>

          {/* Camera button */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={!!status || recording}
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 bg-white border-border text-muted-foreground hover:border-primary hover:text-primary transition-all disabled:opacity-50"
          >
            <Camera size={20} />
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-3">
          {recording
            ? "Зогсоохын тулд дахин дарна уу"
            : showTextInput
            ? "Бичээд Enter дарна уу"
            : status
            ? "Боловсруулж байна..."
            : "Ярихын тулд дарна уу"}
        </p>
        <p className="text-center text-xs mt-3 text-muted-foreground font-semibold tracking-wide">
          <a href="https://veio.digital/" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
            Built by VEIO<span style={{ color: "#ef4444" }}>•</span>
          </a>
        </p>
      </div>
    </div>
  );
}
