import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { carriers, createStore, getQueue, inspect, runAgent, runBatch } from "./payflowCore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const stores = new Map();
const port = Number(process.env.PORT || 4173);

function storeFor(carrierId) {
  if (!stores.has(carrierId)) stores.set(carrierId, createStore(carrierId));
  return stores.get(carrierId);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

async function handleApi(req, res, url) {
  if (url.pathname === "/api/carriers") {
    sendJson(res, 200, carriers);
    return;
  }
  if (url.pathname === "/api/queue") {
    const store = storeFor(url.searchParams.get("carrier") || "verizon");
    sendJson(res, 200, { carrier_id: store.carrierId, display_name: store.displayName, orders: getQueue(store) });
    return;
  }
  if (url.pathname === "/api/inspect") {
    const body = await readBody(req);
    sendJson(res, 200, inspect(storeFor(body.carrier), body.cartId));
    return;
  }
  if (url.pathname === "/api/run") {
    const body = await readBody(req);
    sendJson(res, 200, runAgent(storeFor(body.carrier), body.cartId, {
      approval: body.approval,
      overrideAction: body.overrideAction || null
    }));
    return;
  }
  if (url.pathname === "/api/batch") {
    const body = await readBody(req);
    sendJson(res, 200, runBatch(body.carrier || "verizon"));
    return;
  }
  sendJson(res, 404, { error: "Unknown API route" });
}

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data ? JSON.parse(data) : {});
    });
    req.on("error", reject);
  });
}

server.listen(port, () => {
  console.log(`PayFlow Recovery Agent running at http://localhost:${port}`);
});
