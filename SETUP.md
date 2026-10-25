# BOAROUTE setup

## 1. Database (Supabase dashboard)

1. SQL Editor > New query > paste `supabase/migrations/20261025000000_boaroute_init.sql` > Run.
   It creates every table, RLS policy, the `task-media` storage bucket, and seeds Jo's 78 and David's 65 stores.
   It also adds the onboarding fields: `profiles.current_mileage` (trips logged in Finances add to it
   automatically), `profiles.working_days`, `profiles.onboarded_at`, and the `user_stores` table for each
   person's chosen stores. It is safe to run again, including over a database that ran an earlier version.
   Anyone who signed in before this version goes through the new four-step onboarding once.
   Each person also gets `profiles.standard_budget` (default £60) and `profiles.sales_day_budget`
   (default £150, shared by Sales Day and OOH expenses). They can change both under Me > Budgets.
2. Authentication > Providers > Email: enabled (email + password).
   If "Confirm email" is on, new users must tap the email link before signing in.
3. Access is decided by the signed-in email, never by the name typed at signup.
   Only emails in `public.team_members` get into the app. It is seeded with the
   owner's address as the one and only admin (Joseph's stores, `HP13 6BU` start).
   Anyone else who signs up is held on the sign-in screen as a pending request
   and sees no data until the admin approves them under Me > Team Management
   (or pre-adds their email there). The admin can also deny or remove people.

Store visibility is enforced by RLS: the admin sees the full master list (Store
Management) and routes Joseph's stores day to day; a merchandiser sees only their
patch. Defaults: David's stores for David; Sarah, Joseph, Pete and Marcia for
Sarah; anyone else their own. The admin can change a patch under Team Management.

## 2. App configuration

`.env.local` (development) and EAS environment variables (cloud builds):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

For EAS builds:

```
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <key> --visibility plaintext
```

## 3. Edge Functions (live traffic routing + AI writer)

```
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set GOOGLE_MAPS_API_KEY=<directions key> ANTHROPIC_API_KEY=<anthropic key>
npx supabase functions deploy route-options
npx supabase functions deploy ai-writer
```

- `route-options` calls the Google Directions API with `departure_time=now` and
  `traffic_model=best_guess` for live traffic, plus turn-by-turn steps for the in-app
  navigator. Its key stays on the server and never ships in the app. If only
  `MAPBOX_ACCESS_TOKEN` is set it uses Mapbox instead. With neither, the app falls back
  to clearly labelled offline estimates.
- `ai-writer` uses Claude (`claude-opus-5-5`) with server-side refusal fallback enabled.
  The prompt forbids em dashes and the output is cleaned again before it is returned.

## 3b. In-app map (Google Maps SDK for Android)

The map is drawn by Google Maps, which needs a key inside the APK. Use a separate key
from the Directions one and restrict it in Google Cloud Console to **Android apps**,
package `com.boanets.boaroute` plus the SHA-1 shown by `npx eas-cli@latest credentials`,
with only "Maps SDK for Android" enabled.

```
# .env.local (local builds)
GOOGLE_MAPS_API_KEY=<android maps key>

# EAS builds
npx eas-cli@latest env:create --environment preview --name GOOGLE_MAPS_API_KEY --value <android maps key> --visibility sensitive
```

Without this key the build still works: the navigator shows the HUD route view instead
of the live map, and every other feature is unchanged.

## 4. Build

```
npx eas-cli@latest build --profile preview --platform android
```

## Checks

```
npm test            # Jest
npm run typecheck   # TypeScript
npm run lint        # ESLint
```
