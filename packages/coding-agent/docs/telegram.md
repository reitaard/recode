# Telegram Gateway

`recode telegram` runs a long-polling Telegram Bot API gateway that maps allowed chats/topics to Recode RPC sessions.

## Configuration

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USER_ID`; optional comma-separated `TELEGRAM_ALLOWED_GROUP_IDS` permits groups. `RECODE_TELEGRAM_CWD` selects the base working directory. Equivalent values may be read from the private agent `telegram.json`. Never commit bot tokens.

Private messages require the allowed user. Groups must be allowlisted; forum topics use `/connect` before tasks are accepted and receive separate workspace/session directories. Commands include `/start`, `/connect [new]`, `/disconnect`, `/new`, `/reload`, `/status`, and `/stop`.

## Persistence and delivery

The gateway persists update offset, route/session state, and recoverable job ledger below the agent directory. It edits streaming previews at bounded intervals and sends final Markdown through Telegram's supported HTML subset. Stop aborts active work and clears queued work; reload/new refuse while busy.

## Attachments and limits

Cloud downloads are capped at 20 MB and uploads at 50 MB. Images are MIME-checked; documents receive sanitized storage names, mode-restricted files, and an explicit untrusted-attachment prompt. Documents are not automatically executed or unpacked.

## Security and operations

Long polling requires network access and grants the bot access to messages/files in allowed chats. Telegram is an external trust and retention boundary. Restrict the bot, protect its token/state directory, review workspace permissions, and run under a dedicated account when appropriate. The gateway is not certified as a public multi-tenant service.
