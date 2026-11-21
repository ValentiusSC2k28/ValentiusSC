# Hue & Harmony — game night app

The class game-night website: team sign-in, live team scoreboard, activity centre, Last Man Standing, the treasure hunt, and an admin dashboard that controls almost everything.

The site is plain files hosted on GitHub Pages. Everything else (players, scores, rooms, settings) lives in Supabase, on the free plan.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page shell and version number |
| `style.css` | All colours and layout |
| `supabase.js` | Everything that talks to the database. **Your project URL and key go here.** |
| `script.js` | Sign-in, team colours, home, scoreboard, schedule, info pages, winner reveal, default settings |
| `lms.js` | Last Man Standing |
| `hunt.js` | Treasure hunt |
| `admin.js` | The admin dashboard |
| `setup.sql` | Run once in Supabase. Not part of the website. |

## First-time setup (about 20 minutes)

### 1. Create the Supabase project
1. Go to supabase.com → **New project**. Any name; pick the region closest to Nigeria (for example, Europe West or South Africa if offered). Save the database password somewhere.
2. When it is ready: **SQL Editor** → **New query** → paste the whole of `setup.sql` → **Run**. The result says `Hue & Harmony setup complete`.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. Put the keys in the code
Open `supabase.js` and replace `https://YOUR-PROJECT.supabase.co` and `YOUR-ANON-KEY` with the two values. The anon key is safe to publish; the database rules in `setup.sql` protect everything.

### 3. Create the GitHub repository and turn on Pages
1. New repository (public), for example `hue-harmony`.
2. Upload all the files (`index.html`, `style.css`, `supabase.js`, `script.js`, `lms.js`, `hunt.js`, `admin.js`, `README.md`; `setup.sql` too for safekeeping).
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save. After a minute the site is at `https://YOUR-USERNAME.github.io/hue-harmony/`.

### 4. Supabase sign-in settings (for admins)
**Authentication → URL Configuration**
- **Site URL**: your GitHub Pages address from step 3.
- **Redirect URLs**: add the same address.

**Authentication → Sign In / Providers → Email**: switch **Confirm email** off, so admin accounts work immediately. (Supabase's built-in email only sends a few emails an hour, so confirmation and password-reset emails are unreliable without your own email service. Players never use email: they sign in with name + PIN.)

### 5. Make yourself the first admin
Do this straight away, before sharing the link:
1. Open the site → **Admin** (bottom of the sign-in screen, or add `#/admin` to the address).
2. Type your email and a password → **Create an admin account** → then **Sign in**.
3. The very first account becomes the first admin automatically. Add the other admins (up to 5) in **Admin → Admins**; each of them first creates an account the same way.

### 6. Prepare the event in the dashboard
- **Teams**: check the four names and colours.
- **Games**: add every physical game and the points for 1st, 2nd, 3rd, 4th.
- **Activity centre**: the schedule. Tick *Visible* for what players should see.
- **Treasure hunt**: add stations (clue, challenge, answers, hint), then **Build routes**, then **Print QR codes** and stick them up.
- **Appearance**, **Text & wording**, **Pages & home tiles**: anything you want to change.
- **Danger zone**: clear your test points and players before the event.

## Changing things after launch

Almost everything is changed in the dashboard, with no code: wording, colours, fonts, logos, home tiles, info pages, points, game rules, polling speed, admins. Changes reach every phone within about 10 seconds.

**Admin → Settings → Advanced** shows every setting as JSON, including ones without their own field.

### Flyer fonts and logos
1. In GitHub, create a folder `assets` and upload the logo images and font files.
2. Logos: **Admin → Appearance → Logo images**: one per line, e.g. `assets/valentis.png`.
3. Fonts: add a file `assets/fonts.css`, for example:
   ```css
   @font-face { font-family: 'Flyer Display'; src: url('FlyerDisplay.woff2') format('woff2'); }
   ```
   then in **Admin → Appearance** set *Your own font stylesheet* to `assets/fonts.css` and *Display font* to `Flyer Display`.

### Publishing a code change
Raise the version number in `index.html` (`window.HH_VERSION` and every `?v=`) so phones fetch the new files, then upload.

### For whoever edits the code
- **A new setting**: add its starting value to `DEFAULT_SETTINGS` in `script.js`, and one `F(...)` line in the right section of `admin.js`.
- **New wording**: add a key to `DEFAULT_SETTINGS.text` and use `T('key')`. It appears in Admin → Text automatically.
- **Database changes**: edit `setup.sql` and run it again. It is safe to re-run; it never deletes data.
- Every piece of text shown on the page goes through `esc()`. Keep it that way.

## How it handles 150+ people on the free plan

Phones don't hold a live connection. They ask the database for small updates on a timer (every 8 s on the home screen, 2 s inside a game room, 4 s in the hunt). The busiest realistic moment is about 65 small reads a second. That stays clear of the free plan's Realtime limits, which a live connection would hit with this many people.

- Game rules run inside the database, so a phone dying never breaks a game, and nobody's phone ever receives other players' roles or lives.
- The free plan **pauses a project after a period of no activity**. Open the Supabase dashboard in the days before the event and on the morning itself.
- Before the event, do a rehearsal with 10–20 phones.

## Known limits
- Admin password-reset emails depend on Supabase's email service (see step 4).
- The in-app camera scanner needs camera permission. If it fails, the phone's normal camera opens the code's link, or players type the short code printed under it.
