from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from payflow_backend import CARRIERS, create_store, get_queue, inspect, run_agent, run_batch

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "node_demo" / "public"
PORT = 8000
STORES: dict[str, dict] = {}


def store_for(carrier_id: str) -> dict:
    if carrier_id not in STORES:
        STORES[carrier_id] = create_store(carrier_id)
    return STORES[carrier_id]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/carriers":
            self._json(CARRIERS)
            return
        if parsed.path == "/api/queue":
            carrier = parse_qs(parsed.query).get("carrier", ["verizon"])[0]
            store = store_for(carrier)
            self._json({"carrier_id": carrier, "display_name": store["display_name"], "orders": get_queue(store)})
            return
        if parsed.path.startswith("/api/"):
            self._json({"error": "Unknown API route"}, status=404)
            return
        self._static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        body = self._body()
        if parsed.path == "/api/inspect":
            self._json(inspect(store_for(body.get("carrier", "verizon")), body["cartId"]))
            return
        if parsed.path == "/api/run":
            self._json(run_agent(
                store_for(body.get("carrier", "verizon")),
                body["cartId"],
                approval=body.get("approval", "PENDING"),
                override_action=body.get("overrideAction"),
            ))
            return
        if parsed.path == "/api/batch":
            self._json(run_batch(body.get("carrier", "verizon")))
            return
        if parsed.path == "/api/reset":
            carrier = body.get("carrier")
            if carrier:
                STORES[carrier] = create_store(carrier)
            else:
                STORES.clear()
            self._json({"ok": True})
            return
        self._json({"error": "Unknown API route"}, status=404)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json(self, value: object, status: int = 200) -> None:
        data = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _static(self, request_path: str) -> None:
        relative = "index.html" if request_path == "/" else request_path.lstrip("/")
        path = (PUBLIC / relative).resolve()
        if not str(path).startswith(str(PUBLIC.resolve())) or not path.exists():
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args) -> None:
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    print(f"PayFlow Recovery Agent Python backend running at http://localhost:{PORT}")
    server.serve_forever()
