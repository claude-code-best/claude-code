/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationTelemetry } from "../../config/ClientConfiguration.js";
import { getAndFlushLogsFromCache, Logger } from "../../logger/Logger.js";
import {
    InProgressPerformanceEvent,
    IPerformanceClient,
    PerformanceCallbackFunction,
} from "./IPerformanceClient.js";
import {
    EXT_FIELD_PREFIX,
    IntFields,
    PerformanceEvent,
    PerformanceEventContext,
    PerformanceEventStackedContext,
    PerformanceEventStatus,
} from "./PerformanceEvent.js";
import { AuthError } from "../../error/AuthError.js";
import { CacheError } from "../../error/CacheError.js";
import { ServerError } from "../../error/ServerError.js";
import { InteractionRequiredAuthError } from "../../error/InteractionRequiredAuthError.js";
import { AccountInfo } from "../../account/AccountInfo.js";

/**
 * Starts context by adding payload to the stack
 * @param event {PerformanceEvent}
 * @param stack {?PerformanceEventStackedContext[]} stack
 */
export function startContext(
    event: PerformanceEvent,
    stack?: PerformanceEventStackedContext[]
): void {
    if (!stack) {
        return;
    }

    stack.push({
        name: event.name,
    });
}

/**
 * Ends context by removing payload from the stack and returning parent or self, if stack is empty, payload
 *
 * @param event {PerformanceEvent}
 * @param stack {?PerformanceEventStackedContext[]} stack
 * @param error {?unknown} error
 */
export function endContext(
    event: PerformanceEvent,
    stack?: PerformanceEventStackedContext[],
    error?: unknown
): PerformanceEventContext | undefined {
    if (!stack?.length) {
        return;
    }

    const peek = (stack: PerformanceEventStackedContext[]) => {
        return stack.length ? stack[stack.length - 1] : undefined;
    };

    const abbrEventName = event.name;
    const top = peek(stack);
    if (top?.name !== abbrEventName) {
        return;
    }

    const current = stack?.pop();
    if (!current) {
        return;
    }

    const errorCode =
        error instanceof AuthError
            ? error.errorCode
            : error instanceof Error
            ? error.name
            : undefined;
    const subErr = error instanceof AuthError ? error.subError : undefined;

    if (errorCode && current.childErr !== errorCode) {
        current.err = errorCode;
        if (subErr) {
            current.subErr = subErr;
        }
    }

    delete current.name;
    delete current.childErr;

    const context: PerformanceEventContext = {
        ...current,
        dur: event.durationMs,
    };

    if (!event.success) {
        context.fail = 1;
    }

    const parent = peek(stack);
    if (!parent) {
        return { [abbrEventName]: context };
    }

    if (errorCode) {
        parent.childErr = errorCode;
    }

    let childName: string;
    if (!parent[abbrEventName]) {
        childName = abbrEventName;
    } else {
        const siblings = Object.keys(parent).filter((key) =>
            key.startsWith(abbrEventName)
        ).length;
        childName = `${abbrEventName}_${siblings + 1}`;
    }
    parent[childName] = context;
    return parent;
}

/**
 * Adds error name and stack trace to the telemetry event
 * @param error {Error}
 * @param logger {Logger}
 * @param event {PerformanceEvent}
 * @param stackMaxSize {number} max error stack size to capture
 */
export function addError(
    error: unknown,
    logger: Logger,
    event: PerformanceEvent,
    stackMaxSize: number = 5
): void {
    if (!(error instanceof Error)) {
        logger.trace(
            "PerformanceClient.addErrorStack: Input error is not instance of Error",
            event.correlationId
        );
        return;
    } else if (error instanceof AuthError) {
        event.errorCode = error.errorCode;
        event.subErrorCode = error.subError;
        if (
            !event.serverErrorNo &&
            (error instanceof ServerError ||
                error instanceof InteractionRequiredAuthError) &&
            error.errorNo
        ) {
            event.serverErrorNo = error.errorNo;
        }
        return;
    } else if (error instanceof CacheError) {
        event.errorCode = error.errorCode;
        return;
    } else if (event.errorStack?.length) {
        logger.trace(
            "PerformanceClient.addErrorStack: Stack already exist",
            event.correlationId
        );
        return;
    } else if (!error.stack?.length) {
        logger.trace(
            "PerformanceClient.addErrorStack: Input stack is empty",
            event.correlationId
        );
        return;
    }

    if (error.stack) {
        event.errorStack = compactStack(error.stack, stackMaxSize);
    }
    event.errorName = error.name;
}

/**
 * Compacts error stack into array by fetching N first entries
 * @param stack {string} error stack
 * @param stackMaxSize {number} max error stack size to capture
 * @returns {string[]}
 */
export function compactStack(stack: string, stackMaxSize: number): string[] {
    if (stackMaxSize < 0) {
        return [];
    }

    const stackArr = stack.split("\n") || [];

    const res = [];

    // Check for a handful of known, common runtime errors and log them (with redaction where applicable).
    const firstLine = stackArr[0];
    if (
        firstLine.startsWith("TypeError: Cannot read property") ||
        firstLine.startsWith("TypeError: Cannot read properties of") ||
        firstLine.startsWith("TypeError: Cannot set property") ||
        firstLine.startsWith("TypeError: Cannot set properties of") ||
        firstLine.endsWith("is not a function")
    ) {
        // These types of errors are not at risk of leaking PII. They will indicate unavailable APIs
        res.push(compactStackLine(firstLine));
    } else if (
        firstLine.startsWith("SyntaxError") ||
        firstLine.startsWith("TypeError")
    ) {
        // Prevent unintentional leaking of arbitrary info by redacting contents between both single and double quotes
        res.push(
            compactStackLine(
                // Example: SyntaxError: Unexpected token 'e', "test" is not valid JSON -> SyntaxError: Unexpected token <redacted>, <redacted> is not valid JSON
                firstLine.replace(/['].*[']|["].*["]/g, "<redacted>")
            )
        );
    }

    // Get top N stack lines
    for (let ix = 1; ix < stackArr.length; ix++) {
        if (res.length >= stackMaxSize) {
            break;
        }
        const line = stackArr[ix];
        res.push(compactStackLine(line));
    }
    return res;
}

/**
 * Compacts error stack line by shortening file path
 * Example: https://localhost/msal-common/src/authority/Authority.js:100:1 -> Authority.js:100:1
 * @param line {string} stack line
 * @returns {string}
 */
export function compactStackLine(line: string): string {
    const filePathIx = line.lastIndexOf(" ") + 1;
    if (filePathIx < 1) {
        return line;
    }
    const filePath = line.substring(filePathIx);

    let fileNameIx = filePath.lastIndexOf("/");
    fileNameIx = fileNameIx < 0 ? filePath.lastIndexOf("\\") : fileNameIx;

    if (fileNameIx >= 0) {
        return (
            line.substring(0, filePathIx) +
            "(" +
            filePath.substring(fileNameIx + 1) +
            (filePath.charAt(filePath.length - 1) === ")" ? "" : ")")
        ).trimStart();
    }

    return line.trimStart();
}

export function getAccountType(
    account?: AccountInfo
): "AAD" | "MSA" | "B2C" | undefined {
    const idTokenClaims = account?.idTokenClaims;
    if (idTokenClaims?.tfp || idTokenClaims?.acr) {
        return "B2C";
    }

    if (!idTokenClaims?.tid) {
        return undefined;
    } else if (idTokenClaims?.tid === "9188040d-6c67-4c5b-b112-36a304b66dad") {
        return "MSA";
    }
    return "AAD";
}

export abstract class PerformanceClient implements IPerformanceClient {
    protected authority: string;
    protected libraryName: string;
    protected libraryVersion: string;
    protected applicationTelemetry: ApplicationTelemetry;
    protected clientId: string;
    protected logger: Logger;
    protected callbacks: Map<string, PerformanceCallbackFunction>;

    /**
     * Multiple events with the same correlation id.
     * @protected
     * @type {Map<string, PerformanceEvent>}
     */
    protected eventsByCorrelationId: Map<string, PerformanceEvent>;

    protected intFields: Set<string>;

    /**
     * Map of stacked events by correlation id.
     *
     * @protected
     */
    protected eventStack: Map<string, PerformanceEventStackedContext[]>;

    /**
     * Creates an instance of PerformanceClient,
     * an abstract class containing core performance telemetry logic.
     *
     * @constructor
     * @param {string} clientId Client ID of the application
     * @param {string} authority Authority used by the application
     * @param {Logger} logger Logger used by the application
     * @param {string} libraryName Name of the library
     * @param {string} libraryVersion Version of the library
     * @param {ApplicationTelemetry} applicationTelemetry application name and version
     * @param {Set<String>} intFields integer fields to be truncated
     */
    constructor(
        clientId: string,
        authority: string,
        logger: Logger,
        libraryName: string,
        libraryVersion: string,
        applicationTelemetry: ApplicationTelemetry,
        intFields?: Set<string>
    ) {
        this.authority = authority;
        this.libraryName = libraryName;
        this.libraryVersion = libraryVersion;
        this.applicationTelemetry = applicationTelemetry;
        this.clientId = clientId;
        this.logger = logger;
        this.callbacks = new Map();
        this.eventsByCorrelationId = new Map();
        this.eventStack = new Map();
        this.intFields = intFields || new Set();
        for (const item of IntFields) {
            this.intFields.add(item);
        }
    }

    /**
     * Generates and returns a unique id, typically a guid.
     *
     * @abstract
     * @returns {string}
     */
    abstract generateId(): string;

    /**
     * Starts measuring performance for a given operation. Returns a function that should be used to end the measurement.
     *
     * @param {PerformanceEvents} measureName
     * @param {?string} [correlationId]
     * @returns {InProgressPerformanceEvent}
     */
    startMeasurement(
        measureName: string,
        correlationId?: string
    ): InProgressPerformanceEvent {
        // Generate a placeholder correlation if the request does not provide one
        const eventCorrelationId = correlationId || this.generateId();

        const inProgressEvent: PerformanceEvent = {
            eventId: this.generateId(),
            status: PerformanceEventStatus.InProgress,
            authority: this.authority,
            libraryName: this.libraryName,
            libraryVersion: this.libraryVersion,
            clientId: this.clientId,
            name: measureName,
            startTimeMs: Date.now(),
            correlationId: eventCorrelationId,
            appName: this.applicationTelemetry?.appName,
            appVersion: this.applicationTelemetry?.appVersion,
        };

        // Store in progress events so they can be discarded if not ended properly
        this.cacheEventByCorrelationId(inProgressEvent);
        startContext(inProgressEvent, this.eventStack.get(eventCorrelationId));

        // Return the event and functions the caller can use to properly end/flush the measurement
        return {
            end: (
                event?: Partial<PerformanceEvent>,
                error?: unknown,
                account?: AccountInfo
            ): PerformanceEvent | null => {
                return this.endMeasurement(
                    {
                        // Initial set of event properties
                        ...inProgressEvent,
                        // Properties set when event ends
                        ...event,
                    },
                    error,
                    account
                );
            },
            discard: () => {
                return this.discardMeasurements(inProgressEvent.correlationId);
            },
            add: (fields: { [key: string]: {} | undefined }) => {
                return this.addFields(fields, inProgressEvent.correlationId);
            },
            increment: (fields: { [key: string]: number | undefined }) => {
                return this.incrementFields(
                    fields,
                    inProgressEvent.correlationId
                );
            },
            event: inProgressEvent,
        };
    }

    /**
     * Stops measuring the performance for an operation. Should only be called directly by PerformanceClient classes,
     * as consumers should instead use the function returned by startMeasurement.
     * Adds a new field named as "[event name]DurationMs" for sub-measurements, completes and emits an event
     * otherwise.
     *
     * @param {PerformanceEvent} event
     * @param {unknown} error
     * @param {AccountInfo?} account
     * @returns {(PerformanceEvent | null)}
     */
    endMeasurement(
        event: PerformanceEvent,
        error?: unknown,
        account?: AccountInfo
    ): PerformanceEvent | null {
        const rootEvent: PerformanceEvent | undefined =
            this.eventsByCorrelationId.get(event.correlationId);
        if (!rootEvent) {
            this.logger.trace(
                `PerformanceClient: Measurement not found for '${event.eventId}'`,
                event.correlationId
            );
            return null;
        }

        const isRoot = event.eventId === rootEvent.eventId;

        event.durationMs = Math.round(
            event.durationMs || this.getDurationMs(event.startTimeMs)
        );

        const context = JSON.stringify(
            endContext(
                event,
                this.eventStack.get(rootEvent.correlationId),
                error
            )
        );

        if (isRoot) {
            this.discardMeasurements(rootEvent.correlationId);
        } else {
            rootEvent.incompleteSubMeasurements?.delete(event.eventId);
        }

        if (error) {
            addError(error, this.logger, rootEvent);
        }

        // Add sub-measurement attribute to root event's ext field.
        if (!isRoot) {
            rootEvent.ext = {
                ...rootEvent.ext,
                ...event.ext,
            };
            rootEvent.ext[event.name + "DurationMs"] = Math.floor(
                event.durationMs
            );
            return { ...rootEvent };
        }

        if (
            isRoot &&
            !error &&
            (rootEvent.errorCode || rootEvent.subErrorCode)
        ) {
            this.logger.trace(
                `PerformanceClient: Remove error and sub-error codes for root event '${event.name}' as intermediate error was successfully handled`,
                event.correlationId
            );
            rootEvent.errorCode = undefined;
            rootEvent.subErrorCode = undefined;
        }

        let finalEvent: PerformanceEvent = { ...rootEvent, ...event };
        let incompleteSubsCount: number = 0;
        // Incomplete sub-measurements are discarded. They are likely an instrumentation bug that should be fixed.
        finalEvent.incompleteSubMeasurements?.forEach((subMeasurement) => {
            this.logger.trace(
                `PerformanceClient: Incomplete submeasurement '${subMeasurement.name}' found for '${event.name}'`,
                finalEvent.correlationId
            );
            incompleteSubsCount++;
        });
        finalEvent.incompleteSubMeasurements = undefined;

        const logs = getAndFlushLogsFromCache(event.correlationId);
        // Format logs: [millis1,hash1;millis2,hash2;...]
        const formattedLogs = logs
            .map(
                (logMessage) => `${logMessage.milliseconds},${logMessage.hash}`
            )
            .join(";");

        finalEvent = {
            ...finalEvent,
            status: PerformanceEventStatus.Completed,
            incompleteSubsCount,
            context,
            logs: formattedLogs,
        };
        if (account) {
            finalEvent.accountType = getAccountType(account);
            finalEvent.dataBoundary = account.dataBoundary;
        }

        this.truncateIntegralFields(finalEvent);
        this.emitEvents([finalEvent], event.correlationId);

        return finalEvent;
    }

    /**
     * Saves extra information to be emitted when the measurements are flushed
     * @param fields
     * @param correlationId
     */
    addFields(
        fields: { [key: string]: {} | undefined },
        correlationId: string
    ): void {
        const event = this.eventsByCorrelationId.get(correlationId);
        if (event) {
            const staticFields: { [key: string]: {} | undefined } = {};
            const dynamicFields: Record<string, string | number> = {};

            for (const key in fields) {
                if (key.startsWith(EXT_FIELD_PREFIX)) {
                    const dynamicKey = key.slice(EXT_FIELD_PREFIX.length);
                    const value = fields[key];
                    if (
                        typeof value === "string" ||
                        typeof value === "number"
                    ) {
                        dynamicFields[dynamicKey] = value;
                    }
                } else {
                    staticFields[key] = fields[key];
                }
            }

            const updatedEvent: PerformanceEvent = {
                ...event,
                ...staticFields,
            };
            if (Object.keys(dynamicFields).length) {
                updatedEvent.ext = {
                    ...updatedEvent.ext,
                    ...dynamicFields,
                };
            }

            this.eventsByCorrelationId.set(correlationId, updatedEvent);
        } else {
            this.logger.trace(
                "PerformanceClient: Event not found for",
                correlationId
            );
        }
    }

    /**
     * Increment counters to be emitted when the measurements are flushed
     * @param fields {string[]}
     * @param correlationId {string} correlation identifier
     */
    incrementFields(
        fields: { [key: string]: number | undefined },
        correlationId: string
    ): void {
        const event = this.eventsByCorrelationId.get(correlationId);
        if (event) {
            for (const counter in fields) {
                if (counter.startsWith(EXT_FIELD_PREFIX)) {
                    event.ext = event.ext || {};
                    // Route to ext sub-object
                    const dynamicKey = counter.slice(EXT_FIELD_PREFIX.length);
                    const currentValue = event.ext[dynamicKey];
                    if (currentValue === undefined) {
                        event.ext[dynamicKey] = 0;
                    } else if (isNaN(Number(currentValue))) {
                        return;
                    }
                    event.ext[dynamicKey] =
                        (Number(event.ext[dynamicKey]) || 0) +
                        (fields[counter] ?? 0);
                } else {
                    /* eslint-disable custom-msal/no-dynamic-telemetry-fields -- internal dispatching of static fields by name */
                    if (!event.hasOwnProperty(counter)) {
                        event[counter] = 0;
                    } else if (isNaN(Number(event[counter]))) {
                        return;
                    }
                    event[counter] += fields[counter];
                    /* eslint-enable custom-msal/no-dynamic-telemetry-fields */
                }
            }
        } else {
            this.logger.trace(
                "PerformanceClient: Event not found for",
                correlationId
            );
        }
    }

    /**
     * Upserts event into event cache.
     * First key is the correlation id, second key is the event id.
     * Allows for events to be grouped by correlation id,
     * and to easily allow for properties on them to be updated.
     *
     * @private
     * @param {PerformanceEvent} event
     */
    protected cacheEventByCorrelationId(event: PerformanceEvent): void {
        const rootEvent = this.eventsByCorrelationId.get(event.correlationId);
        if (rootEvent) {
            rootEvent.incompleteSubMeasurements =
                rootEvent.incompleteSubMeasurements || new Map();
            rootEvent.incompleteSubMeasurements.set(event.eventId, {
                name: event.name,
                startTimeMs: event.startTimeMs,
            });
        } else {
            this.eventsByCorrelationId.set(event.correlationId, { ...event });
            this.eventStack.set(event.correlationId, []);
        }
    }

    /**
     * Removes measurements and aux data for a given correlation id.
     *
     * @param {string} correlationId
     */
    discardMeasurements(correlationId: string): void {
        this.eventsByCorrelationId.delete(correlationId);
        this.eventStack.delete(correlationId);
    }

    /**
     * Registers a callback function to receive performance events.
     *
     * @param {PerformanceCallbackFunction} callback
     * @returns {string}
     */
    addPerformanceCallback(callback: PerformanceCallbackFunction): string {
        for (const [id, cb] of this.callbacks) {
            if (cb.toString() === callback.toString()) {
                this.logger.warning(
                    `PerformanceClient: Performance callback is already registered with id: ${id}`,
                    ""
                );
                return id;
            }
        }

        const callbackId = this.generateId();
        this.callbacks.set(callbackId, callback);
        this.logger.verbose(
            `PerformanceClient: Performance callback registered with id: '${callbackId}'`,
            ""
        );

        return callbackId;
    }

    /**
     * Removes a callback registered with addPerformanceCallback.
     *
     * @param {string} callbackId
     * @returns {boolean}
     */
    removePerformanceCallback(callbackId: string): boolean {
        const result = this.callbacks.delete(callbackId);

        if (result) {
            this.logger.verbose(
                `PerformanceClient: Performance callback '${callbackId}' removed.`,
                ""
            );
        } else {
            this.logger.verbose(
                `PerformanceClient: Performance callback '${callbackId}' not removed.`,
                ""
            );
        }

        return result;
    }

    /**
     * Emits events to all registered callbacks.
     *
     * @param {PerformanceEvent[]} events
     * @param {?string} [correlationId]
     */
    emitEvents(events: PerformanceEvent[], correlationId: string): void {
        this.logger.verbose(
            "PerformanceClient: Emitting performance events",
            correlationId
        );

        this.callbacks.forEach(
            (callback: PerformanceCallbackFunction, callbackId: string) => {
                this.logger.trace(
                    `PerformanceClient: Emitting event to callback '${callbackId}'`,
                    correlationId
                );
                callback.apply(null, [events]);
            }
        );
    }

    /**
     * Enforce truncation of integral fields in performance event.
     * @param {PerformanceEvent} event performance event to update.
     */
    private truncateIntegralFields(event: PerformanceEvent): void {
        this.intFields.forEach((key) => {
            /* eslint-disable custom-msal/no-dynamic-telemetry-fields -- internal truncation of known integer fields */
            if (key in event && typeof event[key] === "number") {
                event[key] = Math.floor(event[key]);
            }
            /* eslint-enable custom-msal/no-dynamic-telemetry-fields */
        });
    }

    /**
     * Returns event duration in milliseconds
     * @param startTimeMs {number}
     * @returns {number}
     */
    private getDurationMs(startTimeMs: number): number {
        const durationMs = Date.now() - startTimeMs;
        // Handle clock skew
        return durationMs < 0 ? durationMs : 0;
    }
}
