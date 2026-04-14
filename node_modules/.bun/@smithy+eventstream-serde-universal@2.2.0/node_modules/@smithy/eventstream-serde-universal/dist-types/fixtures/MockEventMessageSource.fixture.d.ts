/// <reference types="node" />
/// <reference types="node" />
import { Readable, ReadableOptions } from "stream";
/**
 * @internal
 */
export interface MockEventMessageSourceOptions extends ReadableOptions {
    messages: Array<Buffer>;
    emitSize: number;
    throwError?: Error;
}
/**
 * @internal
 */
export declare class MockEventMessageSource extends Readable {
    private readonly data;
    private readonly emitSize;
    private readonly throwError?;
    private readCount;
    constructor(options: MockEventMessageSourceOptions);
    _read(): void;
}
