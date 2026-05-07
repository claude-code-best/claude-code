import {
  getMainLoopModel,
  getUserSpecifiedModelSetting,
} from './model/model.js'
import { getAPIProvider } from './model/providers.js'

function getProviderModelEnv(): string | undefined {
  const provider = getAPIProvider()
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_MODEL
    case 'gemini':
      return process.env.GEMINI_MODEL
    case 'grok':
      return process.env.GROK_MODEL
    default:
      return undefined
  }
}

export function getRealModelName(): string {
  const userSetting = getUserSpecifiedModelSetting()
  if (userSetting !== undefined && userSetting !== null) {
    return userSetting
  }
  const providerModel = getProviderModelEnv()
  if (providerModel) {
    return providerModel
  }
  return getMainLoopModel()
}
