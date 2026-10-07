# ADR-034: New members are welcomed on WhatsApp with an approved template

- Status: Accepted
- Refines: [ADR-033](ADR-033-platform-administration.md)
- Date: 2026-10-07

## Context

When a platform admin creates a household or adds a person, the person should hear from the assistant right away: who it is and what it does.

WhatsApp accepts a free-form message from a business only within 24 hours of the person's last message. Someone just registered has never written, so a free-form welcome would be refused. A conversation started by the business must use a message template approved by Meta.

## Decision

**The welcome is an approved template.** The template is registered in Kapso by an operator, in Portuguese (Brazil) and English under one name. `WHATSAPP_WELCOME_TEMPLATE` names it. Without that variable, welcomes are off and nothing is sent.

**Its only variable is the person's first name.** The text is fixed and reviewed by Meta, so the model takes no part and no figure is ever sent. The language follows the household's language.

**It is sent when a number is registered.** Creating a household and adding a person accept an optional WhatsApp number. The welcome goes out as soon as a number is registered, whether with the person or later, and an admin can send it again. Every welcome sent is recorded in `platform_actions`.

**A refused welcome does not undo the registration.** The number stays saved, and the dashboard says the welcome failed and offers to send it again.

## Consequences

- A new person receives a welcome on WhatsApp without having written first.
- Each welcome is a conversation started by the business, which Meta charges for according to the template's category.
- When the person replies, the assistant answers as it does to anyone's first message, which includes its own introduction. Both greetings are short, and nothing is recorded twice.
- Changing the text means approving a new template in Meta and, if the name changes, updating the variable.
