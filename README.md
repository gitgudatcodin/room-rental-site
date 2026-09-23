# Room Rental Website

A complete booking website for renting out rooms by the room: tenants browse
rooms and photos, pick a lease term, and book. They pay you via Zelle, and you
confirm each payment in a private admin panel.

> **Version control:** this project is a git repo. See "Tracking changes with
> GitHub" below to push it to GitHub and track every change.

**Live pages**

| Page | What it does |
|---|---|
| `index.html` | Homepage — searchable/filterable room listings, how-it-works, FAQ |
| `room.html?id=…` | Room detail — photo gallery (click to zoom), term picker, parking add-on, live total, booking form, Zelle instructions |
| `track.html` | Tenant self-service — look up booking status with reference code + email |
| `admin.html` | Owner-only — dashboard stats, bookings (confirm Zelle / cancel / search / CSV export), rooms, photo uploads, property management |
| Email notifications | Tenant gets booking receipt + Zelle instructions; you get an instant new-booking alert; tenant gets a confirmation email when you confirm payment (Resend + Edge Function, free) |

**How the Zelle flow works**

1. Tenant picks a room + term → total is calculated (monthly rate for that term × months + deposit + optional parking).
2. Tenant submits name, email, phone, move-in date → booking saved as **Awaiting payment**.
3. Confirmation screen shows your Zelle number, the exact total, and a booking
   reference code (tenant puts name + code in the Zelle memo).
4. You see the money in your Zelle account → open `admin.html` → **Confirm payment**.
   The room stays visible until you mark it unavailable.

## The stack (and why)

| Piece | Service | Cost |
|---|---|---|
| Website hosting | Cloudflare Pages (static hosting) | **$0** — unlimited static sites, no server, nothing runs on your computer |
| Database + photo storage + owner login | Supabase free tier | **$0** — 500 MB database, 1 GB photo storage, 50,000 visitors/mo |

Everything is plain HTML/CSS/JS — no build step, no framework to maintain.
The site talks directly to Supabase from the browser, so there is no backend
server for you to run or pay for.

**One honest caveat:** Supabase pauses free projects after 7 days with zero
traffic. The site wakes itself up on the next visit (takes ~10–30 seconds the
first time). If that ever bothers you, a free scheduled ping (e.g. a GitHub
Actions cron hitting your site weekly) keeps it awake — ask and I'll set that up.

## Setup (about 20 minutes)

### Step 1 — Create the free Supabase project
1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. **New project** → name it `room-rentals` → pick a region near you → create.
   (Free tier allows 2 projects; you need 1.)
3. Go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://xyzcompany.supabase.co`)
   - **Publishable / anon key** (starts with `sb_publishable_…` or `eyJ…`)

### Step 2 — Create the database tables
1. In Supabase, open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
   (If you ran `schema.sql` before newer features were added, also run the
   matching `supabase/migration-*.sql` files once — each one says when it's needed.)
   This creates the `properties`, `rooms`, and `bookings` tables, the security
   rules (visitors can only read available rooms and submit bookings), and the
   `room-photos` photo bucket.
3. *(Optional)* Run `supabase/seed.sql` too, to see the site working with sample
   rooms before you add your own.

### Step 3 — Create your owner login
1. In Supabase, open **Authentication → Users → Add user → Create new user**.
2. Enter your email + a strong password.
3. Turn **off** "Send email confirmation" (or confirm it via the email) — then **Create**.
4. Only this login can open the admin panel and confirm payments. Never share it.

### Step 4 — Point the site at your Supabase project
Open `js/config.js` and fill in:
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` (from Step 1)
- `SITE.name`, contact info, and **your Zelle number/email**
- `PARKING_PERMIT` — the monthly parking-permit fee tenants can add at booking (set to $75 — change it to your price). Set `enabled: false` to hide the option entirely.
- Lease terms and per-term prices are managed in the **admin panel** (Admin → Rooms), not here — see "Customizing" below.

### Step 5 — Put the site online (free, not on your computer)
**Cloudflare Pages** (recommended):
1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Pages → Upload assets**.
3. Name it (e.g. `my-room-rentals`), then **drag the entire `room-rental-site`
   folder** (or a zip of it) into the upload box → Deploy.
   ⚠️ Important: do NOT include the `supabase/` folder in the upload — it holds
   backend setup files (including a `.ts` file) that belong in Supabase, not on
   the website, and Cloudflare's uploader will reject the deploy if it sees
   them. (A ready-to-upload zip with only the website files is included as
   `room-rental-site-deploy.zip`.)
4. You get a live URL like `my-room-rentals.pages.dev` instantly. Share that link
   with tenants.

Alternatives that are equally free: Netlify Drop (drag the folder at
app.netlify.com/drop) or GitHub Pages.

### Step 6 — Add your real rooms
1. Open `your-site.pages.dev/admin.html` and sign in.
2. Go to the **Rooms** tab → fill in each room (name, rent, deposit, amenities)
   and upload photos. Uncheck **Available** for any room that's currently occupied.
3. New properties (houses) are added in Supabase → **Table Editor → properties**.

That's it — the site is live and you never touch your computer to keep it running.

### Step 7 — Email notifications (free, ~10 minutes)
The site emails the tenant a booking receipt with Zelle instructions, emails **you**
instantly when a booking comes in, and emails the tenant again when you confirm
payment. Powered by **Resend** (free: 3,000 emails/month) + a Supabase Edge Function.

1. Sign up free at [resend.com](https://resend.com).
2. Go to **API Keys → Create API Key** (give it "Sending access") and copy it.
3. In Supabase, open **Edge Functions → Create a new function**, name it
   `notify-booking`, delete the starter code, and paste the entire contents of
   `supabase/functions/notify-booking/index.ts` from this project. Click **Deploy**.
4. Still in Supabase, go to **Edge Functions → Secrets → Add new secret** and add:
   - `RESEND_API_KEY` = the key from step 2
   - `RESEND_FROM` = the email tenants see as the sender.
5. **About the sender address:** Resend's free tier only lets *unverified* senders
   email your own Resend account address. So for testing, set
   `RESEND_FROM` to `onboarding@resend.dev` — admin alerts to yourself will work
   immediately. To email *tenants* at their own addresses, verify your domain
   once in Resend (**Domains → Add Domain**, add the DNS records they show —
   free, ~10 minutes), then change `RESEND_FROM` to something like
   `Sunrise Rooms <bookings@yourdomain.com>`.
6. Make sure `SITE.contactEmail` in `js/config.js` is the address where you want
   booking alerts. Set `EMAIL.enabled = false` there if you ever want to pause emails.

Test it: submit a test booking on the live site, then check your inbox and the
tenant inbox. (Delete the test booking from the admin panel afterwards.)

## Customizing

- **Lease terms**: managed in the admin panel — Admin → Rooms → **Lease terms** (add/delete terms; they appear on every room page). No coding needed.
- **Price per term**: edit any room in the admin panel — set the base monthly rent plus an optional different monthly price for each term (e.g. $900/mo for 1 month, $800/mo for 12 months). Blank = base rent.
- **Zelle details**: `SITE.zelle` in `js/config.js`.
- **Parking fee**: `PARKING_PERMIT` in `js/config.js` (set `enabled: false` to hide it).
- **FAQ answers**: edit the `<details>` blocks in `index.html` — just change the text, no coding needed.
- **Colors / branding**: CSS variables at the top of `css/style.css`.
- **Custom domain** (e.g. `rooms.yourname.com`): Cloudflare Pages → Custom domains → free, takes ~5 minutes with any domain registrar.

## Project files

```
room-rental-site/
├── index.html            # homepage + listings + FAQ
├── room.html             # room detail + booking flow
├── track.html            # tenant booking-status lookup
├── admin.html            # owner admin (login required)
├── css/style.css         # all styling
├── js/
│   ├── config.js         # ← EDIT THIS: keys, Zelle, contact info, parking fee, email toggle
│   ├── db.js             # Supabase client
│   ├── terms.js          # lease-term + per-term pricing helpers
│   ├── home.js           # homepage logic (filters, FAQ contact)
│   ├── room.js           # booking flow + photo lightbox
│   ├── track.js          # booking-status lookup logic
│   ├── notify.js         # triggers email notifications (fire-and-forget)
│   └── admin.js          # admin panel logic
├── supabase/
│   ├── schema.sql        # ← run once in Supabase SQL Editor
│   ├── migration-*.sql   # run once each, only if you ran schema.sql before that feature was added
│   ├── functions/
│   │   └── notify-booking/index.ts  # ← paste into Supabase Edge Functions (Step 7)
│   └── seed.sql          # optional sample data
└── README.md
```

## FAQ

**Can tenants pay by card instead of Zelle?**
Not in this version — by design you asked for Zelle-with-manual-confirmation.
Card payments need a processor (Stripe) and have fees; say the word and it can be added.

**What stops random people from spamming fake bookings?**
Bookings are insert-only for the public (they can't read or change anything),
and only you can confirm them. If spam ever becomes a problem, a free
Cloudflare Turnstile captcha can be added to the booking form in ~30 minutes.

**What if I outgrow the free tier?**
500 MB holds tens of thousands of bookings; 1 GB holds roughly a thousand
room photos. If you ever need more, Supabase Pro is $25/mo — but most landlords
never hit the free limits.

## Tracking changes with GitHub

The project folder is already a git repository with its history committed.
To keep it on GitHub (version control + backup + a way to deploy from git later):

1. Create a **free** account at [github.com](https://github.com), then create a
   **new empty repository** (name it e.g. `room-rental-site`). Don't add a
   README/license — keep it empty.
2. On your computer, open a terminal in the `room-rental-site` folder and run:
   ```
   git remote add origin https://github.com/YOUR-USERNAME/room-rental-site.git
   git branch -M main
   git push -u origin main
   ```
   (Replace `YOUR-USERNAME` with your GitHub username. GitHub will ask you to
   sign in the first time.)
3. From then on, every change is tracked with three commands:
   ```
   git add -A
   git commit -m "Describe what changed"
   git push
   ```

Bonus: once the code is on GitHub you can connect the repo to Cloudflare Pages
(**Create → Pages → Connect to Git**) instead of uploading zips — every `git push`
then redeploys the site automatically.
