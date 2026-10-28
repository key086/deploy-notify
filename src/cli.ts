#!/usr/bin/env node
/**
 * deploy-notify CLI — 在 CI/CD、部署脚本、crontab 里一行发通知
 *
 *   deploy-notify -w <webhook> -t "部署成功" -m "api-server v1.2.3 已上线"
 *   echo "构建失败：exit 1" | deploy-notify -w <webhook> -t "CI 告警"
 *   deploy-notify -w <webhook> -s <加签密钥> --markdown -m "**版本**: v1.0"
 */
import { notify } from "./notify.js";

function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => resolve(d));
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (...names: string[]): string | undefined => {
    for (const n of names) {
      const i = argv.indexOf(n);
      if (i >= 0 && argv[i + 1]) return argv[i + 1];
    }
    return undefined;
  };

  const webhook = get("--webhook", "-w");
  if (!webhook || argv.includes("--help") || argv.includes("-h")) {
    console.log(`deploy-notify — 飞书/钉钉/企微/Slack 群机器人通知 CLI

用法:
  deploy-notify -w <webhook> [-t 标题] [-m 正文] [-s 飞书加签密钥] [--markdown] [--at-all]
  echo "消息" | deploy-notify -w <webhook> -t "标题"     # 正文从 stdin 读

选项:
  -w, --webhook   群机器人 webhook 地址（必填，自动识别平台）
  -t, --title     消息标题（可选）
  -m, --text      消息正文（缺省从 stdin 读取）
  -s, --secret    飞书机器人加签密钥（可选）
      --markdown  以 markdown 格式发送
      --at-all    @所有人

退出码: 0 成功 | 1 参数错误 | 2 消息为空 | 3 发送失败`);
    process.exit(webhook ? 0 : 1);
  }

  let text = get("--text", "-m");
  if (!text) text = (await readStdin()).trim();
  if (!text) {
    console.error("消息内容为空：请用 -m 指定正文，或通过管道传入 stdin");
    process.exit(2);
  }

  const res = await notify(
    {
      title: get("--title", "-t"),
      text,
      markdown: argv.includes("--markdown"),
      atAll: argv.includes("--at-all"),
    },
    { webhook, secret: get("--secret", "-s") }
  );

  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 3);
}

main();
