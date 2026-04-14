Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

// map of patched request objects to stored layers
const requestLayerStore = new WeakMap();
const storeLayer = (req, layer) => {
  const store = requestLayerStore.get(req);
  if (!store) {
    requestLayerStore.set(req, [layer]);
  } else {
    store.push(layer);
  }
};

const getStoredLayers = (req) => {
  let store = requestLayerStore.get(req);
  if (!store) {
    store = [];
    requestLayerStore.set(req, store);
  }
  return store;
};

exports.getStoredLayers = getStoredLayers;
exports.storeLayer = storeLayer;
//# sourceMappingURL=request-layer-store.js.map
