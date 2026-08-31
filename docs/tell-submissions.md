# Tell submissions

Tell is a durable, asynchronous supervision flow. Sending a Tell never means
that the browser must remain open while AI runs.

## Source-first lifecycle

1. The authenticated submission function creates the source entry.
2. Original text and photos are stored before the entry is queued.
3. The client receives the secured entry id and may leave immediately.
4. `process-tell-queue` claims the durable queue message and asks the Tell
   processor to interpret the secured source.
5. The processor stores each suggestion as a child of the Tell entry and opens
   one Activity / Needs Attention item for the parent submission.
6. Review can approve suggestions individually, approve all pending
   suggestions, or dismiss a suggestion.
7. The attention item remains open until no pending suggestions remain.

## User-visible states

- `uploading`: the device is still securing the source; leaving is guarded.
- `queued` / `processing`: the source is secured and the user may leave.
- `ready_review`: one or more grouped suggestions are awaiting review.
- `needs_info`: the Tell needs a job or clearer source information.
- `approved`: every suggestion was approved or dismissed and at least one
  permanent record was created.
- `dismissed`: review finished without creating a permanent record.
- `failed`: processing exhausted its retries; the source remains available.
- `undone`: approved records were safely reversed without deleting the source.

## Integrity boundaries

- AI writes proposal rows, never permanent job truth.
- Authenticated database capabilities create approved notes, shopping needs,
  and hours.
- Proposal ids make partial approvals idempotent.
- A Tell produces one attention item regardless of its proposal count.
- Source attachments remain stored even when approved records are undone.
- Approved records keep the Tell entry id in their activity/source metadata.

The queue reuses the existing `receipt_worker_secret` vault/Edge Function
secret, with optional support for a dedicated `TELL_WORKER_SECRET` later.

Tell uses its own `OPENAI_COMMAND_MODEL` Edge Function secret instead of
inheriting the receipt parser's model. The production baseline is
`gpt-4o-mini`; the code uses the same value if the secret is absent. Keeping
the models separate prevents a receipt-model change from silently breaking
the Tell processing queue.
