export type JsonObject = { [k: string]: JsonType };
export type JsonArray = ReadonlyArray<JsonType>;
export type JsonType = JsonObject | JsonArray | string | number | boolean | null;

export function isJsonObject(v: JsonType): v is JsonObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export interface ApiErrorBody {
  message: string;
}

export type Issuer = string;

export interface AuthInfo {
  sessionId: string;
  sessionCreationTime: string;
  issuer: Issuer;
  idAtIssuer: string;
}

export interface Connections {
  nodes: ReadonlyArray<Node>;
  edges: ReadonlyArray<Edge>;
}

export interface Node {
  id: number;
  x: number;
  y: number;
  label: string;
}

export interface Edge {
  source: number;
  target: number;
  label: string;
}