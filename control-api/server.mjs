import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(process.env.DASHBOARD_WORKSPACE_ROOT || resolve(projectDir, ".."));
const port = Number(process.env.DASHBOARD_CONTROL_PORT || 3178);
const services = {
  music: { project: "music-server", file: "ジュークボックス/docker-compose.yml" },
  video: { project: "home-video-streamer", file: "自宅動画配信サーバー/compose.yaml" },
  english: { project: "kotoba-study", file: "13_英語勉強/compose.yaml" },
  tabiphrase: { project: "12_lang", file: "12_lang/compose.yaml" },
  stock: { project: "app", file: "stock-compare/app/docker-compose.yml" },
  reader: { project: "15_", file: "15_まとめビューアー/compose.yaml" },
  travel: { project: "tabi", file: "18_旅行コンサル/compose.yaml" },
};

for (const config of Object.values(services)) {
  const composeFile = resolve(workspaceRoot, config.file);
  const pathFromRoot = relative(workspaceRoot, composeFile);
  if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") throw new Error("Compose path escaped workspace root.");
  await access(composeFile);
  config.composeFile = composeFile;
  config.composeDir = dirname(composeFile);
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function dockerArgs(config, command) {
  return [
    "compose",
    "--project-name", config.project,
    "--file", config.composeFile,
    "--project-directory", config.composeDir,
    ...command,
  ];
}

async function runDocker(config, command) {
  return execFileAsync("docker", dockerArgs(config, command), {
    cwd: config.composeDir,
    timeout: 240_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
}

function parseComposeRows(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function getServiceState(config) {
  try {
    const { stdout } = await runDocker(config, ["ps", "--all", "--format", "json"]);
    const rows = parseComposeRows(stdout);
    const running = rows.filter((row) => String(row.State || "").toLowerCase() === "running").length;
    const state = rows.length === 0 || running === 0 ? "stopped" : running === rows.length ? "running" : "partial";
    return { state, running, total: rows.length };
  } catch (error) {
    console.error(`Could not inspect ${config.project}:`, error.stderr || error.message);
    return { state: "error", running: 0, total: 0, error: true };
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end("ok");
    return;
  }
  if (!url.pathname.startsWith("/api/")) {
    send(response, 404, { error: "Not found" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/services") {
    const states = await Promise.all(Object.entries(services).map(async ([id, config]) => [id, await getServiceState(config)]));
    send(response, 200, { services: Object.fromEntries(states) });
    return;
  }

  const actionMatch = /^\/api\/services\/([a-z]+)\/(start|stop)$/.exec(url.pathname);
  if (request.method === "POST" && actionMatch) {
    const [, id, action] = actionMatch;
    const config = services[id];
    if (!config) {
      send(response, 404, { error: "このサービスは操作対象に登録されていません。" });
      return;
    }
    try {
      await runDocker(config, action === "start" ? ["up", "--detach"] : ["stop"]);
      send(response, 200, { ok: true, service: id, action });
    } catch (error) {
      console.error(`Docker ${action} failed for ${config.project}:`, error.stderr || error.message);
      send(response, 500, { error: "Docker 操作に失敗しました。Docker Desktop と Compose 定義を確認してください。" });
    }
    return;
  }
  send(response, 404, { error: "Not found" });
});

server.requestTimeout = 250_000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Local Desk control API listening on port ${port}`);
});
