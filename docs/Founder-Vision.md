# Founder Vision

This document is different from everything else in `docs/`. The Engineering Bible tells you how
Novara works. This tells you why it should exist at all, and what should survive no matter how
many times the code underneath it gets rewritten.

## An honest note on where this comes from

No separate mission statement, founder letter, or values document exists anywhere in this
repository. Everything below is drawn from two kinds of real evidence: the product's own
user-facing words (the homepage copy, the in-app messaging, the error messages users actually see),
and the design choices visible again and again across independent parts of the codebase — choices
consistent enough, made by the same hands enough times, that they read as convictions rather than
accidents. Nothing here is invented sentiment. Where this document interprets rather than quotes,
it says so.

## The problem, in the founder's own words

Novara's homepage says it plainly:

> "Never let an important relationship go cold."

That's the whole thesis. Not "manage your contacts" — a filing-cabinet framing this product
deliberately avoids. The word chosen is *cold*, a temperature, a thing that happens to a
relationship through neglect, not through any single decision. The product exists because
ambitious people meet valuable connections constantly and lose almost all of them to nothing more
dramatic than time and busyness. Novara's job is to notice before you would, and to say something
before it's too late.

## Who this is for

The homepage is specific: "your personal relationship CRM for **ambitious professionals**." Not
everyone with a phone full of contacts — people who are *building* something with their network:
a career move, a new industry, a fundraise, a job search. The product reasons about this directly
— it asks users what they're trying to achieve (`career_statement`, `career_goals`) and quietly
reweights who matters most based on the answer. That's a real, structural bet about the target
user: someone who has a direction, not just a Rolodex.

## What should never change, regardless of what gets rebuilt

### 1. The algorithm nudges. It never overrides a human.

This is the single most consistent value found anywhere in the codebase, expressed the same way in
three independent places: a contact's priority score, once a user manually sets it
(`priorityOverride`), is never silently recalculated again — the code checks this first, before
anything else, every time. A feature request or bug report a user types is never altered,
categorized, or filtered by the system before a human reads it. A career statement a user writes
is only ever used to *suggest* priority, capped at moving a contact one level up or down, never to
override an explicit choice. **If Novara is rebuilt from scratch, this principle should be written
down explicitly and treated as non-negotiable, not rediscovered by accident the way it currently
exists only as a pattern across files.** The product's job is to notice and suggest. The user's
job is to decide. That boundary should never blur, no matter how much smarter the underlying
algorithm gets.

### 2. A broken integration should never cost a user their data or their trust.

Every third-party integration in this codebase — push notifications, feedback emails, news
lookups — is built to fail quietly and never take the core product down with it. A missing API key
degrades a feature. It never crashes a request, never loses a submission, never blocks a user from
doing the thing they came to do. This is worth preserving as a hard rule for anything added later:
optional should mean optional, all the way down.

### 3. Diagnostic data collection has a stated, honored limit.

The feedback feature's own code comments go out of their way to say, more than once, what is *not*
collected: no passwords, no tokens, no cookies, no authorization headers. Only the page you were on,
your browser, and the app version — and only when you're reporting a bug, never otherwise. Someone
who built this cared enough to write that constraint down in the code itself, not just follow it by
default. That's worth protecting as the product grows and the temptation to collect "just a little
more" telemetry inevitably shows up.

### 4. The product should feel personal, not corporate.

The visual and interaction design — a mobile-first, installable app that opens full-screen like a
native tool, warm rounded cards, a serif wordmark, copy like "Never let an important relationship go
cold" instead of anything resembling enterprise CRM language — is a consistent aesthetic choice
across every page reviewed. This is a tool for one person managing their own relationships, not a
team dashboard, and it should keep feeling like the former even if collaborative or team features
are ever added on top.

### 5. Being honest about being unfinished is better than pretending otherwise.

The 25-contact limit's own user-facing copy says "for the beta" and "more spots are coming soon" —
not a euphemism, an honest signal to the user that this is early and growing. The product doesn't
pretend to be bigger or more finished than it is. That candor, extended to users, is worth keeping
even after "beta" is no longer true.

## What Novara intentionally is not, and should stay that way

- **Not a team tool.** Every table, every query, every design choice in this codebase assumes one
  person managing their own relationships. If a team/shared-contacts feature is ever built, it
  should be additive, not a replacement for the deeply personal, single-owner feel of the current
  product.
- **Not a messaging platform.** Novara helps you remember to reach out. It has never tried to be
  the place you actually talk to people — LinkedIn, email, and text already do that, and duplicating
  them would dilute what makes this useful.
- **Not a surveillance tool dressed up as a productivity app.** See principle 3, above. This is
  worth repeating because it's the easiest principle to erode gradually, one "just this one extra
  field" decision at a time.

## What future engineers should protect, in one sentence each

- Protect the moment a user overrides the algorithm — that decision is sacred, not a suggestion the
  system can second-guess later.
- Protect the feeling of opening the app and seeing exactly who needs you today, not a wall of
  everyone you've ever met.
- Protect the honesty in the product's voice — "for the beta," "we read every submission," "no
  secrets/tokens/cookies" — even as the product matures past needing to say so.
- Protect the boundary between "this is a tool that helps me remember people" and "this is a tool
  that tracks me."

## A closing thought

This document was written without ever having spoken to Novara's founder — it was reconstructed
entirely from what the product says about itself and what its code quietly reveals about the values
of whoever built it. That a coherent, consistent philosophy could be recovered this way at all is
itself a signal worth naming: whoever wrote this codebase built with intention, even in the places
where the engineering has real gaps (documented plainly in the Engineering Bible). A future team
inheriting Novara should feel free to rebuild every line of code. They should think twice before
rebuilding the judgment behind it.
