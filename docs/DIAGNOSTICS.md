# Operational diagnostics

TurnRight keeps support evidence inside the application and existing API/worker
logs. It does not require a hosted monitoring account or send browser diagnostics
to an external endpoint.

## Browser recovery

The recovery screen offers an explicit diagnostic download. The browser retains
at most 50 events in memory, combines repeated identical events within five
seconds, and caps each occurrence count. Reloading clears this evidence.

Events contain an allowlisted failure category, timestamp, occurrence count and,
when available, HTTP status, failure reason and validated API request reference.
Error objects, messages, stacks, request/response bodies, URLs, credentials,
photographs, coordinates and location history are not collected. An operator
should request the small diagnostic file only when needed to investigate a
reported failure; the user controls whether to share it.

## Follow a request or background job

1. Match the browser's request reference to the API's `X-Request-Id` response
   header and structured request log. Server failures also return the reference
   in their error response.
2. For a successful import, GIS job start or source-review operation, the API
   log includes the job's validated UUID alongside that request reference.
3. Match `jobId` to the worker's completion/failure event and the private job
   record shown in Activity. The private record retains actionable processing
   details and normal campus access controls. Claim/run tokens are never used
   as diagnostic correlation IDs.

A request that fails before creating a job has no job identity. Standalone
source checks without an import identity retain their existing private check
receipt and workflow context; diagnostics do not invent a correlation.

API/worker events allowlist event name, timestamp, duration, HTTP status,
request/job identifiers, validated action names, known worker and dependency categories. The
structured log envelope discards arbitrary payload fields. Worker logs do not
print upstream exceptions or uploaded contents. Local worker output stays in
the ignored `.local-runtime/jobs` directory; API and hosted worker logs use the
deployment provider's existing access controls and retention settings.

## Investigation and verification

Use `/api/health` to check configured runtime health, then inspect the matching
request and private job receipt. An interrupted or uncertain job remains subject
to the existing retry/cancellation and idempotency controls. A diagnostic event
does not authorize accepting source data, publishing a release or bypassing
independent review.

Client tests check bounded retention and rejection of sensitive input. Server
tests check request-to-job correlation and the metadata allowlist. Python tests
check worker UUID validation, status and duration. The local-stack acceptance
checks exercise actual API and worker boundaries; browser fixtures separately
exercise recovery and user-facing failures.
