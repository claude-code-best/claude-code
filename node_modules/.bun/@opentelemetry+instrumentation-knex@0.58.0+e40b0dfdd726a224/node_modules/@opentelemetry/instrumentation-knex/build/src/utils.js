"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTableName = exports.extractPortFromConnectionString = exports.extractHostFromConnectionString = exports.extractDatabaseFromConnectionString = exports.limitLength = exports.getName = exports.mapSystem = exports.otelExceptionFromKnexError = exports.getFormatter = void 0;
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const semconv_1 = require("./semconv");
const getFormatter = (runner) => {
    if (runner) {
        if (runner.client) {
            if (runner.client._formatQuery) {
                return runner.client._formatQuery.bind(runner.client);
            }
            else if (runner.client.SqlString) {
                return runner.client.SqlString.format.bind(runner.client.SqlString);
            }
        }
        if (runner.builder) {
            return runner.builder.toString.bind(runner.builder);
        }
    }
    return () => '<noop formatter>';
};
exports.getFormatter = getFormatter;
function otelExceptionFromKnexError(err, message) {
    if (!(err && err instanceof Error)) {
        return err;
    }
    return {
        message,
        code: err.code,
        stack: err.stack,
        name: err.name,
    };
}
exports.otelExceptionFromKnexError = otelExceptionFromKnexError;
const systemMap = new Map([
    ['sqlite3', semconv_1.DB_SYSTEM_NAME_VALUE_SQLITE],
    ['pg', semantic_conventions_1.DB_SYSTEM_NAME_VALUE_POSTGRESQL],
]);
const mapSystem = (knexSystem) => {
    return systemMap.get(knexSystem) || knexSystem;
};
exports.mapSystem = mapSystem;
const getName = (db, operation, table) => {
    if (operation) {
        if (table) {
            return `${operation} ${db}.${table}`;
        }
        return `${operation} ${db}`;
    }
    return db;
};
exports.getName = getName;
const limitLength = (str, maxLength) => {
    if (typeof str === 'string' &&
        typeof maxLength === 'number' &&
        0 < maxLength &&
        maxLength < str.length) {
        return str.substring(0, maxLength) + '..';
    }
    return str;
};
exports.limitLength = limitLength;
/**
 * Helpers to extract connection details from a Knex connectionString.
 * When Knex is configured via `connection.connectionString` instead of
 * explicit fields like `host`, `port`, and `database`, these values are
 * embedded in the URL and must be parsed out.
 * e.g. "postgres://user:pass@localhost:5432/mydb"
 */
const extractDatabaseFromConnectionString = (connectionString) => {
    if (!connectionString)
        return undefined;
    try {
        const db = new URL(connectionString).pathname?.replace(/^\//, '');
        return db || undefined;
    }
    catch {
        return undefined;
    }
};
exports.extractDatabaseFromConnectionString = extractDatabaseFromConnectionString;
const extractHostFromConnectionString = (connectionString) => {
    if (!connectionString)
        return undefined;
    try {
        return new URL(connectionString).hostname || undefined;
    }
    catch {
        return undefined;
    }
};
exports.extractHostFromConnectionString = extractHostFromConnectionString;
const extractPortFromConnectionString = (connectionString) => {
    if (!connectionString)
        return undefined;
    try {
        const port = new URL(connectionString).port;
        return port ? parseInt(port, 10) : undefined;
    }
    catch {
        return undefined;
    }
};
exports.extractPortFromConnectionString = extractPortFromConnectionString;
const extractTableName = (builder) => {
    const table = builder?._single?.table;
    if (typeof table === 'object') {
        return (0, exports.extractTableName)(table);
    }
    return table;
};
exports.extractTableName = extractTableName;
//# sourceMappingURL=utils.js.map