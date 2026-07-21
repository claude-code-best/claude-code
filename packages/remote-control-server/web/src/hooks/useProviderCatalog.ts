import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetchProviderCatalog } from '../api/client'
import {
  ProviderCatalogModel,
  type ProviderCatalogMutationResult,
  type ProviderCatalogState,
} from '../lib/provider-catalog-model'

export function useProviderCatalog(environmentId: string | null) {
  const model = useMemo(
    () =>
      new ProviderCatalogModel((id, signal) =>
        apiFetchProviderCatalog(id, signal),
      ),
    [],
  )
  const [state, setState] = useState<ProviderCatalogState>(model.snapshot())

  useEffect(() => model.subscribe(setState), [model])
  useEffect(() => {
    void model.selectEnvironment(environmentId)
    return () => model.cancel()
  }, [environmentId, model])

  const refresh = useCallback(
    () => model.selectEnvironment(environmentId),
    [environmentId, model],
  )
  const mutate = useCallback(
    (
      action: (revision: number, operationId: string) => Promise<unknown>,
    ): Promise<ProviderCatalogMutationResult> => model.mutate(action),
    [model],
  )

  return {
    catalog: state.catalog,
    loading: state.loading,
    stale: state.stale,
    error: state.error,
    mutate,
    refresh,
  }
}
