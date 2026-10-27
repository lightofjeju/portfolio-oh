// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = "https://vqtsodztsmakplxmoczw.supabase.co";
const SUPABASE_KEY = "sb_publishable_p5Dd_oLbxuONpCeaDdgf1A_ALSj8q-0";
const BUCKET = "resume";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// 올릴 수 있는 파일 종류와 붙일 확장자
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const FILE_TYPES = { ...IMAGE_TYPES, "application/pdf": "pdf" };

// ===== 작은 도우미 =====
function $(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(text, className, onClick) {
  const b = el("button", "btn btn-small " + (className || ""), text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function note(id, text, kind) {
  const n = $(id);
  n.textContent = text || "";
  n.className = "note" + (kind ? " " + kind : "");
}

function thumb(className, url) {
  const box = el("div", className);
  if (url) {
    const img = el("img");
    img.src = url;
    img.alt = "";
    box.append(img);
  }
  return box;
}

// ===== 로그인 정보 (브라우저에 보관) =====
const SESSION_KEY = "resume_admin_session";
let session = null;

function loadSession() {
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (e) {
    session = null;
  }
}

function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {}
}

function clearSession() {
  session = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

// Supabase Auth에 요청 (로그인·토큰 새로 받기)
async function auth(path, body) {
  const res = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error_description || data.msg || "로그인 실패");
    error.status = res.status;
    throw error;
  }
  return data;
}

// 토큰이 곧 끝나면 새로 받아 온다
async function getToken() {
  if (!session) throw new Error("로그인이 필요합니다");
  if (session.expires_at - 60 < Date.now() / 1000) {
    try {
      const data = await auth("token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      saveSession(data);
    } catch (e) {
      clearSession();
      showLogin("로그인 시간이 지났어요. 다시 로그인해 주세요.");
      throw e;
    }
  }
  return session.access_token;
}

// 로그인한 토큰으로 표에 요청
async function db(path, options = {}) {
  const token = await getToken();
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const error = new Error("요청 실패 " + res.status);
    error.status = res.status;
    throw error;
  }
  return res;
}

async function dbJson(path, options) {
  const res = await db(path, options);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ===== 파일 올리기 =====

// 고른 파일이 괜찮은지 확인. 문제가 있으면 안내 문구를, 괜찮으면 ""를 돌려준다
function checkFile(file, allowed) {
  if (!file) return "";
  if (!allowed[file.type]) {
    return allowed === IMAGE_TYPES
      ? "이미지 파일(png, jpg, webp, gif)만 올릴 수 있어요."
      : "이미지(png, jpg, webp, gif)나 PDF 파일만 올릴 수 있어요.";
  }
  if (file.size > MAX_SIZE) {
    return "파일이 10MB보다 커요. 더 작은 파일을 골라 주세요.";
  }
  return "";
}

// 파일 이름을 영어·숫자로 새로 짓는다 (예: projects/thumb-1730000000000-k3j9x2.png)
function newFileName(folder, prefix, file, allowed) {
  const random = Math.random().toString(36).slice(2, 8);
  return folder + "/" + prefix + "-" + Date.now() + "-" + random + "." + allowed[file.type];
}

// resume 보관함에 올리고 공개 주소를 돌려준다
async function uploadFile(folder, prefix, file, allowed) {
  const path = newFileName(folder, prefix, file, allowed);
  const token = await getToken();
  const res = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!res.ok) throw new Error("파일 올리기 실패 " + res.status);
  return SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + path;
}

// 파일을 고르면 바로 검사해서 안내한다
function watchFile(inputId, allowed, noteId, onOk) {
  $(inputId).addEventListener("change", () => {
    const file = $(inputId).files[0];
    const problem = checkFile(file, allowed);
    if (problem) {
      $(inputId).value = "";
      note(noteId, problem, "bad");
      return;
    }
    note(noteId, "");
    if (file && onOk) onOk(file);
  });
}

function previewLocal(boxId, file) {
  const box = $(boxId);
  box.replaceChildren();
  if (file && IMAGE_TYPES[file.type]) {
    const img = el("img");
    img.src = URL.createObjectURL(file);
    img.alt = "";
    box.append(img);
  }
}

function previewUrl(boxId, url) {
  $(boxId).replaceWith(Object.assign(thumb("file-preview", url), { id: boxId }));
}

// ===== 화면 바꾸기 =====
function showOnly(viewId) {
  ["login-view", "denied-view", "admin-view"].forEach((id) => {
    $(id).hidden = id !== viewId;
  });
}

function showLogin(message) {
  showOnly("login-view");
  note("login-note", message || "", message ? "bad" : "");
}

// 로그인한 사람이 관리자인지 확인하고 알맞은 화면을 보여 준다
async function start() {
  loadSession();
  if (!session) {
    showLogin();
    return;
  }
  try {
    const rows = await dbJson("admins?select=user_id");
    const email = (session.user && session.user.email) || "";
    if (!rows || rows.length === 0) {
      $("denied-email").textContent = email + " 계정은 관리자가 아니에요.";
      showOnly("denied-view");
      return;
    }
    $("who").textContent = email;
    showOnly("admin-view");
    loadProfile();
    loadProjects();
    loadGuestbook();
  } catch (e) {
    if (session) showLogin("확인하지 못했어요. 다시 로그인해 주세요.");
  }
}

async function login() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) {
    note("login-note", "이메일과 비밀번호를 적어 주세요.", "bad");
    return;
  }
  $("login-button").disabled = true;
  note("login-note", "로그인 중…");
  try {
    const data = await auth("token?grant_type=password", { email, password });
    saveSession(data);
    $("login-password").value = "";
    note("login-note", "");
    await start();
  } catch (e) {
    note("login-note", "이메일이나 비밀번호가 맞지 않아요.", "bad");
  }
  $("login-button").disabled = false;
}

async function logout() {
  if (session) {
    try {
      await fetch(SUPABASE_URL + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + session.access_token },
      });
    } catch (e) {}
  }
  clearSession();
  showLogin("로그아웃했어요.");
  $("login-note").className = "note";
}

$("login-button").addEventListener("click", login);
$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  login();
});
$("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    login();
  }
});
document.querySelectorAll(".logout-button").forEach((b) => b.addEventListener("click", logout));

// ===== 프로필 =====
const PROFILE_FIELDS = [
  "name", "title", "career_badge", "email", "phone", "location",
  "headline", "intro", "education", "skills", "experience", "quote",
];
let profilePhotoUrl = null;

async function loadProfile() {
  try {
    const rows = await dbJson("profile?id=eq.1&select=*");
    const p = rows[0] || {};
    PROFILE_FIELDS.forEach((f) => {
      $("p-" + f).value = p[f] || "";
    });
    profilePhotoUrl = p.photo_url || null;
    previewUrl("photo-preview", profilePhotoUrl);
  } catch (e) {
    note("profile-note", "프로필을 불러오지 못했어요.", "bad");
  }
}

watchFile("photo-file", IMAGE_TYPES, "profile-note", (file) => previewLocal("photo-preview", file));

$("photo-clear").addEventListener("click", () => {
  $("photo-file").value = "";
  profilePhotoUrl = null;
  previewUrl("photo-preview", null);
  note("profile-note", "저장을 누르면 사진이 빠져요.");
});

$("profile-save").addEventListener("click", async () => {
  const btn = $("profile-save");
  btn.disabled = true;
  note("profile-note", "저장 중…");
  try {
    const file = $("photo-file").files[0];
    if (file) {
      profilePhotoUrl = await uploadFile("profile", "photo", file, IMAGE_TYPES);
    }
    const row = { id: 1, photo_url: profilePhotoUrl, updated_at: new Date().toISOString() };
    PROFILE_FIELDS.forEach((f) => {
      row[f] = $("p-" + f).value.trim();
    });
    // 한 줄이 있으면 고치고, 없으면 새로 만든다
    await db("profile?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: row,
    });
    $("photo-file").value = "";
    previewUrl("photo-preview", profilePhotoUrl);
    note("profile-note", "저장했어요. 방문자 화면에 바로 보여요.", "good");
  } catch (e) {
    note("profile-note", "저장하지 못했어요. (" + e.message + ")", "bad");
  }
  btn.disabled = false;
});

// ===== 포트폴리오 카드 =====
let projects = [];
let likeCounts = {};
let editing = null; // 고치는 중인 카드 (새 카드면 빈 객체)
let editThumbUrl = null;
let editFileUrl = null;

async function countLikes(projectId) {
  const res = await db("likes?project_id=eq." + projectId + "&select=id", {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range") || "";
  return Number(range.split("/")[1]) || 0;
}

async function loadProjects() {
  try {
    projects = await dbJson("projects?select=*&order=sort_order.asc,id.asc");
    const counts = await Promise.all(projects.map((p) => countLikes(p.id).catch(() => 0)));
    likeCounts = {};
    projects.forEach((p, i) => {
      likeCounts[p.id] = counts[i];
    });
    renderProjects();
    renderLikes();
  } catch (e) {
    $("project-list").replaceChildren(el("li", "muted", "카드를 불러오지 못했어요."));
    $("like-list").replaceChildren(el("li", "muted", "좋아요를 불러오지 못했어요."));
  }
}

function heartCount(n) {
  return el("span", "count", "♥ " + n);
}

function renderProjects() {
  const list = $("project-list");
  if (projects.length === 0) {
    list.replaceChildren(el("li", "muted", "카드가 없어요. 위의 버튼으로 추가해 주세요."));
    return;
  }
  list.replaceChildren(
    ...projects.map((p, i) => {
      const li = el("li", "row");
      const main = el("div", "row-main");
      main.append(
        el("p", "row-title", [p.number, p.title].filter(Boolean).join(". ")),
        el("p", "row-sub", [p.category, (p.tags || []).join(", ")].filter(Boolean).join(" · "))
      );

      const up = button("▲ 올리기", "", () => moveProject(i, -1));
      up.disabled = i === 0;
      const down = button("▼ 내리기", "", () => moveProject(i, 1));
      down.disabled = i === projects.length - 1;

      const actions = el("div", "btn-row");
      actions.append(
        up,
        down,
        button("수정", "", () => openEditor(p)),
        button("삭제", "btn-red", () => deleteProject(p))
      );
      li.append(thumb("row-thumb", p.thumbnail_url), main, heartCount(likeCounts[p.id] || 0), actions);
      return li;
    })
  );
}

// 순서 바꾸기: 옆 카드와 자리를 바꾼 뒤, 1부터 차례로 다시 번호를 매긴다
async function moveProject(index, step) {
  const target = index + step;
  if (target < 0 || target >= projects.length) return;
  const order = projects.slice();
  [order[index], order[target]] = [order[target], order[index]];
  note("project-list-note", "순서 바꾸는 중…");
  try {
    for (let i = 0; i < order.length; i++) {
      if (order[i].sort_order !== i + 1) {
        await db("projects?id=eq." + order[i].id, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: { sort_order: i + 1 },
        });
      }
    }
    note("project-list-note", "");
  } catch (e) {
    note("project-list-note", "순서를 바꾸지 못했어요.", "bad");
  }
  loadProjects();
}

async function deleteProject(p) {
  if (!confirm("'" + p.title + "' 카드를 지울까요?\n이 카드의 좋아요도 함께 지워지고, 되돌릴 수 없어요.")) return;
  try {
    await db("projects?id=eq." + p.id, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (editing && editing.id === p.id) closeEditor();
    note("project-list-note", "지웠어요.", "good");
  } catch (e) {
    note("project-list-note", "지우지 못했어요.", "bad");
  }
  loadProjects();
}

function showFileNow() {
  const box = $("file-now");
  box.replaceChildren();
  if (editFileUrl) {
    const a = el("a", "", "지금 첨부된 파일 보기");
    a.href = editFileUrl;
    a.target = "_blank";
    a.rel = "noopener";
    box.append(a);
  } else {
    box.textContent = "첨부 파일 없음";
  }
}

function openEditor(p) {
  editing = p || {};
  $("editor-title").textContent = p ? "카드 수정" : "카드 추가";
  $("e-number").value = editing.number || "";
  $("e-category").value = editing.category || "";
  $("e-title").value = editing.title || "";
  $("e-description").value = editing.description || "";
  $("e-tags").value = (editing.tags || []).join(", ");
  $("e-thumb").value = "";
  $("e-file").value = "";
  editThumbUrl = editing.thumbnail_url || null;
  editFileUrl = editing.file_url || null;
  previewUrl("thumb-preview", editThumbUrl);
  showFileNow();
  note("project-note", "");
  $("project-editor").hidden = false;
  $("project-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  editing = null;
  $("project-editor").hidden = true;
}

$("project-new").addEventListener("click", () => openEditor(null));
$("project-cancel").addEventListener("click", closeEditor);

watchFile("e-thumb", IMAGE_TYPES, "project-note", (file) => previewLocal("thumb-preview", file));
watchFile("e-file", FILE_TYPES, "project-note", () => {
  $("file-now").textContent = "저장을 누르면 새 파일이 올라가요.";
});

$("thumb-clear").addEventListener("click", () => {
  $("e-thumb").value = "";
  editThumbUrl = null;
  previewUrl("thumb-preview", null);
});

$("file-clear").addEventListener("click", () => {
  $("e-file").value = "";
  editFileUrl = null;
  showFileNow();
});

$("project-save").addEventListener("click", async () => {
  const title = $("e-title").value.trim();
  if (!title) {
    note("project-note", "제목을 적어 주세요.", "bad");
    return;
  }
  const btn = $("project-save");
  btn.disabled = true;
  note("project-note", "저장 중…");
  try {
    const thumbFile = $("e-thumb").files[0];
    const attachFile = $("e-file").files[0];
    if (thumbFile) editThumbUrl = await uploadFile("projects", "thumb", thumbFile, IMAGE_TYPES);
    if (attachFile) editFileUrl = await uploadFile("projects", "file", attachFile, FILE_TYPES);

    const row = {
      number: $("e-number").value.trim(),
      category: $("e-category").value.trim(),
      title,
      description: $("e-description").value.trim(),
      tags: $("e-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
      thumbnail_url: editThumbUrl,
      file_url: editFileUrl,
    };

    if (editing && editing.id) {
      await db("projects?id=eq." + editing.id, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: row,
      });
    } else {
      // 새 카드는 맨 뒤에 붙인다
      row.sort_order = projects.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
      await db("projects", { method: "POST", headers: { Prefer: "return=minimal" }, body: row });
    }
    closeEditor();
    note("project-list-note", "저장했어요. 방문자 화면에 바로 보여요.", "good");
    loadProjects();
  } catch (e) {
    note("project-note", "저장하지 못했어요. (" + e.message + ")", "bad");
  }
  btn.disabled = false;
});

// ===== 좋아요 =====
function renderLikes() {
  const list = $("like-list");
  if (projects.length === 0) {
    list.replaceChildren(el("li", "muted", "카드가 없어요."));
    return;
  }
  list.replaceChildren(
    ...projects.map((p) => {
      const li = el("li", "row");
      const main = el("div", "row-main");
      main.append(el("p", "row-title", [p.number, p.title].filter(Boolean).join(". ")));
      const reset = button("좋아요 초기화", "btn-red", () => resetLikes(p));
      reset.disabled = !likeCounts[p.id];
      const actions = el("div", "btn-row");
      actions.append(reset);
      li.append(main, heartCount(likeCounts[p.id] || 0), actions);
      return li;
    })
  );
}

async function resetLikes(p) {
  if (!confirm("'" + p.title + "' 카드의 좋아요 " + (likeCounts[p.id] || 0) + "개를 모두 지울까요?\n되돌릴 수 없어요.")) return;
  try {
    await db("likes?project_id=eq." + p.id, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    note("like-note", "초기화했어요.", "good");
  } catch (e) {
    note("like-note", "초기화하지 못했어요.", "bad");
  }
  loadProjects();
}

// ===== 방명록 =====
function formatDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadGuestbook() {
  const list = $("guest-list");
  try {
    const rows = await dbJson("resume_guestbook?select=*&order=created_at.desc");
    if (rows.length === 0) {
      list.replaceChildren(el("li", "muted", "남겨진 글이 없어요."));
      return;
    }
    list.replaceChildren(
      ...rows.map((g) => {
        const li = el("li", "row");
        const main = el("div", "row-main");
        main.append(
          el("p", "row-title", g.nickname),
          el("p", "row-sub", formatDate(g.created_at)),
          el("p", "gb-text", g.message)
        );
        const actions = el("div", "btn-row");
        actions.append(button("삭제", "btn-red", () => deleteGuest(g)));
        li.append(main, actions);
        return li;
      })
    );
  } catch (e) {
    list.replaceChildren(el("li", "muted", "방명록을 불러오지 못했어요."));
  }
}

async function deleteGuest(g) {
  if (!confirm("'" + g.nickname + "'님의 글을 지울까요?\n되돌릴 수 없어요.")) return;
  try {
    await db("resume_guestbook?id=eq." + g.id, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    note("guest-note", "지웠어요.", "good");
  } catch (e) {
    note("guest-note", "지우지 못했어요.", "bad");
  }
  loadGuestbook();
}

// ===== 시작 =====
start();
