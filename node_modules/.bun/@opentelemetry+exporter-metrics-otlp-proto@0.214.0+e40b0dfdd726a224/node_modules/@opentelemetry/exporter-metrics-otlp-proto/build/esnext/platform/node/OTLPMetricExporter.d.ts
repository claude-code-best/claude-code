import type { OTLPMetricExporterOptions } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporterBase } from '@opentelemetry/exporter-metrics-otlp-http';
import type { OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
export declare class OTLPMetricExporter extends OTLPMetricExporterBase {
    constructor(config?: OTLPExporterNodeConfigBase & OTLPMetricExporterOptions);
}
//# sourceMappingURL=OTLPMetricExporter.d.ts.map