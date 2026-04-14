import { getIsolationScope } from '../../currentScopes.js';
import { httpRequestToRequestData } from '../../utils/request.js';

// TODO: consider moving this into a core util, eg
// setSDKProcessingMetadataFromRequest(..), if other integrations need it.
function setSDKProcessingMetadata(request) {
  const sdkProcMeta = getIsolationScope()?.getScopeData()?.sdkProcessingMetadata;
  if (!sdkProcMeta?.normalizedRequest) {
    const normalizedRequest = httpRequestToRequestData(request);
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });
  }
}

export { setSDKProcessingMetadata };
//# sourceMappingURL=set-sdk-processing-metadata.js.map
