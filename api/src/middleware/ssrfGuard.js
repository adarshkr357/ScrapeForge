// ================================================================
// Middleware: SSRF Guard
// ================================================================
const { URL } = require('url');
const net = require('net');
const dns = require('dns').promises;

// Private IP ranges to block
const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
];

const BLOCKED_HOSTNAMES = [
  'localhost', '0.0.0.0', 'metadata.google.internal',
  'instance-data', '169.254.169.254',
];

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIP(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc00:');

  const ipInt = ipToInt(ip);
  return PRIVATE_RANGES.some(range => {
    const startInt = ipToInt(range.start);
    const endInt = ipToInt(range.end);
    return ipInt >= startInt && ipInt <= endInt;
  });
}

/**
 * Validate a URL is not pointing to private/internal resources.
 * Checks hostname, resolved IP, and common cloud metadata endpoints.
 */
async function validateUrl(urlString) {
  try {
    const parsed = new URL(urlString);

    // Block non-HTTP protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: `Blocked protocol: ${parsed.protocol}` };
    }

    // Block known internal hostnames
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { safe: false, reason: `Blocked hostname: ${hostname}` };
    }

    // Block Docker internal DNS
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
      return { safe: false, reason: `Blocked internal hostname: ${hostname}` };
    }

    // Check if hostname is an IP address
    if (net.isIP(hostname)) {
      if (isPrivateIP(hostname)) {
        return { safe: false, reason: `Blocked private IP: ${hostname}` };
      }
      return { safe: true };
    }

    // Resolve hostname and check IP
    try {
      const addresses = await dns.resolve4(hostname);
      for (const addr of addresses) {
        if (isPrivateIP(addr)) {
          return { safe: false, reason: `Hostname ${hostname} resolves to private IP: ${addr}` };
        }
      }
    } catch (dnsErr) {
      // DNS resolution failed — allow (might be a valid but unresolvable domain)
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: `Invalid URL: ${err.message}` };
  }
}

/**
 * SSRF guard middleware — validates scrape URLs and webhook URLs.
 */
async function ssrfGuardMiddleware(req, res, next) {
  try {
    const urlsToCheck = [];

    if (req.body?.url) urlsToCheck.push({ field: 'url', value: req.body.url });
    if (req.body?.webhook_url) urlsToCheck.push({ field: 'webhook_url', value: req.body.webhook_url });
    if (req.body?.urls && Array.isArray(req.body.urls)) {
      req.body.urls.slice(0, 10).forEach((u, i) =>
        urlsToCheck.push({ field: `urls[${i}]`, value: u })
      );
    }

    for (const { field, value } of urlsToCheck) {
      const result = await validateUrl(value);
      if (!result.safe) {
        return res.status(400).json({
          success: false,
          error: 'SSRFBlocked',
          message: `URL blocked (${field}): ${result.reason}`,
        });
      }
    }

    next();
  } catch (err) {
    console.error('[SSRFGuard] Error:', err.message);
    next();
  }
}

module.exports = { ssrfGuardMiddleware, validateUrl, isPrivateIP };
