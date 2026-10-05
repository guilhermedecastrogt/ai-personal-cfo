# ADR-027: Each household has a display language, and canonical names stay in English

- Status: Accepted
- Date: 2026-10-05

## Context

The first household to use the system speaks Portuguese. Every text the system produces on its own was in English: category names, dashboard labels, alerts, findings, fallback replies and month names. The model already replied in the member's language, so a WhatsApp conversation mixed a Portuguese reply with English categories, and the dashboard was entirely in English.

Categories are a global list created by a migration ([ADR-014](ADR-014-global-category-list.md)). Their names are also the keys the model must return when it interprets a message, and dozens of tests and seed files refer to them by name.

## Decision

**A household has a `locale`**, `en` or `pt-BR`, stored on the `households` row with `en` as the default. An operator sets it with `npm run households:set-locale`.

**The locale travels with the request.** It is resolved with the household, by the WhatsApp identity resolver and by the session lookup, and carried in the request context and in the name directory that every text producer already receives. The proactive layer reads it from the household it evaluates.

**Canonical names stay in the database.** Categories keep their English names as stable identifiers. A label table maps each canonical name to its display name for a locale. The household directory applies it when it loads, so everything downstream sees labels: the dashboard, reply facts, and the category list offered to the model. The model therefore receives and returns labels, and the label is matched back to the category within the same localised list. Labels are unique within a locale, which a test checks.

**Every deterministic text has one wording per locale.** That covers:

- signal titles and details, findings and the deterministic review;
- proactive notification titles;
- fallback and fixed WhatsApp replies;
- month names;
- the fallback names Unknown, Uncategorised and Joint.

Money and percentages are formatted for the locale: `€ 1.826,98` and `18,76%` in pt-BR. The figure check on model replies already treats a comma and a full stop alike as decimal separators.

**The model is told the household language** for the monthly review when no message was given. Replies otherwise follow the language of the member's message, in Brazilian Portuguese when it is Portuguese.

## Alternatives considered

- **Renaming categories to Portuguese in a migration.** Rejected. It would impose one language on every installation of an open-source project, rewrite the seed and break every place that names a category, for a display concern.
- **Translating at the edges only, in the web app.** Rejected. WhatsApp replies and notifications are produced by the API, and the model's category list has to be in the household's language for its answers to read naturally.

## Consequences

- A household that never sets a locale behaves exactly as before.
- Adding a language means adding one wording per producer and a label per category; the type system requires every key.
- Notifications already stored keep the language they were written in.
- A category added later without a label is shown under its canonical name.
- Model replies still follow the member's message, so a member writing in English to a Portuguese household gets an English reply with Portuguese category names.
