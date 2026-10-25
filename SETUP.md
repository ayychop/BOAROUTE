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
3. The admin is whoever signs up with an email listed in `public.app_admins`
   (seeded with the owner's address). Admins get the `HP13 6BU` start location.

Route scope defaults: admin routes Joseph's stores, users route Joseph + Pete,
users whose name starts with "David" route David's stores. The admin can change
anyone's scope in the app under Me > Team routes.

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
npx supabase secrets set MAPBOX_ACCESS_TOKEN=<mapbox token> ANTHROPIC_API_KEY=<anthropic key>
npx supabase functions deploy route-options
npx supabase functions deploy ai-writer
```

- `route-options` uses the Mapbox Directions API (`driving-traffic` profile) for live
  traffic and road classes. Without it the app falls back to clearly labelled
  offline estimates.
- `ai-writer` uses Claude (`claude-opus-5-5`) with server-side refusal fallback enabled.
  The prompt forbids em dashes and the output is cleaned again before it is returned.

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
