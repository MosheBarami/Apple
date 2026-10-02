-- 0012 — THE DATABASE AND THE PRODUCT DISAGREED ABOUT WHICH PLANS EXIST.
--
-- `public.profiles.plan` carried `CHECK (plan = ANY (ARRAY['free', 'pro']))` — the plan model from
-- an older shape of this product. `PLAN_LIMITS` in packages/shared declares free, builder, studio
-- and enterprise, and has for some time. Nothing compared the two, so nothing reported it.
--
-- WHAT THAT COST. Every account in the database is on `free`, including the owner's, because no
-- other value the product knows about could be written: an UPDATE to 'builder' or 'enterprise' was
-- refused by the constraint. The product's entire paid tier was unreachable by assignment as well
-- as by checkout — and since checkout is closed too (buildCheckoutRequest hardcodes
-- mode: 'subscription' against a Stripe account with charges_enabled false), nobody had ever tried
-- the other path and found it shut.
--
-- The owner noticed the way anyone notices: he asked why he was on Free, on his own product, as an
-- admin, having never been offered a way off it.
--
-- AND 'pro' IS WHERE THE DOCS GOT IT. `/docs/credits-and-limits` published "Pro (when it ships)
-- queues ahead" and a guard now forbids the word as an invented tier. It was not invented — it is
-- what the SCHEMA still said, and the documentation was the only place the old model survived in
-- writing. Removing it from the prose without removing it from the column would have left the
-- disagreement in the one place nobody reads.
--
-- 'pro' IS DROPPED RATHER THAN KEPT AS AN ALIAS. No row holds it (checked before this ran), the
-- product has no code path that would produce it, and a value a constraint allows but nothing
-- writes is the next person's afternoon.

alter table public.profiles drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan = any (array['free'::text, 'builder'::text, 'studio'::text, 'enterprise'::text]));

comment on column public.profiles.plan is
  'One of PLAN_LIMITS in packages/shared/src/index.ts. The constraint above is the second copy of that list; if you add a plan, add it in both places in the same change.';
