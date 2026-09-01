"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import AppHeader from "../../components/app-header";
import { Icon, type IconName } from "../../components/embe-icon";
import { sendFamilyPhoto } from "../../lib/photo-upload-client";

type Topic = "ngu" | "bu" | "moi-truong";
type State = "ready" | "waiting" | "done" | "error";
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; media?: { kind: "image" | "video"; url: string } };

type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const topics: Array<{ id: Topic; icon: IconName; title: string; detail: string }> = [
  { id: "ngu", icon: "sleep", title: "Giấc ngủ của em bé", detail: "Nhịp ngủ và thời lượng" },
  { id: "bu", icon: "milk", title: "Bú sữa của em bé", detail: "Số lần và lượng sữa" },
  { id: "moi-truong", icon: "room", title: "Phòng ngủ của em bé", detail: "Nhiệt độ, độ ẩm và giấc ngủ" }
];

const pregnancyHelp = [
  { href: "/me-bau#viec-hom-nay", icon: "check" as const, title: "Việc nên làm hôm nay", detail: "Checklist ngắn, không tạo áp lực" },
  { href: "/me-bau#cam-nang", icon: "care" as const, title: "Ăn gì, kiêng gì", detail: "Chỉ dẫn đã đối chiếu nguồn y tế" },
  { href: "/me-bau#can-lien-he", icon: "alert" as const, title: "Dấu hiệu cần liên hệ", detail: "Biết khi nào không nên chờ" }
];

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function AssistantPage() {
  const [days, setDays] = useState(7);
  const [state, setState] = useState<State>("ready");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome", role: "assistant", text: "Mẹ Ngân có thể hỏi bằng chữ hoặc chạm micro để nói. EmBe sẽ trả lời ngắn gọn và không thay bác sĩ."
  }]);
  const [chatState, setChatState] = useState<"ready" | "sending" | "error">("ready");
  const [listening, setListening] = useState(false);
  const [media, setMedia] = useState<{ file: File; kind: "image" | "video"; url: string } | null>(null);
  const [mediaProgress, setMediaProgress] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mediaUrlsRef = useRef<string[]>([]);

  useEffect(() => () => { mediaUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }); }, [messages, chatState]);

  async function requestAssistant(topic: Topic | "hoi-dap", directQuestion?: string): Promise<string> {
    const submitted = await fetch("/api/assistant", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, days, ...(directQuestion ? { question: directQuestion } : {}), idempotencyKey: crypto.randomUUID() })
    });
    if (!submitted.ok) throw new Error("assistant unavailable");
    const { id } = await submitted.json() as { id: string };
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (attempt > 0) await pause(1000);
      const response = await fetch(`/api/assistant?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("assistant unavailable");
      const result = await response.json() as { status: string; answer?: string };
      if (result.status === "completed" && result.answer) return result.answer;
      if (result.status === "failed") throw new Error("assistant failed");
    }
    throw new Error("assistant timeout");
  }

  async function ask(topic: Topic) {
    setState("waiting");
    setAnswer("");
    try {
      setAnswer(await requestAssistant(topic));
      setState("done");
    } catch {
      setState("error");
    }
  }

  async function sendMessage(event: FormEvent): Promise<void> {
    event.preventDefault();
    const text = question.trim();
    if (!text || chatState === "sending") return;
    const currentMedia = media;
    setQuestion("");
    setMedia(null);
    setMediaProgress(0);
    setChatState("sending");
    setMessages((current) => [...current, {
      id: crypto.randomUUID(), role: "user", text,
      ...(currentMedia ? { media: { kind: currentMedia.kind, url: currentMedia.url } } : {})
    }]);
    try {
      if (currentMedia) {
        await sendFamilyPhoto({
          authorRole: "mother", caption: `Từ Trợ lý: ${text}`.slice(0, 180), file: currentMedia.file,
          idempotencyKey: crypto.randomUUID(), onProgress: setMediaProgress
        });
      }
      const response = await requestAssistant("hoi-dap", text);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: response }]);
      setChatState("ready");
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: "Máy nhà chưa trả lời được lúc này. Mẹ Ngân có thể thử lại sau; nội dung vừa nhập không bị đăng công khai." }]);
      setChatState("error");
    }
  }

  function toggleVoice(): void {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setChatState("error");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => setQuestion((current) => `${current}${current ? " " : ""}${event.results[0]?.[0]?.transcript ?? ""}`.trim());
    recognition.onerror = () => setChatState("error");
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setChatState("ready");
    setListening(true);
    recognition.start();
  }

  function chooseMedia(file: File | undefined): void {
    if (!file) return;
    if (file.size > 25_000_000 || !(file.type.startsWith("image/") || file.type === "video/mp4" || file.type === "video/quicktime")) {
      setChatState("error");
      return;
    }
    if (media) {
      URL.revokeObjectURL(media.url);
      mediaUrlsRef.current = mediaUrlsRef.current.filter((url) => url !== media.url);
    }
    const url = URL.createObjectURL(file);
    mediaUrlsRef.current.push(url);
    setMedia({ file, kind: file.type.startsWith("video/") ? "video" : "image", url });
    setChatState("ready");
  }

  function clearMedia(): void {
    if (!media) return;
    URL.revokeObjectURL(media.url);
    mediaUrlsRef.current = mediaUrlsRef.current.filter((url) => url !== media.url);
    setMedia(null);
  }

  return (
    <main className="assistant-main">
      <AppHeader note="Trợ lý riêng của gia đình" />
      <section className="assistant-hero">
        <p className="eyebrow">Đồng hành đúng giai đoạn</p>
        <h1>Mẹ Ngân cần gì lúc này?</h1>
        <p className="intro">Chọn một việc cần xem ngay. Nếu có dấu hiệu bất thường, hãy liên hệ nơi Mẹ Ngân đang khám.</p>
      </section>
      <section className="assistant-chat" aria-labelledby="assistant-chat-title">
        <div className="assistant-chat-heading"><div><p className="eyebrow">Hỏi trực tiếp</p><h2 id="assistant-chat-title">Trò chuyện với EmBe</h2></div><span><i /> Máy nhà</span></div>
        <div className="assistant-messages" aria-live="polite">
          {messages.map((message) => <article className={`assistant-message is-${message.role}`} key={message.id}>
            {message.media ? message.media.kind === "video"
              ? <video src={message.media.url} controls playsInline preload="metadata" aria-label="Video đã chọn" />
              : <img src={message.media.url} alt="Ảnh đã chọn" /> : null}
            <p>{message.text}</p>
          </article>)}
          {chatState === "sending" ? <article className="assistant-message is-assistant is-typing" role="status"><span /><span /><span /><small>{mediaProgress > 0 && mediaProgress < 100 ? `Đang lưu video/ảnh · ${mediaProgress}%` : "EmBe đang trả lời…"}</small></article> : null}
          <div ref={chatEndRef} />
        </div>
        {media ? <div className="assistant-media-preview">
          {media.kind === "video" ? <video src={media.url} playsInline muted /> : <img src={media.url} alt="Xem trước ảnh đính kèm" />}
          <span>{media.file.name}</span><button type="button" aria-label="Bỏ tệp đính kèm" onClick={clearMedia}>×</button>
        </div> : null}
        <form className="assistant-composer" onSubmit={(event) => void sendMessage(event)}>
          <textarea aria-label="Câu hỏi cho EmBe" maxLength={600} rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Hỏi điều Mẹ Ngân đang cần…" />
          <div className="assistant-compose-actions">
            <label className="assistant-attach" aria-label="Chọn ảnh hoặc video">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime" onChange={(event) => chooseMedia(event.target.files?.[0])} />
              <Icon name="memory" />
            </label>
            <button className={`assistant-voice${listening ? " is-listening" : ""}`} type="button" aria-label={listening ? "Dừng ghi âm" : "Ghi âm để nhập"} aria-pressed={listening} onClick={toggleVoice}>●</button>
            <button className="assistant-send" type="submit" disabled={!question.trim() || chatState === "sending"} aria-label="Gửi câu hỏi"><Icon name="arrow" /></button>
          </div>
        </form>
        <p className="assistant-chat-note">Micro chuyển lời nói thành chữ; EmBe không lưu file ghi âm. Ảnh/video tối đa 25 MB được lưu riêng vào kỷ niệm, AI chỉ trả lời phần chữ.</p>
        {chatState === "error" ? <p className="assistant-error" role="alert">Nếu micro không mở được, hãy cho Safari quyền dùng micro hoặc nhập bằng bàn phím. Ảnh/video cần đúng định dạng và không quá 25 MB.</p> : null}
      </section>
      <section className="assistant-topics pregnancy-help" aria-label="Hỗ trợ thai kỳ">
        {pregnancyHelp.map((item) => (
          <a key={item.href} href={item.href} aria-label={item.title}>
            <span className="shortcut-mark" aria-hidden="true"><Icon name={item.icon} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><Icon name="arrow" className="icon icon-chevron" />
          </a>
        ))}
      </section>
      <details className="future-assistant">
        <summary><span><small>Dành cho giai đoạn sau</small><strong>Sau khi em bé chào đời</strong></span><span aria-hidden="true">⌄</span></summary>
        <p>Phần này phân tích số liệu bú, ngủ và môi trường khi gia đình bắt đầu ghi nhận sau sinh.</p>
        <div className="assistant-period" role="group" aria-label="Khoảng thời gian">
          {[7, 14, 30].map((value) => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} ngày</button>
          ))}
        </div>
        <section className="assistant-topics" aria-label="Chọn nội dung sau sinh cần phân tích">
          {topics.map((topic) => (
            <button key={topic.id} type="button" disabled={state === "waiting"} onClick={() => void ask(topic.id)} aria-label={`Hỏi về ${topic.title}`}>
              <span className="shortcut-mark" aria-hidden="true"><Icon name={topic.icon} /></span><span><strong>{topic.title}</strong><small>{topic.detail}</small></span><Icon name="arrow" className="icon icon-chevron" />
            </button>
          ))}
        </section>
      </details>
      {state === "waiting" ? <section className="assistant-answer is-waiting" role="status"><span /><span /><p>Máy nhà đang xem lại số liệu…</p></section> : null}
      {state === "done" ? <section className="assistant-answer" aria-live="polite"><small>KẾT QUẢ TỪ MÁY NHÀ</small><p>{answer}</p></section> : null}
      {state === "error" ? <p className="assistant-error" role="alert">Máy nhà chưa trả lời được lúc này. Dữ liệu vẫn an toàn; hãy chạm thử lại sau.</p> : null}
      <aside className="assistant-boundary"><strong>Dữ liệu vẫn riêng tư</strong><p>AI chỉ nhận câu hỏi bằng chữ và số liệu tổng hợp; không nhận ảnh, video hoặc hồ sơ gốc.</p></aside>
    </main>
  );
}
