# ParkEasy — Parking Slot Reservation System

A JavaScript/HTML/CSS rewrite of the original C++ console project, backed by Supabase.

## Files
- `index.html` — pages/views: Home, Parking Slots, My Reservation, Waiting List, Admin
- `style.css` — visual styling
- `app.js` — all app logic (Supabase calls, search/sort algorithms, queue handling)
- `supabase-config.js` — your Supabase project URL + anon key go here
- `schema.sql` — creates the two database tables and seeds starter slots

## Setup (5 minutes)
1. Create a free project at https://supabase.com.
2. Open **SQL Editor** in your project and run everything in `schema.sql`.
3. Open **Project Settings → API** and copy your **Project URL** and **anon public key**.
4. Paste them into `supabase-config.js`:
   ```js
   const SUPABASE_URL = "https://xxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
5. Open `index.html` in a browser (or serve the folder with any static server / Live Server extension).

## Using it
- **Parking Slots** — tap any green (Available) slot (labeled A1–A5, B1–B5 by default), type your name, done.
- **My Reservation** — look up your slot by name, or cancel it. Cancelling automatically pulls the next person off the Waiting List into the freed slot.
- **Waiting List** — join it when every slot is Reserved/Occupied. First to join is first served.
- **Admin** — passcode is `admin123` (change it at the top of `app.js`). From here you can:
  - **Add a slot** with a real name or number — click an existing section chip (A, B, ...) to auto-fill the next open number, or type any section + number/name combo yourself (e.g. section `VIP`, number `1` → slot `VIP1`).
  - Cycle a slot's status (Available → Reserved → Occupied), edit the name attached to a reservation, or delete a slot entirely.
  - Search by label (e.g. `A3`) and sort the table by slot or status.
  - **Moderate the waiting list** — remove a no-show, or click "Seat Now" to immediately place someone from the queue into the next open slot.

## Where the original DSA concepts live now
| Original (C++) | Here (JavaScript) |
|---|---|
| Array of slot records | The cached `slots` array + the `parking_slots` table |
| Queue for the waiting list | `waiting_list` table, always read oldest-first |
| Searching Algorithm | `linearSearchByLabel()` in `app.js` |
| Sorting Algorithm | `bubbleSort()` in `app.js` |
| File Handling | Supabase (cloud database) |

## Updated Tools & Technologies table
| Tool/Technology | Purpose |
|---|---|
| JavaScript | Main programming language used to develop the system |
| HTML | Structures the app's pages and content |
| CSS | Styles the interface |
| Supabase | Cloud database used to store and retrieve parking and waiting-list data |
| Visual Studio Code | Used for writing and editing the source code |
| Web Browser | Runs the app — no separate compiler needed, unlike the C++ version |
| Array | Used to store parking slot information in memory |
| Queue | Used to manage the waiting list, in join order |
| Searching Algorithm | Used to find specific parking slots (linear search) |
| Sorting Algorithm | Used to organize parking slot information (bubble sort) |
