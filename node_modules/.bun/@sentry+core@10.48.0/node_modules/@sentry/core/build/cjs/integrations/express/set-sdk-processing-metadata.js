Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const currentScopes = require('../../currentScopes.js');
const request = require('../../utils/request.js');

// TODO: consider moving this into a core util, eg
// setSDKProcessingMetadataFromRequest(..), if other integrations need it.
function setSDKProcessingMetadata(request$1) {
  const sdkProcMeta = currentScopes.getIsolationScope()?.getScopeData()?.sdkProcessingMetadata;
  if (!sdkProcMeta?.normalizedRequest) {
    const normalizedRequest = request.httpRequestToRequestData(request$1);
    currentScopes.getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });
  }
}

exports.setSDKProcessingMetadata = setSDKProcessingMetadata;
//# sourceMappingURL=set-sdk-processing-metadata.js.map
