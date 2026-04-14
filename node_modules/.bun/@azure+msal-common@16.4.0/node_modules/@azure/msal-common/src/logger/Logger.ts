/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LoggerOptions } from "../config/ClientConfiguration.js";

/**
 * Options for logger messages.
 */
export type LoggerMessageOptions = {
    logLevel: LogLevel;
    containsPii?: boolean;
    context?: string;
    correlationId: string;
};

/**
 * Log message level.
 */
export enum LogLevel {
    Error,
    Warning,
    Info,
    Verbose,
    Trace,
}

/**
 * Callback to send the messages to.
 */
export interface ILoggerCallback {
    (level: LogLevel, message: string, containsPii: boolean): void;
}

/**
 * Represents a single logged message with metadata
 */
export interface LoggedMessage {
    hash: string;
    level: LogLevel;
    containsPii: boolean;
    milliseconds: number;
}

/**
 * LRU cache node for correlation ID management
 */
interface CorrelationLogData {
    logs: LoggedMessage[];
    firstEventTime: number;
}

// Shared cache state for better minification - using Map's insertion order for LRU
const CACHE_CAPACITY = 50;
const MAX_LOGS_PER_CORRELATION = 500;
const correlationCache = new Map<string, CorrelationLogData>();

/**
 * Mark correlation ID as recently used by moving it to end of Map
 * @param correlationId
 * @param {CorrelationLogData} data
 */
function markAsRecentlyUsed(
    correlationId: string,
    data: CorrelationLogData
): void {
    correlationCache.delete(correlationId);
    correlationCache.set(correlationId, data);
}

/**
 * Add log message to cache for specific correlation ID
 * @param correlationId
 * @param {LoggedMessage} loggedMessage
 */
function addLogToCache(
    correlationId: string,
    loggedMessage: LoggedMessage
): void {
    const currentTime = Date.now();

    let data = correlationCache.get(correlationId);

    if (data) {
        // Mark as recently used
        markAsRecentlyUsed(correlationId, data);
    } else {
        // Create new entry
        data = { logs: [], firstEventTime: currentTime };
        correlationCache.set(correlationId, data);

        // Remove LRU (first entry) if capacity exceeded
        if (correlationCache.size > CACHE_CAPACITY) {
            const firstKey = correlationCache.keys().next().value;
            if (firstKey) {
                correlationCache.delete(firstKey);
            }
        }
    }

    // Add log to the data, maintaining max logs per correlation
    data.logs.push({
        ...loggedMessage,
        milliseconds: currentTime - data.firstEventTime,
    });
    if (data.logs.length > MAX_LOGS_PER_CORRELATION) {
        data.logs.shift(); // Remove oldest log
    }
}

/**
 * Get all logs for specific correlation ID
 * @param correlationId
 */
export function getLogsFromCache(correlationId: string): LoggedMessage[] {
    const data = correlationCache.get(correlationId);
    if (data) {
        markAsRecentlyUsed(correlationId, data);
        return [...data.logs]; // Return copy
    }
    return [];
}

/**
 * Get logs for correlation ID and flush them from cache
 * Attaches logs with empty correlation id to the requested correlation logs
 * @param correlationId
 */
export function getAndFlushLogsFromCache(
    correlationId: string
): LoggedMessage[] {
    const res: LoggedMessage[] = [];
    for (const id of ["", correlationId]) {
        const data = correlationCache.get(id);
        res.push(...(data?.logs ?? []));
        correlationCache.delete(id); // Remove the correlation ID completely from cache
    }
    return res;
}

/**
 * Get all correlation IDs that have logs
 */
export function getCachedCorrelationIds(): string[] {
    return Array.from(correlationCache.keys());
}

/**
 * Checks if a string is already a hashed logging string (6 alphanumeric characters)
 */
function isHashedString(str: string): boolean {
    if (str.length !== 6) {
        return false;
    }

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const isAlphaNumeric =
            (char >= "a" && char <= "z") ||
            (char >= "A" && char <= "Z") ||
            (char >= "0" && char <= "9");
        if (!isAlphaNumeric) {
            return false;
        }
    }

    return true;
}

/**
 * Class which facilitates logging of messages to a specific place.
 */
export class Logger {
    // Current log level, defaults to info.
    private level: LogLevel = LogLevel.Info;

    // Boolean describing whether PII logging is allowed.
    private piiLoggingEnabled: boolean;

    // Callback to send messages to.
    private localCallback: ILoggerCallback;

    // Package name implementing this logger
    private packageName: string;

    // Package version implementing this logger
    private packageVersion: string;

    constructor(
        loggerOptions: LoggerOptions,
        packageName?: string,
        packageVersion?: string
    ) {
        const defaultLoggerCallback = () => {
            return;
        };
        const setLoggerOptions =
            loggerOptions || Logger.createDefaultLoggerOptions();
        this.localCallback =
            setLoggerOptions.loggerCallback || defaultLoggerCallback;
        this.piiLoggingEnabled = setLoggerOptions.piiLoggingEnabled || false;
        this.level =
            typeof setLoggerOptions.logLevel === "number"
                ? setLoggerOptions.logLevel
                : LogLevel.Info;
        this.packageName = packageName || "";
        this.packageVersion = packageVersion || "";
    }

    private static createDefaultLoggerOptions(): LoggerOptions {
        return {
            loggerCallback: () => {
                // allow users to not set loggerCallback
            },
            piiLoggingEnabled: false,
            logLevel: LogLevel.Info,
        };
    }

    /**
     * Create new Logger with existing configurations.
     */
    public clone(packageName: string, packageVersion: string): Logger {
        return new Logger(
            {
                loggerCallback: this.localCallback,
                piiLoggingEnabled: this.piiLoggingEnabled,
                logLevel: this.level,
            },
            packageName,
            packageVersion
        );
    }

    /**
     * Log message with required options.
     */
    private logMessage(
        logMessage: string,
        options: LoggerMessageOptions
    ): void {
        const correlationId = options.correlationId;
        const isHashedInput = isHashedString(logMessage);

        if (isHashedInput) {
            const loggedMessage: LoggedMessage = {
                hash: logMessage,
                level: options.logLevel,
                containsPii: options.containsPii || false,
                milliseconds: 0, // Will be calculated in addLogToCache
            };
            addLogToCache(correlationId, loggedMessage);
        }

        if (
            options.logLevel > this.level ||
            (!this.piiLoggingEnabled && options.containsPii)
        ) {
            return;
        }
        const timestamp = new Date().toUTCString();

        // Add correlationId to logs if set, correlationId provided on log messages take precedence
        const logHeader = `[${timestamp}] : [${correlationId}]`;

        const log = `${logHeader} : ${this.packageName}@${
            this.packageVersion
        } : ${LogLevel[options.logLevel]} - ${logMessage}`;

        this.executeCallback(
            options.logLevel,
            log,
            options.containsPii || false
        );
    }

    /**
     * Execute callback with message.
     */
    executeCallback(
        level: LogLevel,
        message: string,
        containsPii: boolean
    ): void {
        if (this.localCallback) {
            this.localCallback(level, message, containsPii);
        }
    }

    /**
     * Logs error messages.
     */
    error(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Error,
            containsPii: false,
            correlationId: correlationId,
        });
    }

    /**
     * Logs error messages with PII.
     */
    errorPii(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Error,
            containsPii: true,
            correlationId: correlationId,
        });
    }

    /**
     * Logs warning messages.
     */
    warning(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Warning,
            containsPii: false,
            correlationId: correlationId,
        });
    }

    /**
     * Logs warning messages with PII.
     */
    warningPii(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Warning,
            containsPii: true,
            correlationId: correlationId,
        });
    }

    /**
     * Logs info messages.
     */
    info(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Info,
            containsPii: false,
            correlationId: correlationId,
        });
    }

    /**
     * Logs info messages with PII.
     */
    infoPii(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Info,
            containsPii: true,
            correlationId: correlationId,
        });
    }

    /**
     * Logs verbose messages.
     */
    verbose(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Verbose,
            containsPii: false,
            correlationId: correlationId,
        });
    }

    /**
     * Logs verbose messages with PII.
     */
    verbosePii(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Verbose,
            containsPii: true,
            correlationId: correlationId,
        });
    }

    /**
     * Logs trace messages.
     */
    trace(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Trace,
            containsPii: false,
            correlationId: correlationId,
        });
    }

    /**
     * Logs trace messages with PII.
     */
    tracePii(message: string, correlationId: string): void {
        this.logMessage(message, {
            logLevel: LogLevel.Trace,
            containsPii: true,
            correlationId: correlationId,
        });
    }

    /**
     * Returns whether PII Logging is enabled or not.
     */
    isPiiLoggingEnabled(): boolean {
        return this.piiLoggingEnabled || false;
    }
}
