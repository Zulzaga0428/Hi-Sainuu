import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Globe, ChevronDown, RefreshCw, Volume2, X, Camera, Keyboard, Send, Download, Copy, Check } from "lucide-react";
import { getT } from "../translations";

const LANGUAGES = [
  { code: "mn", label: "Монгол", flag: "🇲🇳" },
  { code: "en", label: "Англи", flag: "🇺🇸" },
  { code: "zh", label: "Хятад", flag: "🇨🇳" },
  { code: "ru", label: "Орос", flag: "🇷🇺" },
  { code: "ja", label: "Япон", flag: "🇯🇵" },
  { code: "ko", label: "Солонгос", flag: "🇰🇷" },
  { code: "th", label: "Тайланд", flag: "🇹🇭" },
  { code: "tr", label: "Турк", flag: "🇹🇷" },
  { code: "de", label: "Герман", flag: "🇩🇪" },
  { code: "fr", label: "Франц", flag: "🇫🇷" },
  { code: "es", label: "Испани", flag: "🇪🇸" },
  { code: "it", label: "Итали", flag: "🇮🇹" },
  { code: "ar", label: "Араб", flag: "🇦🇪" },
  { code: "hi", label: "Хинди", flag: "🇮🇳" },
  { code: "vi", label: "Вьетнам", flag: "🇻🇳" },
  { code: "id", label: "Индонези", flag: "🇮🇩" },
  { code: "ms", label: "Малайз", flag: "🇲🇾" },
  { code: "pt", label: "Португал", flag: "🇵🇹" },
  { code: "pl", label: "Польш", flag: "🇵🇱" },
  { code: "uk", label: "Украин", flag: "🇺🇦" },
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

async function playTTS(text: string, lang: string, speed = 1.0) {
  const res = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, speed }),
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
  const [subtitle, setSubtitle] = useState<{ original: string; translated: string; toLang: string } | null>(null);

  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = (window.navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (isIos) { setShowIosGuide(true); return; }
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const showInstallBtn = !isStandalone && (installPrompt || isIos);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = getT(langA);
  const getLang = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

  const showSubtitle = (original: string, translated: string, toLang: string) => {
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    setSubtitle({ original, translated, toLang });
    subtitleTimerRef.current = setTimeout(() => setSubtitle(null), 5000);
  };

  useEffect(() => () => {
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
  }, []);

  const startRecording = async () => {
    setError("");
    setShowTextInput(false);
    setSubtitle(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setStatus(t.recording);
    } catch {
      setError(t.micPermission);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setStatus(t.processing);
    }
  };

  const processAudio = async (blob: Blob) => {
    const fromCode = activeSpeaker === "A" ? langA : langB;
    const toCode = activeSpeaker === "A" ? langB : langA;
    try {
      setStatus(t.transcribing);
      const original = await apiTranscribe(blob, fromCode);
      setStatus(t.translating);
      const translated = await apiTranslate(original, fromCode, toCode);
      const newTurn: Turn = { id: Date.now(), speaker: activeSpeaker, original, translated, langFrom: fromCode, langTo: toCode };
      setTurns((prev) => [...prev, newTurn]);
      showSubtitle(original, translated, toCode);
      if (toCode !== "mn") {
        setStatus(t.speaking);
        await playTTS(translated, toCode, ttsSpeed);
      }
      setActiveSpeaker((s) => (s === "A" ? "B" : "A"));
      setStatus("");
    } catch (err: any) {
      setError(err.message || t.errorGeneric);
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
      setStatus(t.translating);
      const translated = await apiTranslate(text, fromCode, toCode);
      const newTurn: Turn = { id: Date.now(), speaker: activeSpeaker, original: text, translated, langFrom: fromCode, langTo: toCode };
      setTurns((prev) => [...prev, newTurn]);
      showSubtitle(text, translated, toCode);
      if (toCode !== "mn") {
        setStatus(t.speaking);
        await playTTS(translated, toCode, ttsSpeed);
      }
      setActiveSpeaker((s) => (s === "A" ? "B" : "A"));
      setStatus("");
    } catch (err: any) {
      setError(err.message || t.errorGeneric);
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
      setStatus(t.scanning);
      const form = new FormData();
      form.append("image", file);
      form.append("toLang", toLangCode);
      const res = await fetch(`${BASE}/api/scan`, { method: "POST", body: form });
      if (!res.ok) throw new Error(t.errorGeneric);
      const data = await res.json();
      if (!data.detected) {
        setError(t.noTextFound);
        setStatus("");
        URL.revokeObjectURL(imageUrl);
        return;
      }
      const newTurn: Turn = { id: Date.now(), speaker: activeSpeaker, original: data.detected, translated: data.translated, langFrom: "auto", langTo: toLangCode, imageUrl };
      setTurns((prev) => [...prev, newTurn]);
      showSubtitle(data.detected, data.translated, toLangCode);
      if (toLangCode !== "mn") {
        setStatus(t.speaking);
        await playTTS(data.translated, toLangCode, ttsSpeed);
      }
      setActiveSpeaker((s) => (s === "A" ? "B" : "A"));
      setStatus("");
    } catch (err: any) {
      setError(err.message || t.errorGeneric);
      setStatus("");
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleMicPress = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const copyText = (text: string, id: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
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
    setSubtitle(null);
  };

  const currentFromLang = activeSpeaker === "A" ? getLang(langA) : getLang(langB);
  const currentToLang = activeSpeaker === "A" ? getLang(langB) : getLang(langA);

  return (
    <div className="bg-background flex flex-col max-w-md mx-auto overflow-hidden" style={{ height: "100dvh" }}>
      {/* Header */}
      <div className="bg-primary px-4 pt-10 pb-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Hi Сайн уу" className="w-8 h-8 rounded-lg object-cover" style={{ filter: "brightness(0) invert(1)" }} />
            <h1 className="text-lg font-bold tracking-tight">Hi Сайн уу</h1>
          </div>
          <div className="flex items-center gap-2">
            {showInstallBtn && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
              >
                <Download size={13} />
                {t.install}
              </button>
            )}
            {turns.length > 0 && (
              <button onClick={clearAll} className="flex items-center gap-1 text-white/70 text-sm hover:text-white">
                <RefreshCw size={14} />
                {t.clear}
              </button>
            )}
          </div>
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
          <button
            onClick={() => { setLangA(langB); setLangB(langA); setShowLangPicker(null); }}
            className="text-white/80 hover:text-white text-xl px-1 active:scale-90 transition-transform"
          >↔</button>
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
          <div className="mt-2 bg-white rounded-xl p-2 shadow-lg max-h-64 overflow-y-auto">
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
            <p className="text-sm font-medium">{t.start}</p>
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
                  {turn.langFrom === "auto" ? `📷 ${t.fromImage}` : `${getLang(turn.langFrom).flag} ${getLang(turn.langFrom).label}`}
                </div>
                <p className="text-sm font-medium">{turn.original}</p>
                <div className={`mt-2 pt-2 border-t ${turn.speaker === "A" ? "border-border" : "border-white/20"}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="text-xs font-semibold opacity-60">
                      {getLang(turn.langTo).flag} {getLang(turn.langTo).label}
                    </div>
                    {turn.langTo !== "mn" && (
                      <button onClick={() => playTTS(turn.translated, turn.langTo, ttsSpeed)} className="opacity-50 hover:opacity-100 ml-1">
                        <Volume2 size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => copyText(turn.translated, turn.id)}
                      className="opacity-50 hover:opacity-100 ml-auto"
                    >
                      {copiedId === turn.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
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
      <div className="px-4 pb-5 pt-3 border-t border-border bg-background">
        <div className="text-center mb-2">
          <span className="text-xs text-muted-foreground">
            {currentFromLang.flag} {currentFromLang.label} → {currentToLang.flag} {currentToLang.label}
          </span>
        </div>

        {error && (
          <div className="text-center text-sm text-destructive font-medium mb-2 bg-destructive/10 rounded-xl py-2 px-3">
            {error}
          </div>
        )}

        {/* TTS Speed toggle */}
        <div className="flex items-center justify-center gap-1 mb-3">
          {([0.75, 1.0, 1.25] as const).map((s) => (
            <button
              key={s}
              onClick={() => setTtsSpeed(s)}
              className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition-all ${ttsSpeed === s ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary"}`}
            >
              {s === 0.75 ? "🐢 Удаан" : s === 1.0 ? "⚡ Хэвийн" : "🐇 Хурдан"}
            </button>
          ))}
        </div>

        {/* Speaker toggle */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setActiveSpeaker("A")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${activeSpeaker === "A" ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary"}`}
          >
            {getLang(langA).flag} Hi
          </button>
          <button
            onClick={() => setActiveSpeaker("B")}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${activeSpeaker === "B" ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary"}`}
          >
            {getLang(langB).flag} Сайн уу
          </button>
        </div>

        {/* Text input area */}
        {showTextInput && (
          <div className="mb-3 flex gap-2 items-end">
            <textarea
              ref={textInputRef}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } }}
              placeholder={`${currentFromLang.flag} ${t.writeIn} ${currentFromLang.label}...`}
              rows={2}
              className="flex-1 resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
            <button onClick={sendTextMessage} disabled={!textDraft.trim() || !!status}
              className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-all flex-shrink-0">
              <Send size={16} />
            </button>
            <button onClick={() => { setShowTextInput(false); setTextDraft(""); }}
              className="w-10 h-10 rounded-xl border border-border text-muted-foreground flex items-center justify-center hover:text-foreground transition-all flex-shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Waveform / subtitle area */}
        <div className="flex justify-center items-center mb-2" style={{ height: 52 }}>
          {recording ? (
            <div className="flex items-center gap-[3px] h-10">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: 4,
                    backgroundColor: "#CD2E3A",
                    animation: `wavebar 0.9s ease-in-out infinite`,
                    animationDelay: `${(i % 7) * 0.12}s`,
                    height: "100%",
                    transformOrigin: "center",
                    transform: "scaleY(0.15)",
                  }}
                />
              ))}
            </div>
          ) : subtitle ? (
            <div className="w-full text-center px-2">
              <p className="text-xs text-muted-foreground truncate mb-0.5">{subtitle.original}</p>
              <p className="text-base font-bold text-primary leading-tight line-clamp-2">{subtitle.translated}</p>
            </div>
          ) : status ? (
            <p className="text-sm text-primary font-medium animate-pulse">{status}</p>
          ) : null}
        </div>

        {/* Hidden camera input */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />

        {/* Keyboard + Mic + Camera */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleTextInput}
            disabled={recording}
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all disabled:opacity-40 ${showTextInput ? "bg-primary border-primary text-white" : "bg-white border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
          >
            <Keyboard size={20} />
          </button>

          <button
            onClick={handleMicPress}
            disabled={!!status && !recording}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 ${recording ? "bg-destructive scale-110" : "bg-primary hover:bg-primary/90"}`}
          >
            {recording ? <MicOff size={32} className="text-white" /> : <Mic size={32} className="text-white" />}
          </button>

          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={!!status || recording}
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 bg-white border-border text-muted-foreground hover:border-primary hover:text-primary transition-all disabled:opacity-50"
          >
            <Camera size={20} />
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-2">
          {recording ? t.pressToStop : showTextInput ? t.typeAndEnter : t.pressToSpeak}
        </p>
        <p className="text-center text-xs mt-2 text-muted-foreground font-semibold tracking-wide">
          <a href="https://veio.digital/" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
            Built by VEIO<span style={{ color: "#CD2E3A" }}>•</span>
          </a>
        </p>
      </div>

      {/* iOS Install Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4" onClick={() => setShowIosGuide(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 mb-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">{t.installTitle}</h2>
              <button onClick={() => setShowIosGuide(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="space-y-4 text-sm text-foreground">
              <div className="flex items-start gap-3">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0">1</span>
                <p>{t.iosStep1}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0">2</span>
                <p>{t.iosStep2}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0">3</span>
                <p>{t.iosStep3}</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0">4</span>
                <p>{t.iosStep4}</p>
              </div>
            </div>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full mt-5 bg-primary text-white font-semibold py-3 rounded-xl"
            >
              {t.gotIt}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
