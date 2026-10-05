# Recurring expenses

A household's regular charges, such as rent, subscriptions and insurance, are detected from its transactions. Nothing is entered by hand and nothing is stored: every answer about recurring expenses is recomputed from the ledger.

This layer detects, tracks, forecasts and explains. It does not cancel subscriptions, make payments, or change any transaction.

## Where it lives

| Concern                                       | Code                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| Detection, status, price changes, payers      | `finance/domain/recurring/recurring-expense-detector.ts` |
| Commitments, totals, upcoming, changes        | `finance/domain/recurring/recurring-summary.ts`          |
| Thresholds                                    | `finance/domain/finance-policy.ts`, section `recurring`  |
| Loading the ledger per household and currency | `FinanceService`                                         |
| Insights raised from patterns                 | `finance/domain/insights/insight-engine.ts`              |

Both domain files are pure functions over ledger entries. They import nothing but money arithmetic, dates and the policy.

`FinanceService` exposes four methods, all taking the household first:

| Method                 | Returns                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `recurringExpenses`    | Detected patterns for one currency, with the evidence behind each         |
| `recurringCommitments` | One summary per currency: active commitments, totals, stopped commitments |
| `upcomingRecurring`    | Per currency, what is expected in the next 14 days and its total          |
| `recurringChanges`     | Per currency, new commitments, price changes and stopped commitments      |

The dashboard, the conversation layer, the monthly review and proactive notifications all read from these. None of them detects or totals anything itself.

## Detection

Expenses from the last 1 200 days are grouped by merchant. Names are compared case-insensitively with whitespace collapsed. Expenses without a merchant, income and transfers are ignored.

For each merchant the detector looks for the most recent unbroken run of charges that fits one cadence:

| Cadence   | Gap between charges | Occurrences per year | Grace after the expected date |
| --------- | ------------------- | -------------------- | ----------------------------- |
| Weekly    | 7 ± 1 days          | 52                   | 3 days                        |
| Monthly   | 30 ± 3 days         | 12                   | 10 days                       |
| Quarterly | 91 ± 4 days         | 4                    | 20 days                       |
| Yearly    | 365 ± 5 days        | 1                    | 45 days                       |

Walking back from the latest charge:

- A gap that fits the cadence extends the run.
- A gap that is too long ends the run. A subscription that paused and resumed is detected from where it resumed.
- A gap that is too short rejects the merchant for that cadence. A subscription does not charge twice in one cycle, so an extra purchase means the merchant is a shop.

A run is reported only when it has at least three charges and its amounts pass the rule below. One or two charges are never called recurring, whatever they look like.

The lookback is long enough for three yearly charges to stay in view between renewals.

## Amounts

Charges in a run are grouped into price levels, again walking back from the latest charge.

| A charge compared with the price after it | Treated as                              |
| ----------------------------------------- | --------------------------------------- |
| Within 10%                                | Normal variation, the same price        |
| Between 10% and 50% away                  | An earlier price, if the later one held |
| More than 50% away                        | Unrelated. The run starts after it      |

"Held" means the later price was charged at least twice, or is the current price. A price that was charged once and then abandoned ends the run there, like a charge that is too far away. This lets `15.99, 15.99, 17.99` be one subscription whose price has just risen, while a merchant charged `30, 42, 35` is rejected because no price ever repeats.

The typical amount is the lower median of the charges at the current price.

## Price changes

When a run has an earlier price level, the pattern carries a price change:

| Field                 | Meaning                                           |
| --------------------- | ------------------------------------------------- |
| `previousAmountMinor` | Lower median of the charges at the previous price |
| `currentAmountMinor`  | The typical amount                                |
| `differenceMinor`     | Current minus previous. Negative for a decrease   |
| `changeBasisPoints`   | The difference as a share of the previous amount  |
| `effectiveDate`       | The date of the first charge at the current price |
| `direction`           | `INCREASE` or `DECREASE`                          |

The effective date is always the date of a real transaction. A change is reported for 90 days from that date and then dropped, so "which subscriptions increased" means recently.

A variation inside the 10% tolerance is never reported as a price change.

## Status

| Status    | Condition                                                                     |
| --------- | ----------------------------------------------------------------------------- |
| `ACTIVE`  | Today is no later than the next expected date plus the cadence's grace period |
| `STOPPED` | The grace period has passed with no charge                                    |

The next expected date is the last charge plus the cadence's interval. For a stopped commitment that date is reported as the date it was missed, and no future date is given.

A stopped commitment stays visible for 120 days after its grace period ended, then drops out.

The system says a payment "appears to have stopped". It does not say it was cancelled and does not guess why: a missed charge, a changed merchant name and a cancellation look the same in the ledger.

## New commitments

A commitment is established on the date of its third charge. It is flagged as new for 90 days from that date.

## Commitment totals

| Figure             | Rule                                                 |
| ------------------ | ---------------------------------------------------- |
| Annual equivalent  | Typical amount × occurrences per year                |
| Monthly equivalent | Annual equivalent ÷ 12, rounded half away from zero  |
| Household monthly  | Sum of the monthly equivalents of active commitments |
| Household annual   | Sum of the annual equivalents of active commitments  |

So 20.00 monthly is 240.00 a year, 12.00 weekly is 624.00 a year and 52.00 a month, and 100.00 yearly is 8.33 a month.

All arithmetic is on integer minor units with exact integers. Because each monthly equivalent is rounded on its own, the household's monthly total multiplied by twelve can differ from its annual total by a few minor units. The annual total is the exact one.

Stopped commitments are excluded from both totals.

## Currencies

Detection runs once per currency the household holds. Each currency has its own summary with its own totals. Amounts in different currencies are never added and never converted, and summarising patterns of mixed currencies throws.

## Members

A recurring expense belongs to the household. Each commitment lists who has paid it and how many times, most frequent first, for any number of members. This is attribution only: every member sees every commitment.

## Questions

| Intent               | Example                                                | Engine method          |
| -------------------- | ------------------------------------------------------ | ---------------------- |
| `RECURRING_EXPENSES` | "What subscriptions do we have?", "How much per year?" | `recurringCommitments` |
| `RECURRING_UPCOMING` | "What recurring payments are coming up?"               | `upcomingRecurring`    |
| `RECURRING_CHANGES`  | "Which subscriptions increased?", "Did any stop?"      | `recurringChanges`     |

The model chooses the intent. The application calls the method and hands the model the result with names in place of identifiers and amounts already formatted. The reply passes the same figure check as every other reply, and falls back to a plain rendering of the facts if the model fails or states a number that is not in them.

## Dashboard

The Recurring page shows, per currency: the monthly and annual commitment, what is expected in the next 14 days, each active commitment with its cadence, typical amount, annual cost, last and next dates, payers, a "New" mark and any price change, and the commitments that appear to have stopped. Active commitments can be sorted by cost, next date or name; the order is applied by the API.

`GET /dashboard/recurring?sort=cost|next|name` serves it. It reflects today and is not tied to the selected month.

## Proactive notifications

Recurring events go through the proactive layer described in [proactive-cfo.md](proactive-cfo.md). There is no second notification path.

| Event                       | Raised when                                       | Severity | Key                                                              |
| --------------------------- | ------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `NEW_RECURRING_EXPENSE`     | A commitment is newly established                 | `MEDIUM` | `NEW_RECURRING_EXPENSE:<merchant>:<cadence>:<first charge>`      |
| `RECURRING_PRICE_INCREASE`  | The current price is higher than the previous one | `MEDIUM` | `RECURRING_PRICE_INCREASE:<merchant>:<cadence>:<effective date>` |
| `RECURRING_EXPENSE_STOPPED` | A commitment appears to have stopped              | `MEDIUM` | `RECURRING_EXPENSE_STOPPED:<merchant>:<cadence>:<last charge>`   |
| `RECURRING_EXPENSE_DUE`     | A charge is expected within 3 days                | `LOW`    | `RECURRING_DUE:<merchant>:<expected date>`                       |
| `RECURRING_EXPENSE`         | An established commitment exists                  | `INFO`   | `RECURRING_EXPENSE:<merchant>:<cadence>`                         |

The first three are sent once each. Their keys are built from transaction dates, so re-evaluating never produces a new event, and a second price increase is a different event from the first. The last two are recorded for the dashboard and not sent. Quiet hours, the daily limit and delivery retries apply as to any other notification.

A price decrease is shown on the dashboard and in answers but raises no notification.

## Deterministic and AI responsibilities

| Decided by the finance engine                        | Left to the model                        |
| ---------------------------------------------------- | ---------------------------------------- |
| Whether an expense is recurring, and its cadence     | Which recurring intent a question is     |
| Typical amount, monthly and annual equivalents       | How to phrase the answer                 |
| Whether a price changed, by how much, and since when | How to phrase a notification, if enabled |
| Whether a commitment appears to have stopped         |                                          |
| What is new, what is due, who paid                   |                                          |
| Severity and whether to notify                       |                                          |

Everything works with the model unavailable.

## The `recurring_expenses` table

The table from the original schema is still not written to. Detected commitments are derived from transactions on every read, so there is no second copy to drift from the ledger. The table is kept for commitments a household confirms or dismisses by hand, which is not implemented. See [ADR-024](adr/ADR-024-derived-recurring-expenses.md).

## Limitations

- A merchant must be written the same way each time, apart from case and spacing. "Netflix" and "Netflix.com" are two merchants.
- One charge at a different amount in the middle of a run, such as a month with an add-on, interrupts the commitment. It is recognised again, and flagged as new, after three regular charges.
- A price change of more than 50% is treated as a different expense: the merchant stops being recognised until three charges exist at the new price, and no price change is reported.
- Monthly means 30 ± 3 days. A charge that drifts further, for example because of bank holidays around a month end, breaks the run.
- A commitment charged from two cadences at once, such as a monthly plan plus a yearly fee at the same merchant, is not recognised.
- "Stopped" cannot be told apart from a late payment beyond the grace period or a renamed merchant.
- New commitments, price changes and stopped commitments are reported for a limited time, not kept as history.
- Questions about recurring expenses always reflect today. "What subscriptions did we have in March?" is not supported in conversation.
- A regular large charge can also be flagged by the anomaly detector when it shares a category with much smaller expenses.
