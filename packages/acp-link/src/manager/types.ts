export type InstanceStatus = "running" | "stopped" | "failed";

export interface AcpInstance {
  id: string;
  group: string;
  command: string;
  status: InstanceStatus;
  pid: number | undefined;
  startTime: number;
  exitCode: number | null;
  logs: LogEntry[];
  subscribers: Set<(entry: LogEntry) => void>;
}

export interface LogEntry {
  timestamp: number;
  stream: "stdout" | "stderr";
  text: string;
}

export interface CreateInstanceRequest {
  group: string;
  command: string;
}

export interface InstanceSummary {
  id: string;
  group: string;
  command: string;
  status: InstanceStatus;
  pid: number | undefined;
  startTime: number;
  exitCode: number | null;
}
