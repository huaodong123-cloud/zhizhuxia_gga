#!/usr/bin/env python3
import argparse
import hmac
import json
import math
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data" / "games"
TOKEN_ENV_NAME = "ZHIZHUXIA_RAG_TOKEN"


def tokenize(text):
    text = (text or "").lower()
    latin = re.findall(r"[a-z0-9]+", text)
    chinese = re.findall(r"[\u4e00-\u9fff]", text)
    return latin + chinese


def normalize_game_id(game_id):
    value = (game_id or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{1,48}", value):
        raise ValueError("gameId must match [a-z0-9_-]{1,48}")
    return value


def knowledge_path(game_id):
    return DATA_ROOT / normalize_game_id(game_id) / "knowledge.jsonl"


def load_documents(game_id):
    path = knowledge_path(game_id)
    if not path.exists():
        return []
    docs = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            docs.append(json.loads(line))
    return docs


def save_documents(game_id, docs):
    path = knowledge_path(game_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for doc in docs:
            handle.write(json.dumps(doc, ensure_ascii=False, sort_keys=True) + "\n")


def merge_documents(existing, incoming):
    by_id = {doc["id"]: doc for doc in existing if doc.get("id")}
    for doc in incoming:
        doc_id = str(doc.get("id") or "").strip()
        text = str(doc.get("text") or "").strip()
        if not doc_id:
            raise ValueError("document id is required")
        if not text:
            raise ValueError(f"document {doc_id} text is required")
        by_id[doc_id] = {
            "id": doc_id,
            "title": str(doc.get("title") or doc_id).strip(),
            "text": text,
            "tags": doc.get("tags") if isinstance(doc.get("tags"), list) else [],
            "source": str(doc.get("source") or "manual").strip(),
        }
    return list(by_id.values())


def score_document(query_terms, doc):
    text = " ".join([
        str(doc.get("title") or ""),
        str(doc.get("text") or ""),
        " ".join(str(tag) for tag in doc.get("tags", [])),
    ]).lower()
    doc_terms = tokenize(text)
    if not query_terms or not doc_terms:
        return 0.0
    term_counts = {}
    for term in doc_terms:
        term_counts[term] = term_counts.get(term, 0) + 1
    score = 0.0
    for term in query_terms:
        count = term_counts.get(term, 0)
        if count:
            score += 1.0 + math.log(count)
        elif term in text:
            score += 0.6
    return score


def query_documents(game_id, query, limit=5):
    docs = load_documents(game_id)
    terms = tokenize(query)
    ranked = []
    for doc in docs:
        score = score_document(terms, doc)
        if score > 0:
            ranked.append((score, doc))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        {
            "id": doc.get("id"),
            "title": doc.get("title"),
            "text": doc.get("text"),
            "tags": doc.get("tags", []),
            "source": doc.get("source", "manual"),
            "score": round(score, 4),
        }
        for score, doc in ranked[: max(1, min(int(limit or 5), 20))]
    ]


def list_games():
    if not DATA_ROOT.exists():
        return []
    return sorted(path.name for path in DATA_ROOT.iterdir() if (path / "knowledge.jsonl").exists())


def is_authorized(configured_token, authorization_header):
    if not configured_token:
        return True
    if not authorization_header:
        return False
    scheme, _, token = authorization_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False
    return hmac.compare_digest(token.strip(), configured_token.strip())


class RagHandler(BaseHTTPRequestHandler):
    server_version = "ZhizhuxiaRag/0.1"

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/health":
            self._send_json(200, {"ok": True, "service": "zhizhuxia-rag", "games": list_games()})
            return
        self._send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        route = urlparse(self.path).path
        try:
            if route.startswith("/api/rag/") and not is_authorized(
                os.environ.get(TOKEN_ENV_NAME),
                self.headers.get("Authorization"),
            ):
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return
            payload = self._read_json()
            if route == "/api/rag/query":
                game_id = normalize_game_id(payload.get("gameId"))
                query = str(payload.get("query") or "").strip()
                if not query:
                    raise ValueError("query is required")
                results = query_documents(game_id, query, payload.get("limit", 5))
                self._send_json(200, {"ok": True, "gameId": game_id, "query": query, "results": results})
                return
            if route == "/api/rag/upsert":
                game_id = normalize_game_id(payload.get("gameId"))
                docs = payload.get("documents")
                if not isinstance(docs, list) or not docs:
                    raise ValueError("documents must be a non-empty array")
                merged = merge_documents(load_documents(game_id), docs)
                save_documents(game_id, merged)
                self._send_json(200, {"ok": True, "gameId": game_id, "count": len(merged)})
                return
            self._send_json(404, {"ok": False, "error": "not_found"})
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "invalid json"})


def run(host, port):
    server = ThreadingHTTPServer((host, port), RagHandler)
    print(f"zhizhuxia-rag listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5188)
    args = parser.parse_args()
    run(args.host, args.port)
