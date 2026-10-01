// =====================================================================
// ParkEasy — Parking Slot Reservation System
// JavaScript + Supabase rewrite of the original C++ console project.
// Keeps the same data-structure/algorithm ideas from the DSA project:
//   - Array               -> in-memory `slots` array, backed by a Supabase table
//   - Queue                -> `waiting_list` table, read/processed in join order
//   - Searching Algorithm  -> linearSearchByLabel() below
//   - Sorting Algorithm    -> bubbleSort() below
//   - File Handling        -> replaced by the Supabase database
//
// Slots are organized into sections (A, B, VIP, ...) each holding a run
// of numbered or named spots, so a slot's full label looks like "A1",
// "B5", or something custom the admin typed, like "VIP1".
// =====================================================================

const ADMIN_PASSCODE = "admin123"; // change before real deployment

let slots = [];        // cached copy of the parking_slots table
let waitingList = [];  // cached copy of the waiting_list table (queue order)
let adminUnlocked = false;

// ---------------------------------------------------------------
// View / navigation handling
// ---------------------------------------------------------------
const views = ["home", "slots", "my-reservation", "waiting-list", "admin"];

function showView(name) {
  views.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle("hidden", v !== name);
  });
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  document.getElementById("navbar").classList.remove("open");

  if (name === "slots") renderSlotGrid();
  if (name === "waiting-list") renderQueueList();
  if (name === "admin") { renderAdminTable(slots); renderAdminQueueList(); }
  if (name === "home") renderHomeStats();
}

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.goto));
});
document.getElementById("navToggle").addEventListener("click", () => {
  document.getElementById("navbar").classList.toggle("open");
});

// ---------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------
let toastTimer;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

// A slot's label is just its section + its number/name, e.g. "A3" or "VIP1".
function labelOf(slot) {
  return `${slot.section}${slot.slot_number}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------
async function loadSlots() {
  const { data, error } = await supabaseClient
    .from("parking_slots")
    .select("*")
    .order("section", { ascending: true })
    .order("slot_number", { ascending: true });

  if (error) {
    console.error(error);
    toast("Could not load parking slots.");
    return;
  }
  slots = data || [];
  renderSlotGrid();
  renderHomeStats();
  renderSectionChips();
  updateNewSlotPreview();
  if (adminUnlocked) renderAdminTable(slots);
}

async function loadWaitingList() {
  const { data, error } = await supabaseClient
    .from("waiting_list")
    .select("*")
    .order("joined_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }
  waitingList = data || [];
  renderQueueList();
  renderHomeStats();
  if (adminUnlocked) renderAdminQueueList();
}

// ---------------------------------------------------------------
// Rendering — public views
// ---------------------------------------------------------------
function renderHomeStats() {
  document.getElementById("statAvailable").textContent =
    slots.filter(s => s.status === "Available").length;
  document.getElementById("statReserved").textContent =
    slots.filter(s => s.status === "Reserved").length;
  document.getElementById("statOccupied").textContent =
    slots.filter(s => s.status === "Occupied").length;
  document.getElementById("statWaiting").textContent = waitingList.length;
}

function renderSlotGrid(list = slots) {
  const grid = document.getElementById("slotGrid");
  if (!list.length) {
    grid.innerHTML = `<p class="empty-state">No parking slots have been set up yet.</p>`;
    return;
  }
  grid.innerHTML = list.map(slot => `
    <div class="slot-card status-${slot.status.toLowerCase()}" data-id="${slot.id}">
      <span class="slot-number">${escapeHtml(labelOf(slot))}</span>
      <span class="slot-status">${slot.status}</span>
    </div>
  `).join("");

  grid.querySelectorAll(".slot-card.status-available").forEach(card => {
    card.addEventListener("click", () => openReserveDialog(Number(card.dataset.id)));
  });
}

function renderQueueList() {
  const el = document.getElementById("queueList");
  if (!waitingList.length) {
    el.innerHTML = `<li class="empty-state">The waiting list is empty right now.</li>`;
    return;
  }
  el.innerHTML = waitingList.map((entry, i) => `
    <li>
      <span class="queue-position">${i + 1}</span>
      <span>${escapeHtml(entry.user_name)}</span>
    </li>
  `).join("");
}

// ---------------------------------------------------------------
// Add-slot helpers: section quick-picks + auto-suggested number
// ---------------------------------------------------------------
function knownSections() {
  return [...new Set(slots.map(s => s.section))].sort();
}

// Finds the next free NUMBER within a section, filling gaps first
// (e.g. if A1, A2, A4 exist it suggests A3 before jumping to A5).
// Only looks at purely numeric slot numbers already in that section;
// if the section has no numeric slots yet (or doesn't exist), it
// suggests "1".
function nextAvailableNumberInSection(section) {
  const numbers = slots
    .filter(s => s.section === section && /^\d+$/.test(s.slot_number))
    .map(s => parseInt(s.slot_number, 10))
    .sort((a, b) => a - b);
  let candidate = 1;
  for (const n of numbers) {
    if (n === candidate) candidate++;
    else if (n > candidate) break;
  }
  return String(candidate);
}

function renderSectionChips() {
  const el = document.getElementById("sectionChips");
  const sections = knownSections();
  if (!sections.length) { el.innerHTML = ""; return; }
  el.innerHTML = sections.map(s => `<button type="button" class="chip" data-section="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("");
  el.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const section = chip.dataset.section;
      document.getElementById("newSlotSection").value = section;
      document.getElementById("newSlotNumber").value = nextAvailableNumberInSection(section);
      updateNewSlotPreview();
    });
  });
}

function updateNewSlotPreview() {
  const section = document.getElementById("newSlotSection").value.trim();
  const number = document.getElementById("newSlotNumber").value.trim();
  const preview = document.getElementById("newSlotPreview");
  preview.textContent = (section || number) ? `${section}${number}` : "—";
}

document.getElementById("newSlotSection").addEventListener("input", () => {
  updateNewSlotPreview();
});
document.getElementById("newSlotNumber").addEventListener("input", updateNewSlotPreview);

// Auto-suggest a number the moment the admin picks/types a section,
// but only if they haven't already typed a number themselves.
document.getElementById("newSlotSection").addEventListener("blur", () => {
  const section = document.getElementById("newSlotSection").value.trim();
  const numberField = document.getElementById("newSlotNumber");
  if (section && !numberField.value.trim()) {
    numberField.value = nextAvailableNumberInSection(section);
    updateNewSlotPreview();
  }
});

// ---------------------------------------------------------------
// Rendering — admin views
// ---------------------------------------------------------------
function renderAdminTable(list) {
  const body = document.getElementById("adminTableBody");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No slots found.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(slot => `
    <tr>
      <td>${escapeHtml(labelOf(slot))}</td>
      <td><span class="status-pill badge-${slot.status.toLowerCase()}">${slot.status}</span></td>
      <td>${slot.reserved_by ? escapeHtml(slot.reserved_by) : "—"}</td>
      <td>
        <button class="btn btn-small btn-ghost" onclick="cycleStatus(${slot.id})">Change Status</button>
        <button class="btn btn-small btn-ghost" onclick="editReservedName(${slot.id})">Edit Name</button>
        <button class="btn btn-small btn-danger" onclick="deleteSlot(${slot.id})">Delete</button>
      </td>
    </tr>
  `).join("");
}

function renderAdminQueueList() {
  const el = document.getElementById("adminQueueList");
  if (!waitingList.length) {
    el.innerHTML = `<li class="empty-state">The waiting list is empty right now.</li>`;
    return;
  }
  el.innerHTML = waitingList.map((entry, i) => `
    <li>
      <span class="queue-position">${i + 1}</span>
      <span style="flex:1">${escapeHtml(entry.user_name)}</span>
      <button class="btn btn-small btn-secondary" onclick="adminSeatFromQueue(${entry.id})">Seat Now</button>
      <button class="btn btn-small btn-danger" onclick="adminRemoveFromQueue(${entry.id})">Remove</button>
    </li>
  `).join("");
}

// =====================================================================
// SEARCHING ALGORITHM — linear search, mirroring Algorithm 5 in the
// original documentation (scan the slot array element by element).
// =====================================================================
function linearSearchByLabel(list, label) {
  const target = label.trim().toUpperCase();
  for (let i = 0; i < list.length; i++) {
    if (labelOf(list[i]).toUpperCase() === target) return list[i];
  }
  return null;
}

// =====================================================================
// SORTING ALGORITHM — bubble sort, mirroring Algorithm 6 in the
// original documentation (repeatedly swap adjacent out-of-order pairs).
// =====================================================================
function bubbleSort(list, keyFn) {
  const arr = [...list];
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      const a = keyFn(arr[j]);
      const b = keyFn(arr[j + 1]);
      const outOfOrder = typeof a === "string" ? a.localeCompare(b) > 0 : a > b;
      if (outOfOrder) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}

// ---------------------------------------------------------------
// Reservation flow (user-facing)
// ---------------------------------------------------------------
function openReserveDialog(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot || slot.status !== "Available") return;
  const name = prompt(`Reserve slot ${labelOf(slot)} — enter your name:`);
  if (name && name.trim()) reserveSlot(slotId, name.trim());
}

async function reserveSlot(slotId, userName) {
  // One reservation per user (Algorithm 2 rule)
  const already = slots.find(
    s => s.reserved_by && s.reserved_by.toLowerCase() === userName.toLowerCase() &&
    (s.status === "Reserved" || s.status === "Occupied")
  );
  if (already) {
    toast(`${userName} already holds slot ${labelOf(already)}.`);
    return;
  }

  const { error } = await supabaseClient
    .from("parking_slots")
    .update({ status: "Reserved", reserved_by: userName })
    .eq("id", slotId)
    .eq("status", "Available"); // guards against double-booking races

  if (error) {
    console.error(error);
    toast("That slot was just taken. Try another.");
  } else {
    toast("Slot reserved successfully.");
  }
  await loadSlots();
}

async function cancelReservationByName(userName) {
  const mySlot = slots.find(
    s => s.reserved_by && s.reserved_by.toLowerCase() === userName.toLowerCase()
  );
  if (!mySlot) {
    toast("No active reservation found for that name.");
    return;
  }

  const { error } = await supabaseClient
    .from("parking_slots")
    .update({ status: "Available", reserved_by: null })
    .eq("id", mySlot.id);

  if (error) {
    console.error(error);
    toast("Could not cancel the reservation.");
    return;
  }

  toast(`Slot ${labelOf(mySlot)} is now free.`);
  await loadSlots();
  await processWaitingQueue(mySlot.id);
}

// Processes the front of the queue whenever a slot frees up.
async function processWaitingQueue(freedSlotId) {
  await loadWaitingList();
  if (!waitingList.length) return;

  const nextInLine = waitingList[0]; // front of the queue
  const { error: reserveError } = await supabaseClient
    .from("parking_slots")
    .update({ status: "Reserved", reserved_by: nextInLine.user_name })
    .eq("id", freedSlotId)
    .eq("status", "Available");

  if (reserveError) {
    console.error(reserveError);
    return;
  }

  await supabaseClient.from("waiting_list").delete().eq("id", nextInLine.id);
  toast(`${nextInLine.user_name} was moved from the waiting list into a slot.`);
  await loadSlots();
  await loadWaitingList();
}

async function joinWaitingList(userName) {
  const hasAvailable = slots.some(s => s.status === "Available");
  if (hasAvailable) {
    toast("There are still available slots — reserve one directly instead.");
    return;
  }
  const { error } = await supabaseClient
    .from("waiting_list")
    .insert({ user_name: userName });

  if (error) {
    console.error(error);
    toast("Could not join the waiting list.");
    return;
  }
  toast("You've been added to the waiting list.");
  await loadWaitingList();
}

// ---------------------------------------------------------------
// "My Reservation" view
// ---------------------------------------------------------------
document.getElementById("lookupBtn").addEventListener("click", () => {
  const name = document.getElementById("userNameInput").value.trim();
  if (!name) return toast("Enter your name first.");
  const result = document.getElementById("myReservationResult");
  const mySlot = slots.find(
    s => s.reserved_by && s.reserved_by.toLowerCase() === name.toLowerCase()
  );

  if (!mySlot) {
    result.innerHTML = `<p class="empty-state">No active reservation for "${escapeHtml(name)}". Head to Parking Slots to reserve one.</p>`;
    return;
  }

  result.innerHTML = `
    <div class="result-card">
      <div>
        <strong>Slot ${escapeHtml(labelOf(mySlot))}</strong>
        <div class="hint">Reserved by ${escapeHtml(mySlot.reserved_by)}</div>
      </div>
      <span class="badge badge-${mySlot.status.toLowerCase()}">${mySlot.status}</span>
      <button class="btn btn-danger" id="cancelBtn">Cancel Reservation</button>
    </div>
  `;
  document.getElementById("cancelBtn").addEventListener("click", () => cancelReservationByName(name));
});

// ---------------------------------------------------------------
// Waiting list view (user-facing "join" form)
// ---------------------------------------------------------------
document.getElementById("joinWaitingBtn").addEventListener("click", () => {
  const name = document.getElementById("waitingNameInput").value.trim();
  if (!name) return toast("Enter your name first.");
  joinWaitingList(name);
  document.getElementById("waitingNameInput").value = "";
});

// ---------------------------------------------------------------
// Admin: unlock
// ---------------------------------------------------------------
document.getElementById("adminUnlockBtn").addEventListener("click", () => {
  const pass = document.getElementById("adminPassInput").value;
  if (pass === ADMIN_PASSCODE) {
    adminUnlocked = true;
    document.getElementById("adminGate").classList.add("hidden");
    document.getElementById("adminBody").classList.remove("hidden");
    renderAdminTable(slots);
    renderAdminQueueList();
    renderSectionChips();
    updateNewSlotPreview();
  } else {
    toast("Incorrect passcode.");
  }
});

// ---------------------------------------------------------------
// Admin: add slot — realistic, admin-named slots.
// Pick an existing section chip (auto-suggests the next open number)
// or type any section + number/name combination, including non-
// numeric names like "Visitor" or "VIP1".
// ---------------------------------------------------------------
document.getElementById("addSlotBtn").addEventListener("click", async () => {
  const section = document.getElementById("newSlotSection").value.trim();
  const number = document.getElementById("newSlotNumber").value.trim();

  if (!section || !number) {
    toast("Enter both a section and a number/name.");
    return;
  }
  if (linearSearchByLabel(slots, `${section}${number}`)) {
    toast(`Slot ${section}${number} already exists.`);
    return;
  }

  const { error } = await supabaseClient
    .from("parking_slots")
    .insert({ section, slot_number: number, status: "Available" });

  if (error) {
    console.error(error);
    toast("Could not add slot.");
    return;
  }
  toast(`Slot ${section}${number} added.`);
  document.getElementById("newSlotNumber").value = "";
  await loadSlots();
});

// ---------------------------------------------------------------
// Admin: change status (cycles Available -> Reserved -> Occupied -> Available)
// ---------------------------------------------------------------
async function cycleStatus(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;
  const order = ["Available", "Reserved", "Occupied"];
  const next = order[(order.indexOf(slot.status) + 1) % order.length];
  const updates = { status: next };
  if (next === "Available") updates.reserved_by = null;
  if (next !== "Available" && !slot.reserved_by) {
    const name = prompt(`Name to attach to slot ${labelOf(slot)}:`, "Walk-in");
    updates.reserved_by = name || "Walk-in";
  }

  const { error } = await supabaseClient.from("parking_slots").update(updates).eq("id", slotId);
  if (error) { console.error(error); toast("Could not update slot."); return; }
  await loadSlots();
}

// ---------------------------------------------------------------
// Admin: moderate a reservation — rename who a slot is attached to,
// without cycling its status (e.g. fix a typo, or hand it to someone else).
// ---------------------------------------------------------------
async function editReservedName(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;
  const name = prompt(`New name for slot ${labelOf(slot)}:`, slot.reserved_by || "");
  if (name === null) return; // cancelled
  const { error } = await supabaseClient
    .from("parking_slots")
    .update({ reserved_by: name.trim() || null })
    .eq("id", slotId);
  if (error) { console.error(error); toast("Could not update the name."); return; }
  toast(`Slot ${labelOf(slot)} updated.`);
  await loadSlots();
}

// ---------------------------------------------------------------
// Admin: delete slot
// ---------------------------------------------------------------
async function deleteSlot(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;
  if (!confirm(`Delete slot ${labelOf(slot)}? This cannot be undone.`)) return;

  const { error } = await supabaseClient.from("parking_slots").delete().eq("id", slotId);
  if (error) { console.error(error); toast("Could not delete slot."); return; }
  toast(`Slot ${labelOf(slot)} deleted.`);
  await loadSlots();
}

// ---------------------------------------------------------------
// Admin: moderate the waiting list directly
// ---------------------------------------------------------------
async function adminRemoveFromQueue(entryId) {
  const entry = waitingList.find(e => e.id === entryId);
  if (!entry) return;
  if (!confirm(`Remove ${entry.user_name} from the waiting list?`)) return;
  const { error } = await supabaseClient.from("waiting_list").delete().eq("id", entryId);
  if (error) { console.error(error); toast("Could not remove from waiting list."); return; }
  toast(`${entry.user_name} removed from the waiting list.`);
  await loadWaitingList();
}

async function adminSeatFromQueue(entryId) {
  const entry = waitingList.find(e => e.id === entryId);
  if (!entry) return;
  const openSlot = slots.find(s => s.status === "Available");
  if (!openSlot) {
    toast("No available slot to seat them in right now.");
    return;
  }
  const { error: reserveError } = await supabaseClient
    .from("parking_slots")
    .update({ status: "Reserved", reserved_by: entry.user_name })
    .eq("id", openSlot.id)
    .eq("status", "Available");
  if (reserveError) { console.error(reserveError); toast("Could not seat that person."); return; }

  await supabaseClient.from("waiting_list").delete().eq("id", entryId);
  toast(`${entry.user_name} seated in slot ${labelOf(openSlot)}.`);
  await loadSlots();
  await loadWaitingList();
}

// ---------------------------------------------------------------
// Admin: search & sort
// ---------------------------------------------------------------
document.getElementById("searchSlotBtn").addEventListener("click", () => {
  const label = document.getElementById("searchSlotInput").value.trim();
  if (!label) return toast("Enter a slot to search, e.g. A3.");
  const found = linearSearchByLabel(slots, label);
  renderAdminTable(found ? [found] : []);
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
  document.getElementById("searchSlotInput").value = "";
  renderAdminTable(slots);
});

document.getElementById("sortNumberBtn").addEventListener("click", () => {
  renderAdminTable(bubbleSort(slots, labelOf));
});

document.getElementById("sortStatusBtn").addEventListener("click", () => {
  renderAdminTable(bubbleSort(slots, s => s.status));
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
(async function init() {
  await loadSlots();
  await loadWaitingList();
  showView("home");
})();
