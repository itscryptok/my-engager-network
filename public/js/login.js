(function () {
  const params = new URLSearchParams(location.search);
  const isSignup = params.get("mode") === "signup";
  const title = document.getElementById("formTitle");
  const sub = document.getElementById("formSub");
  const nameField = document.getElementById("nameField");
  const submitBtn = document.getElementById("submitBtn");
  const switchLine = document.getElementById("switchLine");
  const err = document.getElementById("formErr");

  function showErr(msg) { err.textContent = msg; err.style.display = "block"; }
  function hideErr() { err.style.display = "none"; }

  if (isSignup) {
    title.textContent = "Join MEN — it's free";
    sub.textContent = "Create your account and start building your engager network.";
    nameField.style.display = "block";
    submitBtn.textContent = "Create account";
    switchLine.innerHTML = 'Have an account? <a href="/login">Log in</a>';
  }

  // already logged in? go to app
  fetch("/api/auth/me").then(r => r.json()).then(d => {
    if (d.user) location.href = "/app";
  }).catch(() => {});

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideErr();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const displayName = document.getElementById("displayName").value.trim();
    submitBtn.disabled = true;
    try {
      const r = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const d = await r.json();
      if (!r.ok) { showErr(d.error || "Something went wrong."); return; }
      location.href = "/app";
    } catch {
      showErr("Network error. Try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
