# V2-C Recode baseline — 2026-08-02

## Scope

Local Windows x64 Node 26.5.0 baseline. All runs use clean committed source, make no provider/model request, and classify cache state as **uncontrolled**. These results are not destructive cold-cache claims.

## Startup medians

| Endpoint | State | Median | Min–max |
|---|---|---:|---:|
| RPC `get_state` | configured | 3,446.5 ms | 3,261.1–3,675.1 ms |
| TUI input echo | configured | 3,307.3 ms | 3,242.6–3,377.1 ms |
| RPC `get_state` | isolated | 1,450.3 ms | 1,435.1–1,463.2 ms |
| TUI input echo | isolated | 1,500.6 ms | 1,481.5–1,578.1 ms |

Configured RPC extension loading had a 1,988 ms median. Largest measured contributors were Browser/OpenClaw entry (720 ms), Open Provider factory (654 ms), web-access module (439 ms), and MCP adapter module (192 ms). These values are measurements, not yet an optimization decision.

Startup artifacts use commit `79b9855c6e9f6203af512c0d41c554b0f28d61d7`, version `0.81.5`, and report a clean working tree.

## Installed Recode 0.81.6 startup checkpoint

Artifact: `recode-0.81.6-installed/summary.json`, exact installed Windows x64 binary from commit `6ef78822166cd15c3400bff30cb96c469ce663d3`. One warmup plus five measured runs per endpoint; cache state remains uncontrolled and no provider/model request was made.

| Endpoint | State | Median | Min–max |
|---|---|---:|---:|
| TUI input echo | configured | 4,035.8 ms | 3,897.5–4,264.0 ms |
| RPC `get_state` | configured | 3,889.8 ms | 3,849.4–4,196.4 ms |
| TUI input echo | isolated | 778.3 ms | 753.6–1,032.0 ms |
| RPC `get_state` | isolated | 891.0 ms | 762.0–1,099.4 ms |

These compiled-binary results are not directly ratio-compared with the earlier Node-source results because runtime and artifact topology differ. During compiled Maestro certification, its child launcher was found to reference obsolete `pi.exe`; source commit `5ea2bfdf6` corrects it to the Recode companion executable.

Corrected installed compiled Maestro artifact (`maestro-service.json`, commit `c86c809a19fb94c1cb23da403d51b4eed8cfd27a`):

| Endpoint | Result |
|---|---:|
| Service start to authenticated ready | 930.8 ms |
| Warm direct `list` median | 1.0 ms |
| Warm compiled CLI `list` median | 536.9 ms |
| One configured read-only session spawn | 4,335.6 ms |
| Warm interactive attachment | 2.4 ms |
| One-session aggregate working set | 555,147,264 bytes |
| Ten-session aggregate working set | 5,075,718,144 bytes |

Ten sessions were admitted. The aggregate Windows working-set topology includes shared mapped pages and one extension-launched descendant, so it is not a private-memory or Linux-PSS claim.

The exact jcode `v0.54.4` Windows x64 binary was reverified at SHA-256 `2572765b72f776ef4bfdd41efc055e0078910d60aae600aa35c6b1fcb5f54523`. Its five-run `--version` process median was 31.6 ms. An isolated daemon/session endpoint could not be established because the binary refuses to start without configured jcode credentials; no login, credential mutation or provider request was performed. See `jcode-v0.54.4-matched.json`. Therefore no daemon/session/resource ratio is claimed.

## Maestro service and session endpoints

Artifact: `maestro-service.json`, commit `b6050d6652c417ca1a829c273537f9e30a18db0b`, clean working tree.

| Endpoint | Result |
|---|---:|
| Isolated service start to authenticated ready | 1,802.3 ms |
| Warm `list` control request median | 1.2 ms |
| Warm `list` control request p90 | 1.5 ms |
| One read-only session spawn | 3,845.6 ms |
| Warm interactive attachment | 1.7 ms |

Windows process-tree working-set samples:

| Topology | Processes | Aggregate RSS |
|---|---:|---:|
| Service plus one read-only session | 3 | 539,320,320 bytes (514.3 MiB) |
| Service plus maximum admitted eight sessions | 10 | 3,546,009,600 bytes (3,381.7 MiB) |

These are aggregate Windows working-set samples, not Linux PSS and not topology-neutral cross-product comparisons. An attributed clean-source repeat in `maestro-service-attributed.json` measured 533,008,384 bytes for one session and 3,505,524,736 bytes for eight. Each depth-1 session `node.exe` used approximately 300–458 MiB, while the depth-0 Maestro service used approximately 136 MiB in the eight-session sample. This confirms that most aggregate growth is in repeated session processes rather than the service owner, but does not yet identify which package/backend allocations are safely shareable.

## Capacity result

The initial checkpoint was bounded at eight sessions. After measured review, the production default was raised to ten and both Node-source and corrected compiled-artifact runs admitted all ten. The compiled aggregate working-set result is retained above; it does not by itself justify sharing process-local state.

## Three-cycle optimization result

The Creator-bounded optimization loop stopped after three cycles. Machine-readable detail is in `optimization-summary.json`, with raw cycle-two endpoint samples in `optimization-cycle-2-cli.json` and `optimization-cycle-2-rpc.json`.

1. Corrected clean builds and compiled Maestro identity/session launch. The result progressed from a build failure and unusable compiled session launcher to a ten-session validated artifact.
2. Minified standalone bundles. Maestro's ten-run `--version` process median improved from 463.3 ms to 411.4 ms (11.2%), its executable shrank from 110,075,904 to 105,224,192 bytes (4.4%), and isolated compiled RPC readiness improved from 891.0 ms to 729.0 ms (18.2%). Configured RPC remained effectively unchanged at 3,876.3 ms versus 3,889.8 ms because configured extension/package initialization dominates that endpoint.
3. Preserved function names under minification. The resulting Maestro executable was 105,224,704 bytes, only 512 bytes above full minification, and its measured `--version` median was 388.5 ms; diagnostic function names therefore remain available without a measurable endpoint regression.

jcode's equivalent `--version` median was 32.1 ms, so its short-lived native CLI remains materially faster. No ratio is extended to daemon readiness, session spawn or ten-session resources because jcode could not run those endpoints without credentials on this machine.

## Windows private-memory attribution

Artifacts: `recode-0.81.6-installed/resource-attribution.json` and `rpc-memory-attribution.json`, installed commit `5bf0880c509dca4db934a73873a521d465b828e8`.

The ten-session configured sample reported 5,037,240,320 bytes aggregate working set, of which 4,480,823,296 bytes (89.0%) was `Working Set - Private` and 556,417,024 bytes (11.0%) was non-private working set. The service itself used 98,533,376 private working-set bytes; the ten session processes accounted for about 4.38 GiB private working set. This shows that repeated mapped executable pages are not the main explanation for the aggregate result.

Three standalone configured RPC samples averaged 485,715,968 private working-set bytes, while three fresh isolated-agent-dir RPC samples averaged 129,148,245 bytes. The observed configured-minus-isolated delta was approximately 356.6 MB per process. This delta includes all configured runtime state—especially the three configured packages/extensions, but also settings, provider catalogues and related state—so it is not attributed to one package without heap-level evidence.

No extension-launched descendant appeared in the repeat, confirming that the earlier `urban-vpn-app.exe` descendant was transient rather than a stable part of the ten-session topology. Windows private working set is still not Linux PSS, but this evidence is strong enough to reject executable-page double counting as the primary cause. Sharing mutable extension, credential, transcript or workspace state remains unsafe; the next justified optimization target is immutable package/module metadata or an explicit shared service boundary, not collapsing session processes.

## Remaining matched work

- Repeat resource samples and add per-process attribution before changing ownership boundaries.
- Attribute private versus shared mapped memory and extension-launched descendants before changing ownership boundaries.
- Run jcode daemon/session endpoints only when they can be established without credential mutation or provider requests; continue reporting unlike process topologies separately.
- A destructive cold-cache run still requires separate approval and a documented cache-control procedure.
- Active model-generation measurements require explicit approval for a fixed provider/model request; no paid request was made here.
