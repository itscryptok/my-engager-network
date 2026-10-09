(function () {
  const parts = location.pathname.split("/").filter(Boolean); // profile/:platform/:handle
  const platform = parts[1] || "";
  const handle = decodeURIComponent(parts[2] || "");
  const box = document.getElementById("profileBox");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  fetch("/api/profile/" + encodeURIComponent(platform) + "/" + encodeURIComponent(handle))
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Profile not found.");
      document.title = "@" + d.handle + " — My Engager Network";
      box.innerHTML = `
        <div class="profile-hero">
          <div class="avatar">${esc(d.handle.charAt(0).toUpperCase())}</div>
          <h1>@${esc(d.handle)}</h1>
          <p style="color:var(--muted)">${esc(d.displayName)} · ${esc(d.platformLabel || platform)}</p>
          <div class="stars-big">★ ${d.totalStars} star${d.totalStars === 1 ? "" : "s"} earned</div>
          <p style="color:var(--faint);font-size:13px;margin-top:6px">MEN member since ${new Date(d.memberSince).toLocaleDateString()}</p>
        </div>
        <div class="plinks">
          ${d.links.map((l) => `
            <a class="plink" href="${esc(l.url)}" target="_blank" rel="noopener">
              ${esc(l.label)} — @${esc(l.handle)}<span class="tag">open ↗</span>
            </a>`).join("")}
        </div>`;
      document.getElementById("joinNote").style.display = "block";
    })
    .catch((e) => {
      box.innerHTML = `<div class="profile-hero"><h1>Not on MEN yet</h1>
        <p style="color:var(--muted)">@${esc(handle)} hasn't claimed this handle on My Engager Network.</p>
        <div class="hero-cta"><a class="btn" href="/login?mode=signup">Claim it — join free</a></div></div>`;
    });
})();
