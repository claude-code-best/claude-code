import { parseRfc7231DateTime } from "@smithy/core/serde";
import { HttpResponse } from "@smithy/protocol-http";
export function parseRetryAfterHeader(response, logger) {
    if (!HttpResponse.isInstance(response)) {
        return;
    }
    for (const header of Object.keys(response.headers)) {
        const h = header.toLowerCase();
        if (h === "retry-after") {
            const retryAfter = response.headers[header];
            let retryAfterSeconds = NaN;
            if (retryAfter.endsWith("GMT")) {
                try {
                    const date = parseRfc7231DateTime(retryAfter);
                    retryAfterSeconds = (date.getTime() - Date.now()) / 1000;
                }
                catch (e) {
                    logger?.trace?.("Failed to parse retry-after header");
                    logger?.trace?.(e);
                }
            }
            else if (retryAfter.match(/ GMT, ((\d+)|(\d+\.\d+))$/)) {
                retryAfterSeconds = Number(retryAfter.match(/ GMT, ([\d.]+)$/)?.[1]);
            }
            else if (retryAfter.match(/^((\d+)|(\d+\.\d+))$/)) {
                retryAfterSeconds = Number(retryAfter);
            }
            else if (Date.parse(retryAfter) >= Date.now()) {
                retryAfterSeconds = (Date.parse(retryAfter) - Date.now()) / 1000;
            }
            if (isNaN(retryAfterSeconds)) {
                return;
            }
            return new Date(Date.now() + retryAfterSeconds * 1000);
        }
        else if (h === "x-amz-retry-after") {
            const v = response.headers[header];
            const backoffMilliseconds = Number(v);
            if (isNaN(backoffMilliseconds)) {
                logger?.trace?.(`Failed to parse x-amz-retry-after=${v}`);
                return;
            }
            return new Date(Date.now() + backoffMilliseconds);
        }
    }
}
export function getRetryAfterHint(response, logger) {
    return parseRetryAfterHeader(response, logger);
}
