/**
 * @hidden
 */
export declare class StringUtils {
    /**
     * Check if stringified object is empty
     * @param strObj
     */
    static isEmptyObj(strObj?: string): boolean;
    static startsWith(str: string, search: string): boolean;
    static endsWith(str: string, search: string): boolean;
    /**
     * Parses string into an object.
     *
     * @param query
     */
    static queryStringToObject<T>(query: string): T;
    /**
     * Trims entries in an array.
     *
     * @param arr
     */
    static trimArrayEntries(arr: Array<string>): Array<string>;
    /**
     * Removes empty strings from array
     * @param arr
     */
    static removeEmptyStringsFromArray(arr: Array<string>): Array<string>;
    /**
     * Attempts to parse a string into JSON
     * @param str
     */
    static jsonParseHelper<T>(str: string): T | null;
}
//# sourceMappingURL=StringUtils.d.ts.map