import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.resolve(projectRoot, "..", "shnwazdev-jiosaavn-api");
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const apiDevCli = path.join(apiRoot, "node_modules", "tsx", "dist", "cli.mjs");
const apiLocal = path.join(apiRoot, "src", "local.ts");
const apiBuilt = path.join(apiRoot, "dist", "local.js");
const apiHealthUrl = `${process.env.JIOSAAVN_API_BASE_URL ?? "http://127.0.0.1:3101"}/health`;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const mode = process.argv[2] ?? "dev";

function requireApiRoot() {
  if (!existsSync(apiRoot)) {
    throw new Error(`JioSaavn API folder not found: ${apiRoot}`);
  }
}

function run(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const viaCmd = isWindows && command.endsWith(".cmd");
    const executable = viaCmd ? (process.env.ComSpec ?? "cmd.exe") : command;
    const childArgs = viaCmd ? ["/d", "/s", "/c", `${command} ${args.join(" ")}`] : args;
    const child = spawn(executable, childArgs, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function runSequential() {
  if (mode === "install") {
    requireApiRoot();
    await run(npm, ["ci"], projectRoot);
    await run(npm, ["ci"], apiRoot);
    return;
  }
  if (mode === "build") {
    if (process.env.VERCEL) {
      console.info(
        "Skipping the local JioSaavn API build on Vercel; set JIOSAAVN_API_BASE_URL to a deployed API URL to enable JioSaavn.",
      );
    } else {
      requireApiRoot();
      await run(npm, ["run", "build"], apiRoot);
    }
    await run(process.execPath, [nextCli, "build"], projectRoot);
    return;
  }
  throw new Error(`Unsupported one-shot command: ${mode}`);
}

async function isResponding(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.status < 500;
  } catch {
    return false;
  }
}

if (mode === "install" || mode === "build") {
  await runSequential();
} else if (mode === "dev" || mode === "start") {
  requireApiRoot();
  if (mode === "dev" && !existsSync(apiDevCli)) {
    throw new Error("JioSaavn API dependencies are missing. Run `npm run install:all` first.");
  }
  if (mode === "start" && !existsSync(apiBuilt)) {
    throw new Error("The JioSaavn API has not been built. Run `npm run build` first.");
  }

  const webUrl = process.env.CADENCE_URL ?? "http://127.0.0.1:3000";
  const [apiAlreadyRunning, webAlreadyRunning] = mode === "dev"
    ? await Promise.all([isResponding(apiHealthUrl), isResponding(webUrl)])
    : [false, false];
  const children = [];
  if (!apiAlreadyRunning) {
    const apiCommand = mode === "dev" ? apiDevCli : apiBuilt;
    const apiArgs = mode === "dev" ? ["watch", apiLocal] : [];
    children.push(spawn(process.execPath, [apiCommand, ...apiArgs], {
      cwd: apiRoot,
      env: { ...process.env, PORT: "3101" },
      stdio: "inherit",
    }));
  } else {
    console.info("JioSaavn API already running on port 3101.");
  }
  if (!webAlreadyRunning) {
    // Room invite links use the machine's LAN address. Bind Next to all
    // interfaces so a second device can actually open that invite.
    children.push(spawn(process.execPath, [nextCli, mode === "dev" ? "dev" : "start", "--hostname", "0.0.0.0"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    }));
  } else {
    console.info(`Cadence is already running at ${webUrl}.`);
  }

  let stopping = false;
  const stop = (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
    clearInterval(keepAlive);
    process.exitCode = exitCode;
  };
  const keepAlive = setInterval(() => {}, 60_000);
  for (const child of children) {
    child.once("error", (error) => {
      console.error(error);
      stop(1);
    });
    child.once("exit", (code) => {
      if (!stopping) stop(code === 0 ? 0 : 1);
    });
  }
  process.once("SIGINT", () => stop(0));
  process.once("SIGTERM", () => stop(0));
} else {
  throw new Error("Usage: node scripts/music-stack.mjs <install|dev|build|start>");
}
