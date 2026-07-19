const SUPABASE_URL = "https://qemfgfwbyjbjunkoowmj.supabase.co";
const SUPABASE_KEY = "sb_publishable_YCobY_XD9DTkwpt9X4ihgA_MLWUT4xI";
const NOTE_COLORS = ["#ffe66d", "#caffbf", "#9bf6ff", "#ffd6a5", "#ffadad"];
const SESSION_KEY = "pinrecall.supabase.session";

let session = null;
let profile = null;
let workspaces = [];
let currentWorkspaceIndex = 0;
let boards = [];
let currentBoardIndex = 0;
let notes = [];
let quizzes = [];
let quizOrder = [];
let currentQuiz = 0;
let dragging = null;
let editingNoteId = null;

const nav = document.querySelector("#nav");
const menuToggle = document.querySelector("#menu-toggle");
const pages = {
  notes: document.querySelector("#notes-page"),
  quiz: document.querySelector("#quiz-page"),
  login: document.querySelector("#login-page"),
  signup: document.querySelector("#signup-page"),
  docs: document.querySelector("#docs-page"),
};

const noteBoard = document.querySelector("#note-board");
const noteForm = document.querySelector("#note-form");
const noteText = document.querySelector("#note-text");
const workspaceToggle = document.querySelector("#workspace-toggle");
const workspaceMenu = document.querySelector("#workspace-menu");
const boardCount = document.querySelector("#board-count");
const addBoardButton = document.querySelector("#add-board-btn");
const prevBoardButton = document.querySelector("#prev-board-btn");
const nextBoardButton = document.querySelector("#next-board-btn");
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
  menuToggle.addEventListener("click", toggleMenu);
  nav.addEventListener("click", navigateFromNav);
  workspaceToggle.addEventListener("click", toggleWorkspaceMenu);
  workspaceMenu.addEventListener("click", handleWorkspaceMenu);
  document.addEventListener("click", closeFloatingMenusFromOutside);
  document.addEventListener("keydown", closeFloatingMenusWithEscape);
  noteForm.addEventListener("submit", addNote);
  addBoardButton.addEventListener("click", addBoard);
  prevBoardButton.addEventListener("click", () => moveBoard(-1));
  nextBoardButton.addEventListener("click", () => moveBoard(1));
  quizForm.addEventListener("submit", addQuiz);
  document.querySelector("#shuffle-btn").addEventListener("click", shuffleQuiz);
  document.querySelector("#show-answer-btn").addEventListener("click", () => quizAnswer.classList.toggle("hidden"));
  document.querySelector("#prev-btn").addEventListener("click", prevQuiz);
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
    setMenuOpen(false);
    return;
  }
  location.hash = nextHash;
  setMenuOpen(false);
}

function toggleMenu() {
  setMenuOpen(!nav.classList.contains("open"));
}

function setMenuOpen(isOpen) {
  nav.classList.toggle("open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
}

function toggleWorkspaceMenu() {
  if (!session) return;
  setWorkspaceMenuOpen(!workspaceMenu.classList.contains("open"));
}

function setWorkspaceMenuOpen(isOpen) {
  workspaceMenu.classList.toggle("open", isOpen);
  workspaceToggle.setAttribute("aria-expanded", String(isOpen));
}

async function handleWorkspaceMenu(event) {
  const addButton = event.target.closest("[data-action='add-workspace']");
  if (addButton) {
    await addWorkspace();
    return;
  }

  const option = event.target.closest("[data-workspace-id]");
  if (!option) return;
  await selectWorkspace(option.dataset.workspaceId);
}

function renderWorkspaceMenu() {
  if (!session) {
    workspaceMenu.innerHTML = "";
    setWorkspaceMenuOpen(false);
    return;
  }

  const current = currentWorkspace();
  const items = workspaces
    .map(
      (workspace) => `
        <button
          class="workspace-option ${workspace.id === current?.id ? "active" : ""}"
          type="button"
          data-workspace-id="${workspace.id}"
        >
          ${escapeHtml(workspace.title)}
        </button>
      `,
    )
    .join("");

  workspaceMenu.innerHTML = `
    ${items}
    <button class="workspace-add" type="button" data-action="add-workspace">+ 작업공간 추가</button>
  `;
}

async function selectWorkspace(id) {
  const nextIndex = workspaces.findIndex((workspace) => workspace.id === id);
  if (nextIndex < 0) return;

  currentWorkspaceIndex = nextIndex;
  currentBoardIndex = 0;
  editingNoteId = null;
  setWorkspaceMenuOpen(false);
  await ensureCurrentWorkspaceHasBoard();
  renderNotes();
}

async function addWorkspace() {
  if (!session) return;

  const fallbackTitle = defaultWorkspaceTitle();
  const input = window.prompt("작업공간 이름을 입력하세요.", fallbackTitle);
  if (input === null) return;

  const title = input.trim() || fallbackTitle;
  try {
    const workspace = await createWorkspace(title, workspaces.length);
    workspaces.push(workspace);
    currentWorkspaceIndex = workspaces.length - 1;
    currentBoardIndex = 0;
    editingNoteId = null;

    const board = await createBoard("칠판 1", 0, workspace.id);
    boards.push(board);
    setWorkspaceMenuOpen(false);
    renderNotes();
  } catch {
    return;
  }
}

function defaultWorkspaceTitle() {
  return `기본칠판${workspaces.length + 1}`;
}

function closeFloatingMenusFromOutside(event) {
  if (!event.target.closest(".menu-area")) {
    setMenuOpen(false);
  }
  if (!event.target.closest(".workspace-select")) {
    setWorkspaceMenuOpen(false);
  }
}

function closeFloatingMenusWithEscape(event) {
  if (event.key === "Escape") {
    setMenuOpen(false);
    setWorkspaceMenuOpen(false);
  }
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
    workspaces = [];
    currentWorkspaceIndex = 0;
    boards = [];
    currentBoardIndex = 0;
    notes = [];
    quizzes = [];
    quizOrder = [];
    currentQuiz = 0;
    return;
  }

  try {
    const [profiles, workspaceData, boardData, noteData, quizData] = await Promise.all([
      restRequest(`/profiles?select=nickname,email&id=eq.${session.user.id}`),
      restRequest("/note_workspaces?select=*&order=position.asc,created_at.asc"),
      restRequest("/note_boards?select=*&order=position.asc,created_at.asc"),
      restRequest("/study_notes?select=*&order=created_at.asc"),
      restRequest("/quiz_cards?select=*&order=created_at.asc"),
    ]);

    profile = profiles[0] ?? null;
    workspaces = workspaceData ?? [];
    if (!workspaces.length) {
      workspaces = [await createWorkspace("기본칠판1", 0)];
    }
    currentWorkspaceIndex = Math.min(currentWorkspaceIndex, Math.max(workspaces.length - 1, 0));
    boards = boardData ?? [];
    await assignBoardsWithoutWorkspace();
    await ensureCurrentWorkspaceHasBoard();
    currentBoardIndex = Math.min(currentBoardIndex, Math.max(currentBoards().length - 1, 0));
    notes = noteData ?? [];
    await assignNotesWithoutBoard();
    quizzes = quizData ?? [];
    quizOrder = quizzes.map((_, index) => index);
    currentQuiz = 0;
  } catch {
    clearSession();
    session = null;
    profile = null;
    workspaces = [];
    currentWorkspaceIndex = 0;
    boards = [];
    currentBoardIndex = 0;
    notes = [];
    quizzes = [];
    quizOrder = [];
  }
}

function renderNav() {
  if (session) {
    const name = profile?.nickname || session.user.email;
    nav.innerHTML = `
      <div class="menu-profile">
        <span>로그인 계정</span>
        <strong>${escapeHtml(name)}님</strong>
      </div>
      <a class="${navActive("notes")}" href="#notes">포스트잇</a>
      <a class="${navActive("quiz")}" href="#quiz">퀴즈</a>
      <a class="${navActive("docs")}" href="#docs">사용 설명서</a>
      <button id="logout-btn" type="button">로그아웃</button>
    `;
    document.querySelector("#logout-btn").addEventListener("click", logout);
    return;
  }

  nav.innerHTML = `
    <div class="menu-profile muted-profile">
      <span>학습 공간</span>
      <strong>로그인이 필요합니다</strong>
    </div>
    <a class="${navActive("notes")}" href="#notes">포스트잇</a>
    <a class="${navActive("quiz")}" href="#quiz">퀴즈</a>
    <a class="${navActive("docs")}" href="#docs">사용 설명서</a>
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

  if (session && (route === "login" || route === "signup")) {
    navigateTo("#notes");
    return;
  }

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

  if (route === "docs") {
    pages.docs.classList.remove("hidden");
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
    navigateTo("#notes");
  } catch {
    showMessage(loginMessage, "이메일 또는 비밀번호를 확인하세요.", true);
  }
}

function navigateTo(hash) {
  if (location.hash === hash) {
    renderRoute();
    return;
  }
  location.hash = hash;
}

function logout() {
  clearSession();
  session = null;
  profile = null;
  notes = [];
  workspaces = [];
  currentWorkspaceIndex = 0;
  boards = [];
  currentBoardIndex = 0;
  quizzes = [];
  quizOrder = [];
  currentQuiz = 0;
  renderNav();
  setMenuOpen(false);
  location.hash = "#login";
}

async function addNote(event) {
  event.preventDefault();
  const content = noteText.value.trim();
  if (!content || !session) return;
  const board = currentBoard();
  if (!board) return;

  const nextNote = {
    board_id: board.id,
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
  renderBoardMeta();

  const board = currentBoard();
  const visibleNotes = board ? notes.filter((note) => note.board_id === board.id) : [];

  if (!visibleNotes.length) {
    noteBoard.innerHTML = `<p class="empty">아직 붙인 포스트잇이 없습니다.</p>`;
    return;
  }

  visibleNotes.forEach((note) => {
    const item = document.createElement("article");
    item.className = "note";
    item.style.left = `${note.x}px`;
    item.style.top = `${note.y}px`;
    item.style.background = note.color;
    item.dataset.id = note.id;
    if (editingNoteId === note.id) {
      item.classList.add("editing");
      item.innerHTML = `
        <textarea class="note-editor" maxlength="240" aria-label="포스트잇 내용 수정">${escapeHtml(note.content)}</textarea>
        <div class="note-edit-actions">
          <button class="save-note" type="button">저장</button>
          <button class="cancel-note" type="button">취소</button>
        </div>
      `;
      const editor = item.querySelector(".note-editor");
      item.querySelector(".save-note").addEventListener("click", () => saveNoteEdit(note.id, editor.value));
      item.querySelector(".cancel-note").addEventListener("click", cancelNoteEdit);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      });
    } else {
      item.innerHTML = `
        <button class="delete" type="button" aria-label="삭제">x</button>
        <p>${escapeHtml(note.content)}</p>
      `;
      item.querySelector(".delete").addEventListener("click", () => deleteNote(note.id));
      item.addEventListener("dblclick", () => editNote(note.id));
    }

    item.addEventListener("pointerdown", startDrag);
    noteBoard.append(item);
  });
}

function editNote(id) {
  editingNoteId = id;
  renderNotes();
}

function cancelNoteEdit() {
  editingNoteId = null;
  renderNotes();
}

async function saveNoteEdit(id, content) {
  const nextContent = content.trim();
  if (!nextContent) return;

  try {
    await restRequest(`/study_notes?id=eq.${id}`, {
      method: "PATCH",
      body: { content: nextContent },
    });
    notes = notes.map((note) => (note.id === id ? { ...note, content: nextContent } : note));
    editingNoteId = null;
    renderNotes();
  } catch {
    return;
  }
}

async function addBoard() {
  if (!session) return;
  const workspace = currentWorkspace();
  if (!workspace) return;

  try {
    const workspaceBoards = currentBoards();
    const board = await createBoard(`칠판 ${workspaceBoards.length + 1}`, workspaceBoards.length, workspace.id);
    boards.push(board);
    currentBoardIndex = currentBoards().length - 1;
    renderNotes();
  } catch {
    return;
  }
}

async function createBoard(title, position, workspaceId = currentWorkspace()?.id) {
  const data = await restRequest("/note_boards?select=*", {
    method: "POST",
    body: { title, position, workspace_id: workspaceId },
    prefer: "return=representation",
  });
  return data[0];
}

async function createWorkspace(title, position) {
  const data = await restRequest("/note_workspaces?select=*", {
    method: "POST",
    body: { title, position },
    prefer: "return=representation",
  });
  return data[0];
}

async function assignBoardsWithoutWorkspace() {
  const workspace = currentWorkspace();
  const looseBoards = boards.filter((board) => !board.workspace_id);
  if (!workspace || !looseBoards.length) return;

  await Promise.all(
    looseBoards.map((board) =>
      restRequest(`/note_boards?id=eq.${board.id}`, {
        method: "PATCH",
        body: { workspace_id: workspace.id },
      }),
    ),
  );
  boards = boards.map((board) => (board.workspace_id ? board : { ...board, workspace_id: workspace.id }));
}

async function ensureCurrentWorkspaceHasBoard() {
  const workspace = currentWorkspace();
  if (!workspace || currentBoards().length) return;

  const board = await createBoard("칠판 1", 0, workspace.id);
  boards.push(board);
  currentBoardIndex = 0;
}

async function assignNotesWithoutBoard() {
  const board = currentBoard();
  const looseNotes = notes.filter((note) => !note.board_id);
  if (!board || !looseNotes.length) return;

  await Promise.all(
    looseNotes.map((note) =>
      restRequest(`/study_notes?id=eq.${note.id}`, {
        method: "PATCH",
        body: { board_id: board.id },
      }),
    ),
  );
  notes = notes.map((note) => (note.board_id ? note : { ...note, board_id: board.id }));
}

function moveBoard(direction) {
  const workspaceBoards = currentBoards();
  if (!workspaceBoards.length) return;
  currentBoardIndex = (currentBoardIndex + direction + workspaceBoards.length) % workspaceBoards.length;
  renderNotes();
}

function currentWorkspace() {
  return workspaces[currentWorkspaceIndex] ?? null;
}

function currentBoards() {
  const workspace = currentWorkspace();
  if (!workspace) return [];
  return boards.filter((board) => board.workspace_id === workspace.id);
}

function currentBoard() {
  return currentBoards()[currentBoardIndex] ?? null;
}

function renderBoardMeta() {
  const workspace = currentWorkspace();
  const workspaceBoards = currentBoards();
  currentBoardIndex = Math.min(currentBoardIndex, Math.max(workspaceBoards.length - 1, 0));
  workspaceToggle.textContent = workspace?.title ?? "작업공간 없음";
  boardCount.textContent = workspaceBoards.length ? `${currentBoardIndex + 1} / ${workspaceBoards.length}` : "0 / 0";
  prevBoardButton.disabled = workspaceBoards.length <= 1;
  nextBoardButton.disabled = workspaceBoards.length <= 1;
  renderWorkspaceMenu();
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
  if (event.target.closest("button, textarea, input, .note-editor")) return;

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
    quizQuestion.classList.add("empty-question");
    quizAnswer.textContent = "";
    quizAnswer.classList.add("hidden");
    return;
  }

  const quiz = quizzes[quizOrder[currentQuiz]];
  quizCount.textContent = `${currentQuiz + 1} / ${quizzes.length}`;
  quizQuestion.textContent = quiz.question;
  quizQuestion.classList.remove("empty-question");
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

function prevQuiz() {
  if (!quizzes.length) return;
  currentQuiz = (currentQuiz - 1 + quizzes.length) % quizzes.length;
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
