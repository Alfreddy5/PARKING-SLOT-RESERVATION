// =====================================================================
// ParkEasy — Parking Slot Reservation System
// JavaScript + Supabase rewrite of the original C++ console project.
// Keeps the same data-structure/algorithm ideas from the DSA project:
//   - Array            -> in-memory `slots` array, backed by a Supabase table
//   - Queue             -> `waiting_list` table, read/processed in join order
//   - Searching Algorithm -> linearSearchBySlotNumber() below
//   - Sorting Algorithm   -> bubbleSort() below
//   - File Handling     -> replaced by the Supabase database
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
  if (name === "admin") renderAdminTable(slots);
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

// ---------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------
async function loadSlots() {
  const { data, error } = await supabaseClient
    .from("parking_slots")
    .select("*")
    .order("slot_number", { ascending: true });

  if (error) {
    console.error(error);
    toast("Could not load parking slots.");
    return;
  }
  slots = data || [];
  renderSlotGrid();
  renderHomeStats();
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
}

// ---------------------------------------------------------------
// Rendering
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
      <span class="slot-number">#${slot.slot_number}</span>
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

function renderAdminTable(list) {
  const body = document.getElementById("adminTableBody");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty-state">No slots found.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(slot => `
    <tr>
      <td>#${slot.slot_number}</td>
      <td><span class="status-pill badge-${slot.status.toLowerCase()}">${slot.status}</span></td>
      <td>${slot.reserved_by ? escapeHtml(slot.reserved_by) : "—"}</td>
      <td>
        <button class="btn btn-small btn-ghost" onclick="cycleStatus(${slot.id})">Change Status</button>
        <button class="btn btn-small btn-danger" onclick="deleteSlot(${slot.id})">Delete</button>
      </td>
    </tr>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// =====================================================================
// SEARCHING ALGORITHM — linear search, mirroring Algorithm 5 in the
// original C++ documentation (scan the slot array element by element).
// =====================================================================
function linearSearchBySlotNumber(list, slotNumber) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].slot_number === slotNumber) return list[i];
  }
  return null;
}

// =====================================================================
// SORTING ALGORITHM — bubble sort, mirroring Algorithm 6 in the
// original C++ documentation (repeatedly swap adjacent out-of-order pairs).
// =====================================================================
function bubbleSort(list, key) {
  const arr = [...list];
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      const a = arr[j][key];
      const b = arr[j + 1][key];
      const outOfOrder = typeof a === "string" ? a.localeCompare(b) > 0 : a > b;
      if (outOfOrder) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
  return arr;
}

// ---------------------------------------------------------------
// Reservation flow
// ---------------------------------------------------------------
function openReserveDialog(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot || slot.status !== "Available") return;
  const name = prompt(`Reserve slot #${slot.slot_number} — enter your name:`);
  if (name && name.trim()) reserveSlot(slotId, name.trim());
}

async function reserveSlot(slotId, userName) {
  // One reservation per user (Algorithm 2 rule)
  const already = slots.find(
    s => s.reserved_by && s.reserved_by.toLowerCase() === userName.toLowerCase() &&
    (s.status === "Reserved" || s.status === "Occupied")
  );
  if (already) {
    toast(`${userName} already holds slot #${already.slot_number}.`);
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

  toast(`Slot #${mySlot.slot_number} is now free.`);
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
  toast(`${nextInLine.user_name} was moved from the waiting list into slot.`);
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
        <strong>Slot #${mySlot.slot_number}</strong>
        <div class="hint">Reserved by ${escapeHtml(mySlot.reserved_by)}</div>
      </div>
      <span class="badge badge-${mySlot.status.toLowerCase()}">${mySlot.status}</span>
      <button class="btn btn-danger" id="cancelBtn">Cancel Reservation</button>
    </div>
  `;
  document.getElementById("cancelBtn").addEventListener("click", () => cancelReservationByName(name));
});

// ---------------------------------------------------------------
// Waiting list view
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
  } else {
    toast("Incorrect passcode.");
  }
});

// ---------------------------------------------------------------
// Admin: add slot
// ---------------------------------------------------------------
document.getElementById("addSlotBtn").addEventListener("click", async () => {
  const input = document.getElementById("newSlotNumber");
  const num = Number(input.value);
  if (!num || num <= 0) return toast("Enter a valid slot number.");

  if (linearSearchBySlotNumber(slots, num)) {
    return toast(`Slot #${num} already exists.`);
  }

  const { error } = await supabaseClient
    .from("parking_slots")
    .insert({ slot_number: num, status: "Available" });

  if (error) {
    console.error(error);
    toast("Could not add slot.");
    return;
  }
  input.value = "";
  toast(`Slot #${num} added.`);
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
    const name = prompt(`Name to attach to slot #${slot.slot_number}:`, "Walk-in");
    updates.reserved_by = name || "Walk-in";
  }

  const { error } = await supabaseClient.from("parking_slots").update(updates).eq("id", slotId);
  if (error) { console.error(error); toast("Could not update slot."); return; }
  await loadSlots();
}

// ---------------------------------------------------------------
// Admin: delete slot
// ---------------------------------------------------------------
async function deleteSlot(slotId) {
  const slot = slots.find(s => s.id === slotId);
  if (!slot) return;
  if (!confirm(`Delete slot #${slot.slot_number}? This cannot be undone.`)) return;

  const { error } = await supabaseClient.from("parking_slots").delete().eq("id", slotId);
  if (error) { console.error(error); toast("Could not delete slot."); return; }
  toast(`Slot #${slot.slot_number} deleted.`);
  await loadSlots();
}

// ---------------------------------------------------------------
// Admin: search & sort
// ---------------------------------------------------------------
document.getElementById("searchSlotBtn").addEventListener("click", () => {
  const num = Number(document.getElementById("searchSlotInput").value);
  if (!num) return toast("Enter a slot number to search.");
  const found = linearSearchBySlotNumber(slots, num);
  renderAdminTable(found ? [found] : []);
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
  document.getElementById("searchSlotInput").value = "";
  renderAdminTable(slots);
});

document.getElementById("sortNumberBtn").addEventListener("click", () => {
  renderAdminTable(bubbleSort(slots, "slot_number"));
});

document.getElementById("sortStatusBtn").addEventListener("click", () => {
  renderAdminTable(bubbleSort(slots, "status"));
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
(async function init() {
  await loadSlots();
  await loadWaitingList();
  showView("home");
})();
