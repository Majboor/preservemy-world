import type { GameConfig, PlayerSnapshot, RemotePlayerSnapshot, SceneManifest } from "../types";

export interface RoomState {
  roomId: string;
  serverUrl: string;
  shareLink?: string;
  status: "idle" | "connecting" | "connected" | "offline";
  mapId?: string;
  version?: string;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

export function defaultRoomServer(): string {
  const host = window.location.hostname || "localhost";
  return `http://${host}:8765`;
}

export function currentRoomFromUrl(): Pick<RoomState, "roomId" | "serverUrl"> | undefined {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room");
  if (!roomId) return undefined;
  return {
    roomId,
    serverUrl: params.get("server") || defaultRoomServer(),
  };
}

export async function createRoom(serverUrl: string, gameConfig: GameConfig, map?: Pick<RoomState, "mapId" | "version">) {
  const response = await fetch(`${trimSlash(serverUrl)}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameConfig, mapId: map?.mapId, version: map?.version }),
  });
  if (!response.ok) throw new Error(`Room server returned ${response.status}`);
  return response.json() as Promise<{ roomId: string }>;
}

export interface DeployResult {
  mapId: string;
  version: string;
  manifestUrl: string;
  shareUrl?: string;
}

export async function deployMapVersion(serverUrl: string, manifest: SceneManifest, mapId?: string) {
  const base = trimSlash(serverUrl);
  const endpoint = mapId
    ? `${base}/api/maps/${encodeURIComponent(mapId)}/versions`
    : `${base}/api/maps`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest }),
  });
  if (!response.ok) throw new Error(`Map server returned ${response.status}`);
  return response.json() as Promise<DeployResult>;
}

export async function uploadMapBundle(serverUrl: string, files: FileList | File[]) {
  const form = new FormData();
  Array.from(files).forEach((file) => form.append("files", file, file.name));
  const response = await fetch(`${trimSlash(serverUrl)}/api/maps`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(`Map upload returned ${response.status}`);
  return response.json() as Promise<DeployResult>;
}

export function buildManifestShareUrl(manifestUrl: string, room?: Pick<RoomState, "roomId" | "serverUrl">): string {
  const url = new URL(window.location.href);
  url.searchParams.set("manifest", manifestUrl);
  if (room?.roomId) {
    url.searchParams.set("room", room.roomId);
    url.searchParams.set("server", room.serverUrl);
  }
  url.hash = "";
  return url.toString();
}

export async function sendPlayer(serverUrl: string, roomId: string, clientId: string, player: PlayerSnapshot) {
  await fetch(`${trimSlash(serverUrl)}/api/rooms/${encodeURIComponent(roomId)}/players/${encodeURIComponent(clientId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(player),
  });
}

export async function getPlayers(serverUrl: string, roomId: string, clientId: string) {
  const response = await fetch(`${trimSlash(serverUrl)}/api/rooms/${encodeURIComponent(roomId)}/players`);
  if (!response.ok) throw new Error(`Room server returned ${response.status}`);
  const data = await response.json() as { players?: RemotePlayerSnapshot[] };
  return (data.players ?? []).filter((player) => player.id !== clientId);
}

export function openRoomSocket(serverUrl: string, roomId: string, clientId: string): WebSocket | undefined {
  if (!("WebSocket" in window)) return undefined;
  const base = trimSlash(serverUrl).replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const socket = new WebSocket(`${base}/ws/rooms/${encodeURIComponent(roomId)}?client=${encodeURIComponent(clientId)}`);
  return socket;
}
