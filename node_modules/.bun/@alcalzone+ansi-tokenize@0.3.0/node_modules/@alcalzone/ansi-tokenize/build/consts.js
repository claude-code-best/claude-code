// Named ANSI control characters
const BEL = "\x07";
const ESC = "\x1b";
const BACKSLASH = "\\";
const CSI = "[";
const OSC = "]";
const C1_ST = "\x9c";
// Char codes (derived from named characters)
export const CC_BEL = BEL.charCodeAt(0);
export const CC_ESC = ESC.charCodeAt(0);
export const CC_BACKSLASH = BACKSLASH.charCodeAt(0);
export const CC_CSI = CSI.charCodeAt(0);
export const CC_OSC = OSC.charCodeAt(0);
export const CC_C1_ST = C1_ST.charCodeAt(0);
export const CC_0 = "0".charCodeAt(0);
export const CC_9 = "9".charCodeAt(0);
export const CC_SEMI = ";".charCodeAt(0);
export const CC_M = "m".charCodeAt(0);
// Escape code points
export const ESCAPES = new Set([CC_ESC, 0x9b]); // \x1b and \x9b
// OSC 8 hyperlink constants
export const linkCodePrefix = `${ESC}${OSC}8;`;
export const linkCodePrefixCharCodes = linkCodePrefix.split("").map((char) => char.charCodeAt(0));
export const linkCodeSuffix = BEL;
export const linkEndCode = `${ESC}${OSC}8;;${BEL}`;
export const linkEndCodeST = `${ESC}${OSC}8;;${ESC}${BACKSLASH}`;
export const linkEndCodeC1ST = `${ESC}${OSC}8;;${C1_ST}`;
//# sourceMappingURL=consts.js.map