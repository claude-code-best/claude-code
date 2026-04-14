import type { AnsiCode } from "./tokenize.js";
export declare const endCodesSet: Set<string>;
export declare function getLinkStartCode(url: string, params?: Record<string, string>): string;
export declare function getEndCode(code: string): string;
export declare function ansiCodesToString(codes: AnsiCode[]): string;
/** Check if a code is an intensity code (bold or dim) - these share endCode 22m but can coexist */
export declare function isIntensityCode(code: AnsiCode): boolean;
