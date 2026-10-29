# deploy-notify

[![npm version](https://img.shields.io/npm/v/deploy-notify)](https://www.npmjs.com/package/deploy-notify) [![CI](https://github.com/key086/deploy-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/key086/deploy-notify/actions/workflows/ci.yml) ![license](https://img.shields.io/badge/license-MIT-blue) ![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

[English](./README.en.md) | 中文


一个 API 打通 **飞书(Lark) / 钉钉 / 企业微信 / Slack** 四大群机器人：自动识别 webhook 平台、自动适配消息格式、失败重试、markdown、飞书加签、@所有人。**零依赖**（仅 Node 18+ 内置 fetch），提供库 + CLI 两种用法。

## 安装

```bash
npm install deploy-notify
```

## 库用法

```ts
import { notify, notifyText } from "deploy-notify";

// 自动识别平台：这是飞书 webhook 就走飞书协议
await notifyText("https://open.feishu.cn/open-apis/bot/v2/hook/xxx", "api-server 部署完成 ✅");

// 完整能力：markdown + 飞书加签 + @所有人
const res = await notify(
  {
    title: "🟢 部署成功",
    text: "**项目**: api-server\n**版本**: v1.2.3\n**耗时**: 42s",
    markdown: true,
    atAll: false,
  },
  {
    webhook: process.env.FEISHU_WEBHOOK!,
    secret: process.env.FEISHU_SECRET, // 飞书加签密钥，可选
    retry: 2,                          // 失败重试次数
  }
);
if (!res.ok) console.error(res.error); // { ok, platform, status, body, error }
```

换平台只换 webhook，代码零改动：

```ts
await notifyText("https://oapi.dingtalk.com/robot/send?access_token=xxx", "钉钉通知");
await notifyText("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx", "企微通知");
await notifyText("https://hooks.slack.com/services/T00/B00/xxx", "Slack 通知");
```

## CLI 用法（CI/CD、部署脚本、crontab）

```bash
# 全局安装或 npx
npx deploy-notify -w "$FEISHU_WEBHOOK" -t "部署成功" -m "api-server v1.2.3 已上线"

# 管道输入（构建日志尾部直接推群）
npm run build 2>&1 | tail -5 | npx deploy-notify -w "$WEBHOOK" -t "构建结果"

# markdown + 加签 + @所有人
npx deploy-notify -w "$WEBHOOK" -s "$SECRET" --markdown --at-all -m "**紧急**: 磁盘使用率 92%"
```

退出码：`0` 成功 / `1` 参数错误 / `2` 消息为空 / `3` 发送失败 —— 方便在脚本里 `&&` / `||` 串联。

## 平台能力对照

| 能力 | 飞书 | 钉钉 | 企微 | Slack |
|---|---|---|---|---|
| 纯文本 | ✅ | ✅ | ✅ | ✅ |
| markdown | ✅（互动卡片） | ✅ | ✅ | ✅（mrkdwn） |
| @所有人 | ✅ | ✅ | ✅ | - |
| 加签 | ✅（`secret`） | - | - | - |
| 业务错误检测 | ✅ errcode | ✅ errcode | ✅ errcode | HTTP 状态 |

## API

| 导出 | 说明 |
|---|---|
| `notify(msg, opts)` | 完整发送，返回 `NotifyResult` |
| `notifyText(webhook, text, secret?)` | 纯文本便捷方法 |
| `detectPlatform(webhook)` | 识别平台类型 |
| `buildBody(msg, opts)` | 构造平台原生请求体（调试用） |
| `feishuSign(secret, ts)` | 飞书加签算法（HMAC-SHA256） |

## License

MIT © iien21
