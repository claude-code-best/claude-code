Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const debugBuild = require('../../debug-build.js');
const semanticAttributes = require('../../semanticAttributes.js');
const debugLogger = require('../../utils/debug-logger.js');
const spanUtils = require('../../utils/spanUtils.js');
const spanstatus = require('../../tracing/spanstatus.js');
const object = require('../../utils/object.js');
const currentScopes = require('../../currentScopes.js');
const trace = require('../../tracing/trace.js');
const requestLayerStore = require('./request-layer-store.js');
const types = require('./types.js');
const utils = require('./utils.js');
const defaultScopes = require('../../defaultScopes.js');
const setSdkProcessingMetadata = require('./set-sdk-processing-metadata.js');

/**
 * Platform-portable Express tracing integration.
 *
 * @module
 *
 * This Sentry integration is a derivative work based on the OpenTelemetry
 * Express instrumentation.
 *
 * <https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/instrumentation-express>
 *
 * Extended under the terms of the Apache 2.0 license linked below:
 *
 * ----
 *
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


function patchLayer(options, maybeLayer, layerPath) {
  if (!maybeLayer?.handle) {
    return;
  }
  const layer = maybeLayer;

  const layerHandleOriginal = layer.handle;

  // avoid patching multiple times the same layer
  if (object.getOriginalFunction(layerHandleOriginal)) {
    return;
  }

  if (layerHandleOriginal.length === 4) {
    // todo: instrument error handlers
    return;
  }

  function layerHandlePatched(

    req,
    res,
    //oxlint-disable-next-line no-explicit-any
    ...otherArgs
  ) {
    // Set normalizedRequest here because expressRequestHandler middleware
    // (registered via setupExpressErrorHandler) is added after routes and
    // therefore never runs for successful requests — route handlers typically
    // send a response without calling next(). It would be safe to set this
    // multiple times, since the data is identical, but more performant not to.
    setSdkProcessingMetadata.setSDKProcessingMetadata(req);

    // Only create spans when there's an active parent span
    // Without a parent span, this request is being ignored, so skip it
    const parentSpan = spanUtils.getActiveSpan();
    if (!parentSpan) {
      return layerHandleOriginal.apply(this, [req, res, ...otherArgs]);
    }

    if (layerPath) {
      requestLayerStore.storeLayer(req, layerPath);
    }
    const storedLayers = requestLayerStore.getStoredLayers(req);
    const isLayerPathStored = !!layerPath;

    const constructedRoute = utils.getConstructedRoute(req);
    const actualMatchedRoute = utils.getActualMatchedRoute(req, constructedRoute);

    options.onRouteResolved?.(actualMatchedRoute);

    const metadata = utils.getLayerMetadata(constructedRoute, layer, layerPath);
    const name = metadata.attributes[types.ATTR_EXPRESS_NAME];
    const type = metadata.attributes[types.ATTR_EXPRESS_TYPE];
    const attributes = Object.assign(metadata.attributes, {
      [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.express',
      [semanticAttributes.SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.express`,
    });
    if (actualMatchedRoute) {
      attributes[types.ATTR_HTTP_ROUTE] = actualMatchedRoute;
    }

    // verify against the config if the layer should be ignored
    if (utils.isLayerIgnored(metadata.attributes[types.ATTR_EXPRESS_NAME], type, options)) {
      // XXX: the isLayerPathStored guard here is *not* present in the
      // original @opentelemetry/instrumentation-express impl, but was
      // suggested by the Sentry code review bot. It appears to correctly
      // prevent improper layer calculation in the case where there's a
      // middleware without a layerPath argument. It's unclear whether
      // that's possible, or if any existing code depends on that "bug".
      if (isLayerPathStored) {
        storedLayers.pop();
      }
      return layerHandleOriginal.apply(this, [req, res, ...otherArgs]);
    }

    const currentScope = currentScopes.getIsolationScope();
    if (currentScope !== defaultScopes.getDefaultIsolationScope()) {
      if (type === 'request_handler') {
        // type cast b/c Otel unfortunately types info.request as any :(
        const method = req.method ? req.method.toUpperCase() : 'GET';
        currentScope.setTransactionName(`${method} ${constructedRoute}`);
      }
    } else {
      debugBuild.DEBUG_BUILD && debugLogger.debug.warn('Isolation scope is still default isolation scope - skipping setting transactionName');
    }

    return trace.startSpanManual({ name, attributes }, span => {
      let spanHasEnded = false;
      // TODO: Fix router spans (getRouterPath does not work properly) to
      // have useful names before removing this branch
      if (metadata.attributes[types.ATTR_EXPRESS_TYPE] === types.ExpressLayerType_ROUTER) {
        span.end();
        spanHasEnded = true;
      }
      // listener for response.on('finish')
      const onResponseFinish = () => {
        if (!spanHasEnded) {
          spanHasEnded = true;
          span.end();
        }
      };

      // verify we have a callback
      for (let i = 0; i < otherArgs.length; i++) {
        const callback = otherArgs[i] ;
        if (typeof callback !== 'function') {
          continue;
        }

        //oxlint-disable-next-line no-explicit-any
        otherArgs[i] = function (...args) {
          // express considers anything but an empty value, "route" or "router"
          // passed to its callback to be an error
          const maybeError = args[0];
          const isError = !!maybeError && maybeError !== 'route' && maybeError !== 'router';
          if (!spanHasEnded && isError) {
            const [_, message] = utils.asErrorAndMessage(maybeError);
            // intentionally do not record the exception here, because
            // the error handler we assign does that, provided the user
            // correctly calls setupExpressErrorHandler.
            // TODO: A future enhancement can automatically attach
            // the error handler if we detect that it has not been added.
            span.setStatus({
              code: spanstatus.SPAN_STATUS_ERROR,
              message,
            });
          }

          if (!spanHasEnded) {
            spanHasEnded = true;
            res.removeListener('finish', onResponseFinish);
            span.end();
          }
          if (!(req.route && isError) && isLayerPathStored) {
            storedLayers.pop();
          }
          // execute the callback back in the parent's scope, so that
          // we bubble up each level as next() is called.
          return trace.withActiveSpan(parentSpan, () => callback.apply(this, args));
        };
        break;
      }

      try {
        return layerHandleOriginal.apply(this, [req, res, ...otherArgs]);
      } catch (anyError) {
        const [_, message] = utils.asErrorAndMessage(anyError);
        // intentionally do not record the exception here, because
        // the error handler we assign does that, provided the user
        // correctly calls setupExpressErrorHandler.
        // TODO: A future enhancement can automatically attach
        // the error handler if we detect that it has not been added.
        span.setStatus({
          code: spanstatus.SPAN_STATUS_ERROR,
          message,
        });
        throw anyError;
        /* v8 ignore next - it sees the block end at the throw */
      } finally {
        // At this point if the callback wasn't called, that means
        // either the layer is asynchronous (so it will call the
        // callback later on) or that the layer directly ends the
        // http response, so we'll hook into the "finish" event to
        // handle the later case.
        if (!spanHasEnded) {
          res.once('finish', onResponseFinish);
        }
      }
    });
  }

  // `handle` isn't just a regular function in some cases. It also contains
  // some properties holding metadata and state so we need to proxy them
  // through through patched function. Use a for-in to also pick up properties
  // that other libraries might add to the prototype before we instrument.
  // ref: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1950
  // ref: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2271
  // oxlint-disable-next-line guard-for-in
  for (const key in layerHandleOriginal ) {
    // skip standard function prototype fields that both have
    if (key in layerHandlePatched) {
      continue;
    }
    Object.defineProperty(layerHandlePatched, key, {
      get() {
        return layerHandleOriginal[key];
      },
      set(value) {
        layerHandleOriginal[key] = value;
      },
    });
  }

  object.markFunctionWrapped(layerHandlePatched, layerHandleOriginal);

  Object.defineProperty(layer, 'handle', {
    enumerable: true,
    configurable: true,
    writable: true,
    value: layerHandlePatched,
  });
}

exports.patchLayer = patchLayer;
//# sourceMappingURL=patch-layer.js.map
