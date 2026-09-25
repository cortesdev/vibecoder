"use server";

import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs/promises";

interface ProjectServer {
  projectId: string;
  process: ChildProcess | null;
  port: number;
  url: string;
  status: "starting" | "running" | "stopped" | "error";
  error?: string;
}

// In-memory store for running servers (in production, use Redis or database)
const servers = new Map<string, ProjectServer>();

// Port allocation starting from 3100
let nextPort = 3100;

function getNextPort(): number {
  return nextPort++;
}

async function ensureProjectDir(projectId: string): Promise<string> {
  const projectDir = path.join(process.cwd(), ".vibecoder-projects", projectId);
  await fs.mkdir(projectDir, { recursive: true });
  return projectDir;
}

export async function writeProjectFiles(
  projectId: string,
  files: Record<string, string>
): Promise<void> {
  const projectDir = await ensureProjectDir(projectId);
  
  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(projectDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
  
  // Ensure package.json exists
  const packageJsonPath = path.join(projectDir, "package.json");
  try {
    await fs.access(packageJsonPath);
  } catch {
    // Create default package.json for a Vite + React project
    const packageJson = {
      name: `vibecoder-project-${projectId}`,
      version: "0.0.1",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        react: "^19.2.8",
        "react-dom": "^19.2.8"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.1",
        vite: "^6.3.5"
      }
    };
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }
  
  // Ensure vite.config.ts exists
  const viteConfigPath = path.join(projectDir, "vite.config.ts");
  try {
    await fs.access(viteConfigPath);
  } catch {
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 0, // Will be overridden by --port
    strictPort: true,
    hmr: {
      port: 0
    }
  }
})`;
    await fs.writeFile(viteConfigPath, viteConfig);
  }
  
  // Ensure index.html exists
  const indexHtmlPath = path.join(projectDir, "index.html");
  try {
    await fs.access(indexHtmlPath);
  } catch {
    const indexHtml = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeCoder Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    await fs.writeFile(indexHtmlPath, indexHtml);
  }
}

export async function startProjectServer(
  projectId: string,
  files: Record<string, string>
): Promise<ProjectServer> {
  // Stop existing server if any
  await stopProjectServer(projectId);
  
  // Write files to disk
  await writeProjectFiles(projectId, files);
  
  const projectDir = await ensureProjectDir(projectId);
  const port = getNextPort();
  const url = `http://localhost:${port}`;
  
  const server: ProjectServer = {
    projectId,
    process: null,
    port,
    url,
    status: "starting"
  };
  
  servers.set(projectId, server);
  
  // Install dependencies if needed
  const nodeModulesPath = path.join(projectDir, "node_modules");
  let needsInstall = false;
  try {
    await fs.access(nodeModulesPath);
  } catch {
    needsInstall = true;
  }
  
  if (needsInstall) {
    server.status = "starting";
    server.error = "Installing dependencies...";
    try {
      await runCommand("npm", ["install"], projectDir);
    } catch (e) {
      server.status = "error";
      server.error = `Failed to install dependencies: ${e}`;
      return server;
    }
  }
  
  // Start Vite dev server
  server.status = "starting";
  server.error = "Starting dev server...";
  
  const viteProcess = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" }
  });
  
  server.process = viteProcess;
  
  viteProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    console.log(`[${projectId}] stdout:`, output);
    if (output.includes("ready in") || output.includes("Local:")) {
      server.status = "running";
      server.error = undefined;
    }
  });
  
  viteProcess.stderr?.on("data", (data) => {
    const output = data.toString();
    console.error(`[${projectId}] stderr:`, output);
    if (output.includes("error") || output.includes("Error")) {
      server.status = "error";
      server.error = output;
    }
  });
  
  viteProcess.on("close", (code) => {
    console.log(`[${projectId}] process exited with code ${code}`);
    server.process = null;
    if (server.status !== "stopped") {
      server.status = "error";
      server.error = `Process exited with code ${code}`;
    }
  });
  
  viteProcess.on("error", (err) => {
    console.error(`[${projectId}] process error:`, err);
    server.status = "error";
    server.error = err.message;
  });
  
  // Wait a bit for server to start
  await new Promise((resolve) => setTimeout(resolve, 3000));
  
  return servers.get(projectId)!;
}

export async function stopProjectServer(projectId: string): Promise<void> {
  const server = servers.get(projectId);
  if (server?.process) {
    server.status = "stopped";
    server.process.kill("SIGTERM");
    server.process = null;
  }
  servers.delete(projectId);
}

export async function getProjectServer(projectId: string): Promise<ProjectServer | undefined> {
  return servers.get(projectId);
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// Cleanup on process exit
if (typeof process !== "undefined") {
  process.on("exit", () => {
    for (const [_, server] of servers) {
      if (server.process) {
        server.process.kill("SIGTERM");
      }
    }
  });
}