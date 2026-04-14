Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const api = require('@opentelemetry/api');
const exporterTraceOtlpHttp = require('@opentelemetry/exporter-trace-otlp-http');
const sdkTraceBase = require('@opentelemetry/sdk-trace-base');
const core = require('@sentry/core');

const INTEGRATION_NAME = 'OtlpIntegration';

const _otlpIntegration = ((userOptions = {}) => {
  const options = {
    setupOtlpTracesExporter: userOptions.setupOtlpTracesExporter ?? true,
    collectorUrl: userOptions.collectorUrl,
  };

  let _spanProcessor;
  let _tracerProvider;

  return {
    name: INTEGRATION_NAME,

    setup(_client) {
      // Always register external propagation context so that Sentry error/log events
      // are linked to the active OTel trace context.
      core.registerExternalPropagationContext(() => {
        const activeSpan = api.trace.getActiveSpan();
        if (!activeSpan) {
          return undefined;
        }
        const spanContext = activeSpan.spanContext();
        return { traceId: spanContext.traceId, spanId: spanContext.spanId };
      });

      core.debug.log(`[${INTEGRATION_NAME}] External propagation context registered.`);
    },

    afterAllSetup(client) {
      if (options.setupOtlpTracesExporter) {
        setupTracesExporter(client);
      }
    },
  };

  function setupTracesExporter(client) {
    let endpoint;
    let headers;

    if (options.collectorUrl) {
      endpoint = options.collectorUrl;
      core.debug.log(`[${INTEGRATION_NAME}] Sending traces to collector at ${endpoint}`);
    } else {
      const dsn = client.getDsn();
      if (!dsn) {
        core.debug.warn(`[${INTEGRATION_NAME}] No DSN found. OTLP exporter not set up.`);
        return;
      }

      const { protocol, host, port, path, projectId, publicKey } = dsn;

      const basePath = path ? `/${path}` : '';
      const portStr = port ? `:${port}` : '';
      endpoint = `${protocol}://${host}${portStr}${basePath}/api/${projectId}/integration/otlp/v1/traces/`;

      const sdkInfo = client.getSdkMetadata()?.sdk;
      const sentryClient = sdkInfo ? `, sentry_client=${sdkInfo.name}/${sdkInfo.version}` : '';
      headers = {
        'X-Sentry-Auth': `Sentry sentry_version=${core.SENTRY_API_VERSION}, sentry_key=${publicKey}${sentryClient}`,
      };
    }

    let exporter;
    try {
      exporter = new exporterTraceOtlpHttp.OTLPTraceExporter({
        url: endpoint,
        headers,
      });
    } catch (e) {
      core.debug.warn(`[${INTEGRATION_NAME}] Failed to create OTLPTraceExporter:`, e);
      return;
    }

    _spanProcessor = new sdkTraceBase.BatchSpanProcessor(exporter);

    // Add span processor to existing global tracer provider.
    // trace.getTracerProvider() returns a ProxyTracerProvider; unwrap it to get the real provider.
    const globalProvider = api.trace.getTracerProvider();
    const delegate =
      'getDelegate' in globalProvider
        ? (globalProvider ).getDelegate()
        : globalProvider;

    // In OTel v2, addSpanProcessor was removed. We push into the internal _spanProcessors
    // array on the MultiSpanProcessor, which is how OTel's own forceFlush() accesses it.
    const activeProcessor = (delegate )?._activeSpanProcessor

;
    if (activeProcessor?._spanProcessors) {
      activeProcessor._spanProcessors.push(_spanProcessor);
      core.debug.log(`[${INTEGRATION_NAME}] Added span processor to existing TracerProvider.`);
    } else {
      // No user-configured provider; create a minimal one and set it as global
      _tracerProvider = new sdkTraceBase.BasicTracerProvider({
        spanProcessors: [_spanProcessor],
      });
      api.trace.setGlobalTracerProvider(_tracerProvider);
      core.debug.log(`[${INTEGRATION_NAME}] Created new TracerProvider with OTLP span processor.`);
    }

    client.on('flush', () => {
      void _spanProcessor?.forceFlush();
    });

    client.on('close', () => {
      void _spanProcessor?.shutdown();
      void _tracerProvider?.shutdown();
    });
  }
}) ;

/**
 * OTLP integration for the Sentry light SDK.
 *
 * Bridges an existing OpenTelemetry setup with Sentry by:
 * 1. Linking Sentry error/log events to the active OTel trace context
 * 2. Exporting OTel spans to Sentry via OTLP (or to a custom collector)
 */
const otlpIntegration = core.defineIntegration(_otlpIntegration);

exports.otlpIntegration = otlpIntegration;
//# sourceMappingURL=otlpIntegration.js.map
