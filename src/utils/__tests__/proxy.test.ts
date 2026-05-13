import { afterEach, describe, expect, mock, test } from "bun:test";
import { createServer } from "node:net";
import { debugMock } from "../../../tests/mocks/debug";

mock.module("src/utils/debug.ts", debugMock);

const {
  _resetProxyReachabilityForTesting,
  _waitForProxyReachabilityForTesting,
  getProxyUrl,
} = await import("../proxy");

const originalProxyEnv = {
  https_proxy: process.env.https_proxy,
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  http_proxy: process.env.http_proxy,
  HTTP_PROXY: process.env.HTTP_PROXY,
};

describe("getProxyUrl", () => {
  afterEach(() => {
    restoreProxyEnv();
    _resetProxyReachabilityForTesting();
  });

  test("does not use an unreachable loopback proxy", async () => {
    const port = await getClosedLoopbackPort();
    clearProxyEnv();
    process.env.https_proxy = `http://127.0.0.1:${port}`;

    expect(getProxyUrl()).toBeUndefined();

    expect(await _waitForProxyReachabilityForTesting()).toBe(false);

    expect(process.env.https_proxy).toBeUndefined();
    expect(getProxyUrl()).toBeUndefined();
  });

  test("uses a loopback proxy after reachability is confirmed", async () => {
    const server = createServer();
    await new Promise<void>(resolve => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address");
      }
      const proxyUrl = `http://127.0.0.1:${address.port}`;
      clearProxyEnv();
      process.env.https_proxy = proxyUrl;

      expect(getProxyUrl()).toBeUndefined();
      expect(await _waitForProxyReachabilityForTesting()).toBe(true);
      expect(getProxyUrl()).toBe(proxyUrl);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  test("clears invalid proxy URLs from the current process", () => {
    clearProxyEnv();
    process.env.https_proxy = "not-a-url";

    expect(getProxyUrl()).toBeUndefined();
    expect(process.env.https_proxy).toBeUndefined();
  });
});

function clearProxyEnv(): void {
  for (const key of Object.keys(originalProxyEnv)) {
    delete process.env[key];
  }
}

function restoreProxyEnv(): void {
  for (const [key, value] of Object.entries(originalProxyEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function getClosedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }
  const port = address.port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
