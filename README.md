# Friend Ring MVP — E-Commerce Group Gifting Platform

Friend Ring is a full-stack e-commerce catalog prototype where groups ("Rings") can purchase surprise gifts collectively, split payments, and maintain wishlists. It enforces a **Hidden Cart Rule** using Row-Level Security (RLS) so that a group member remains completely unaware of any surprise gift being purchased for them.

---

## 🛠️ Technology Stack (All Free-Tier & Hosted)

- **Frontend & Backend**: Next.js 15+ (App Router), deployed on [Vercel](https://vercel.com) (free tier).
- **Database & Auth & Realtime**: [Supabase](https://supabase.com) (free tier hosted Postgres, Auth, and Realtime replication).
- **Background Jobs**: Vercel Cron Jobs (configured via `vercel.json` hitting `/api/cron` every 5 minutes).

---

## 🚀 Setup Instructions

### 1. Set Up Supabase (Free Tier)
1. Go to [Supabase](https://supabase.com) and create a new free project.
2. Navigate to the **SQL Editor** in your Supabase Dashboard.
3. Open `supabase/migrations/20260715000000_init.sql` from this codebase, paste it into the SQL Editor, and click **Run**. This will create all tables, triggers, and Row Level Security policies.
4. Open `supabase/seed.sql` from this codebase, paste it into the SQL Editor, and click **Run**. This seeds your catalog with 30 premium products.
5. **Enable Realtime Replication**:
   - Go to your Supabase Dashboard -> **Database** (left sidebar) -> **Publications** (located right below *Indexes*).
   - Look for the publication named `supabase_realtime`.
   - Click **Edit** (or the pencil/gear icon) on the `supabase_realtime` row.
   - Check the boxes to enable realtime for these tables:
     - `carts`
     - `cart_items`
     - `cart_approvals`
     - `cart_contributions`
     - `notifications`
   - Save/update the publication.
   - *This step is critical for collaborative real-time updates!*


---

### 2. Configure Environment Variables
1. Copy the `.env.example` file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Retrieve your keys from the Supabase Dashboard (Settings -> API):
   - `NEXT_PUBLIC_SUPABASE_URL`: Your project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your project's API anon public key.
   - `SUPABASE_SERVICE_ROLE_KEY`: Your private service role key (needed by server cron route to bypass RLS).
3. Generate a secure, random 32-byte hex key (64 characters) for address encryption. Run this in your terminal to generate one:
   ```bash
   node -e "crypto.randomBytes(32).toString('hex')"
   ```
   Add the output to `ENCRYPTION_KEY` in `.env.local`.
4. Choose a custom random string (e.g. `my-friend-ring-cron-secret-2026`) and add it to `CRON_SECRET`.

---

### 3. Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Next.js development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.
4. Open a private/incognito window to log in as a second user and test real-time collaboration.

---

## ☁️ Deploy to Vercel (Zero Cost)

1. Push your code to a GitHub repository (e.g., private or public).
2. Go to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repository.
4. Add the following **Environment Variables** in the Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ENCRYPTION_KEY`
   - `CRON_SECRET`
5. Click **Deploy**. Vercel will automatically read `vercel.json` and configure a background cron job scheduled to trigger `/api/cron?secret=YOUR_CRON_SECRET` at regular intervals to expire overdue payment windows and send birthday reminders.

---

## 🔒 Security & Privacy (The Hidden Cart Rule)

We enforce surprise gift secrecy at the database level using PostgreSQL Row-Level Security (RLS) policies:
- A `select` query on `carts` is blocked if the `receiver_user_id` matches the active user (`auth.uid()`).
- In `cart_items`, `cart_approvals`, and `cart_contributions`, rows are only visible if the parent cart is visible in the `carts` table:
  ```sql
  CREATE POLICY "Users can access items of accessible carts" ON public.cart_items
      FOR ALL USING (EXISTS (SELECT 1 FROM public.carts WHERE id = cart_id));
  ```
- This ensures that when a surprise cart is hidden from a user, its items, pledges, and approvals are automatically blocked, preventing any leaks via developer consoles or network inspection.
