// VS Code webview API type
interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

// Singleton: acquireVsCodeApi() can only be called once per webview lifecycle
const vscodeApi: VSCodeAPI = acquireVsCodeApi();

export function useVSCodeAPI(): VSCodeAPI {
  return vscodeApi;
}
