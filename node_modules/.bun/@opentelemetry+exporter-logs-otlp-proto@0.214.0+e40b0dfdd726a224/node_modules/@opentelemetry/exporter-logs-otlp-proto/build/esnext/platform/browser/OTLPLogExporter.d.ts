import type { OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base';
import { OTLPExporterBase } from '@opentelemetry/otlp-exporter-base';
import type { ReadableLogRecord, LogRecordExporter } from '@opentelemetry/sdk-logs';
/**
 * Collector Trace Exporter for Web
 */
export declare class OTLPLogExporter extends OTLPExporterBase<ReadableLogRecord[]> implements LogRecordExporter {
    constructor(config?: OTLPExporterConfigBase);
}
//# sourceMappingURL=OTLPLogExporter.d.ts.map