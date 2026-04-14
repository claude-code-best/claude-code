import { isIntensityCode } from "./ansiCodes.js";
import { undoAnsiCodes } from "./undo.js";
/**
 * Returns the minimum amount of ANSI codes necessary to get from the compound style `from` to `to`.
 * Both `from` and `to` are expected to be reduced.
 */
export function diffAnsiCodes(from, to) {
    const endCodesInTo = new Set(to.map((code) => code.endCode));
    const startCodesInTo = new Set(to.map((code) => code.code));
    const startCodesInFrom = new Set(from.map((code) => code.code));
    return [
        // Ignore all styles in `from` that are not overwritten or removed by `to`
        // Disable all styles in `from` that are removed in `to`
        ...undoAnsiCodes(from.filter((code) => {
            // Special case: Intensity codes (1m, 2m) can coexist (both end with 22m).
            // We have to check the start codes for those, otherwise we might miss a reset.
            if (isIntensityCode(code)) {
                return !startCodesInTo.has(code.code);
            }
            return !endCodesInTo.has(code.endCode);
        })),
        // Add all styles in `to` that don't exist in `from`
        ...to.filter((code) => !startCodesInFrom.has(code.code)),
    ];
}
//# sourceMappingURL=diff.js.map