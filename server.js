// My Engager Network (MEN) — Express + Prisma + PostgreSQL
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const SESSION_COOKIE = "men_session";
const SESSION_DAYS = 30;

const PLATFORMS = {
  tiktok: { label: "TikTok", profileUrl: (h) => `https://www.tiktok.com/@${h}` },
  instagram: { label: "Instagram", profileUrl: (h) => `https://www.instagram.com/${h}` },
  youtube: { label: "YouTube", profileUrl: (h) => `https://www.youtube.com/@${h}` },
  facebook: { label: "Facebook", profileUrl: (h) => `https://www.facebook.com/${h}` },
};
const PLATFORM_KEYS = Object.keys(PLATFORMS);

function cleanHandle(raw) {
  if (typeof raw !== "string") return null;
  let h = raw.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(h)) return null;
  return h;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  );
}
function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}

async function authMiddleware(req, res, next) {
  req.user = null;
  try {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      const sess = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (sess && sess.expiresAt > new Date()) {
        req.user = sess.user;
      } else if (sess) {
        await prisma.session.delete({ where: { token } }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("auth middleware error:", e.message);
  }
  next();
}
app.use(authMiddleware);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Login required." });
  next();
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    createdAt: u.createdAt,
  };
}

async function getHandlesMap(userId) {
  const rows = await prisma.claimedHandle.findMany({ where: { userId } });
  const map = {};
  for (const r of rows) map[r.platform] = r.handle;
  return map;
}

// ---------- health ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- auth ----------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const displayName = String(req.body.displayName || "").trim().slice(0, 60) || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "That email is already registered. Try logging in." });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash, displayName } });
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
    });
    setSessionCookie(res, token);
    res.json({ user: publicUser(user), handles: {} });
  } catch (e) {
    console.error("signup error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(400).json({ error: "Email or password is wrong." });
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
    });
    setSessionCookie(res, token);
    res.json({ user: publicUser(user), handles: await getHandlesMap(user.id) });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await prisma.session.delete({ where: { token } }).catch(() => {});
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), handles: await getHandlesMap(req.user.id) });
});

// ---------- claimed handles ----------
app.put("/api/handles", requireAuth, async (req, res) => {
  try {
    const input = req.body.handles || {};
    for (const p of PLATFORM_KEYS) {
      const raw = input[p];
      if (raw === undefined) continue;
      const h = raw === "" || raw === null ? null : cleanHandle(raw);
      if (raw !== "" && raw !== null && !h)
        return res.status(400).json({ error: `That ${PLATFORMS[p].label} handle doesn't look valid.` });
      const existing = await prisma.claimedHandle.findUnique({
        where: { userId_platform: { userId: req.user.id, platform: p } },
      });
      if (h === null) {
        if (existing) await prisma.claimedHandle.delete({ where: { id: existing.id } });
      } else if (existing) {
        if (existing.handle !== h)
          await prisma.claimedHandle.update({ where: { id: existing.id }, data: { handle: h } });
      } else {
        await prisma.claimedHandle.create({ data: { userId: req.user.id, platform: p, handle: h } });
      }
    }
    res.json({ handles: await getHandlesMap(req.user.id) });
  } catch (e) {
    console.error("handles error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// Is this username a registered MEN member's claimed handle on this platform?
async function registeredProfile(platform, username) {
  return prisma.claimedHandle.findFirst({
    where: { platform, handle: { equals: username, mode: "insensitive" } },
    include: { user: true },
  });
}

function engagerLink(platform, username, reg) {
  if (reg) return { kind: "internal", url: `/profile/${platform}/${encodeURIComponent(reg.handle)}` };
  return { kind: "external", url: PLATFORMS[platform].profileUrl(username) };
}

// ---------- engagers ----------
app.get("/api/engagers", requireAuth, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const sort = String(req.query.sort || "stars");
    const q = String(req.query.q || "").trim().toLowerCase();
    const orderBy =
      sort === "name" ? { username: "asc" } :
      sort === "recent" ? { createdAt: "desc" } :
      [{ stars: "desc" }, { createdAt: "desc" }];
    let rows = await prisma.engager.findMany({
      where: { userId: req.user.id, platform },
      orderBy,
    });
    if (q) rows = rows.filter((r) => r.username.toLowerCase().includes(q) || (r.notes || "").toLowerCase().includes(q));
    const out = [];
    for (const r of rows) {
      const reg = await registeredProfile(platform, r.username);
      out.push({
        id: r.id, username: r.username, notes: r.notes, stars: r.stars,
        createdAt: r.createdAt, link: engagerLink(platform, r.username, reg),
      });
    }
    res.json({ engagers: out });
  } catch (e) {
    console.error("engagers list error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/engagers", requireAuth, async (req, res) => {
  try {
    const platform = String(req.body.platform || "");
    const username = cleanHandle(req.body.username || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    if (!username) return res.status(400).json({ error: "Enter a valid username." });
    const dupe = await prisma.engager.findUnique({
      where: { userId_platform_username: { userId: req.user.id, platform, username } },
    }).catch(async () => {
      // fallback for case variants: check case-insensitively
      return prisma.engager.findFirst({
        where: { userId: req.user.id, platform, username: { equals: username, mode: "insensitive" } },
      });
    });
    if (dupe) return res.status(400).json({ error: "That engager is already on your list." });
    const r = await prisma.engager.create({
      data: { userId: req.user.id, platform, username },
    });
    const reg = await registeredProfile(platform, username);
    res.json({
      engager: {
        id: r.id, username: r.username, notes: r.notes, stars: r.stars,
        createdAt: r.createdAt, link: engagerLink(platform, r.username, reg),
      },
    });
  } catch (e) {
    if (e.code === "P2002")
      return res.status(400).json({ error: "That engager is already on your list." });
    console.error("engager add error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.patch("/api/engagers/:id", requireAuth, async (req, res) => {
  try {
    const r = await prisma.engager.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!r) return res.status(404).json({ error: "Engager not found." });
    const notes = String(req.body.notes || "").slice(0, 2000);
    const updated = await prisma.engager.update({ where: { id: r.id }, data: { notes } });
    res.json({ ok: true, notes: updated.notes });
  } catch (e) {
    console.error("engager notes error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/engagers/:id/star", requireAuth, async (req, res) => {
  try {
    const r = await prisma.engager.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!r) return res.status(404).json({ error: "Engager not found." });
    const updated = await prisma.engager.update({
      where: { id: r.id },
      data: { stars: { increment: 1 } },
    });
    res.json({ ok: true, stars: updated.stars });
  } catch (e) {
    console.error("star error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.delete("/api/engagers/:id", requireAuth, async (req, res) => {
  try {
    const r = await prisma.engager.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!r) return res.status(404).json({ error: "Engager not found." });
    await prisma.engager.delete({ where: { id: r.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("engager delete error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- top 7 ----------
app.get("/api/top7", requireAuth, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const rows = await prisma.engager.findMany({
      where: { userId: req.user.id, platform },
      orderBy: [{ stars: "desc" }, { createdAt: "desc" }],
      take: 7,
    });
    const out = [];
    let rank = 0;
    for (const r of rows) {
      rank += 1;
      const reg = await registeredProfile(platform, r.username);
      out.push({
        rank, id: r.id, username: r.username, stars: r.stars,
        link: engagerLink(platform, r.username, reg),
      });
    }
    res.json({ top: out });
  } catch (e) {
    console.error("top7 error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- who added me ----------
app.get("/api/added-me", requireAuth, async (req, res) => {
  try {
    const platform = String(req.query.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const handles = await getHandlesMap(req.user.id);
    const myHandle = handles[platform];
    if (!myHandle) return res.json({ claimed: false, entries: [] });
    const rows = await prisma.engager.findMany({
      where: {
        platform,
        username: { equals: myHandle, mode: "insensitive" },
        NOT: { userId: req.user.id },
      },
      include: { user: { include: { handles: true } } },
      orderBy: { createdAt: "desc" },
    });
    const seen = new Map();
    for (const r of rows) {
      if (seen.has(r.userId)) continue;
      const adderHandle = (r.user.handles.find((h) => h.platform === platform) || {}).handle || null;
      seen.set(r.userId, {
        name: r.user.displayName || "A MEN member",
        handle: adderHandle,
        profileUrl: adderHandle ? `/profile/${platform}/${encodeURIComponent(adderHandle)}` : null,
        at: r.createdAt,
      });
    }
    res.json({ claimed: true, myHandle, entries: [...seen.values()] });
  } catch (e) {
    console.error("added-me error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- public in-app profile ----------
app.get("/api/profile/:platform/:handle", async (req, res) => {
  try {
    const platform = String(req.params.platform || "");
    if (!PLATFORMS[platform]) return res.status(400).json({ error: "Unknown platform." });
    const handle = cleanHandle(req.params.handle || "");
    if (!handle) return res.status(404).json({ error: "Profile not found." });
    const claimed = await prisma.claimedHandle.findFirst({
      where: { platform, handle: { equals: handle, mode: "insensitive" } },
      include: { user: { include: { handles: true } } },
    });
    if (!claimed) return res.status(404).json({ error: "That handle isn't registered on MEN yet." });
    const agg = await prisma.engager.aggregate({
      _sum: { stars: true },
      where: {
        platform,
        username: { equals: claimed.handle, mode: "insensitive" },
        NOT: { userId: claimed.userId },
      },
    });
    res.json({
      displayName: claimed.user.displayName || "MEN member",
      handle: claimed.handle,
      platform,
      platformLabel: PLATFORMS[platform].label,
      totalStars: agg._sum.stars || 0,
      memberSince: claimed.user.createdAt,
      links: claimed.user.handles.map((h) => ({
        platform: h.platform,
        label: PLATFORMS[h.platform] ? PLATFORMS[h.platform].label : h.platform,
        handle: h.handle,
        url: PLATFORMS[h.platform] ? PLATFORMS[h.platform].profileUrl(h.handle) : "#",
      })),
    });
  } catch (e) {
    console.error("profile error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- private notepad ----------
app.get("/api/notes", requireAuth, async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ notes });
});

app.post("/api/notes", requireAuth, async (req, res) => {
  try {
    const title = String(req.body.title || "").trim().slice(0, 120) || "Untitled note";
    const body = String(req.body.body || "").slice(0, 10000);
    const n = await prisma.note.create({ data: { userId: req.user.id, title, body } });
    res.json({ note: n });
  } catch (e) {
    console.error("note create error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.patch("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const n = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return res.status(404).json({ error: "Note not found." });
    const data = {};
    if (req.body.title !== undefined) data.title = String(req.body.title).trim().slice(0, 120) || "Untitled note";
    if (req.body.body !== undefined) data.body = String(req.body.body).slice(0, 10000);
    const updated = await prisma.note.update({ where: { id: n.id }, data });
    res.json({ note: updated });
  } catch (e) {
    console.error("note update error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const n = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return res.status(404).json({ error: "Note not found." });
    await prisma.note.delete({ where: { id: n.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("note delete error:", e.message);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

// ---------- pages ----------
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/app", (req, res) => res.sendFile(path.join(__dirname, "public", "app.html")));
app.get("/profile/:platform/:handle", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "profile.html"))
);
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`MEN listening on ${PORT}`));
