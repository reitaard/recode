# JSON Event Mode

```text
recode --mode json --print "prompt"
```

JSON mode is a one-way event stream for automation that does not need RPC commands. It emits AgentSession lifecycle records as LF-delimited JSON on stdout. Use RPC when the controller must change model/session state, send steering/follow-up messages, answer extension UI requests, or query state.

Streaming `message_update` records omit cumulative `partial` snapshots; reconstruct deltas after `message_start` and treat `message_end` as the final authoritative assistant message. Other AgentSession events retain their exported shapes.

Protect protocol stdout from logs, split strictly on LF, handle unknown future event variants, and treat session/tool output as sensitive untrusted data. Exit success alone is not a substitute for checking terminal agent events and error fields.

The exported `JsonAgentSessionEvent` transformation is authority and requires a post-transfer drift test.
