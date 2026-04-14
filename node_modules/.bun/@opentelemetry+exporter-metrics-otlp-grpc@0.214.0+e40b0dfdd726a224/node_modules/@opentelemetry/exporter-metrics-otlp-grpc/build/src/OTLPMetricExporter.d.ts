import type { OTLPMetricExporterOptions } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporterBase } from '@opentelemetry/exporter-metrics-otlp-http';
import type { OTLPGRPCExporterConfigNode } from '@opentelemetry/otlp-grpc-exporter-base';
/**
 * OTLP-gRPC metric exporter
 */
export declare class OTLPMetricExporter extends OTLPMetricExporterBase {
    constructor(config?: OTLPGRPCExporterConfigNode & OTLPMetricExporterOptions);
}
//# sourceMappingURL=OTLPMetricExporter.d.ts.map