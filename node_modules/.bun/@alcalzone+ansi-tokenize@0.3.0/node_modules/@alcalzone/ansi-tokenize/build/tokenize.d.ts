export interface AnsiCode {
    type: "ansi";
    code: string;
    endCode: string;
}
export interface ControlCode {
    type: "control";
    code: string;
}
export interface Char {
    type: "char";
    value: string;
    fullWidth: boolean;
}
export type Token = AnsiCode | ControlCode | Char;
export declare function tokenize(str: string, endChar?: number): Token[];
