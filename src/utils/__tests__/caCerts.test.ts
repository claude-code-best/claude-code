import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { debugMock } from "../../../tests/mocks/debug";

mock.module("src/utils/debug.ts", debugMock);

const { clearCACertsCache, getCACertificates, validateExtraCACertsEnv } =
  await import("../caCerts");

const originalNodeExtraCACerts = process.env.NODE_EXTRA_CA_CERTS;
const originalNodeOptions = process.env.NODE_OPTIONS;

let tempDir: string;

describe("getCACertificates", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "csc-ca-certs-"));
    delete process.env.NODE_EXTRA_CA_CERTS;
    delete process.env.NODE_OPTIONS;
    clearCACertsCache();
  });

  afterEach(() => {
    restoreEnvVar("NODE_EXTRA_CA_CERTS", originalNodeExtraCACerts);
    restoreEnvVar("NODE_OPTIONS", originalNodeOptions);
    clearCACertsCache();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("ignores missing NODE_EXTRA_CA_CERTS path", () => {
    process.env.NODE_EXTRA_CA_CERTS = join(tempDir, "missing.pem");

    expect(getCACertificates()).toBeUndefined();
    expect(process.env.NODE_EXTRA_CA_CERTS).toBeUndefined();
  });

  test("validates and clears missing NODE_EXTRA_CA_CERTS before TLS setup", () => {
    process.env.NODE_EXTRA_CA_CERTS = join(tempDir, "missing.pem");

    validateExtraCACertsEnv();

    expect(process.env.NODE_EXTRA_CA_CERTS).toBeUndefined();
  });

  test("ignores directory NODE_EXTRA_CA_CERTS path", () => {
    process.env.NODE_EXTRA_CA_CERTS = tempDir;

    expect(getCACertificates()).toBeUndefined();
    expect(process.env.NODE_EXTRA_CA_CERTS).toBeUndefined();
  });

  test("appends readable NODE_EXTRA_CA_CERTS file", () => {
    const certPath = join(tempDir, "extra.pem");
    const cert = "-----BEGIN CERTIFICATE-----\nextra\n-----END CERTIFICATE-----\n";
    writeFileSync(certPath, cert);
    process.env.NODE_EXTRA_CA_CERTS = certPath;

    expect(getCACertificates()).toContain(cert);
    expect(process.env.NODE_EXTRA_CA_CERTS).toBe(certPath);
  });

  test("follows NODE_EXTRA_CA_CERTS symlink to a regular file", () => {
    if (process.platform === "win32") {
      return;
    }

    const certPath = join(tempDir, "extra.pem");
    const linkPath = join(tempDir, "extra-link.pem");
    const cert = "-----BEGIN CERTIFICATE-----\nlinked\n-----END CERTIFICATE-----\n";
    writeFileSync(certPath, cert);
    symlinkSync(certPath, linkPath);
    process.env.NODE_EXTRA_CA_CERTS = linkPath;

    expect(getCACertificates()).toContain(cert);
    expect(process.env.NODE_EXTRA_CA_CERTS).toBe(linkPath);
  });
});

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
