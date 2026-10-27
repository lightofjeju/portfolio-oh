// ===== Supabase 연결 정보 (공개 키만 사용) =====
const SUPABASE_URL = "https://vqtsodztsmakplxmoczw.supabase.co";
const SUPABASE_KEY = "sb_publishable_p5Dd_oLbxuONpCeaDdgf1A_ALSj8q-0";

// Supabase 표에 요청을 보내는 함수
async function db(path, options = {}) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
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

// 화면 요소를 만드는 작은 도우미 (글자는 textContent로 넣어 안전하게)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function setText(id, text) {
  document.getElementById(id).textContent = text || "";
}

// ===== 이 브라우저의 표시(client_id)와 누른 좋아요 기억 =====
function getClientId() {
  let id = null;
  try {
    id = localStorage.getItem("resume_client_id");
  } catch (e) {}
  if (!id) {
    id = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    try {
      localStorage.setItem("resume_client_id", id);
    } catch (e) {}
  }
  return id;
}

function getLikedIds() {
  try {
    return JSON.parse(localStorage.getItem("resume_liked") || "[]");
  } catch (e) {
    return [];
  }
}

function saveLikedId(projectId) {
  const liked = getLikedIds();
  if (!liked.includes(projectId)) liked.push(projectId);
  try {
    localStorage.setItem("resume_liked", JSON.stringify(liked));
  } catch (e) {}
}

const clientId = getClientId();

// ===== 프로필 =====
async function loadProfile() {
  try {
    const res = await db("profile?id=eq.1&select=*");
    const rows = await res.json();
    const p = rows[0];
    if (!p) {
      setText("name", "프로필이 아직 없습니다");
      return;
    }

    // 사진 (없으면 회색 자리 그대로)
    const photo = document.getElementById("photo");
    if (p.photo_url) {
      const img = el("img");
      img.src = p.photo_url;
      img.alt = p.name + " 프로필 사진";
      photo.replaceChildren(img);
    }

    setText("name", p.name);
    setText("title", p.title);
    const badge = document.getElementById("badge");
    badge.textContent = p.career_badge || "";
    badge.hidden = !p.career_badge;

    setText("c-name", p.name);
    setText("c-email", p.email);
    setText("c-phone", p.phone);
    setText("c-location", p.location);

    // 한 줄 소개: 그 안의 이름에 파란 밑줄
    const headline = document.getElementById("headline");
    headline.replaceChildren();
    const text = p.headline || "";
    const at = p.name ? text.indexOf(p.name) : -1;
    if (at >= 0) {
      headline.append(
        text.slice(0, at),
        el("span", "name-mark", p.name),
        text.slice(at + p.name.length)
      );
    } else {
      headline.textContent = text;
    }

    setText("intro", p.intro);
    setText("education", p.education);
    setText("skills", p.skills);
    setText("experience", p.experience);

    const quote = document.getElementById("quote");
    quote.textContent = p.quote ? "“" + p.quote + "”" : "";
    quote.hidden = !p.quote;
  } catch (e) {
    setText("name", "프로필을 불러오지 못했습니다");
  }
}

// ===== 포트폴리오 카드 =====

// 카드 하나의 좋아요 수 (줄 수만 세어 옴)
async function countLikes(projectId) {
  const res = await db("likes?project_id=eq." + projectId + "&select=id", {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range") || "";
  return Number(range.split("/")[1]) || 0;
}

// 이 브라우저가 이미 누른 카드 번호들 (다른 기기와 상관없이 이 브라우저 기준)
async function loadMyLikes() {
  const ids = new Set(getLikedIds());
  try {
    const res = await db("likes?client_id=eq." + encodeURIComponent(clientId) + "&select=project_id");
    const rows = await res.json();
    rows.forEach((r) => ids.add(r.project_id));
  } catch (e) {}
  return ids;
}

const heartSvg =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.7 3.2 5 6.8 5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.6 0 5.6 3.7 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg>';

function makeCard(project, likeCount, alreadyLiked) {
  const card = el("article", "card");

  // 누르면 열 주소: 첨부 파일이 먼저, 없으면 썸네일 이미지
  const openUrl = project.file_url || project.thumbnail_url;
  let link;
  if (openUrl) {
    link = el("a", "card-link");
    link.href = openUrl;
    link.target = "_blank";
    link.rel = "noopener";
  } else {
    link = el("div", "card-link");
  }

  // 브라우저 창 모양 썸네일
  const win = el("div", "window");
  const bar = el("div", "window-bar");
  bar.append(el("span"), el("span"), el("span"));
  const body = el("div", "window-body");
  if (project.thumbnail_url) {
    const img = el("img");
    img.src = project.thumbnail_url;
    img.alt = project.title;
    img.loading = "lazy";
    body.append(img);
  }
  win.append(bar, body);

  const info = el("div", "card-body");
  const meta = [project.number, project.category].filter(Boolean).join(" · ");
  info.append(
    el("p", "card-meta", meta),
    el("h4", "card-title", project.title),
    el("p", "card-desc", project.description)
  );
  const tags = el("div", "tags");
  (project.tags || []).forEach((t) => tags.append(el("span", "tag", t)));
  info.append(tags);

  link.append(win, info);

  // 좋아요 버튼
  const foot = el("div", "card-foot");
  const btn = el("button", "like");
  btn.type = "button";
  btn.innerHTML = heartSvg;
  const num = el("span", "like-num", likeCount);
  btn.append(num);
  setLikeState(btn, alreadyLiked);

  btn.addEventListener("click", async () => {
    if (btn.classList.contains("on") || btn.disabled) return;
    btn.disabled = true;
    try {
      await db("likes", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: { project_id: project.id, client_id: clientId },
      });
      num.textContent = Number(num.textContent) + 1;
      saveLikedId(project.id);
      setLikeState(btn, true);
    } catch (e) {
      if (e.status === 409) {
        // 이미 누른 카드였음 (예: 저장해 둔 기록이 지워진 경우)
        saveLikedId(project.id);
        setLikeState(btn, true);
      } else {
        alert("좋아요를 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.");
      }
    }
    btn.disabled = false;
  });

  foot.append(btn);
  card.append(link, foot);
  return card;
}

function setLikeState(btn, liked) {
  btn.classList.toggle("on", liked);
  btn.setAttribute("aria-pressed", liked ? "true" : "false");
  btn.setAttribute("aria-label", liked ? "좋아요를 눌렀어요" : "좋아요");
}

async function loadProjects() {
  const box = document.getElementById("cards");
  try {
    const res = await db("projects?select=*&order=sort_order.asc,id.asc");
    const projects = await res.json();
    if (projects.length === 0) {
      box.replaceChildren(el("p", "muted", "아직 등록된 프로젝트가 없습니다."));
      return;
    }
    const [counts, myLikes] = await Promise.all([
      Promise.all(projects.map((p) => countLikes(p.id).catch(() => 0))),
      loadMyLikes(),
    ]);
    box.replaceChildren(
      ...projects.map((p, i) => makeCard(p, counts[i], myLikes.has(p.id)))
    );
  } catch (e) {
    box.replaceChildren(el("p", "muted", "프로젝트를 불러오지 못했습니다."));
  }
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

function makeGuestItem(row) {
  const li = el("li", "gb-item");
  const head = el("div", "gb-head");
  head.append(el("span", "gb-name", row.nickname), el("span", "gb-date", formatDate(row.created_at)));
  li.append(head, el("p", "gb-text", row.message));
  return li;
}

async function loadGuestbook() {
  const list = document.getElementById("gb-list");
  try {
    const res = await db("resume_guestbook?select=*&order=created_at.desc&limit=100");
    const rows = await res.json();
    if (rows.length === 0) {
      list.replaceChildren(el("li", "muted gb-empty", "첫 번째 한마디를 남겨 주세요."));
      return;
    }
    list.replaceChildren(...rows.map(makeGuestItem));
  } catch (e) {
    list.replaceChildren(el("li", "muted", "방명록을 불러오지 못했습니다."));
  }
}

async function addGuestbook() {
  const nickInput = document.getElementById("gb-nick");
  const msgInput = document.getElementById("gb-msg");
  const button = document.getElementById("gb-button");
  const status = document.getElementById("gb-status");

  const nickname = nickInput.value.trim();
  const message = msgInput.value.trim();
  if (!nickname || !message) {
    status.textContent = "별명과 한마디를 모두 적어 주세요.";
    return;
  }

  button.disabled = true;
  status.textContent = "남기는 중…";
  try {
    const res = await db("resume_guestbook", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { nickname, message },
    });
    const [row] = await res.json();
    const list = document.getElementById("gb-list");
    // "불러오는 중"이나 "첫 번째 한마디" 안내가 있으면 지운다
    list.querySelectorAll(".muted").forEach((n) => n.remove());
    list.prepend(makeGuestItem(row));
    msgInput.value = "";
    status.textContent = "남겼습니다. 고맙습니다!";
  } catch (e) {
    status.textContent = "남기지 못했습니다. 잠시 후 다시 해 주세요.";
  }
  button.disabled = false;
}

document.getElementById("gb-button").addEventListener("click", addGuestbook);
document.getElementById("gb-form").addEventListener("submit", (e) => {
  e.preventDefault();
  addGuestbook();
});
document.getElementById("gb-msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    addGuestbook();
  }
});

// ===== 시작 =====
loadProfile();
loadProjects();
loadGuestbook();
