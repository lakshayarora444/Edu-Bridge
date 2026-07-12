import React, { useState, useRef, useEffect } from "react";

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "tl", label: "Tagalog", native: "Tagalog" },
  { code: "zh", label: "Mandarin", native: "中文" },
  { code: "ar", label: "Arabic", native: "العربية" },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

// Calls our own serverless function — never talks to Gemini directly from the browser.
async function askTutor({ prompt, image }) {
  const res = await fetch("/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `The tutor is temporarily unavailable (${res.status}).`);
  }
  const data = await res.json();
  if (!data.text) throw new Error("No response came back. Try again.");
  return data.text;
}

function safeParseJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

function Spinner({ label }) {
  return (
    <div className="eb-spinner-row">
      <span className="eb-spinner" />
      {label}
    </div>
  );
}

function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="eb-error">
      <p className="eb-error-title">This didn't work.</p>
      <p className="eb-error-msg">{message}</p>
      {onRetry && (
        <button className="eb-error-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function PhotoHelper({ language }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function handleFile(file) {
    setError("");
    setExplanation("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is too large. Try one under 8MB.");
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      setImage({ data: base64, mimeType: file.type });
      setPreview(URL.createObjectURL(file));
    } catch (e) {
      setError(e.message);
    }
  }

  async function explain() {
    if (!image) return setError("Add a photo of your homework or notes first.");
    setLoading(true);
    setError("");
    setExplanation("");
    try {
      const langName = LANGUAGES.find((l) => l.code === language)?.label || "English";
      const text = await askTutor({
        image,
        prompt: `You are a patient tutor for a middle/high school English Learner student. Look at this photo of homework or notes. Explain what it's asking and how to approach it, in simple, clear ${langName}. Break it into short steps. Don't just give the final answer — help the student understand the concept. Keep it under 200 words.`,
      });
      setExplanation(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 className="eb-h3 c-photo">Photo of homework</h3>
      <p className="eb-p">Snap a photo. Get it explained in your language.</p>

      <div className="eb-dropzone" onClick={() => inputRef.current?.click()}>
        {preview ? <img src={preview} alt="Uploaded homework" /> : <p style={{ margin: 0, opacity: 0.6 }}>Tap to choose a photo</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="eb-btn b-photo" onClick={explain} disabled={loading || !image}>
          {loading ? "Reading..." : "Explain this to me"}
        </button>
      </div>

      {loading && <Spinner label="Looking at your photo..." />}
      <ErrorNote message={error} onRetry={image ? explain : null} />
      {explanation && <div className="eb-result">{explanation}</div>}
    </div>
  );
}

function StudyGuide({ language, notes, setNotes }) {
  const [guide, setGuide] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!notes.trim()) return setError("Paste in some class notes first.");
    setLoading(true);
    setError("");
    setGuide("");
    try {
      const langName = LANGUAGES.find((l) => l.code === language)?.label || "English";
      const text = await askTutor({
        prompt: `You are helping an English Learner student study. Turn these class notes into a short, clear study guide written in simple ${langName}: a 2-3 sentence summary, then 4-6 bullet key points, then 2 short review questions at the end. Keep vocabulary simple. Notes:\n\n${notes}`,
      });
      setGuide(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 className="eb-h3 c-notes">Notes → study guide</h3>
      <p className="eb-p">Paste your notes. Get a simplified guide back.</p>

      <textarea
        className="eb-textarea"
        rows={6}
        placeholder="Paste your class notes here..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div style={{ marginTop: 16 }}>
        <button className="eb-btn b-notes" onClick={generate} disabled={loading}>
          {loading ? "Building..." : "Build my study guide"}
        </button>
      </div>

      {loading && <Spinner label="Simplifying your notes..." />}
      <ErrorNote message={error} onRetry={notes.trim() ? generate : null} />
      {guide && <div className="eb-result">{guide}</div>}
    </div>
  );
}

function QuizMe({ language, notes }) {
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generateQuiz() {
    if (!notes.trim()) {
      return setError("Add notes in the 'Study guide' tab first — the quiz is built from those.");
    }
    setLoading(true);
    setError("");
    setQuiz(null);
    setAnswers({});
    setSubmitted(false);
    try {
      const langName = LANGUAGES.find((l) => l.code === language)?.label || "English";
      const text = await askTutor({
        prompt: `Based on these notes, write 4 multiple-choice quiz questions in simple ${langName} for an English Learner student. Respond with ONLY valid JSON, no markdown, no preamble, in exactly this shape:
{"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]}
Notes:\n\n${notes}`,
      });
      const parsed = safeParseJSON(text);
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error("The quiz came back in a format I couldn't read. Try again.");
      }
      setQuiz(parsed.questions);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const score = quiz ? quiz.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0) : 0;

  return (
    <div>
      <h3 className="eb-h3 c-quiz">Quiz me</h3>
      <p className="eb-p">Generates questions from the notes you pasted in the Study guide tab.</p>

      <button className="eb-btn b-quiz" onClick={generateQuiz} disabled={loading}>
        {loading ? "Writing questions..." : "Generate a quiz"}
      </button>

      {loading && <Spinner label="Writing quiz questions..." />}
      <ErrorNote message={error} onRetry={notes.trim() ? generateQuiz : null} />

      {quiz && (
        <div style={{ marginTop: 20 }}>
          {quiz.map((q, i) => (
            <div key={i} className="quiz-q">
              <p>{i + 1}. {q.question}</p>
              {q.options.map((opt, oi) => {
                const isSelected = answers[i] === oi;
                const isCorrect = submitted && oi === q.correctIndex;
                const isWrong = submitted && isSelected && oi !== q.correctIndex;
                let cls = "quiz-opt";
                if (isCorrect) cls += " correct";
                else if (isWrong) cls += " wrong";
                else if (isSelected) cls += " selected";
                return (
                  <button
                    key={oi}
                    className={cls}
                    onClick={() => !submitted && setAnswers((a) => ({ ...a, [i]: oi }))}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ))}
          {!submitted ? (
            <button
              className="eb-btn b-quiz"
              onClick={() => setSubmitted(true)}
              disabled={Object.keys(answers).length < quiz.length}
            >
              Check my answers
            </button>
          ) : (
            <div style={{ position: "relative" }}>
              {score === quiz.length && (
                <div style={{ position: "relative", height: 0 }}>
                  {Array.from({ length: 14 }).map((_, i) => (
                    <span
                      key={i}
                      className="confetti-piece"
                      style={{
                        left: `${(i / 14) * 100}%`,
                        background: ["#FF6B6B", "#F2C14E", "#4ECDC4", "#A78BFA"][i % 4],
                        animationDelay: `${(i % 5) * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              )}
              <p className="eb-score">You got {score} out of {quiz.length} correct.{score === quiz.length ? " 🎉" : ""}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EduBridge() {
  const [language, setLanguage] = useState("en");
  const [tab, setTab] = useState("photo");
  const [sharedNotes, setSharedNotes] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem("eb-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      // localStorage unavailable (private browsing etc) — fall back to system preference
    }
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem("eb-theme", next);
    } catch {
      // ignore — theme just won't persist across reloads
    }
  }

  const tabs = [
    { id: "photo", label: "Photo helper" },
    { id: "notes", label: "Study guide" },
    { id: "quiz", label: "Quiz me" },
  ];

  return (
    <div className="eb-wrap">
      <header className="eb-header">
        <div>
          <h1 className="eb-title">EduBridge</h1>
          <p className="eb-sub">Homework help in your language, for FUSD students.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <select className="eb-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.native}</option>
            ))}
          </select>
          <button
            className="eb-theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <nav className="eb-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`eb-tab ${tab === t.id ? `active-${t.id}` : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="eb-divider" />

      <div className="eb-card">
        {tab === "photo" && <PhotoHelper language={language} />}
        {tab === "notes" && <StudyGuide language={language} notes={sharedNotes} setNotes={setSharedNotes} />}
        {tab === "quiz" && <QuizMe language={language} notes={sharedNotes} />}
      </div>

      <p className="eb-footer">Built by a student, for students learning English while learning everything else.</p>
    </div>
  );
}
