import type { ChannelCredentials, Metadata } from '@grpc/grpc-js';
import type { CompressionAlgorithm, OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base';
/**
 * OTLP Exporter Config for Node
 */
export interface OTLPGRPCExporterConfigNode extends Omit<OTLPExporterConfigBase, 'headers'> {
    credentials?: ChannelCredentials;
    metadata?: Metadata;
    compression?: CompressionAlgorithm;
    userAgent?: string;
}
//# sourceMappingURL=types.d.ts.map