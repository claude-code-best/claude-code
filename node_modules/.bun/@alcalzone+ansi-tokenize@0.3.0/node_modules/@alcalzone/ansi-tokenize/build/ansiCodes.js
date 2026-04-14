import ansiStyles from "ansi-styles";
import { linkCodePrefix, linkCodeSuffix, linkEndCode, linkEndCodeC1ST, linkEndCodeST, } from "./consts.js";
export const endCodesSet = new Set();
const endCodesMap = new Map();
for (const [start, end] of ansiStyles.codes) {
    endCodesSet.add(ansiStyles.color.ansi(end));
    endCodesMap.set(ansiStyles.color.ansi(start), ansiStyles.color.ansi(end));
}
export function getLinkStartCode(url, params) {
    const paramsStr = params
        ? Object.entries(params)
            .map(([k, v]) => `${k}=${v}`)
            .join(":")
        : "";
    return `${linkCodePrefix}${paramsStr};${url}${linkCodeSuffix}`;
}
export function getEndCode(code) {
    if (endCodesSet.has(code))
        return code;
    if (endCodesMap.has(code))
        return endCodesMap.get(code);
    // We have a few special cases to handle here:
    // Links:
    if (code.startsWith(linkCodePrefix)) {
        if (code.endsWith("\x1B\\"))
            return linkEndCodeST;
        if (code.endsWith("\x9C"))
            return linkEndCodeC1ST;
        return linkEndCode; // BEL (\x07)
    }
    code = code.slice(2);
    // 8-bit/24-bit colors:
    if (code.startsWith("38")) {
        return ansiStyles.color.close;
    }
    else if (code.startsWith("48")) {
        return ansiStyles.bgColor.close;
    }
    // Otherwise find the reset code in the ansi-styles map
    const ret = ansiStyles.codes.get(parseInt(code, 10));
    if (ret) {
        return ansiStyles.color.ansi(ret);
    }
    else {
        return ansiStyles.reset.open;
    }
}
export function ansiCodesToString(codes) {
    // Deduplicate ANSI code strings before joining
    const deduplicated = new Set(codes.map((code) => code.code));
    return [...deduplicated].join("");
}
/** Check if a code is an intensity code (bold or dim) - these share endCode 22m but can coexist */
export function isIntensityCode(code) {
    return code.code === ansiStyles.bold.open || code.code === ansiStyles.dim.open;
}
//# sourceMappingURL=ansiCodes.js.map