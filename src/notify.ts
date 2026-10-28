/**
 * deploy-notify — 多平台群机器人通知（飞书/钉钉/企业微信/Slack）
 * 一个 API 打通四个平台：自动识别 webhook 类型、自动适配消息格式、失败重试、支持 markdown 与飞书加签。
 * 零依赖（仅用 Node 18+ 内置 fetch）。
 */
import crypto from "node:crypto";

export type Platform = "feishu" | "dingtalk" | "wechat" | "slack";

export interface NotifyOptions {
  /** 群机器人 webhook 地址，自动识别平台 */
  webhook: string;
  /** 飞书机器人加签密钥（可选） */
  secret?: string;
  /** 失败重试次数，默认 2 */
  retry?: number;
  /** 单次请求超时毫秒，默认 10000 */
  timeoutMs?: number;
}

export interface NotifyMessage {
  /** 标题（飞书卡片头/钉钉 markdown 标题），可选 */
  title?: string;
  /** 正文 */
  text: string;
  /** 以 markdown 发送（钉钉/企微原生支持，飞书用卡片，Slack 用 mrkdwn） */
  markdown?: boolean;
  /** @所有人 */
  atAll?: boolean;
}

export interface NotifyResult {
  ok: boolean;
  platform: Platform;
  status?: number;
  /** 平台返回原文（截断至 200 字符），排查 errcode 用 */
  body?: string;
  error?: string;
}

/** 根据 webhook 地址自动识别平台 */
export function detectPlatform(webhook: string): Platform {
  if (/feishu|larksuite/.test(webhook)) return "feishu";
  if (/dingtalk/.test(webhook)) return "dingtalk";
  if (/qyapi\.weixin/.test(webhook)) return "wechat";
  return "slack";
}

/** 飞书加签：HMAC-SHA256(key = `${timestamp}\n${secret}`, data = "")，base64 */
export function feishuSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

function withFeishuSign(body: Record<string, unknown>, secret?: string): Record<string, unknown> {
  if (secret) {
    const ts = Math.floor(Date.now() / 1000);
    body.timestamp = String(ts);
    body.sign = feishuSign(secret, ts);
  }
  return body;
}

/** 按平台构造请求体 */
export function buildBody(msg: NotifyMessage, opts: NotifyOptions): Record<string, unknown> {
  const p = detectPlatform(opts.webhook);
  const text = msg.title && !msg.markdown ? `${msg.title}\n${msg.text}` : msg.text;

  if (p === "feishu") {
    if (msg.markdown) {
      // 飞书 markdown 走互动卡片
      return withFeishuSign(
        {
          msg_type: "interactive",
          card: {
            config: { wide_screen_mode: true },
            header: { title: { tag: "plain_text", content: msg.title ?? "通知" } },
            elements: [{ tag: "div", text: { tag: "lark_md", content: msg.text } }],
          },
        },
        opts.secret
      );
    }
    return withFeishuSign(
      {
        msg_type: "text",
        content: { text: text + (msg.atAll ? '\n<at user_id="all"></at>' : "") },
      },
      opts.secret
    );
  }

  if (p === "dingtalk") {
    return msg.markdown
      ? {
          msgtype: "markdown",
          markdown: { title: msg.title ?? "通知", text },
          at: { isAtAll: !!msg.atAll },
        }
      : { msgtype: "text", text: { content: text }, at: { isAtAll: !!msg.atAll } };
  }

  if (p === "wechat") {
    return msg.markdown
      ? { msgtype: "markdown", markdown: { content: msg.title ? `## ${msg.title}\n${msg.text}` : text } }
      : {
          msgtype: "text",
          text: { content: text, ...(msg.atAll ? { mentioned_list: ["@all"] } : {}) },
        };
  }

  // slack
  return { text: msg.title ? `*${msg.title}*\n${text}` : text };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 发送通知。失败自动重试（指数间隔 1s/2s/...），HTTP 成功但业务 errcode != 0 也判定失败。
 */
export async function notify(msg: NotifyMessage, opts: NotifyOptions): Promise<NotifyResult> {
  const platform = detectPlatform(opts.webhook);
  const attempts = Math.max(1, (opts.retry ?? 2) + 1);
  let lastErr = "";

  for (let i = 0; i < attempts; i++) {
    // 每次重试都重新构造（飞书加签的 timestamp 有时效）
    const body = buildBody(msg, opts);
    try {
      const res = await fetch(opts.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
      });
      const text = await res.text();
      let bizOk = res.ok;
      try {
        const j = JSON.parse(text) as { errcode?: number };
        if (typeof j.errcode === "number" && j.errcode !== 0) bizOk = false;
      } catch {
        /* 非 JSON 响应以 HTTP 状态为准 */
      }
      if (bizOk) return { ok: true, platform, status: res.status, body: text.slice(0, 200) };
      lastErr = `HTTP ${res.status}: ${text.slice(0, 120)}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    if (i < attempts - 1) await sleep(1000 * (i + 1));
  }
  return { ok: false, platform, error: lastErr };
}

/** 便捷方法：纯文本通知 */
export function notifyText(webhook: string, text: string, secret?: string): Promise<NotifyResult> {
  return notify({ text }, { webhook, secret });
}
