(function () {
  const PLATFORMS = {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
    facebook: "Facebook",
  };
  let platform = "tiktok";
  let me = null;
  let myHandles = {};
  let searchTimer = null;

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
    if (r.status === 401) { location.href = "/login"; throw new Error("auth"); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Something went wrong.");
    return d;
  }

  // ---------- boot ----------
  async function boot() {
    const d = await api("/api/auth/me").catch(() => null);
    if (!d || !d.user) { location.href = "/login"; return; }
    me = d.user;
    myHandles = d.handles || {};
    $("userChip").textContent = me.displayName || me.email;
    $("acctEmail").textContent = me.email;
    $("acctName").textContent = me.displayName || "—";
    $("acctSince").textContent = new Date(me.createdAt).toLocaleDateString();
    renderTabs();
    renderHandlesForm();
    await refreshAll();
  }

  // ---------- tabs ----------
  function renderTabs() {
    const box = $("platformTabs");
    box.innerHTML = "";
    for (const [key, label] of Object.entries(PLATFORMS)) {
      const b = document.createElement("button");
      b.className = "tab" + (key === platform ? " active" : "");
      b.textContent = label;
      b.onclick = () => { platform = key; renderTabs(); refreshAll(); };
      box.appendChild(b);
    }
    $("addTitle").textContent = "Add a " + PLATFORMS[platform] + " engager";
    $("handleInput").placeholder = "Enter a " + PLATFORMS[platform] + " username…";
    $("top7sub").textContent = "Your highest-starred engagers on " + PLATFORMS[platform] + ".";
  }

  // ---------- bottom nav ----------
  document.querySelectorAll(".bottom-nav button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".bottom-nav button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      ["home", "notes", "profile"].forEach((v) => { $("view-" + v).hidden = v !== b.dataset.view; });
      if (b.dataset.view === "notes") loadNotes();
      if (b.dataset.view === "profile") renderMyProfileLinks();
    };
  });

  $("logoutBtn").onclick = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/";
  };

  // ---------- top 7 ----------
  async function loadTop7() {
    const d = await api("/api/top7?platform=" + platform);
    const ol = $("top7list");
    if (!d.top.length) {
      ol.innerHTML = '<div class="empty">No starred engagers yet on ' + esc(PLATFORMS[platform]) + '. Add someone below and give them their first star. ★</div>';
      return;
    }
    ol.innerHTML = d.top.map((e) => {
      const target = e.link.kind === "external" ? ' target="_blank" rel="noopener"' : "";
      const badge = e.link.kind === "internal" ? '<span class="reg-badge">MEN member</span>' : "";
      return `<li><span class="rank">${e.rank}</span><span class="who"><a href="${esc(e.link.url)}"${target}>@${esc(e.username)}</a>${badge}</span><span class="stars">★ ${e.stars}</span></li>`;
    }).join("");
  }

  // ---------- engagers ----------
  async function loadEngagers() {
    const q = $("searchInput").value.trim();
    const sort = $("sortSelect").value;
    const d = await api("/api/engagers?platform=" + platform + "&sort=" + sort + "&q=" + encodeURIComponent(q));
    const box = $("engagerList");
    $("acctCount").textContent = d.engagers.length + " on " + PLATFORMS[platform];
    if (!d.engagers.length) {
      box.innerHTML = '<div class="empty">Nothing here yet. Your ' + esc(PLATFORMS[platform]) + ' engager list starts with the field above. ↑</div>';
      return;
    }
    box.innerHTML = d.engagers.map((e) => {
      const target = e.link.kind === "external" ? ' target="_blank" rel="noopener"' : "";
      const badge = e.link.kind === "internal" ? '<span class="reg-badge">MEN member</span>' : "";
      return `<div class="eng" data-id="${esc(e.id)}">
        <div class="eng-top">
          <div class="avatar">${esc(e.username.charAt(0).toUpperCase())}</div>
          <div><div class="eng-name"><a href="${esc(e.link.url)}"${target}>@${esc(e.username)}</a>${badge}</div>
          <div class="eng-meta">Added ${new Date(e.createdAt).toLocaleDateString()}</div></div>
          <div class="eng-actions">
            <span class="star-count">★ ${e.stars}</span>
            <button class="star-btn" data-act="star">★ Star</button>
          </div>
        </div>
        <div class="eng-notes">
          <textarea class="input" data-act="notes" placeholder="Private note — only you can see this…">${esc(e.notes)}</textarea>
          <div class="row-btns">
            <button class="btn small ghost" data-act="savenotes">Save note</button>
            <a class="btn small ghost link-btn" href="${esc(e.link.url)}"${target}>${e.link.kind === "internal" ? "View MEN profile →" : "Open " + esc(PLATFORMS[platform]) + " profile ↗"}</a>
            <span class="nav-spacer"></span>
            <button class="btn small danger" data-act="del">Remove</button>
          </div>
        </div>
      </div>`;
    }).join("");
  }

  $("engagerList").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const card = ev.target.closest(".eng");
    const id = card.dataset.id;
    const act = btn.dataset.act;
    try {
      if (act === "star") {
        const d = await api("/api/engagers/" + id + "/star", { method: "POST" });
        card.querySelector(".star-count").textContent = "★ " + d.stars;
        loadTop7();
      } else if (act === "savenotes") {
        const notes = card.querySelector('[data-act="notes"]').value;
        await api("/api/engagers/" + id, { method: "PATCH", body: JSON.stringify({ notes }) });
        btn.textContent = "Saved ✓";
        setTimeout(() => (btn.textContent = "Save note"), 1500);
      } else if (act === "del") {
        if (!confirm("Remove this engager from your list?")) return;
        await api("/api/engagers/" + id, { method: "DELETE" });
        await refreshAll();
      }
    } catch (e) { alert(e.message); }
  });

  function showAddErr(msg) {
    const el = $("addErr");
    if (!msg) { el.style.display = "none"; return; }
    el.textContent = msg; el.style.display = "block";
  }

  async function addEngager() {
    showAddErr(null);
    const username = $("handleInput").value.trim();
    if (!username) { showAddErr("Type a username first."); return; }
    $("addBtn").disabled = true;
    try {
      await api("/api/engagers", { method: "POST", body: JSON.stringify({ platform, username }) });
      $("handleInput").value = "";
      await refreshAll();
    } catch (e) { showAddErr(e.message); }
    finally { $("addBtn").disabled = false; }
  }
  $("addBtn").onclick = addEngager;
  $("handleInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addEngager(); });
  $("sortSelect").onchange = loadEngagers;
  $("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadEngagers, 300);
  });

  // ---------- who added me ----------
  async function loadAddedMe() {
    const d = await api("/api/added-me?platform=" + platform);
    const ul = $("addedMeList");
    if (!d.claimed) {
      $("addedMeSub").textContent = "Claim your " + PLATFORMS[platform] + " handle in My Profile so members can find you here.";
      ul.innerHTML = "";
      return;
    }
    $("addedMeSub").textContent = "People who added @" + d.myHandle + " on " + PLATFORMS[platform] + ".";
    if (!d.entries.length) {
      ul.innerHTML = '<div class="empty">Nobody yet — share your handle and collect those stars. ★</div>';
      return;
    }
    ul.innerHTML = d.entries.map((e) => {
      const who = e.profileUrl
        ? `<a href="${esc(e.profileUrl)}">@${esc(e.handle)}</a>`
        : esc(e.name);
      return `<li><strong>${who}</strong> added you to their engagers list <span style="color:var(--faint)">· ${new Date(e.at).toLocaleDateString()}</span></li>`;
    }).join("");
  }

  // ---------- notepad ----------
  async function loadNotes() {
    const d = await api("/api/notes");
    const box = $("notesList");
    if (!d.notes.length) { box.innerHTML = '<div class="empty">No notes yet. Your private scratch pad is above.</div>'; return; }
    box.innerHTML = d.notes.map((n) => `
      <div class="note" data-id="${esc(n.id)}">
        <h4>${esc(n.title)}</h4><p>${esc(n.body)}</p>
        <div class="row-btns">
          <button class="btn small ghost" data-nact="edit">Edit</button>
          <button class="btn small danger" data-nact="del">Delete</button>
        </div>
      </div>`).join("");
  }
  $("noteAddBtn").onclick = async () => {
    const title = $("noteTitle").value, body = $("noteBody").value;
    try {
      await api("/api/notes", { method: "POST", body: JSON.stringify({ title, body }) });
      $("noteTitle").value = ""; $("noteBody").value = "";
      loadNotes();
    } catch (e) { alert(e.message); }
  };
  $("notesList").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-nact]");
    if (!btn) return;
    const id = ev.target.closest(".note").dataset.id;
    if (btn.dataset.nact === "del") {
      if (!confirm("Delete this note?")) return;
      await api("/api/notes/" + id, { method: "DELETE" }).catch((e) => alert(e.message));
      loadNotes();
    } else {
      const card = ev.target.closest(".note");
      const curT = card.querySelector("h4").textContent;
      const curB = card.querySelector("p").textContent;
      const t = prompt("Title", curT);
      if (t === null) return;
      const b = prompt("Body", curB);
      if (b === null) return;
      await api("/api/notes/" + id, { method: "PATCH", body: JSON.stringify({ title: t, body: b }) }).catch((e) => alert(e.message));
      loadNotes();
    }
  });

  // ---------- handles / my profile ----------
  function renderHandlesForm() {
    const grid = $("handlesGrid");
    grid.innerHTML = "";
    for (const [key, label] of Object.entries(PLATFORMS)) {
      const div = document.createElement("div");
      div.className = "field";
      div.innerHTML = `<label>${esc(label)} handle</label><input class="input" data-handle="${key}" placeholder="@you" value="${esc(myHandles[key] || "")}" maxlength="60">`;
      grid.appendChild(div);
    }
  }
  $("handlesSave").onclick = async () => {
    const errEl = $("handlesErr");
    errEl.style.display = "none";
    const handles = {};
    document.querySelectorAll("[data-handle]").forEach((i) => { handles[i.dataset.handle] = i.value.trim(); });
    try {
      const d = await api("/api/handles", { method: "PUT", body: JSON.stringify({ handles }) });
      myHandles = d.handles;
      renderMyProfileLinks();
      loadAddedMe();
      const btn = $("handlesSave");
      btn.textContent = "Saved ✓";
      setTimeout(() => (btn.textContent = "Save handles"), 1500);
    } catch (e) { errEl.textContent = e.message; errEl.style.display = "block"; }
  };
  function renderMyProfileLinks() {
    const box = $("myProfileLinks");
    const keys = Object.keys(PLATFORMS).filter((k) => myHandles[k]);
    if (!keys.length) { box.innerHTML = '<p style="color:var(--faint);font-size:14px">Claim at least one handle above to get your public profile links.</p>'; return; }
    box.innerHTML = keys.map((k) =>
      `<a class="plink" href="/profile/${k}/${encodeURIComponent(myHandles[k])}">${esc(PLATFORMS[k])} — @${esc(myHandles[k])}<span class="tag">/profile/${k}/${esc(myHandles[k])} →</span></a>`
    ).join("");
  }

  async function refreshAll() {
    await Promise.all([loadTop7(), loadEngagers(), loadAddedMe()]);
  }

  boot();
})();
