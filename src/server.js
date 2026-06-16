import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { Transform } from "node:stream";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const FILE_DIR = join(DATA_DIR, "files");
const PUBLIC_URL = trimEnd(process.env.PUBLIC_URL || `http://localhost:${PORT}`);
const WOPI_PUBLIC_URL = trimEnd(process.env.WOPI_PUBLIC_URL || PUBLIC_URL);
const COLLABORA_INTERNAL_URL = trimEnd(process.env.COLLABORA_INTERNAL_URL || "http://localhost:9980");
const COLLABORA_PUBLIC_URL = trimEnd(process.env.COLLABORA_PUBLIC_URL || COLLABORA_INTERNAL_URL);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 500 * 1024 * 1024);
const URL_DOWNLOAD_TIMEOUT_MS = Number(process.env.URL_DOWNLOAD_TIMEOUT_MS || 60_000);
const IGNORE_HTTPS_ERRORS = process.env.IGNORE_HTTPS_ERRORS !== "false";
const PREVIEW_TTL_MS = Number(process.env.PREVIEW_TTL_MS || 24 * 60 * 60 * 1000);
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS || 24 * 60 * 60 * 1000);
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

await mkdir(FILE_DIR, { recursive: true });
cleanupExpiredFiles().catch((error) => console.error("Initial cleanup failed:", error));
setInterval(() => {
  cleanupExpiredFiles().catch((error) => console.error("Scheduled cleanup failed:", error));
}, CLEANUP_INTERVAL_MS).unref();

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, PUBLIC_URL);

    if (req.method === "OPTIONS") {
      return empty(res, 204);
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/preview/url") {
      return createUrlPreview(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/preview/upload") {
      return createUploadPreview(req, res, url);
    }

    const cleanupMatch = url.pathname.match(/^\/api\/preview\/([^/]+)\/cleanup$/);
    if (cleanupMatch && (req.method === "POST" || req.method === "DELETE")) {
      await deleteFileRecord(decodeURIComponent(cleanupMatch[1]));
      return json(res, 200, { ok: true });
    }

    const wopiMatch = url.pathname.match(/^\/wopi\/files\/([^/]+)(?:\/contents)?$/);
    if (wopiMatch) {
      const fileId = decodeURIComponent(wopiMatch[1]);
      if (req.method === "GET" && url.pathname.endsWith("/contents")) {
        return serveWopiFile(res, fileId);
      }
      if (req.method === "GET") {
        return serveWopiInfo(res, fileId);
      }
      return json(res, 200, {});
    }

    if (req.method === "GET") {
      return serveStatic(req, res, url.pathname);
    }

    return text(res, 405, "Method Not Allowed");
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Internal Server Error" });
  }
});

server.listen(PORT, () => {
  console.log(`View Office Preview listening on ${PUBLIC_URL}`);
});

async function createUrlPreview(req, res) {
  const body = await readJson(req);
  if (!body.url) {
    return json(res, 400, { error: "Missing url" });
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(body.url);
  } catch {
    return json(res, 400, { error: "Invalid url" });
  }
  if (!["http:", "https:"].includes(sourceUrl.protocol)) {
    return json(res, 400, { error: "Only http/https URLs are supported" });
  }

  const fileName = sanitizeFileName(body.fileName || basenameFromUrl(sourceUrl) || "document");
  const fileType = normalizeFileType(body.fileType || extname(fileName).slice(1));
  const file = await createFileRecord(fileName, fileType, requestOrigin(req, body.parentOrigin));

  try {
    await downloadUrlToFile(sourceUrl, file.path, MAX_UPLOAD_BYTES);
  } catch (error) {
    return json(res, 400, {
      error: "Could not download file",
      detail: error.message || String(error)
    });
  }

  const result = await buildPreviewResponse(file.id);
  return json(res, 201, result);
}

async function createUploadPreview(req, res, url) {
  const fileName = sanitizeFileName(url.searchParams.get("fileName") || "document");
  const fileType = normalizeFileType(url.searchParams.get("fileType") || extname(fileName).slice(1));
  const file = await createFileRecord(fileName, fileType, requestOrigin(req, url.searchParams.get("parentOrigin")));
  await writeNodeStreamToFile(req, file.path, MAX_UPLOAD_BYTES);
  const result = await buildPreviewResponse(file.id);
  return json(res, 201, result);
}

async function buildPreviewResponse(fileId) {
  const record = await readRecord(fileId);
  const actionUrl = await getCollaboraActionUrl(record.fileType);
  const wopiSrc = `${WOPI_PUBLIC_URL}/wopi/files/${encodeURIComponent(fileId)}`;
  const viewerUrl = `${actionUrl}${actionUrl.includes("?") ? "&" : "?"}WOPISrc=${encodeURIComponent(wopiSrc)}`;

  return {
    fileId,
    fileName: record.fileName,
    fileType: record.fileType,
    viewerUrl,
    wopiSrc
  };
}

async function getCollaboraActionUrl(fileType) {
  const discoveryUrl = `${COLLABORA_INTERNAL_URL}/hosting/discovery`;
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`Collabora discovery failed: ${response.status}`);
  }
  const xml = await response.text();
  const ext = escapeRegExp(fileType);
  const actionName = fileType === "pdf" ? "(?:view|view_comment)" : "view";
  const match = xml.match(new RegExp(`<action[^>]+ext="${ext}"[^>]+name="${actionName}"[^>]+urlsrc="([^"]+)"`, "i"))
    || xml.match(new RegExp(`<action[^>]+name="${actionName}"[^>]+ext="${ext}"[^>]+urlsrc="([^"]+)"`, "i"));

  if (!match) {
    throw new Error(`No Collabora view action found for ${fileType}`);
  }

  return match[1]
    .replace(/&amp;/g, "&")
    .replace(COLLABORA_INTERNAL_URL, COLLABORA_PUBLIC_URL)
    .replace(/^https?:\/\/[^/]+/, COLLABORA_PUBLIC_URL);
}

async function serveWopiInfo(res, fileId) {
  const record = await readRecord(fileId);
  const info = await stat(record.path);

  return json(res, 200, {
    BaseFileName: record.fileName,
    OwnerId: "view-office",
    Size: info.size,
    UserId: "anonymous",
    UserFriendlyName: "Anonymous",
    Version: record.version,
    UserCanWrite: false,
    ReadOnly: true,
    SupportsLocks: false,
    SupportsUpdate: false,
    SupportsRename: false,
    SupportsUserInfo: false,
    DisablePrint: false,
    DisableExport: false,
    DisableCopy: false,
    PostMessageOrigin: record.parentOrigin || PUBLIC_URL
  });
}

async function serveWopiFile(res, fileId) {
  const record = await readRecord(fileId);
  const info = await stat(record.path);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": info.size,
    "X-WOPI-ItemVersion": record.version
  });
  createReadStream(record.path).pipe(res);
}

async function createFileRecord(fileName, fileType, parentOrigin) {
  const id = randomUUID();
  const storedName = `${id}.${fileType || "bin"}`;
  const path = join(FILE_DIR, storedName);
  const record = {
    id,
    fileName,
    fileType,
    parentOrigin,
    path,
    version: createHash("sha1").update(`${id}:${Date.now()}`).digest("hex"),
    createdAt: new Date().toISOString()
  };
  await writeFile(join(FILE_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

async function deleteFileRecord(fileId) {
  if (!/^[a-f0-9-]{36}$/i.test(fileId)) {
    return false;
  }

  const recordPath = join(FILE_DIR, `${fileId}.json`);
  let record;
  try {
    record = JSON.parse(await readFile(recordPath, "utf8"));
  } catch {
    await rm(recordPath, { force: true });
    return false;
  }

  await Promise.all([
    rm(record.path, { force: true }),
    rm(recordPath, { force: true })
  ]);
  return true;
}

async function cleanupExpiredFiles() {
  const now = Date.now();
  const entries = await readdir(FILE_DIR, { withFileTypes: true });
  const knownFiles = new Set();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const recordPath = join(FILE_DIR, entry.name);
    try {
      const record = JSON.parse(await readFile(recordPath, "utf8"));
      knownFiles.add(record.path);
      knownFiles.add(recordPath);
      const createdAt = Date.parse(record.createdAt || "");
      const age = Number.isFinite(createdAt) ? now - createdAt : PREVIEW_TTL_MS + 1;
      if (age > PREVIEW_TTL_MS) {
        await deleteFileRecord(record.id);
      }
    } catch {
      await rm(recordPath, { force: true });
    }
  }

  const refreshedEntries = await readdir(FILE_DIR, { withFileTypes: true });
  for (const entry of refreshedEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const path = join(FILE_DIR, entry.name);
    if (knownFiles.has(path) || entry.name.endsWith(".json")) {
      continue;
    }

    try {
      const info = await stat(path);
      if (now - info.mtimeMs > PREVIEW_TTL_MS) {
        await rm(path, { force: true });
      }
    } catch {
      // File may have been removed by a concurrent cleanup.
    }
  }
}

async function readRecord(fileId) {
  if (!/^[a-f0-9-]{36}$/i.test(fileId)) {
    throw new Error("Invalid file id");
  }
  return JSON.parse(await readFile(join(FILE_DIR, `${fileId}.json`), "utf8"));
}

async function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/demo/index.html" : pathname;
  if (filePath.endsWith("/")) {
    filePath += "index.html";
  }
  filePath = join(PUBLIC_DIR, filePath.replace(/^\/+/, ""));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return text(res, 403, "Forbidden");
  }

  try {
    const data = await readFile(filePath);
    const type = mimeTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    text(res, 404, "Not Found");
  }
}

async function readJson(req) {
  const raw = await readBody(req, 2 * 1024 * 1024);
  return raw.length ? JSON.parse(raw.toString("utf8")) : {};
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function writeNodeStreamToFile(stream, path, limit) {
  let size = 0;
  stream.on("data", (chunk) => {
    size += chunk.length;
    if (size > limit) {
      stream.destroy(new Error("File too large"));
    }
  });
  await pipeline(stream, createWriteStream(path));
}

async function downloadUrlToFile(url, path, limit, redirects = 0) {
  if (redirects > 5) {
    throw new Error("Too many redirects");
  }

  const client = url.protocol === "https:" ? https : http;
  const options = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: {
      "User-Agent": "ViewOfficePreview/0.1"
    },
    timeout: URL_DOWNLOAD_TIMEOUT_MS
  };

  if (url.protocol === "https:") {
    options.rejectUnauthorized = !IGNORE_HTTPS_ERRORS;
  }

  await new Promise((resolve, reject) => {
    const req = client.request(options, async (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        try {
          await downloadUrlToFile(new URL(location, url), path, limit, redirects + 1);
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      pipeline(response, limitBytes(limit), createWriteStream(path))
        .then(resolve)
        .catch(reject);
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Download timed out after ${URL_DOWNLOAD_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

function limitBytes(limit) {
  let size = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      if (size > limit) {
        callback(new Error("File too large"));
        return;
      }
      callback(null, chunk);
    }
  });
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  res.end(JSON.stringify(payload));
}

function text(res, status, payload) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() });
  res.end(payload);
}

function empty(res, status) {
  res.writeHead(status, corsHeaders());
  res.end();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
    "Access-Control-Allow-Private-Network": "true"
  };
}

function trimEnd(value) {
  return value.replace(/\/+$/, "");
}

function sanitizeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "document";
}

function normalizeFileType(type) {
  return String(type || "bin").toLowerCase().replace(/^\./, "");
}

function basenameFromUrl(url) {
  const pathname = decodeURIComponent(url.pathname || "");
  return pathname.split("/").filter(Boolean).pop();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requestOrigin(req, explicitOrigin) {
  const explicit = normalizeOrigin(explicitOrigin);
  if (explicit) {
    return explicit;
  }

  const origin = normalizeOrigin(req.headers.origin);
  if (origin) {
    return origin;
  }

  try {
    return normalizeOrigin(new URL(req.headers.referer).origin) || PUBLIC_URL;
  } catch {
    return PUBLIC_URL;
  }
}

function normalizeOrigin(value) {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(String(value));
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}
