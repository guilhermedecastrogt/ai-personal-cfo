# ADR-018: Media is fetched through an opaque reference and held only in a temporary directory

- Status: Accepted
- Date: 2026-10-05

## Context

Members send images of receipts and bank screens. Reading one requires its bytes to exist somewhere between the messaging provider and the model. The project has already decided that images are not kept.

Three things needed deciding: how the image layer obtains an image without being tied to a messaging provider, where the bytes live while they are in use, and how to be sure they are gone afterwards. Because the bytes come from outside and a model reads text inside them, there is also the question of what could cause the system to fetch something it should not.

## Decision

**An opaque reference, not a URL.** The image layer receives a `MediaReference`, a provider name and a provider-issued identifier. It passes that to a `MediaSource`, whose single method downloads the referenced media to a path it is given. The image layer has no HTTP client. Only a `MediaSource` implementation performs network access, and only against its own provider.

**A scoped temporary directory.** `TemporaryMediaStore.withImage` creates a private directory with a random name, has the source download into it, validates the file, hands the bytes to a callback and deletes the directory in a `finally` block. The file cannot outlive the callback. On startup the store deletes its entire root, which removes anything a crash left behind.

**Validation by content.** Size, type and dimensions are checked before the bytes are handed over. The type is detected from the file's leading bytes. Declared content types and file names are ignored.

**A dedicated provider operation.** `AIProvider.extractTransactionFromImage` takes the image and returns a reading. It reuses the transaction candidate schema from text extraction, so both inputs share every later validation step.

**One transaction per image.** A reading reports whether the image holds one transaction, several, none, or is unreadable. Only the first is recorded.

## Alternatives considered

**Passing a URL to the image layer** is what most messaging APIs offer directly. It would put an HTTP fetch of an externally supplied address in the middle of a pipeline that processes untrusted text, which is the precondition for server-side request forgery. An opaque identifier resolved by provider-specific code removes the possibility.

**Keeping the bytes in memory only** would avoid the file system. A file in a scoped directory lets a source stream a large download without holding it in memory, gives one place to enforce size before reading, and makes "is anything left behind" a question that can be answered by listing a directory, which the tests do.

**An image-processing library** for resizing or re-encoding would add a native dependency that has to be built for ARM64, for no present benefit. The accepted formats are sent as they are.

**Recording every row of a statement** would be useful and is easy to get wrong: duplicates against transactions already recorded, pending versus settled entries, running balances mistaken for amounts. Declining clearly is better than guessing.

## Consequences

- No image exists on disk after a request finishes, whatever happened during it, and none exists after a restart.
- A messaging provider is added by writing one `MediaSource`. The image layer does not change.
- A `MediaSource` implementation is trusted to fetch only from its provider. That is where a review of network access has to look.
- Files are limited to JPEG, PNG and WebP up to 10 MB. PDFs and statements are not supported.
- Header parsing for three formats is maintained in this codebase. It is small, has no dependencies and is covered by tests.
- A member who sends a statement has to send transactions one at a time until batch extraction exists.
