/**
 * Shared MACRO define map used by both dev.ts (runtime -d flags)
 * and build.ts (Bun.build define option).
 *
 * Each value is a JSON-stringified expression that replaces the
 * corresponding MACRO.* identifier at transpile / bundle time.
 */
export function getMacroDefines(): Record<string, string> {
    return {
        "MACRO.VERSION": JSON.stringify("2.1.888"),
        "MACRO.BUILD_TIME": JSON.stringify(new Date().toISOString()),
        "MACRO.FEEDBACK_CHANNEL": JSON.stringify(""),
        "MACRO.ISSUES_EXPLAINER": JSON.stringify(""),
        "MACRO.NATIVE_PACKAGE_URL": JSON.stringify(""),
        "MACRO.PACKAGE_URL": JSON.stringify(""),
        "MACRO.VERSION_CHANGELOG": JSON.stringify(""),
    };
}
