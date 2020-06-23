import { RawSecret } from '../models/Secret';

export enum WebSocketOpCodes {
  CONNECTION_REQUEST,
  MESSAGE,
}

export enum RTCOpCode {
  SYNC_REQUEST,
  SYNC_RESPONSE,
  SYNC_TRUTH,
  UPDATE,
  PING,
  PONG,
}

export interface RTCUpdate {
  data: RawSecret | null;
  id: string;
}

export interface RTCSync {
  secrets: Record<string, RawSecret>;
  deleted: string[];
}

export interface RTCUpdatePacket {
  op: RTCOpCode.UPDATE;
  d: RTCUpdate;
}

export interface RTCSyncPacket {
  op: RTCOpCode.SYNC_REQUEST | RTCOpCode.SYNC_RESPONSE | RTCOpCode.SYNC_TRUTH;
  d: RTCSync;
}

export interface RTCEmptyPacket {
  op: RTCOpCode.PING | RTCOpCode.PONG;
  d: undefined;
}

export type RTCPacket = RTCSyncPacket | RTCEmptyPacket | RTCUpdatePacket;
