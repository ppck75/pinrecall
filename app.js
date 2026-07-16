const SUPABASE_URL = "https://qemfgfwbyjbjunkoowmj.supabase.co";
const SUPABASE_KEY = "sb_publishable_YCobY_XD9DTkwpt9X4ihgA_MLWUT4xI";
const NOTE_COLORS = ["#ffe66d", "#caffbf", "#9bf6ff", "#ffd6a5", "#ffadad"];
const SESSION_KEY = "pinrecall.supabase.session";

let session = null;
let profile = null;
let notes = [];
let quizzes = [];
let quizOrder = [];
let currentQuiz = 0;
let dragging = null;

const nav = document.querySelector("#nav");
const userSummary = document.querySelector("#user-summary");
const pages = {
  notes: document.querySelector("#notes-page"),
  quiz: document.querySelector("#quiz-page"),
  login: document.querySelector("#login-page"),
  signup: document.querySelector("#signup-page"),
};

const noteBoard = document.querySelector("#note-board");
const noteForm = document.querySelector("#note-form");
const noteText = document.querySelector("#note-text");
const quizForm = document.querySelector("#quiz-form");
const questionInput = document.querySelector("#question-input");
const answerInput = document.querySelector("#answer-input");
const quizQuestion = document.querySelector("#quiz-question");
const quizAnswer = document.querySelector("#quiz-answer");
const quizCount = document.querySelector("#quiz-count");
const quizList = document.querySelector("#quiz-list");
const loginMessage = document.querySelector("#login-message");
const signupMessage = document.querySelector("#signup-message");

init();

async function init() {
  bindEvents();
  session = await getStoredSession();
  await loadUserData();
  renderNav();
  renderRoute();
}

function bindEvents() {
  window.addEventListener("hashchange", renderRoute);
  nav.addEventListener("click", navigateFromNav);
  noteForm.addEventListener("submit", addNote);
  quizForm.addEventListener("submit", addQuiz);
  document.querySelector("#shuffle-btn").addEventListener("click", shuffleQuiz);
  document.querySelector("#show-answer-btn").addEventListener("click", () => quizAnswer.classList.toggle("hidden"));
  document.querySelector("#next-btn").addEventListener("click", nextQuiz);
  document.querySelector("#login-form").addEventListener("submit", login);
  document.querySelector("#signup-form").addEventListener("submit", signup);
}

function navigateFromNav(event) {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;

  event.preventDefault();
  const nextHash = link.getAttribute("href");
  if (location.hash === nextHash) {
    renderRoute();
    return;
  }
  location.hash = nextHash;
}

async function getStoredSession() {
  const stored = readSession();
  if (!stored) return null;

  if (stored.expires_at && Date.now() < stored.expires_at - 60000) {
    return stored;
  }

  if (!stored.refresh_token) {
    clearSession();
    return null;
  }

  try {
    const refreshed = await authRequest("/token?grant_type=refresh_token", {
      refresh_token: stored.refresh_token,
    });
    return saveSession(refreshed);
  } catch {
    clearSession();
    return null;
  }
}

async function loadUserData() {
  if (!session) {
    profile = null;
    notes = [];
    quizzes = [];
    quizOrder = [];
    currentQuiz = 0;
    return;
  }

  try {
    const [profiles, noteData, quizData] = await Promise.all([
      restRequest(`/profiles?select=nickname,email&id=eq.${session.user.id}`),
      restRequest("/study_notes?select=*&order=created_at.asc"),
      restRequest("/quiz_cards?select=*&order=created_at.asc"),
    ]);

    profile = profiles[0] ?? null;
    notes = noteData ?? [];
    quizzes = quizData ?? [];
    quizOrder = quizzes.map((_, index) => index);
    currentQuiz = 0;
  } catch {
    clearSession();
    session = null;
    profile = null;
    notes = [];
    quizzes = [];
    quizOrder = [];
  }
}

function renderNav() {
  if (session) {
    const name = profile?.nickname || session.user.email;
    userSummary.textContent = `${name}님`;
    nav.innerHTML = `
      <a class="${navActive("notes")}" href="#notes">포스트잇</a>
      <a class="${navActive("quiz")}" href="#quiz">퀴즈</a>
      <button id="logout-btn" type="button">로그아웃</button>
    `;
    document.querySelector("#logout-btn").addEventListener("click", logout);
    return;
  }

  userSummary.textContent = "";
  nav.innerHTML = `
    <a class="${navActive("notes")}" href="#notes">포스트잇</a>
    <a class="${navActive("quiz")}" href="#quiz">퀴즈</a>
    <a class="${navActive("login")}" href="#login">로그인</a>
    <a class="${navActive("signup")}" href="#signup">회원가입</a>
  `;
}

function navActive(routeName) {
  const route = location.hash.replace("#", "") || "notes";
  return route === routeName ? "active" : "";
}

function renderRoute() {
  const route = location.hash.replace("#", "") || "notes";
  Object.values(pages).forEach((page) => page.classList.add("hidden"));
  hideMessage(loginMessage);
  hideMessage(signupMessage);
  renderNav();

  if (route === "signup") {
    pages.signup.classList.remove("hidden");
    return;
  }

  if (route === "login") {
    pages.login.classList.remove("hidden");
    const message = sessionStorage.getItem("signup-success");
    if (message) {
      showMessage(loginMessage, message, false);
      sessionStorage.removeItem("signup-success");
    }
    return;
  }

  if ((route === "notes" || route === "quiz") && !session) {
    pages.login.classList.remove("hidden");
    showMessage(loginMessage, "로그인 후 포스트잇과 퀴즈를 사용할 수 있습니다.", false);
    return;
  }

  if (route === "quiz") {
    pages.quiz.classList.remove("hidden");
    renderQuiz();
    return;
  }

  pages.notes.classList.remove("hidden");
  renderNotes();
}

async function signup(event) {
  event.preventDefault();
  hideMessage(signupMessage);

  const email = document.querySelector("#signup-email").value.trim().toLowerCase();
  const password = document.querySelector("#signup-password").value;
  const confirm = document.querySelector("#signup-password-confirm").value;
  const nickname = document.querySelector("#signup-nickname").value.trim();

  if (password !== confirm) {
    showMessage(signupMessage, "비밀번호가 일치하지 않습니다.", true);
    return;
  }

  try {
    const exists = await rpcRequest("is_email_registered", { email_to_check: email });
    if (exists) {
      showMessage(signupMessage, "이미 가입된 이메일 입니다", true);
      return;
    }

    const redirectTo = encodeURIComponent(`${location.origin}${location.pathname}#login`);
    const data = await authRequest(`/signup?redirect_to=${redirectTo}`, {
      email,
      password,
      data: { nickname },
    });

    if (data.access_token) {
      saveSession(data);
      clearSession();
    }

    sessionStorage.setItem("signup-success", "회원가입이 완료되었습니다. 로그인해 주세요.");
    location.hash = "#login";
  } catch (error) {
    showMessage(signupMessage, authMessage(error, "회원가입에 실패했습니다."), true);
  }
}

async function login(event) {
  event.preventDefault();
  hideMessage(loginMessage);

  const email = document.querySelector("#login-email").value.trim().toLowerCase();
  const password = document.querySelector("#login-password").value;

  try {
    const data = await authRequest("/token?grant_type=password", { email, password });
    session = saveSession(data);
    await loadUserData();
    renderNav();
    location.hash = "#notes";
  } catch {
    showMessage(loginMessage, "이메일 또는 비밀번호를 확인하세요.", true);
  }
}

function logout() {
  clearSession();
  session = null;
  profile = null;
  notes = [];
  quizzes = [];
  quizOrder = [];
  currentQuiz = 0;
  renderNav();
  location.hash = "#login";
}

async function addNote(event) {
  event.preventDefault();
  const content = noteText.value.trim();
  if (!content || !session) return;

  const nextNote = {
    content,
    x: 24 + (notes.length % 4) * 32,
    y: 24 + (notes.length % 5) * 28,
    color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
  };

  try {
    const data = await restRequest("/study_notes?select=*", {
      method: "POST",
      body: nextNote,
      prefer: "return=representation",
    });
    notes.push(data[0]);
    noteText.value = "";
    renderNotes();
  } catch {
    return;
  }
}

function renderNotes() {
  noteBoard.innerHTML = "";

  if (!notes.length) {
    noteBoard.innerHTML = `<p class="empty">아직 붙인 포스트잇이 없습니다.</p>`;
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("article");
    item.className = "note";
    item.style.left = `${note.x}px`;
    item.style.top = `${note.y}px`;
    item.style.background = note.color;
    item.dataset.id = note.id;
    item.innerHTML = `
      <button class="delete" type="button" aria-label="삭제">x</button>
      <p>${escapeHtml(note.content)}</p>
    `;

    item.querySelector(".delete").addEventListener("click", () => deleteNote(note.id));
    item.addEventListener("pointerdown", startDrag);
    noteBoard.append(item);
  });
}

async function deleteNote(id) {
  try {
    await restRequest(`/study_notes?id=eq.${id}`, { method: "DELETE" });
    notes = notes.filter((note) => note.id !== id);
    renderNotes();
  } catch {
    return;
  }
}

function startDrag(event) {
  if (event.target.closest("button")) return;

  const note = event.currentTarget;
  const rect = note.getBoundingClientRect();
  dragging = {
    id: note.dataset.id,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  note.setPointerCapture(event.pointerId);
  note.addEventListener("pointermove", moveDrag);
  note.addEventListener("pointerup", endDrag, { once: true });
}

function moveDrag(event) {
  if (!dragging) return;

  const boardRect = noteBoard.getBoundingClientRect();
  const note = event.currentTarget;
  const x = clamp(event.clientX - boardRect.left - dragging.offsetX, 0, boardRect.width - note.offsetWidth);
  const y = clamp(event.clientY - boardRect.top - dragging.offsetY, 0, boardRect.height - note.offsetHeight);

  note.style.left = `${x}px`;
  note.style.top = `${y}px`;
}

async function endDrag(event) {
  const note = event.currentTarget;
  note.removeEventListener("pointermove", moveDrag);

  const x = Number.parseInt(note.style.left, 10);
  const y = Number.parseInt(note.style.top, 10);
  const saved = notes.find((item) => item.id === dragging.id);
  if (saved) {
    saved.x = x;
    saved.y = y;
    try {
      await restRequest(`/study_notes?id=eq.${dragging.id}`, {
        method: "PATCH",
        body: { x, y },
      });
    } catch {
      return;
    }
  }
  dragging = null;
}

async function addQuiz(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();
  if (!question || !answer || !session) return;

  try {
    const data = await restRequest("/quiz_cards?select=*", {
      method: "POST",
      body: { question, answer },
      prefer: "return=representation",
    });

    quizzes.push(data[0]);
    quizOrder = quizzes.map((_, index) => index);
    currentQuiz = quizOrder.length - 1;
    questionInput.value = "";
    answerInput.value = "";
    renderQuiz();
  } catch {
    return;
  }
}

function renderQuiz() {
  quizList.innerHTML = "";

  quizzes.forEach((quiz) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <span><strong>${escapeHtml(quiz.question)}</strong> - ${escapeHtml(quiz.answer)}</span>
      <button type="button">삭제</button>
    `;
    item.querySelector("button").addEventListener("click", () => deleteQuiz(quiz.id));
    quizList.append(item);
  });

  showCurrentQuiz();
}

async function deleteQuiz(id) {
  try {
    await restRequest(`/quiz_cards?id=eq.${id}`, { method: "DELETE" });
    quizzes = quizzes.filter((quiz) => quiz.id !== id);
    quizOrder = quizzes.map((_, index) => index);
    currentQuiz = 0;
    renderQuiz();
  } catch {
    return;
  }
}

function showCurrentQuiz() {
  if (!quizzes.length) {
    quizCount.textContent = "0 / 0";
    quizQuestion.textContent = "등록한 문제가 없습니다.";
    quizAnswer.textContent = "";
    quizAnswer.classList.add("hidden");
    return;
  }

  const quiz = quizzes[quizOrder[currentQuiz]];
  quizCount.textContent = `${currentQuiz + 1} / ${quizzes.length}`;
  quizQuestion.textContent = quiz.question;
  quizAnswer.textContent = quiz.answer;
  quizAnswer.classList.add("hidden");
}

function shuffleQuiz() {
  quizOrder = quizOrder
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
  currentQuiz = 0;
  showCurrentQuiz();
}

function nextQuiz() {
  if (!quizzes.length) return;
  currentQuiz = (currentQuiz + 1) % quizzes.length;
  showCurrentQuiz();
}

async function authRequest(path, body) {
  return request(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function rpcRequest(name, body) {
  return request(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify(body),
  });
}

async function restRequest(path, options = {}) {
  const headers = baseHeaders();
  if (options.prefer) headers.Prefer = options.prefer;

  return request(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function baseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function request(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function saveSession(data) {
  const nextSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    user: data.user,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  return nextSession;
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function authMessage(error, fallback) {
  const message = error?.message ?? "";
  if (message.toLowerCase().includes("already") || message.toLowerCase().includes("registered")) {
    return "이미 가입된 이메일 입니다";
  }
  return message || fallback;
}

function showMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("error", isError);
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
