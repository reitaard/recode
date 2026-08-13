# V2-D configured-runtime attribution

Date: 2026-08-02  
Platform: Windows x64, Node 26.5.0  
Cache declaration: warm child-process runs with uncontrolled OS cache

No cache was cleared, no provider/model generation request was made, and no configured feature was disabled.

## Attribution

Three configured and three fresh isolated RPC runs emitted opt-in memory checkpoints through the existing startup-probe stream. At `settings-ready`, configured and isolated RSS differed by only 2.2 MB. At `package-runtime-ready`, the difference was 4.3 MB. After extension activation, the configured difference was 142.4 MB RSS, 85.5 MB used heap, 17.7 MB external memory and 9.8 MB array buffers.

Package metadata resolution is therefore not a material private-memory optimization target. Extension module activation is the first justified boundary. Instantiated extension runtimes, handlers, credentials, transcripts and workspace/session state remain isolated and are not candidates for sharing.

## First bounded optimization

The controlled private Browser package created `PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)` during module import even when the browser was stopped and ad blocking was disabled. The candidate makes that promise lazy and creates it only when a block-enabled page needs it.

Matched three-run configured RPC startup remained inside the 10% guard: the average changed from 3,328 ms to 3,460 ms (+4.0%), consistent with uncontrolled run variance rather than a supported speed claim. At `extensions-ready`, average RSS fell by 23.0 MB and external memory fell by 10.8 MB.

A separate three-run held-RPC sample reported:

| Browser blocker | Private working-set average | Median |
|---|---:|---:|
| Eager import-time initialization | 307,904,512 bytes | 260,120,576 bytes |
| Lazy block-enabled initialization | 232,116,224 bytes | 229,179,392 bytes |
| Delta | -75,788,288 bytes | -30,941,184 bytes |

The eager samples were highly variable because asynchronous filter retrieval/allocation continued after startup. These are uncontrolled-cache Windows private-working-set results, not cold-start or Linux PSS claims.

Machine-readable values are in `attribution-and-lazy-blocker.json`.
