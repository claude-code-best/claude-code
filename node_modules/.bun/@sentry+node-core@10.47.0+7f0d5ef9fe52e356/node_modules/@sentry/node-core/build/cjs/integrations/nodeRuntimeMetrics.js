Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const perf_hooks = require('perf_hooks');
const core = require('@sentry/core');

const INTEGRATION_NAME = 'NodeRuntimeMetrics';
const DEFAULT_INTERVAL_MS = 30000;
const EVENT_LOOP_DELAY_RESOLUTION_MS = 10;

/**
 * Automatically collects Node.js runtime metrics and emits them to Sentry.
 *
 * @example
 * ```ts
 * Sentry.init({
 *   integrations: [
 *     Sentry.nodeRuntimeMetricsIntegration(),
 *   ],
 * });
 * ```
 */
const nodeRuntimeMetricsIntegration = core.defineIntegration((options = {}) => {
  const collectionIntervalMs = options.collectionIntervalMs ?? DEFAULT_INTERVAL_MS;
  const collect = {
    // Default on
    cpuUtilization: true,
    memHeapUsed: true,
    memHeapTotal: true,
    memRss: true,
    eventLoopDelayP50: true,
    eventLoopDelayP99: true,
    eventLoopUtilization: true,
    uptime: true,
    // Default off
    cpuTime: false,
    memExternal: false,
    eventLoopDelayMin: false,
    eventLoopDelayMax: false,
    eventLoopDelayMean: false,
    eventLoopDelayP90: false,
    ...options.collect,
  };

  const needsEventLoopDelay =
    collect.eventLoopDelayP99 ||
    collect.eventLoopDelayMin ||
    collect.eventLoopDelayMax ||
    collect.eventLoopDelayMean ||
    collect.eventLoopDelayP50 ||
    collect.eventLoopDelayP90;

  const needsCpu = collect.cpuUtilization || collect.cpuTime;

  let intervalId;
  let prevCpuUsage;
  let prevElu;
  let prevFlushTime = 0;
  let eventLoopDelayHistogram;

  const resolutionNs = EVENT_LOOP_DELAY_RESOLUTION_MS * 1e6;
  const nsToS = (ns) => Math.max(0, (ns - resolutionNs) / 1e9);

  const METRIC_ATTRIBUTES = { attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };
  const METRIC_ATTRIBUTES_BYTE = { unit: 'byte', attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };
  const METRIC_ATTRIBUTES_SECOND = { unit: 'second', attributes: { 'sentry.origin': 'auto.node.runtime_metrics' } };

  function collectMetrics() {
    const now = core._INTERNAL_safeDateNow();
    const elapsed = now - prevFlushTime;

    if (needsCpu && prevCpuUsage !== undefined) {
      const delta = process.cpuUsage(prevCpuUsage);

      if (collect.cpuTime) {
        core.metrics.gauge('node.runtime.cpu.user', delta.user / 1e6, METRIC_ATTRIBUTES_SECOND);
        core.metrics.gauge('node.runtime.cpu.system', delta.system / 1e6, METRIC_ATTRIBUTES_SECOND);
      }
      if (collect.cpuUtilization && elapsed > 0) {
        // Ratio of CPU time to wall-clock time. Can exceed 1.0 on multi-core systems.
        // TODO: In cluster mode, add a runtime_id/process_id attribute to disambiguate per-worker metrics.
        core.metrics.gauge(
          'node.runtime.cpu.utilization',
          (delta.user + delta.system) / (elapsed * 1000),
          METRIC_ATTRIBUTES,
        );
      }

      prevCpuUsage = process.cpuUsage();
    }

    if (collect.memRss || collect.memHeapUsed || collect.memHeapTotal || collect.memExternal) {
      const mem = process.memoryUsage();
      if (collect.memRss) {
        core.metrics.gauge('node.runtime.mem.rss', mem.rss, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapUsed) {
        core.metrics.gauge('node.runtime.mem.heap_used', mem.heapUsed, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memHeapTotal) {
        core.metrics.gauge('node.runtime.mem.heap_total', mem.heapTotal, METRIC_ATTRIBUTES_BYTE);
      }
      if (collect.memExternal) {
        core.metrics.gauge('node.runtime.mem.external', mem.external, METRIC_ATTRIBUTES_BYTE);
        core.metrics.gauge('node.runtime.mem.array_buffers', mem.arrayBuffers, METRIC_ATTRIBUTES_BYTE);
      }
    }

    if (needsEventLoopDelay && eventLoopDelayHistogram) {
      if (collect.eventLoopDelayMin) {
        core.metrics.gauge(
          'node.runtime.event_loop.delay.min',
          nsToS(eventLoopDelayHistogram.min),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayMax) {
        core.metrics.gauge(
          'node.runtime.event_loop.delay.max',
          nsToS(eventLoopDelayHistogram.max),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayMean) {
        core.metrics.gauge(
          'node.runtime.event_loop.delay.mean',
          nsToS(eventLoopDelayHistogram.mean),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayP50) {
        core.metrics.gauge(
          'node.runtime.event_loop.delay.p50',
          nsToS(eventLoopDelayHistogram.percentile(50)),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayP90) {
        core.metrics.gauge(
          'node.runtime.event_loop.delay.p90',
          nsToS(eventLoopDelayHistogram.percentile(90)),
          METRIC_ATTRIBUTES_SECOND,
        );
      }
      if (collect.eventLoopDelayP99) {
        core.metrics.gauge(
          'node.runtime.event_loop.delay.p99',
          nsToS(eventLoopDelayHistogram.percentile(99)),
          METRIC_ATTRIBUTES_SECOND,
        );
      }

      eventLoopDelayHistogram.reset();
    }

    if (collect.eventLoopUtilization && prevElu !== undefined) {
      const currentElu = perf_hooks.performance.eventLoopUtilization();
      const delta = perf_hooks.performance.eventLoopUtilization(currentElu, prevElu);
      core.metrics.gauge('node.runtime.event_loop.utilization', delta.utilization, METRIC_ATTRIBUTES);
      prevElu = currentElu;
    }

    if (collect.uptime && elapsed > 0) {
      core.metrics.count('node.runtime.process.uptime', elapsed / 1000, METRIC_ATTRIBUTES_SECOND);
    }

    prevFlushTime = now;
  }

  return {
    name: INTEGRATION_NAME,

    setup() {
      if (needsEventLoopDelay) {
        // Disable any previous histogram before overwriting (prevents native resource leak on re-init).
        eventLoopDelayHistogram?.disable();
        try {
          eventLoopDelayHistogram = perf_hooks.monitorEventLoopDelay({ resolution: EVENT_LOOP_DELAY_RESOLUTION_MS });
          eventLoopDelayHistogram.enable();
        } catch {
          // Not available in all runtimes (e.g. Bun throws NotImplementedError).
          eventLoopDelayHistogram = undefined;
        }
      }

      // Prime baselines before the first collection interval.
      if (needsCpu) {
        prevCpuUsage = process.cpuUsage();
      }
      if (collect.eventLoopUtilization) {
        prevElu = perf_hooks.performance.eventLoopUtilization();
      }
      prevFlushTime = core._INTERNAL_safeDateNow();

      // Guard against double setup (e.g. re-init).
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = core._INTERNAL_safeUnref(setInterval(collectMetrics, collectionIntervalMs));
    },
  };
});

exports.nodeRuntimeMetricsIntegration = nodeRuntimeMetricsIntegration;
//# sourceMappingURL=nodeRuntimeMetrics.js.map
