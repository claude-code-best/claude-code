import { Exception } from '@opentelemetry/api';
type KnexError = Error & {
    code?: string;
};
export declare const getFormatter: (runner: any) => any;
export declare function otelExceptionFromKnexError(err: KnexError, message: string): Exception;
export declare const mapSystem: (knexSystem: string) => string;
export declare const getName: (db: string, operation?: string, table?: string) => string;
export declare const limitLength: (str: string, maxLength: number) => string;
/**
 * Helpers to extract connection details from a Knex connectionString.
 * When Knex is configured via `connection.connectionString` instead of
 * explicit fields like `host`, `port`, and `database`, these values are
 * embedded in the URL and must be parsed out.
 * e.g. "postgres://user:pass@localhost:5432/mydb"
 */
export declare const extractDatabaseFromConnectionString: (connectionString?: string) => string | undefined;
export declare const extractHostFromConnectionString: (connectionString?: string) => string | undefined;
export declare const extractPortFromConnectionString: (connectionString?: string) => number | undefined;
export declare const extractTableName: (builder: any) => string;
export {};
//# sourceMappingURL=utils.d.ts.map