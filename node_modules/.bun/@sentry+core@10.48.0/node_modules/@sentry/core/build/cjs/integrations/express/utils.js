Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const requestLayerStore = require('./request-layer-store.js');
const types = require('./types.js');
const string = require('../../utils/string.js');

/**
 * Converts a user-provided error value into an error and error message pair
 *
 * @param error - User-provided error value
 * @returns Both an Error or string representation of the value and an error message
 */
const asErrorAndMessage = (error) =>
  error instanceof Error ? [error, error.message] : [String(error), String(error)];

/**
 * Checks if a route contains parameter patterns (e.g., :id, :userId)
 * which are valid even if they don't exactly match the original URL
 */
function isRoutePattern(route) {
  return route.includes(':') || route.includes('*');
}

/**
 * Parse express layer context to retrieve a name and attributes.
 * @param route The route of the layer
 * @param layer Express layer
 * @param [layerPath] if present, the path on which the layer has been mounted
 */
const getLayerMetadata = (
  route,
  layer,
  layerPath,

) => {
  if (layer.name === 'router') {
    const maybeRouterPath = getRouterPath('', layer);
    const extractedRouterPath = maybeRouterPath ? maybeRouterPath : layerPath || route || '/';

    return {
      attributes: {
        [types.ATTR_EXPRESS_NAME]: extractedRouterPath,
        [types.ATTR_EXPRESS_TYPE]: types.ExpressLayerType_ROUTER,
      },
      name: `router - ${extractedRouterPath}`,
    };
  } else if (layer.name === 'bound dispatch' || layer.name === 'handle') {
    return {
      attributes: {
        [types.ATTR_EXPRESS_NAME]: (route || layerPath) ?? 'request handler',
        [types.ATTR_EXPRESS_TYPE]: types.ExpressLayerType_REQUEST_HANDLER,
      },
      name: `request handler${layer.path ? ` - ${route || layerPath}` : ''}`,
    };
  } else {
    return {
      attributes: {
        [types.ATTR_EXPRESS_NAME]: layer.name,
        [types.ATTR_EXPRESS_TYPE]: types.ExpressLayerType_MIDDLEWARE,
      },
      name: `middleware - ${layer.name}`,
    };
  }
};

/**
 * Recursively search the router path from layer stack
 * @param path The path to reconstruct
 * @param layer The layer to reconstruct from
 * @returns The reconstructed path
 */
const getRouterPath = (path, layer) => {
  const stackLayer = Array.isArray(layer.handle?.stack) ? layer.handle?.stack?.[0] : undefined;

  if (stackLayer?.route?.path) {
    return `${path}${stackLayer.route.path}`;
  }

  if (stackLayer && Array.isArray(stackLayer?.handle?.stack)) {
    return getRouterPath(path, stackLayer);
  }

  return path;
};

/**
 * Check whether the given request is ignored by configuration
 * It will not re-throw exceptions from `list` provided by the client
 * @param constant e.g URL of request
 * @param [list] List of ignore patterns
 * @param [onException] callback for doing something when an exception has
 *     occurred
 */

const isLayerIgnored = (
  name,
  type,
  config,
) => {
  if (Array.isArray(config?.ignoreLayersType) && config?.ignoreLayersType?.includes(type)) {
    return true;
  }
  if (!Array.isArray(config?.ignoreLayers)) {
    return false;
  }
  try {
    return string.stringMatchesSomePattern(name, config.ignoreLayers, true);
  } catch {}

  return false;
};

/**
 * Extracts the actual matched route from Express request for OpenTelemetry instrumentation.
 * Returns the route that should be used as the http.route attribute.
 *
 * @param req - The Express request object with layers store
 * @param constructedRoute - The constructed route from `getConstructedRoute`
 * @returns The matched route string or undefined if no valid route is found
 */
function getActualMatchedRoute(req, constructedRoute) {
  const layersStore = requestLayerStore.getStoredLayers(req);

  // If no layers are stored, no route can be determined
  if (layersStore.length === 0) {
    return undefined;
  }

  // Handle root path case - if all paths are root, only return root if originalUrl is also root
  // The layer store also includes root paths in case a non-existing url was requested
  if (layersStore.every(path => path === '/')) {
    return req.originalUrl === '/' ? '/' : undefined;
  }

  if (constructedRoute === '*') {
    return constructedRoute;
  }

  // For RegExp routes or route arrays, return the constructed route
  // This handles the case where the route is defined using RegExp or an array
  if (
    constructedRoute.includes('/') &&
    (constructedRoute.includes(',') ||
      constructedRoute.includes('\\') ||
      constructedRoute.includes('*') ||
      constructedRoute.includes('['))
  ) {
    return constructedRoute;
  }

  // Ensure route starts with '/' if it doesn't already
  const normalizedRoute = constructedRoute.startsWith('/') ? constructedRoute : `/${constructedRoute}`;

  // Validate that this appears to be a matched route
  // A route is considered matched if:
  // 1. We have a constructed route
  // 2. The original URL matches or starts with our route pattern
  const isValidRoute =
    normalizedRoute.length > 0 &&
    (req.originalUrl === normalizedRoute ||
      req.originalUrl.startsWith(normalizedRoute) ||
      isRoutePattern(normalizedRoute));

  return isValidRoute ? normalizedRoute : undefined;
}

function getConstructedRoute(req) {
  const layersStore = requestLayerStore.getStoredLayers(req);

  let constructedRoute = '';
  for (const path of layersStore) {
    if (path === '/' || path === '/*') {
      continue;
    }
    constructedRoute += !constructedRoute || constructedRoute.endsWith('/') ? path : `/${path}`;
  }

  return constructedRoute.replace(/\/{2,}/g, '/');
}

const getLayerPath = (args) => {
  const firstArg = args[0];

  if (Array.isArray(firstArg)) {
    return firstArg.map(arg => extractLayerPathSegment(arg) || '').join(',');
  }

  return extractLayerPathSegment(firstArg );
};

const extractLayerPathSegment = (arg) =>
  typeof arg === 'string' ? arg : arg instanceof RegExp || typeof arg === 'number' ? String(arg) : undefined;

// v5 we instrument Router.prototype
// v4 we instrument Router itself
const isExpressWithRouterPrototype = (express) =>
  isExpressRouterPrototype((express )?.Router?.prototype);

// In Express v4, Router is a function (not a plain object), so we need to accept both
const isExpressRouterPrototype = (routerProto) =>
  (typeof routerProto === 'object' || typeof routerProto === 'function') &&
  !!routerProto &&
  'route' in routerProto &&
  typeof (routerProto ).route === 'function';

const isExpressWithoutRouterPrototype = (express) =>
  isExpressRouterPrototype((express ).Router) && !isExpressWithRouterPrototype(express);

// dynamic puts the default on .default, require or normal import are fine
const hasDefaultProp = (
  express,

) => !!express && typeof express === 'object' && 'default' in express && typeof express.default === 'function';

function getStatusCodeFromResponse(error) {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode , 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error) {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}

exports.asErrorAndMessage = asErrorAndMessage;
exports.defaultShouldHandleError = defaultShouldHandleError;
exports.getActualMatchedRoute = getActualMatchedRoute;
exports.getConstructedRoute = getConstructedRoute;
exports.getLayerMetadata = getLayerMetadata;
exports.getLayerPath = getLayerPath;
exports.getRouterPath = getRouterPath;
exports.hasDefaultProp = hasDefaultProp;
exports.isExpressWithRouterPrototype = isExpressWithRouterPrototype;
exports.isExpressWithoutRouterPrototype = isExpressWithoutRouterPrototype;
exports.isLayerIgnored = isLayerIgnored;
exports.isRoutePattern = isRoutePattern;
//# sourceMappingURL=utils.js.map
