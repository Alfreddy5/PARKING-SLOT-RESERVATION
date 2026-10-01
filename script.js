/* ===== OPTIONAL: paste your Supabase details to use the cloud database. Leave blank to use browser storage. =====
   Tables:  slots(label text primary key, status text, name text)
            waiting(id bigint generated always as identity primary key, name text, created_at timestamptz default now())
   Turn off RLS or add policies allowing anon select/insert/update/delete. */
const SB_URL = "";   // e.g. https://xxxx.supabase.co
const SB_KEY = "";   // anon public key
const ADMIN_PASS = "GROUP5";

const useSB = !!(SB_URL && SB_KEY);
let slots = [], queue = [], isAdmin = false;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const enc = encodeURIComponent;
const same = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

async function sb(path, method = "GET", body, prefer = "return=minimal") {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { method,
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(await r.text());
  return method === "GET" ? r.json() : null;
}
const dbPatch = s => useSB && sb("slots?label=eq." + enc(s.label), "PATCH", { status: s.status, name: s.name });
const dbAddSlot = s => useSB && sb("slots", "POST", { label: s.label, status: s.status, name: s.name });
const dbDelSlot = l => useSB && sb("slots?label=eq." + enc(l), "DELETE");
const dbAddWait = n => useSB && sb("waiting", "POST", { name: n });
const dbDelWait = id => useSB && sb("waiting?id=eq." + id, "DELETE");

async function load() {
  if (useSB) { slots = await sb("slots?select=*"); queue = await sb("waiting?select=*&order=id"); }
  else {
    const d = JSON.parse(localStorage.getItem("parkease") || "null");
    if (d) { slots = d.slots; queue = d.queue; }
    else { slots = ["A1","A2","A3","A4","A5","B1","B2","B3","VIP1","VIP2"].map(l => ({ label: l, status: "Available", name: null })); queue = []; }
  }
}
async function persist(fn) {
  try { await fn(); if (useSB) await load(); else localStorage.setItem("parkease", JSON.stringify({ slots, queue })); }
  catch (e) { toast("Database error: " + e.message.slice(0, 80)); }
  render();
}

/* ===== Data structure algorithms ===== */
const nat = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
function linearSearch(arr, q) {            // linear search: scan first to last
  const out = []; q = q.trim().toLowerCase();
  for (let i = 0; i < arr.length; i++) if (arr[i].label.toLowerCase().includes(q)) out.push(arr[i]);
  return out;
}
function bubbleSort(arr, key) {            // bubble sort: swap neighbours until ordered
  const a = arr.slice();
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < a.length - i - 1; j++) {
      const x = key === "status" ? a[j].status + a[j].label : a[j].label;
      const y = key === "status" ? a[j+1].status + a[j+1].label : a[j+1].label;
      if (nat(x, y) > 0) [a[j], a[j+1]] = [a[j+1], a[j]];
    }
  return a;
}
const hasRes = n => slots.some(s => s.status !== "Available" && same(s.name, n));
const free = () => slots.find(s => s.status === "Available");   // used when seating from the queue
const sorted = () => bubbleSort(slots, "label");

/* ===== UI helpers ===== */
let tt; function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2800); }
function go(p) { document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === p));
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.p === p)); window.scrollTo(0, 0); }
document.querySelectorAll("#nav button").forEach(b => b.onclick = () => go(b.dataset.p));

/* ===== User actions ===== */
function reserve(label) {
  const name = $("#uname").value.trim();
  if (!name) return toast("Please enter your name first.");
  if (hasRes(name)) return toast("You already have a parking slot. One per person.");
  if (queue.some(q => same(q.name, name))) return toast("You're on the waiting list already.");
  const s = slots.find(x => x.label === label);
  if (!s || s.status !== "Available") return toast("Sorry, that slot was just taken.");
  s.status = "Reserved"; s.name = name; localStorage.setItem("pe_me", name);
  persist(() => dbPatch(s)).then(() => toast("✅ Slot " + label + " reserved for " + name));
}
function cancel(label) {
  const s = slots.find(x => x.label === label); if (!s) return;
  persist(async () => {
    s.status = "Available"; s.name = null; await dbPatch(s);
    if (queue.length) { const n = queue.shift(); s.status = "Reserved"; s.name = n.name; await dbPatch(s); await dbDelWait(n.id); toast("Cancelled. " + n.name + " was seated from the waiting list."); }
    else toast("Reservation cancelled.");
  });
}
function joinQueue() {
  const n = $("#wname").value.trim();
  if (!n) return toast("Enter your name.");
  if (free()) return toast("Slots are still available, no need to wait!");
  if (hasRes(n) || queue.some(q => same(q.name, n))) return toast("You already have a slot or a place in line.");
  queue.push({ id: Date.now(), name: n }); localStorage.setItem("pe_me", n);
  persist(() => dbAddWait(n)).then(() => toast("Added to the waiting list."));
}

/* ===== Admin actions ===== */
function login() { if ($("#pass").value.trim().toUpperCase() === ADMIN_PASS) { isAdmin = true; $("#pass").value = ""; render(); } else toast("Wrong passcode."); }
function logout() { isAdmin = false; render(); }
function sections() { return [...new Set(slots.map(s => s.label.match(/^[A-Za-z]+/)?.[0]).filter(Boolean))]; }
function suggest() {
  const sec = $("#secNew").value.trim() || $("#secSel").value;
  const nums = slots.filter(s => s.label.startsWith(sec) && /^\d+$/.test(s.label.slice(sec.length))).map(s => +s.label.slice(sec.length));
  if (sec && !$("#secNew").value.trim()) $("#numIn").value = (nums.length ? Math.max(...nums) : 0) + 1;
  else if ($("#secNew").value.trim()) $("#numIn").value = "1";
}
function addSlot() {
  const sec = ($("#secNew").value.trim() || $("#secSel").value || "").replace(/\s/g, "");
  const num = $("#numIn").value.trim().replace(/\s/g, "");
  if (!sec || !num) return toast("Enter a section and a number/name.");
  const label = sec + num;
  if (linearSearch(slots, label).some(s => s.label.toLowerCase() === label.toLowerCase())) return toast("Slot " + label + " already exists.");
  const s = { label, status: "Available", name: null }; slots.push(s);
  $("#secNew").value = "";
  persist(async () => { await dbAddSlot(s);
    if (queue.length) { const n = queue.shift(); s.status = "Reserved"; s.name = n.name; await dbPatch(s); await dbDelWait(n.id); } }).then(() => toast("Slot " + label + " added."));
}
function delSlot(l) { if (!confirm("Delete slot " + l + "?")) return; slots = slots.filter(s => s.label !== l); persist(() => dbDelSlot(l)).then(() => toast("Slot deleted.")); }
function setStatus(l, st) { const s = slots.find(x => x.label === l); s.status = st; if (st === "Available") s.name = null;
  else if (!s.name) { const n = prompt("Name for this " + st.toLowerCase() + " slot:"); if (!n) { return render(); } s.name = n.trim(); }
  persist(() => dbPatch(s)); }
function editName(l) { const s = slots.find(x => x.label === l); const n = prompt("Reservation name for " + l + ":", s.name || ""); if (!n || !n.trim()) return;
  s.name = n.trim(); persist(() => dbPatch(s)).then(() => toast("Name updated.")); }
function removeQ(id) { queue = queue.filter(q => q.id !== id); persist(() => dbDelWait(id)).then(() => toast("Removed from waiting list.")); }
function seatQ(id) { const s = free(); if (!s) return toast("No available slot right now.");
  const n = queue.find(q => q.id === id); queue = queue.filter(q => q.id !== id); s.status = "Reserved"; s.name = n.name;
  persist(async () => { await dbPatch(s); await dbDelWait(id); }).then(() => toast(n.name + " seated in " + s.label)); }

/* ===== Rendering ===== */
function counts() { const c = { Available: 0, Reserved: 0, Occupied: 0 }; slots.forEach(s => c[s.status]++); return c; }
function statsHTML(t) { const c = counts();
  return (t ? `<div class="stat"><b>${slots.length}</b><span>Total slots</span></div>` : "") + `<div class="stat"><b>${c.Available}</b><span>Available</span></div>
  <div class="stat"><b>${c.Reserved}</b><span>Reserved</span></div>
  <div class="stat"><b>${c.Occupied}</b><span>Occupied</span></div>
  <div class="stat"><b>${queue.length}</b><span>Waiting</span></div>`; }
function renderMine() {
  const n = $("#mname").value.trim(), o = $("#mineOut");
  if (!n) return o.innerHTML = '<div class="empty">Enter your name to find your reservation.</div>';
  const s = slots.find(x => x.status !== "Available" && same(x.name, n));
  const qi = queue.findIndex(q => same(q.name, n));
  if (s) o.innerHTML = `<div class="slot ${s.status}" style="max-width:240px;margin:6px 0 12px"><b>${esc(s.label)}</b><small>${s.status} · ${esc(s.name)}</small></div><button class="btn r" onclick="cancel('${esc(s.label)}')">Cancel reservation</button>`;
  else if (qi >= 0) o.innerHTML = `<div class="empty">⏳ You're <b>#${qi + 1}</b> in the waiting list.</div><button class="btn r" onclick="removeQ(${queue[qi].id})">Leave waiting list</button>`;
  else o.innerHTML = '<div class="empty">No reservation found for that name.</div>';
}
function render() {
  $("#mode").textContent = useSB ? "· cloud" : "· local demo";
  $("#stats").innerHTML = statsHTML();
  $("#grid").innerHTML = sorted().map(s => `<div class="slot ${s.status}" ${s.status === "Available" ? `onclick="reserve('${esc(s.label)}')"` : ""}><b>${esc(s.label)}</b><small>${s.status === "Available" ? "Tap to reserve" : s.status}</small></div>`).join("") || '<div class="empty">No slots yet.</div>';
  const full = !free();
  $("#joinBtn").disabled = !full;
  $("#waitOut").innerHTML = (full ? "" : '<div class="empty">Slots are available right now. <a href="#" onclick="go(\'slots\');return false">Reserve one</a></div>') +
    (queue.length ? queue.map((q, i) => `<div class="q"><div class="num">${i + 1}</div><b>${esc(q.name)}</b></div>`).join("") : '<div class="empty">Nobody is waiting.</div>');
  renderMine();
  $("#login").style.display = isAdmin ? "none" : "block"; $("#panel").style.display = isAdmin ? "block" : "none";
  if (isAdmin) renderAdmin();
}
function renderAdmin() {
  $("#astats").innerHTML = statsHTML(true);
  const cur = $("#secSel").value;
  $("#secSel").innerHTML = sections().map(s => `<option ${s === cur ? "selected" : ""}>${esc(s)}</option>`).join("");
  if (!$("#numIn").value) suggest();
  let list = bubbleSort(slots, $("#sortBy").value);
  const q = $("#q").value; if (q.trim()) { const hit = linearSearch(slots, q); list = list.filter(s => hit.includes(s)); }
  $("#aBody").innerHTML = list.map(s => `<tr><td><b>${esc(s.label)}</b></td><td><span class="pill ${s.status}">${s.status}</span></td><td>${esc(s.name) || "—"}</td>
    <td><select onchange="setStatus('${esc(s.label)}',this.value)">${["Available","Reserved","Occupied"].map(x => `<option ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}</select>
    ${s.name ? `<button class="btn sm l" onclick="editName('${esc(s.label)}')">Edit name</button>` : ""}
    <button class="btn sm r" onclick="delSlot('${esc(s.label)}')">Delete</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Slot not found.</td></tr>';
  $("#aWait").innerHTML = queue.length ? queue.map((x, i) => `<div class="q"><div class="num">${i + 1}</div><b style="flex:1">${esc(x.name)}</b>
    <button class="btn sm g" onclick="seatQ(${x.id})">Seat now</button><button class="btn sm r" onclick="removeQ(${x.id})">Remove</button></div>`).join("") : '<div class="empty">Waiting list is empty.</div>';
}
load().then(() => { render(); const me = localStorage.getItem("pe_me"); if (me) { $("#uname").value = me; $("#mname").value = me; $("#wname").value = me; renderMine(); } })
  .catch(e => toast("Could not load data: " + e.message.slice(0, 80)));
