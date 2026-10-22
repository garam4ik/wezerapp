/* GitHub Pages is static: this client-side password is NOT secure authentication.
   Change it to a unique, non-sensitive passphrase before use. */
const ADMIN_PASSWORD = "CHANGE_THIS_LOCAL_GATE_PASSWORD";
const DEFAULT_NOTES = {
  version: "2026-10-22-1",
  title: "Що нового?",
  items: [
    "Додано та повернуто на карту Донецьку область.",
    "Крим, Луганська, Запорізька й Херсонська області виділені світло-червоним.",
    "Збережено звичайний колір і товщину меж районів."
  ]
};
const $ = id => document.getElementById(id);
let original = DEFAULT_NOTES;
async function loadNotes() {
  try {
    const res = await fetch("release-notes.json", { cache: "no-store" });
    if (res.ok) original = await res.json();
  } catch (_) {}
  if (!original || !Array.isArray(original.items)) original = DEFAULT_NOTES;
  fillForm(original);
}
function fillForm(notes) {
  $("version").value = notes.version || "";
  $("title").value = notes.title || "Що нового?";
  $("items").value = (notes.items || []).join("\n");
}
$("login-form").addEventListener("submit", event => {
  event.preventDefault();
  if ($("password").value !== ADMIN_PASSWORD) {
    $("login-error").hidden = false;
    return;
  }
  $("login-error").hidden = true;
  $("login-card").hidden = true;
  $("editor-card").hidden = false;
  sessionStorage.setItem("wezera-admin-unlocked", "1");
  loadNotes();
});
$("logout").addEventListener("click", () => {
  sessionStorage.removeItem("wezera-admin-unlocked");
  $("editor-card").hidden = true;
  $("login-card").hidden = false;
  $("password").value = "";
});
$("notes-form").addEventListener("submit", event => {
  event.preventDefault();
  const notes = {
    version: $("version").value.trim(),
    title: $("title").value.trim(),
    items: $("items").value.split("\n").map(s => s.trim()).filter(Boolean)
  };
  if (!notes.version || !notes.title || !notes.items.length) {
    $("status").hidden = false;
    $("status").textContent = "Заповни версію, заголовок і хоча б один пункт.";
    return;
  }
  const blob = new Blob([JSON.stringify(notes, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "release-notes.json";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  $("status").hidden = false;
  $("status").textContent = "Файл створено. Тепер заміни release-notes.json у корені GitHub-репозиторію.";
});
$("reset").addEventListener("click", () => fillForm(original));
if (sessionStorage.getItem("wezera-admin-unlocked") === "1") {
  $("login-card").hidden = true;
  $("editor-card").hidden = false;
  loadNotes();
}
