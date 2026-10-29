# deploy-notify

**One API for Feishu/Lark, DingTalk, WeCom and Slack group-bot notifications — auto platform detection, markdown, retries, Feishu signing, @all.**

[![npm version](https://img.shields.io/npm/v/deploy-notify)](https://www.npmjs.com/package/deploy-notify)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)

English | [中文](./README.md)

Send deploy and alert messages to any of the four major chat platforms from the same code. Just pass the webhook — the platform is detected from its URL, the message body is adapted to the platform's native protocol, and failures are retried automatically. Zero dependencies (uses Node 18+ built-in `fetch` and `node:crypto` only). Ships as both a library and a CLI.

## Features

- 🔍 **Auto platform detection** — Feishu/Lark, DingTalk, WeCom (WeChat Work) and Slack are recognized from the webhook URL; switch platforms by swapping the URL, with zero code changes
- 📝 **Markdown everywhere** — DingTalk/WeCom native markdown, Feishu interactive cards, Slack `mrkdwn`
- 🔏 **Feishu signing** — pass `secret` and requests are signed with the HMAC-SHA256 scheme Feishu bots require
- 📣 **@all support** — on Feishu, DingTalk and WeCom
- 🔁 **Retries with backoff** — failed sends are retried (default 2 retries, 1s/2s… delays); a request body with a Feishu signature is rebuilt on every attempt so the timestamp stays fresh
- 🧪 **Business-error detection** — an HTTP 200 with a non-zero `errcode` (Feishu/DingTalk/WeCom) is correctly treated as a failure
- ⌨️ **CLI included** — one-liner notifications for CI/CD pipelines, deploy scripts and crontab, with meaningful exit codes and stdin support
- 📦 **Zero dependencies** — nothing to audit, no supply-chain risk

## Install

```bash
npm install deploy-notify
```

Or use it directly via `npx` (see [CLI usage](#cli-usage)).

## Quick Start

```ts
import { notify, notifyText } from "deploy-notify";

// Platform is detected automatically: a Feishu webhook speaks the Feishu protocol
await notifyText("https://open.feishu.cn/open-apis/bot/v2/hook/xxx", "api-server deploy complete ✅");

// Full power: markdown + Feishu signing + @all
const res = await notify(
  {
    title: "🟢 Deploy succeeded",
    text: "**Project**: api-server\n**Version**: v1.2.3\n**Duration**: 42s",
    markdown: true,
    atAll: false,
  },
  {
    webhook: process.env.FEISHU_WEBHOOK!,
    secret: process.env.FEISHU_SECRET, // Feishu signing secret, optional
    retry: 2,                          // retries on failure
  }
);
if (!res.ok) console.error(res.error); // { ok, platform, status, body, error }
```

Switching platforms is just a different webhook:

```ts
await notifyText("https://oapi.dingtalk.com/robot/send?access_token=xxx", "DingTalk ping");
await notifyText("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx", "WeCom ping");
await notifyText("https://hooks.slack.com/services/T00/B00/xxx", "Slack ping");
```

## API

| Export | Description |
|---|---|
| `notify(msg, opts)` | Full send, returns `Promise<NotifyResult>` |
| `notifyText(webhook, text, secret?)` | Convenience method for plain-text messages |
| `detectPlatform(webhook)` | Returns the platform: `"feishu" \| "dingtalk" \| "wechat" \| "slack"` |
| `buildBody(msg, opts)` | Builds the platform-native request body (useful for debugging) |
| `feishuSign(secret, timestamp)` | Feishu signing algorithm (HMAC-SHA256, base64) |

### `NotifyMessage`

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Message body (required) |
| `title` | `string?` | Title — Feishu card header / DingTalk markdown title; for plain text it is prepended to the body |
| `markdown` | `boolean?` | Send as markdown |
| `atAll` | `boolean?` | Mention everyone |

### `NotifyOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `webhook` | `string` | - | Group-bot webhook URL; the platform is auto-detected |
| `secret` | `string?` | - | Feishu bot signing secret |
| `retry` | `number?` | `2` | Retry count on failure (1s, 2s, … backoff) |
| `timeoutMs` | `number?` | `10000` | Per-request timeout |

### `NotifyResult`

```ts
{
  ok: boolean;        // true only on HTTP success AND a zero/absent business errcode
  platform: Platform; // "feishu" | "dingtalk" | "wechat" | "slack"
  status?: number;    // HTTP status code
  body?: string;      // raw platform response, truncated to 200 chars (for errcode debugging)
  error?: string;     // last error message when ok === false
}
```

## Platform Capability Matrix

| Capability | Feishu/Lark | DingTalk | WeCom | Slack |
|---|---|---|---|---|
| Plain text | ✅ | ✅ | ✅ | ✅ |
| Markdown | ✅ (interactive card) | ✅ (native) | ✅ (native) | ✅ (`mrkdwn`) |
| @all | ✅ | ✅ | ✅ | - |
| Signed requests | ✅ (`secret`) | - | - | - |
| Failure detection | ✅ `errcode` | ✅ `errcode` | ✅ `errcode` | HTTP status |

Protocol notes per platform:

- **Feishu/Lark** — plain text uses `msg_type: "text"` with an `<at user_id="all">` tag for @all; markdown is rendered as an interactive card (`msg_type: "interactive"`, wide-screen mode, `lark_md` body). If a `secret` is provided, every request carries `timestamp` and `sign` fields, where `sign = base64(HMAC-SHA256(key = "<timestamp>\n<secret>", data = ""))`.
- **DingTalk** — `msgtype: "text"` or `msgtype: "markdown"` with an `at.isAtAll` flag.
- **WeCom** — `msgtype: "text"` (with `mentioned_list: ["@all"]` for @all) or `msgtype: "markdown"` (the title becomes an `##` heading, since WeCom markdown has no title field).
- **Slack** — a single `text` field; the title is bolded with `*…*`. @all and signing are not applicable to Slack incoming webhooks and are ignored.

## CLI Usage

For CI/CD pipelines, deploy scripts and crontab — no code needed:

```bash
# Via npx (or install globally)
npx deploy-notify -w "$FEISHU_WEBHOOK" -t "Deploy succeeded" -m "api-server v1.2.3 is live"

# Pipe input (push the tail of a build log straight to the group chat)
npm run build 2>&1 | tail -5 | npx deploy-notify -w "$WEBHOOK" -t "Build result"

# Markdown + Feishu signing + @all
npx deploy-notify -w "$WEBHOOK" -s "$SECRET" --markdown --at-all -m "**Urgent**: disk usage at 92%"
```

| Option | Description |
|---|---|
| `-w, --webhook` | Group-bot webhook URL (required; platform auto-detected) |
| `-t, --title` | Message title (optional) |
| `-m, --text` | Message body (defaults to reading stdin) |
| `-s, --secret` | Feishu bot signing secret (optional) |
| `--markdown` | Send as markdown |
| `--at-all` | Mention everyone |

Exit codes: `0` success · `1` bad arguments · `2` empty message · `3` send failed — handy for `&&` / `||` chaining in shell scripts. The result JSON is also printed to stdout.

## How It Works

`detectPlatform` matches the webhook URL against known host patterns (`feishu`/`larksuite` → Feishu, `dingtalk` → DingTalk, `qyapi.weixin` → WeCom, everything else → Slack). `buildBody` then translates your message into that platform's native JSON payload. `notify` POSTs it with `fetch` under an `AbortSignal.timeout`, parses the response, and treats a non-zero `errcode` as a failure even when HTTP returned 200 — which is how Feishu/DingTalk/WeCom actually report bot errors. On failure it waits 1s, 2s, … and retries, rebuilding the body each time so Feishu signatures get a fresh timestamp.

## Origin Story

Extracted from a production SaaS alerting system, where deploys, CI failures and monitoring alerts had to reach whichever chat platform a customer's team happened to use. The four platforms all do "webhook group bot" slightly differently — payload shapes, markdown dialects, signing, error reporting — and this package hides all of those differences behind one call.

## License

[MIT](./LICENSE)
