/**
 * Self-signed certificate generation for HTTPS support
 */

import { X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { generate } from "selfsigned";

/**
 * Get all LAN IPv4 addresses
 */
export function getLanIPs(): string[] {
  const ips: string[] = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (!net.internal && net.family === "IPv4") {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

/**
 * Extract IP addresses from certificate's Subject Alternative Name (SAN)
 * SAN format: "IP Address:192.168.1.100, IP Address:127.0.0.1, DNS:localhost"
 */
function extractSanIPs(x509: X509Certificate): string[] {
  const san = x509.subjectAltName;
  if (!san) return [];

  const ips: string[] = [];
  // Parse "IP Address:x.x.x.x" entries from SAN string
  const parts = san.split(", ");
  for (const part of parts) {
    const match = part.match(/^IP Address:(.+)$/);
    if (match && match[1]) {
      ips.push(match[1]);
    }
  }
  return ips;
}

const CERT_DIR = join(homedir(), ".acp-proxy");
const KEY_PATH = join(CERT_DIR, "key.pem");
const CERT_PATH = join(CERT_DIR, "cert.pem");

// Certificate validity in days
const CERT_VALIDITY_DAYS = 365;

export interface TlsOptions {
  key: string;
  cert: string;
}

/**
 * Get or generate self-signed certificate
 * Certificates are cached in ~/.acp-proxy/
 */
export async function getOrCreateCertificate(): Promise<TlsOptions> {
  // Ensure directory exists
  if (!existsSync(CERT_DIR)) {
    mkdirSync(CERT_DIR, { recursive: true });
  }

  // Check if certificates already exist and are still valid
  if (existsSync(KEY_PATH) && existsSync(CERT_PATH)) {
    const certPem = readFileSync(CERT_PATH, "utf-8");
    const keyPem = readFileSync(KEY_PATH, "utf-8");

    try {
      const x509 = new X509Certificate(certPem);
      const validTo = new Date(x509.validTo);
      const now = new Date();

      // Check if cert is expired or will expire within 7 days
      const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 7) {
        // Certificate expired or expiring soon
        console.log(`⚠️  Certificate ${daysUntilExpiry <= 0 ? "expired" : `expires in ${daysUntilExpiry} days`}, regenerating...`);
      } else {
        // Check if current LAN IPs are in the certificate's SAN
        const currentLanIPs = getLanIPs();
        const certSanIPs = extractSanIPs(x509);

        // Check if all current LAN IPs are covered by the certificate
        const missingIPs = currentLanIPs.filter(ip => !certSanIPs.includes(ip));

        if (missingIPs.length === 0) {
          console.log(`🔐 Using existing certificate from ${CERT_DIR}`);
          console.log(`   Valid for ${daysUntilExpiry} more days`);
          return { key: keyPem, cert: certPem };
        }

        // LAN IP changed, regenerate
        console.log(`⚠️  LAN IP changed (missing: ${missingIPs.join(", ")}), regenerating certificate...`);
      }
    } catch {
      // Failed to parse certificate, regenerate
      console.log(`⚠️  Invalid certificate, regenerating...`);
    }
  }

  // Generate new self-signed certificate
  console.log(`🔐 Generating self-signed certificate...`);

  const attrs = [{ name: "commonName", value: "ACP Proxy Server" }];

  // Calculate expiry date
  const notAfterDate = new Date();
  notAfterDate.setDate(notAfterDate.getDate() + CERT_VALIDITY_DAYS);

  // Build altNames: localhost + loopback + all LAN IPs
  const altNames: Array<{ type: 1 | 2 | 6 | 7; value?: string; ip?: string }> = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
    { type: 7, ip: "::1" },
  ];

  // Add all current LAN IPs
  const lanIPs = getLanIPs();
  for (const ip of lanIPs) {
    altNames.push({ type: 7, ip });
  }

  if (lanIPs.length > 0) {
    console.log(`   Including LAN IPs: ${lanIPs.join(", ")}`);
  }

  const pems = await generate(attrs, {
    keySize: 2048,
    notAfterDate,
    algorithm: "sha256",
    extensions: [
      {
        name: "basicConstraints",
        cA: true,
      },
      {
        name: "keyUsage",
        keyCertSign: true,
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: "extKeyUsage",
        serverAuth: true,
      },
      {
        name: "subjectAltName",
        altNames,
      },
    ],
  });

  // Save certificates
  writeFileSync(KEY_PATH, pems.private);
  writeFileSync(CERT_PATH, pems.cert);

  console.log(`✅ Certificate saved to ${CERT_DIR}`);
  console.log(`   Valid for ${CERT_VALIDITY_DAYS} days`);
  console.log(`   ⚠️  First access will show a security warning - click "Advanced" → "Proceed"`);

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

