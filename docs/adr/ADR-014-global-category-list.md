# ADR-014: Categories are a global controlled list created by migration

- Status: Accepted
- Date: 2026-10-05

## Context

Category totals, budgets and trends are only meaningful when the same things are classified the same way over time. A model allowed to name categories freely would produce "Groceries", "Supermarket" and "Food shopping" for the same shop, and every aggregate would fragment.

[ADR-006](ADR-006-household-and-members.md) anticipated global defaults with household-owned custom categories later. A category that might belong to a household raises a question the database cannot answer with an ordinary foreign key: whether the category on a transaction belongs to that transaction's household.

## Decision

Categories are global reference data with no household. There is one tree, shared by every household.

- Each category has a name, an optional parent and a kind, `EXPENSE` or `INCOME`.
- The default tree is inserted by a migration, so every database built from the migrations has it. It is not part of the development seed.
- Nothing in the application creates a category. Extraction maps to an existing category or leaves the transaction uncategorised, and a transaction naming an unknown category is rejected.
- A transaction's category must match its type: an expense cannot be filed under an income category.

Custom categories remain a planned extension. They would arrive as a nullable `household_id` on `categories` together with a rule tying a household's transactions to global or own categories.

## Consequences

- A category on a transaction can never belong to another household, because categories belong to none.
- Totals are comparable across months, and in principle across households.
- A household cannot add or rename a category yet. Anything that does not fit goes to `Other` or stays uncategorised.
- Changing the default tree is a migration, reviewed like any other schema change.
- Removing or merging a category that transactions refer to needs a data migration.
