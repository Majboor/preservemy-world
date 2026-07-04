#!/usr/bin/env python3
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

try:
  from aiohttp import WSMsgType, web
except ModuleNotFoundError:
  root = Path(__file__).resolve().parent
  venv = root / ".share-server-venv"
  python = venv / "bin" / "python"
  pip = venv / "bin" / "pip"
  if os.environ.get("GORGON_SERVER_BOOTSTRAPPED") == "1":
    print("Missing dependency: aiohttp. Install with: python3 -m pip install -r requirements.txt", file=sys.stderr)
    raise
  print("Bootstrapping local share-server Python environment...", file=sys.stderr)
  subprocess.check_call([sys.executable, "-m", "venv", str(venv)])
  subprocess.check_call([str(pip), "install", "-r", str(root / "requirements.txt")])
  env = os.environ.copy()
  env["GORGON_SERVER_BOOTSTRAPPED"] = "1"
  os.execve(str(python), [str(python), __file__, *sys.argv[1:]], env)


HOST = "0.0.0.0"
PORT = 8765
PLAYER_TTL_SECONDS = 8
ROOT = Path(__file__).resolve().parent
STORAGE = ROOT / "map-storage"

rooms = {}
room_sockets = {}


def now_ms():
  return int(time.time() * 1000)


def clean_players(room):
  stale = [
    player_id for player_id, player in room.setdefault("players", {}).items()
    if time.time() - player.get("seenAt", 0) > PLAYER_TTL_SECONDS
  ]
  for player_id in stale:
    del room["players"][player_id]


def json_response(payload, status=200):
  return web.json_response(payload, status=status, headers=cors_headers())


def cors_headers():
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  }


@web.middleware
async def cors_middleware(request, handler):
  if request.method == "OPTIONS":
    return web.Response(status=200, headers=cors_headers())
  response = await handler(request)
  for key, value in cors_headers().items():
    response.headers.setdefault(key, value)
  return response


def public_base(request):
  return f"{request.scheme}://{request.host}"


def map_dir(map_id, version):
  return STORAGE / map_id / "versions" / version


def version_id(map_id):
  base = STORAGE / map_id / "versions"
  if not base.exists():
    return "v1"
  count = len([path for path in base.iterdir() if path.is_dir()])
  return f"v{count + 1}"


def manifest_url(request, map_id, version):
  return f"{public_base(request)}/api/maps/{quote(map_id)}/versions/{quote(version)}/scene-manifest.json"


def file_url(request, map_id, version, filename):
  return f"{public_base(request)}/api/maps/{quote(map_id)}/versions/{quote(version)}/{quote(filename)}"


def is_absolute_url(value):
  return isinstance(value, str) and (value.startswith("http://") or value.startswith("https://") or value.startswith("data:"))


def rewrite_asset_urls(request, manifest, map_id, version, files):
  next_manifest = dict(manifest)
  for key in ["plyUrl", "loaderPreviewUrl", "trajectoryUrl", "collisionUrl"]:
    value = next_manifest.get(key)
    if not isinstance(value, str) or is_absolute_url(value):
      continue
    filename = Path(value.replace("./", "")).name
    if filename in files:
      next_manifest[key] = file_url(request, map_id, version, filename)
  return next_manifest


def infer_manifest(uploaded):
  manifest = uploaded.get("scene-manifest.json") or uploaded.get("manifest.json")
  if manifest:
    return json.loads(manifest.decode("utf-8"))

  ply = next((name for name in uploaded if name.lower().endswith(".ply")), "scene.ply")
  trajectory = next((name for name in uploaded if "trajectory" in name.lower() and name.lower().endswith(".json")), "trajectory.json")
  preview = next((name for name in uploaded if "loader" in name.lower() and name.lower().endswith(".json")), "loader-point-cloud.json")
  return {
    "plyUrl": f"./{ply}",
    "loaderPreviewUrl": f"./{preview}",
    "trajectoryUrl": f"./{trajectory}",
    "bounds": {"lo": [-6, -4, -26], "hi": [10, 4, 11]},
    "collectibleSeed": f"uploaded-{secrets.token_hex(4)}",
  }


async def persist_map_version(request, map_id, version, manifest, uploaded=None):
  uploaded = uploaded or {}
  target = map_dir(map_id, version)
  target.mkdir(parents=True, exist_ok=True)

  for filename, data in uploaded.items():
    (target / Path(filename).name).write_bytes(data)

  manifest = rewrite_asset_urls(request, manifest, map_id, version, set(uploaded.keys()))
  (target / "scene-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
  return {
    "mapId": map_id,
    "version": version,
    "manifestUrl": manifest_url(request, map_id, version),
  }


async def health(request):
  return json_response({"ok": True, "rooms": len(rooms), "maps": len(list((STORAGE).glob("*"))) if STORAGE.exists() else 0})


async def create_map(request):
  map_id = secrets.token_urlsafe(6)
  version = "v1"
  uploaded = {}

  if request.content_type.startswith("multipart/"):
    reader = await request.multipart()
    async for part in reader:
      if part.name != "files" or not part.filename:
        continue
      uploaded[Path(part.filename).name] = await part.read(decode=False)
    manifest = infer_manifest(uploaded)
  else:
    payload = await request.json()
    manifest = payload.get("manifest") or payload.get("gameConfig") or {}

  result = await persist_map_version(request, map_id, version, manifest, uploaded)
  return json_response(result)


async def create_map_version(request):
  map_id = request.match_info["map_id"]
  payload = await request.json()
  manifest = payload.get("manifest") or payload.get("gameConfig") or {}
  version = version_id(map_id)
  result = await persist_map_version(request, map_id, version, manifest)
  return json_response(result)


async def get_manifest(request):
  path = map_dir(request.match_info["map_id"], request.match_info["version"]) / "scene-manifest.json"
  if not path.exists():
    return json_response({"error": "manifest not found"}, status=404)
  return web.Response(text=path.read_text(encoding="utf-8"), content_type="application/json", headers=cors_headers())


async def get_map_file(request):
  filename = Path(request.match_info["filename"]).name
  path = map_dir(request.match_info["map_id"], request.match_info["version"]) / filename
  if not path.exists() or path.name == "scene-manifest.json":
    return json_response({"error": "file not found"}, status=404)
  return web.FileResponse(path, headers=cors_headers())


async def create_room(request):
  payload = await request.json()
  room_id = secrets.token_urlsafe(5)
  rooms[room_id] = {
    "createdAt": time.time(),
    "mode": payload.get("mode", "fpv"),
    "gameConfig": payload.get("gameConfig"),
    "mapId": payload.get("mapId"),
    "version": payload.get("version"),
    "players": {},
    "match": {"status": "waiting", "score": {}},
  }
  return json_response({"roomId": room_id})


async def get_room(request):
  room_id = request.match_info["room_id"]
  room = rooms.get(room_id)
  if not room:
    return json_response({"error": "room not found"}, status=404)
  clean_players(room)
  return json_response({
    "roomId": room_id,
    "mode": room.get("mode"),
    "gameConfig": room.get("gameConfig"),
    "mapId": room.get("mapId"),
    "version": room.get("version"),
    "players": list(room.get("players", {}).values()),
    "match": room.get("match"),
  })


async def get_players(request):
  room_id = request.match_info["room_id"]
  room = rooms.get(room_id)
  if not room:
    return json_response({"error": "room not found"}, status=404)
  clean_players(room)
  return json_response({"players": list(room.get("players", {}).values())})


async def update_player(request):
  room_id = request.match_info["room_id"]
  player_id = request.match_info["player_id"]
  room = rooms.get(room_id)
  if not room:
    return json_response({"error": "room not found"}, status=404)
  player = await request.json()
  player.update({"id": player_id, "updatedAt": now_ms(), "seenAt": time.time()})
  room.setdefault("players", {})[player_id] = player
  clean_players(room)
  return json_response({"ok": True})


async def broadcast_players(room_id):
  room = rooms.get(room_id)
  if not room:
    return
  clean_players(room)
  payload = json.dumps({"type": "players", "players": list(room.get("players", {}).values()), "match": room.get("match")})
  dead = []
  for ws in room_sockets.get(room_id, set()):
    if ws.closed:
      dead.append(ws)
      continue
    await ws.send_str(payload)
  for ws in dead:
    room_sockets.get(room_id, set()).discard(ws)


async def broadcast_event(room_id, payload):
  data = json.dumps(payload)
  for ws in list(room_sockets.get(room_id, set())):
    if not ws.closed:
      await ws.send_str(data)


async def room_socket(request):
  room_id = request.match_info["room_id"]
  room = rooms.setdefault(room_id, {
    "createdAt": time.time(),
    "mode": "fpv",
    "players": {},
    "match": {"status": "waiting", "score": {}},
  })
  client_id = request.query.get("client") or secrets.token_urlsafe(6)
  ws = web.WebSocketResponse(heartbeat=10)
  await ws.prepare(request)
  room_sockets.setdefault(room_id, set()).add(ws)
  await ws.send_str(json.dumps({"type": "joined", "roomId": room_id, "clientId": client_id, "match": room.get("match")}))
  await broadcast_players(room_id)

  async for message in ws:
    if message.type != WSMsgType.TEXT:
      continue
    try:
      payload = json.loads(message.data)
    except json.JSONDecodeError:
      continue
    kind = payload.get("type")
    if kind == "player":
      player = payload.get("player") or {}
      player.update({"id": client_id, "updatedAt": now_ms(), "seenAt": time.time()})
      room.setdefault("players", {})[client_id] = player
      await broadcast_players(room_id)
    elif kind in {"shot", "hit", "respawn", "score", "match"}:
      if kind == "score":
        score = room.setdefault("match", {}).setdefault("score", {})
        player_id = payload.get("playerId") or client_id
        score[player_id] = int(score.get(player_id, 0)) + int(payload.get("delta", 1))
      await broadcast_event(room_id, {"type": kind, "from": client_id, **payload})

  room_sockets.get(room_id, set()).discard(ws)
  room.setdefault("players", {}).pop(client_id, None)
  await broadcast_players(room_id)
  return ws


def create_app():
  app = web.Application(middlewares=[cors_middleware], client_max_size=1024 ** 3)
  app.router.add_route("GET", "/health", health)
  app.router.add_route("POST", "/api/maps", create_map)
  app.router.add_route("POST", "/api/maps/{map_id}/versions", create_map_version)
  app.router.add_route("GET", "/api/maps/{map_id}/versions/{version}/scene-manifest.json", get_manifest)
  app.router.add_route("GET", "/api/maps/{map_id}/versions/{version}/{filename}", get_map_file)
  app.router.add_route("POST", "/api/rooms", create_room)
  app.router.add_route("GET", "/api/rooms/{room_id}", get_room)
  app.router.add_route("GET", "/api/rooms/{room_id}/players", get_players)
  app.router.add_route("POST", "/api/rooms/{room_id}/players/{player_id}", update_player)
  app.router.add_route("GET", "/ws/rooms/{room_id}", room_socket)
  app.router.add_route("OPTIONS", "/{tail:.*}", lambda request: web.Response(status=200, headers=cors_headers()))
  return app


if __name__ == "__main__":
  STORAGE.mkdir(parents=True, exist_ok=True)
  print(f"Share server listening on http://{HOST}:{PORT}")
  web.run_app(create_app(), host=HOST, port=PORT)
