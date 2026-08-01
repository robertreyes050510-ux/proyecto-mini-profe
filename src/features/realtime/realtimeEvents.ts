export type RealtimeServerEvent = {
  type?: string;
  event_id?: string;
  response_id?: string;
  transcript?: string;
  text?: string;
  delta?: string;
  error?: {
    message?: string;
  };
  response?: {
    id?: string;
    status?: string;
  };
};

export function parseRealtimeEvent(rawEvent: MessageEvent<string>) {
  try {
    return JSON.parse(rawEvent.data) as RealtimeServerEvent;
  } catch {
    return null;
  }
}
