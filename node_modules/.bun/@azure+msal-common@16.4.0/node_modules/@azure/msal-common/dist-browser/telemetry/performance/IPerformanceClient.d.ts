import { PerformanceEvent } from "./PerformanceEvent.js";
import { AccountInfo } from "../../account/AccountInfo.js";
export type PerformanceCallbackFunction = (events: PerformanceEvent[]) => void;
export type InProgressPerformanceEvent = {
    end: (event?: Partial<PerformanceEvent>, error?: unknown, account?: AccountInfo) => PerformanceEvent | null;
    discard: () => void;
    add: (fields: {
        [key: string]: {} | undefined;
    }) => void;
    increment: (fields: {
        [key: string]: number | undefined;
    }) => void;
    event: PerformanceEvent;
};
export interface IPerformanceClient {
    startMeasurement(measureName: string, correlationId?: string): InProgressPerformanceEvent;
    endMeasurement(event: PerformanceEvent): PerformanceEvent | null;
    discardMeasurements(correlationId: string): void;
    addFields(fields: {
        [key: string]: {} | undefined;
    }, correlationId: string): void;
    incrementFields(fields: {
        [key: string]: number | undefined;
    }, correlationId: string): void;
    removePerformanceCallback(callbackId: string): boolean;
    addPerformanceCallback(callback: PerformanceCallbackFunction): string;
    emitEvents(events: PerformanceEvent[], correlationId: string): void;
    generateId(): string;
}
//# sourceMappingURL=IPerformanceClient.d.ts.map