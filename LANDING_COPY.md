# Vibecoder.io — Landing page copy (v1)

Placeholders look like ⟪this⟫. Dynamic numbers (grants, credit prices) must render from the credit-config file — the same source of truth the billing engine reads — never hardcoded.

**Voice:** plain, warm, exact. Short sentences. Grade 7–8 reading level. We never pressure, never hide, and never celebrate trapping the user.

---

## 1. Nav

Product · Pricing · FAQ — then **Sign in** and the button **Start free**.

## 2. Hero

**Eyebrow:** Free as in yours.

**H1:** Type an idea. Get a real app. Keep the code.

**Sub:** Describe what you want in plain words. Vibecoder builds it, shows you every change before it happens, and hands you the code. No ads. No region locks. No surprises.

**CTA (primary):** Start building free
**CTA (secondary):** See how it works

**Under the buttons:** Free tier includes 30 credits every day. No credit card.

**Trust chips:** No ads, ever · One-click cancel · Export your code anytime

**Alternate headlines (A/B):**
- Build apps by describing them. Keep the code.
- The app builder that behaves: honest limits, yours to keep.

## 3. The honest alternative (contrast band)

**H2:** Free shouldn't cost your attention.

Some free builders show you ads, gate their best models by country, or make your code awkward to leave with. We took the other route: a paid Pro plan funds the free tier. So there are no ads to scroll past, no VPN games, and no fine print about where you live.

**Chips:** No ads · No region locks · No surprise model swaps

## 4. How it works

**H2:** From idea to running app, in the open.

1. **Describe it.** Tell Vibecoder what you want — "a booking site for my dog-grooming side hustle." It plans the screens and data first, so you can steer before any code is written.
2. **Approve the changes.** Every file change shows up as a side-by-side diff. Nothing touches your project until you say yes.
3. **Watch it run.** Your app runs live in the preview, at a link you can share. If something breaks, Vibecoder proposes a fix — and you approve that too.
4. **Keep it.** Download your code as a zip whenever you like. Host it anywhere. It's yours.

## 5. Trust features

**H2:** Built so you can trust what it builds.

- **Nothing changes without you.** Every edit arrives as a diff you review. Surprise is a bug, not a feature.
- **Made a mistake? Go back.** Every prompt saves a version. One click restores it, byte for byte.
- **Apps everyone can use.** Apps you build here follow WCAG 2.2 AA out of the box — keyboard friendly, screen-reader labeled, contrast checked. Most builders skip this. We don't.
- **Leave anytime. Take everything.** Export your code in one click. If we ever stop being useful, you lose nothing but us.

## 6. Inclusive free tier

**H2:** The free tier is a real product.

Most free tiers are demos with a paywall behind them. Ours is the whole product: every core feature, capable standard models, your code exportable. The daily credits are the only limit — and they refill while you sleep.

**Checklist:**
- 30 credits, every day — refills at 00:00 UTC, the same moment for the whole planet
- All core features. Nothing crippled.
- No credit card, ever
- No ads, ever
- Your code, exportable anytime

**Honest limits box:** When you run out of credits, we stop and tell you plainly. Nothing gets charged — we don't even have your card. Credits refill at 00:00 UTC, or upgrade if 30 a day feels tight.

## 7. Pricing

**H2:** Simple pricing. Published rules.

Two plans. Every credit price is listed below — the same table our system uses. If prices ever change, we announce it first and protect projects already built.

| | **Free** | **Pro** |
|---|---|---|
| Price | $0 forever | $20/month — or $16/month, billed yearly ($192 once a year) |
| Daily credits | 30 | 300 |
| Models | Standard (capable, honest) | Standard + frontier (2× credit cost) |
| Features | Every core feature | Everything in Free + priority generation queue |
| Code export | Yes | Yes |
| Credit card | Never asked | Required, cancel in one click |

**CTA (Free):** Start on Free — **CTA (Pro):** Upgrade to Pro

**Under both cards:** Cancel anytime, in one click, from your account. You keep Pro until the end of the period you paid for. Your projects stay; your daily grant returns to 30.

**Published credit prices:**

| Action | Credits |
|---|---|
| Small edit | 1 |
| Generate a feature | 5 |
| Plan a new app | 15 |
| Auto-fix preview errors | 2 |
| Frontier models | 2× listed cost |

We show the price before you spend. Always.

## 8. FAQ

**Is it really free?**
Yes. 30 credits a day, every day, with every core feature. Pro exists for people who need more; the free tier is not a trial.

**What are credits?**
The unit every action costs: a small edit is 1, generating a feature is 5. Your balance refills daily at 00:00 UTC and doesn't roll over — we'd rather you build daily than hoard.

**What happens when I run out mid-project?**
Nothing dramatic. We stop, tell you how much the next step costs, and wait. Tomorrow your credits are back, exactly where you left off.

**Do I own the code?**
Yes. Export it as a zip anytime and use it commercially, modify it, host it wherever. Ownership doesn't expire if you cancel.

**How do I cancel?**
Account → Billing → Cancel. One click, no chat with support, no retention offers. You keep Pro until the end of what you paid for.

**Do you show ads?**
Never, in any plan. Pro subscriptions fund the free tier. That's the whole business model, and it's the reason we don't need your attention or your data.

**Do you work in my country?**
Yes — everywhere, no VPN needed. Credits reset at 00:00 UTC for everyone on Earth, and the same models are available in every country.

**Is my code private?**
Your code runs your app and nothing else. We don't sell data, don't train on it, and don't run an ad business that would want it. The plain-language privacy policy is linked in the footer.

## 9. Final CTA

**H2:** Your next app is a sentence away.

**CTA:** Start building free
**Under:** 30 credits a day. No card. No ads. The code is yours.

## 10. Footer

Columns: Product (Pricing, Changelog, Status) · Company (About, Blog, Contact) · Legal (Privacy in plain language, Terms, Accessibility statement).
Closing line: **Free as in yours.** · We don't sell your data or show ads. Your code trains nothing.

## 11. Microcopy kit (product surfaces)

- **Spend preview chip:** "This will cost 5 credits. You have 23."
- **80% warning:** "You've used 24 of today's 30 credits. Just so you know."
- **Out of credits:** "You've used today's 30 credits. They refill at 00:00 UTC. Upgrade for 300 a day, or pick this up tomorrow." Buttons: "Upgrade to Pro" / "I'll come back tomorrow."
- **Revert button:** "Undo this change" — never "Are you sure?! This cannot be undone!" when it can.
- **Model fallback:** "The frontier model is busy right now. Want the standard model instead? It costs fewer credits."
- **Delete account:** "Delete my account and data. We'll email you a zip of your code first; deletion finishes in 30 days and can be canceled until then."

## 12. No-dark-patterns checklist (for implementation)

- No countdown timers, fake scarcity, or "only X left."
- No pre-checked add-ons; every opt-in is explicit.
- Cancel flow: same number of clicks as signup.
- No confirm-shaming button labels ("No thanks, I hate saving money" is banned).
- Button labels describe what happens ("Start free," not "Claim my reward").
- The pricing table on the page is generated from the same config the billing engine reads — page and engine can't disagree.
- Unused-credit expiry is stated everywhere credits are shown, not buried.

## 13. Implementation notes

- Heading order H1→H2→H3, one H1. Chips are lists, not decorative divs.
- All numbers (30, 300, prices, credit costs) come from credit config at build/render time.
- Suggested SEO title: "Vibecoder.io — Build real apps by describing them. Free, no ads, your code."
- Contrast ≥ 4.5:1 for all text; every icon-only control has an accessible name; respect `prefers-reduced-motion` for any hero animation.
