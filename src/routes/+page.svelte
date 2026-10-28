<script lang="ts">
  import { onMount } from "svelte";

  type Booking = {
    id: string;
    guest: string;
    room: string;
    checkin: string;
    checkout: string;
    guests: number;
    source: string;
    reference: string;
    phone: string;
    email: string;
    status: "Confirmed" | "Pending" | "Cancelled";
    total: number;
    paid: number;
    paymentMethod: string;
    notes: string;
    createdAt?: number;
    updatedAt?: number;
  };

  type User = { email: string; role: "owner" };

  const rooms = [
    { name: "Kaani", color: "kaani" },
    { name: "Hirundhu", color: "hirundhu" },
    { name: "Funa", color: "funa" },
    { name: "Dhigga", color: "dhigga" }
  ];
  const sources = [
    "Direct / Website", "WhatsApp", "Phone", "Email", "Booking.com",
    "Airbnb", "Expedia", "Travel agent", "Walk-in", "Other"
  ];
  const paymentMethods = [
    "Not specified", "Cash", "Bank transfer", "Card",
    "Paid to booking channel", "Other"
  ];
  const propertyTimeZone = "Indian/Maldives";

  export let data: { user: User | null };

  let bookings: Booking[] = [];
  let view = "Calendar";
  let roomFilter = "";
  let search = "";
  let loading = false;
  let saving = false;
  let pageError = "";
  let authError = "";
  let notice = "";
  let authMode: "login" | "setup" = "login";
  let authEmail = "";
  let authPassword = "";
  let bootstrapSecret = "";
  let month = currentMonthDate();
  let editingId: string | null = null;
  let dialogElement: HTMLDialogElement;
  let backupInput: HTMLInputElement;

  const blankBooking = (): Omit<Booking, "id"> => ({
    guest: "",
    room: "Kaani",
    checkin: todayString(),
    checkout: tomorrowString(),
    guests: 1,
    source: "Direct / Website",
    reference: "",
    phone: "",
    email: "",
    status: "Confirmed",
    total: 0,
    paid: 0,
    paymentMethod: "Not specified",
    notes: ""
  });

  let draft: Omit<Booking, "id"> = blankBooking();
  let monthDays: Date[] = [];
  let activeBookings: Booking[] = [];
  let visibleBookings: Booking[] = [];
  let arrivals: Booking[] = [];
  let occupancy = 0;
  let occupiedNights = 0;
  let availableTonight = 4;
  let monthlyValue = 0;
  let arrivalCount = 0;

  $: monthDays = Array.from(
    { length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)
  );
  $: activeBookings = bookings.filter((booking) => booking.status !== "Cancelled");
  $: visibleBookings = bookings.filter((booking) => {
    const query = search.trim().toLowerCase();
    const matchesText = !query || [
      booking.guest, booking.room, booking.source, booking.reference,
      booking.email, booking.phone, booking.status
    ].some((value) => value.toLowerCase().includes(query));
    return matchesText && (!roomFilter || booking.room === roomFilter);
  }).sort((a, b) => a.checkin.localeCompare(b.checkin));
  $: arrivals = activeBookings.filter((booking) =>
    booking.checkin >= dateKey(month) &&
    booking.checkin < dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1))
  );
  $: occupiedNights = monthDays.reduce((sum, day) => {
    const key = dateKey(day);
    return sum + rooms.filter((room) =>
      activeBookings.some((booking) =>
        booking.room === room.name && booking.checkin <= key && booking.checkout > key
      )
    ).length;
  }, 0);
  $: occupancy = monthDays.length
    ? Math.round((occupiedNights / (monthDays.length * rooms.length)) * 100)
    : 0;
  $: arrivalCount = arrivals.length;
  $: monthlyValue = arrivals.reduce((sum, booking) => sum + booking.total, 0);
  $: availableTonight = rooms.length - new Set(
    activeBookings.filter((booking) =>
      booking.checkin <= todayString() && booking.checkout > todayString()
    ).map((booking) => booking.room)
  ).size;

  onMount(() => {
    if (data.user) void loadBookings();
  });

  function todayString(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: propertyTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function tomorrowString(): string {
    const [year, monthNumber, day] = todayString().split("-").map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, day + 1)).toISOString().slice(0, 10);
  }

  function currentMonthDate(): Date {
    const [year, monthNumber] = todayString().split("-").map(Number);
    return new Date(year, monthNumber - 1, 1);
  }

  function dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function dateFromKey(value: string): Date {
    const [year, monthNumber, day] = value.split("-").map(Number);
    return new Date(year, monthNumber - 1, day);
  }

  function dateLabel(value: string, options: Intl.DateTimeFormatOptions = {
    day: "numeric", month: "short"
  }): string {
    if (!value) return "";
    return dateFromKey(value).toLocaleDateString("en-GB", options);
  }

  function nights(booking: Booking): number {
    return Math.round((dateFromKey(booking.checkout).getTime() -
      dateFromKey(booking.checkin).getTime()) / 86_400_000);
  }

  function money(value: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 2
    }).format(value || 0);
  }

  function roomClass(room: string): string {
    return rooms.find((item) => item.name === room)?.color ?? "kaani";
  }

  function gridPosition(booking: Booking): string {
    const start = dateKey(month);
    const end = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    const left = booking.checkin < start ? 1 : dateFromKey(booking.checkin).getDate();
    const right = booking.checkout >= end ? monthDays.length + 1 : dateFromKey(booking.checkout).getDate();
    return `${left} / ${right}`;
  }

  async function loadBookings(): Promise<void> {
    loading = true;
    pageError = "";
    try {
      const response = await fetch("/api/bookings?limit=1000");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Bookings could not be loaded.");
      bookings = result.bookings as Booking[];
    } catch (error) {
      pageError = error instanceof Error ? error.message : "Bookings could not be loaded.";
    } finally {
      loading = false;
    }
  }

  async function submitAuth(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    authError = "";
    const setup = authMode === "setup";
    try {
      const response = await fetch(`/api/auth/${setup ? "setup" : "login"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(setup ? { "X-Bootstrap-Secret": bootstrapSecret } : {})
        },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request could not be completed.");
      if (setup) {
        authMode = "login";
        authPassword = "";
        bootstrapSecret = "";
        authError = "";
        notice = "Owner account created. Sign in with your new credentials.";
        return;
      }
      window.location.reload();
    } catch (error) {
      authError = error instanceof Error ? error.message : "Request could not be completed.";
    }
  }

  async function signOut(): Promise<void> {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      pageError = "Could not safely sign out. Please try again.";
      return;
    }
    window.location.reload();
  }

  function openNewBooking(room = "Kaani", date = todayString()): void {
    editingId = null;
    draft = { ...blankBooking(), room, checkin: date };
    const checkoutDate = dateFromKey(date);
    checkoutDate.setDate(checkoutDate.getDate() + 1);
    draft.checkout = dateKey(checkoutDate);
    notice = "";
    dialogElement.showModal();
  }

  function openEditBooking(booking: Booking): void {
    editingId = booking.id;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = booking;
    draft = { ...fields };
    notice = "";
    dialogElement.showModal();
  }

  function closeDialog(): void {
    if (dialogElement.open) dialogElement.close();
  }

  async function saveBooking(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    saving = true;
    pageError = "";
    try {
      const response = await fetch(editingId ? `/api/bookings/${encodeURIComponent(editingId)}` : "/api/bookings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Booking could not be saved.");
      closeDialog();
      if (result.emailWarning) notice = result.emailWarning;
      await loadBookings();
    } catch (error) {
      pageError = error instanceof Error ? error.message : "Booking could not be saved.";
    } finally {
      saving = false;
    }
  }

  async function deleteBooking(): Promise<void> {
    if (!editingId || !confirm("Permanently delete this booking? This cannot be undone.")) return;
    const response = await fetch(`/api/bookings/${encodeURIComponent(editingId)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      pageError = result.error || "Booking could not be deleted.";
      return;
    }
    closeDialog();
    await loadBookings();
  }

  function changeMonth(amount: number): void {
    month = new Date(month.getFullYear(), month.getMonth() + amount, 1);
  }

  function goToToday(): void {
    month = currentMonthDate();
  }

  function downloadFile(contents: string, type: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportBackup(): void {
    downloadFile(JSON.stringify({
      app: "Fulhadhoo Beach Cottage",
      version: 1,
      exportedAt: new Date().toISOString(),
      bookings
    }, null, 2), "application/json", `fulhadhoo-backup-${todayString()}.json`);
    notice = "Backup downloaded. It contains guest details; store it securely.";
  }

  function exportCsv(): void {
    const fields: Array<keyof Booking> = [
      "guest", "room", "checkin", "checkout", "guests", "source", "reference",
      "phone", "email", "status", "total", "paid", "paymentMethod", "notes"
    ];
    const cell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = "\uFEFF" + [
      fields.join(","),
      ...bookings.map((booking) => fields.map((field) => cell(booking[field])).join(","))
    ].join("\r\n");
    downloadFile(csv, "text/csv;charset=utf-8", `fulhadhoo-bookings-${todayString()}.csv`);
  }

  async function restoreBackup(): Promise<void> {
    const file = backupInput.files?.[0];
    if (!file) return;
    pageError = "";
    try {
      if (file.size > 5_000_000) throw new Error("Choose a backup smaller than 5 MB.");
      const backup = JSON.parse(await file.text());
      if (backup.app !== "Fulhadhoo Beach Cottage" || backup.version !== 1 ||
          !Array.isArray(backup.bookings)) {
        throw new Error("Choose a backup created by this booking manager.");
      }
      if (!confirm(`Replace all ${bookings.length} current bookings with ${backup.bookings.length} from this backup?`)) {
        return;
      }
      const response = await fetch("/api/bookings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Backup could not be restored.");
      notice = result.message;
      await loadBookings();
    } catch (error) {
      pageError = error instanceof Error ? error.message : "Backup could not be restored.";
    } finally {
      backupInput.value = "";
    }
  }

  async function retryEmails(): Promise<void> {
    const response = await fetch("/api/emails/retry", { method: "POST" });
    const result = await response.json();
    notice = response.ok ? result.message : result.error || "Email retry failed.";
  }
</script>

<svelte:head>
  <title>Fulhadhoo Beach Cottage — Booking Manager</title>
  <meta name="description" content="Secure guest bookings management for Fulhadhoo Beach Cottage." />
</svelte:head>

{#if !data.user}
  <main class="auth-page">
    <section class="auth-card">
      <a class="brand" href="https://fulhadhoobeachcottage.com" rel="noreferrer">
        <span class="brand-mark">≈</span>
        <span><strong>fulhadhoo.</strong><small>BEACH COTTAGE</small></span>
      </a>
      <div class="eyebrow">FULHADHOO BEACH COTTAGE</div>
      <h1>{authMode === "setup" ? "Create your owner account." : "Welcome back."}</h1>
      <p class="muted">
        {authMode === "setup"
          ? "First-time setup is limited to the person with the private bootstrap key."
          : "Sign in to manage your guest bookings securely."}
      </p>
      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
      <form class="auth-form" onsubmit={submitAuth}>
        {#if authMode === "setup"}
          <label>
            <span>One-time setup key</span>
            <input bind:value={bootstrapSecret} type="password" autocomplete="off" required minlength="24" />
          </label>
        {/if}
        <label>
          <span>Owner email</span>
          <input bind:value={authEmail} type="email" autocomplete="username" maxlength="150" required />
        </label>
        <label>
          <span>Password</span>
          <input bind:value={authPassword} type="password"
            autocomplete={authMode === "setup" ? "new-password" : "current-password"}
            minlength={authMode === "setup" ? 12 : 1} maxlength="128" required />
          {#if authMode === "setup"}<small>Use at least 12 characters.</small>{/if}
        </label>
        {#if authError}<p class="error" role="alert">{authError}</p>{/if}
        <button class="button primary wide" type="submit">
          {authMode === "setup" ? "Create owner account" : "Sign in"}
        </button>
      </form>
      <button class="text-button" type="button" onclick={() => {
        authMode = authMode === "login" ? "setup" : "login";
        authError = "";
      }}>
        {authMode === "setup" ? "Back to sign in" : "First-time owner setup"}
      </button>
      <p class="security-note">Your bookings are stored in the secured, central database—not in this browser.</p>
    </section>
  </main>
{:else}
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="https://fulhadhoobeachcottage.com" rel="noreferrer">
        <span class="brand-mark">≈</span>
        <span><strong>fulhadhoo.</strong><small>BEACH COTTAGE</small></span>
      </a>
      <p class="nav-caption">WORKSPACE</p>
      {#each ["Calendar", "Reservations", "Rooms", "Backups"] as item}
        <button class:active={view === item} class="nav-item" type="button" onclick={() => view = item}>
          <span aria-hidden="true">{item === "Calendar" ? "▦" : item === "Reservations" ? "☷" : item === "Rooms" ? "⌂" : "↓"}</span>
          {item}
        </button>
      {/each}
      <div class="side-rooms">
        <p class="nav-caption">YOUR FOUR SPACES</p>
        {#each rooms as room}
          <div class="room-key"><i class={`dot ${room.color}`}></i>{room.name}</div>
        {/each}
      </div>
      <div class="side-bottom">
        <p>A little closer to paradise.<br />Fulhadhoo Island · Maldives</p>
        <a href="https://fulhadhoobeachcottage.com" rel="noreferrer">Our cottage website ↗</a>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="breadcrumb">Workspace <b>/ {view}</b></div>
        <div class="top-right">
          <span class="date-today">{dateLabel(todayString(), {
            weekday: "short", day: "numeric", month: "short", year: "numeric"
          })}</span>
          <span class="sync-state"><i></i>Synced to cloud</span>
          <span class="user-email">{data.user.email}</span>
          <button class="sign-out" type="button" onclick={signOut}>Sign out</button>
        </div>
      </header>

      <section class="hero">
        <div>
          <div class="eyebrow">FULHADHOO BEACH COTTAGE</div>
          <h1>{view === "Calendar" ? "Room for good days." : view === "Reservations" ? "Every stay, in place." : view === "Rooms" ? "Your island spaces." : "Your bookings. Safely kept."}</h1>
          <p class="subtitle">Four rooms. One island. Every stay, beautifully organised.</p>
        </div>
        <div class="hero-actions">
          {#if view === "Backups"}
            <button class="button" type="button" onclick={exportBackup}>↓ Download backup</button>
          {/if}
          <button class="button primary" type="button" onclick={() => openNewBooking()}>＋ New booking</button>
        </div>
      </section>

      {#if pageError}<div class="alert error" role="alert">{pageError}</div>{/if}
      {#if notice}<div class="alert success" role="status">{notice}</div>{/if}

      <section class="stats" aria-label="Booking statistics">
        <article class="stat"><span>Monthly occupancy</span><strong>{occupancy}%</strong><small>{occupiedNights} of {monthDays.length * rooms.length} room nights · includes pending</small></article>
        <article class="stat"><span>Arrivals this month</span><strong>{arrivalCount}</strong><small>Confirmed and pending bookings</small></article>
        <article class="stat"><span>Available tonight</span><strong>{availableTonight} <small class="stat-total">/ 4</small></strong><small>Rooms not reserved tonight</small></article>
        <article class="stat"><span>Monthly booking value</span><strong>{money(monthlyValue)}</strong><small>Full value of stays arriving this month</small></article>
      </section>

      {#if view === "Calendar"}
        <section class="card">
          <div class="section-head">
            <div><h2>Your island, at a glance.</h2><p>Select an empty date to book. Select a stay to manage it.</p></div>
            <div class="controls">
              <label class="sr-only" for="roomFilter">Filter rooms</label>
              <select id="roomFilter" class="control" bind:value={roomFilter}>
                <option value="">All rooms</option>
                {#each rooms as room}<option value={room.name}>{room.name}</option>{/each}
              </select>
              <button class="button small" type="button" onclick={goToToday}>Today</button>
              <div class="month-control">
                <button class="arrow" type="button" aria-label="Previous month" onclick={() => changeMonth(-1)}>‹</button>
                <strong>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</strong>
                <button class="arrow" type="button" aria-label="Next month" onclick={() => changeMonth(1)}>›</button>
              </div>
            </div>
          </div>
          {#if loading}<p class="loading">Loading bookings…</p>{/if}
          <div class="calendar-scroll">
            <div class="calendar">
              <div class="calendar-header">
                <div class="room-label header-room">ROOM / DATE</div>
                <div class="day-row" style={`grid-template-columns: repeat(${monthDays.length}, minmax(30px, 1fr))`}>
                  {#each monthDays as day}
                    <div class:today={dateKey(day) === todayString()} class="day">
                      <small>{day.toLocaleDateString("en", { weekday: "short" })}</small>
                      <strong>{day.getDate()}</strong>
                    </div>
                  {/each}
                </div>
              </div>
              {#each rooms.filter((room) => !roomFilter || room.name === roomFilter) as room}
                <div class="room-row">
                  <div class="room-label"><strong><i class={`dot ${room.color}`}></i>{room.name}</strong><small>Private cottage room</small></div>
                  <div class="room-grid" style={`grid-template-columns: repeat(${monthDays.length}, minmax(30px, 1fr))`}>
                    {#each monthDays as day}
                      <button class="date-cell" type="button"
                        aria-label={`Book ${room.name} on ${dateLabel(dateKey(day))}`}
                        onclick={() => openNewBooking(room.name, dateKey(day))}></button>
                    {/each}
                    <div class="booking-layer" style={`grid-template-columns: repeat(${monthDays.length}, minmax(30px, 1fr))`}>
                      {#each activeBookings.filter((booking) =>
                        booking.room === room.name &&
                        booking.checkin < dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1)) &&
                        booking.checkout > dateKey(month)
                      ) as booking (booking.id)}
                        <button class={`booking-chip ${room.color} ${booking.status.toLowerCase()}`}
                          style={`grid-column: ${gridPosition(booking)}`}
                          title={`${booking.guest} · ${dateLabel(booking.checkin)} – ${dateLabel(booking.checkout)}`}
                          aria-label={`Manage ${booking.guest}, ${room.name}, ${booking.status}`}
                          onclick={() => openEditBooking(booking)}>
                          <strong>{booking.guest}</strong>
                          <small>{booking.source} · {nights(booking)} nights</small>
                        </button>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <div class="calendar-footer"><span>Confirmed · Pending bookings use a dashed border</span><span>Checkout day is available · Scroll horizontally →</span></div>
        </section>

        <section class="card arrivals-card">
          <div class="section-head"><div><h2>Next arrivals</h2><p>A warm welcome starts here.</p></div>
            <button class="text-button" type="button" onclick={() => view = "Reservations"}>View all ↗</button>
          </div>
          {@render BookingTable(arrivals.slice(0, 5), openEditBooking, true)}
        </section>
      {:else if view === "Reservations"}
        <section class="card">
          <div class="section-head">
            <div><h2>All reservations</h2><p>Guest details, booking channels and payment status.</p></div>
            <div class="controls">
              <label class="sr-only" for="bookingSearch">Search reservations</label>
              <input id="bookingSearch" class="control search" bind:value={search} placeholder="Search guest, room, channel…" />
              <button class="button small" type="button" onclick={exportCsv}>↓ CSV</button>
            </div>
          </div>
          {@render BookingTable(visibleBookings, openEditBooking)}
        </section>
      {:else if view === "Rooms"}
        <section class="room-cards">
          {#each rooms as room}
            <article class="card room-card">
              <div class={`room-banner ${room.color}`}><i class={`dot ${room.color}`}></i><h2>{room.name}</h2></div>
              <p>Private cottage room</p>
              <strong>{activeBookings.filter((booking) =>
                booking.room === room.name &&
                booking.checkin <= todayString() && booking.checkout > todayString()
              ).length ? "Occupied tonight" : "Available tonight"}</strong>
              <button class="button small" type="button" onclick={() => {
                roomFilter = room.name;
                view = "Reservations";
              }}>View reservations</button>
            </article>
          {/each}
        </section>
      {:else}
        <section class="card backup-card">
          <div class="eyebrow">LOOK AFTER YOUR ISLAND STORIES</div>
          <h2>Your bookings. Safely kept.</h2>
          <p>Bookings are stored in Cloudflare D1 and are available when you sign in on another device. Downloaded backups contain guest personal information; keep them encrypted and access-controlled.</p>
          <div class="backup-actions">
            <button class="button primary" type="button" onclick={exportBackup}>↓ Download JSON backup</button>
            <button class="button" type="button" onclick={() => backupInput.click()}>↑ Restore JSON backup</button>
            <button class="button" type="button" onclick={exportCsv}>↓ Export CSV</button>
            <button class="button" type="button" onclick={retryEmails}>Retry pending emails</button>
          </div>
          <input bind:this={backupInput} type="file" accept=".json,application/json" hidden onchange={restoreBackup} />
          <p class="backup-note">Restoring replaces all current bookings. A restore is limited to 500 records. Download a current backup first. CSV exports are protected against spreadsheet-formula injection.</p>
        </section>
      {/if}

      <footer class="footer"><span>Fulhadhoo Beach Cottage — thoughtfully hosted.</span><span>Cloud synced · USD · No automatic channel sync</span></footer>
    </main>
  </div>

  <dialog bind:this={dialogElement} aria-labelledby="modalTitle" onclose={() => pageError = ""}>
    <form class="booking-form" onsubmit={saveBooking}>
      <header class="modal-header">
        <div><div class="eyebrow">A LITTLE SPACE IN PARADISE</div><h2 id="modalTitle">{editingId ? "Manage booking" : "New booking"}</h2></div>
        <button class="close-button" type="button" aria-label="Close dialog" onclick={closeDialog}>×</button>
      </header>
      <div class="form-body">
        <div class="form-grid">
          <label class="field full"><span>Guest name *</span><input bind:value={draft.guest} required maxlength="100" autocomplete="name" /></label>
          <label class="field"><span>Room *</span><select bind:value={draft.room}>{#each rooms as room}<option>{room.name}</option>{/each}</select></label>
          <label class="field"><span>Number of guests *</span><input bind:value={draft.guests} type="number" min="1" max="10" step="1" required /></label>
          <label class="field"><span>Check-in *</span><input bind:value={draft.checkin} type="date" required /></label>
          <label class="field"><span>Check-out *</span><input bind:value={draft.checkout} type="date" min={draft.checkin} required /></label>
          <label class="field"><span>Booking method</span><select bind:value={draft.source}>{#each sources as source}<option>{source}</option>{/each}</select></label>
          <label class="field"><span>Booking reference</span><input bind:value={draft.reference} maxlength="100" /></label>
          <label class="field"><span>Phone / WhatsApp</span><input bind:value={draft.phone} type="tel" maxlength="40" autocomplete="tel" /></label>
          <label class="field"><span>Email address</span><input bind:value={draft.email} type="email" maxlength="150" autocomplete="email" /></label>
          <label class="field"><span>Booking status</span><select bind:value={draft.status}><option>Confirmed</option><option>Pending</option><option>Cancelled</option></select></label>
          <label class="field"><span>Payment method</span><select bind:value={draft.paymentMethod}>{#each paymentMethods as method}<option>{method}</option>{/each}</select></label>
          <label class="field"><span>Total stay value · USD *</span><input bind:value={draft.total} type="number" min="0" max="100000000" step=".01" required /></label>
          <label class="field"><span>Amount paid · USD *</span><input bind:value={draft.paid} type="number" min="0" max="100000000" step=".01" required /></label>
          <div class="summary full" aria-live="polite">
            {#if draft.checkin && draft.checkout && draft.checkout > draft.checkin}
              {Math.round((dateFromKey(draft.checkout).getTime() - dateFromKey(draft.checkin).getTime()) / 86_400_000)} nights
            {:else}Choose valid stay dates{/if}
            · {money(Number(draft.total) || 0)} total · {money((Number(draft.total) || 0) - (Number(draft.paid) || 0))} outstanding
          </div>
          <label class="field full"><span>Guest notes & special requests</span><textarea bind:value={draft.notes} rows="3" maxlength="4000" placeholder="Boat arrival, transfers, dietary requirements…"></textarea></label>
        </div>
        {#if pageError}<p class="error" role="alert">{pageError}</p>{/if}
      </div>
      <footer class="modal-footer">
        {#if editingId}<button class="button danger" type="button" onclick={deleteBooking}>Delete booking</button>{/if}
        <div class="modal-actions">
          <button class="button" type="button" onclick={closeDialog}>Cancel</button>
          <button class="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save booking ↗"}</button>
        </div>
      </footer>
    </form>
  </dialog>
{/if}

{#snippet BookingTable(items: Booking[], onEdit: (booking: Booking) => void, compact = false)}
  {#if !items.length}
    <p class="empty">No reservations to show.<br />A new island story starts with your next booking.</p>
  {:else}
    <div class="table-scroll">
      <table>
        <thead><tr><th>Guest / room</th><th>Stay</th><th>Channel</th>{#if !compact}<th>Value / balance</th>{/if}<th>Status</th></tr></thead>
        <tbody>
          {#each items as booking (booking.id)}
            <tr class="clickable-row" onclick={() => onEdit(booking)} onkeydown={(event) => {
              if (event.key === "Enter" || event.key === " ") onEdit(booking);
            }} role="button" tabindex="0" aria-label={`Manage ${booking.guest}'s reservation`}>
              <td><strong>{booking.guest}</strong><small><i class={`dot ${roomClass(booking.room)}`}></i>{booking.room}</small></td>
              <td>{dateLabel(booking.checkin)} – {dateLabel(booking.checkout)}<small>{nights(booking)} nights · {booking.guests} guests</small></td>
              <td>{booking.source}<small>{booking.reference || "No reference"}</small></td>
              {#if !compact}<td>{money(booking.total)}<small>{money(booking.total - booking.paid)} outstanding</small></td>{/if}
              <td><span class={`status ${booking.status.toLowerCase()}`}>{booking.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}
