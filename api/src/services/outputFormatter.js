// ================================================================
// Service: Output Formatter (12 formats)
// ================================================================
const TurndownService = require('turndown');
const { Parser: CsvParser } = require('json2csv');

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/**
 * Format scraped output into the requested format.
 * Supports: json, markdown, html, raw_html, text, csv, ndjson, xml, rss, links, screenshot, pdf
 */
function formatOutput(data, format, options = {}) {
  switch (format) {
    case 'json':
      return formatJSON(data);
    case 'markdown':
      return formatMarkdown(data, options.markdown_options);
    case 'html':
      return formatHTML(data);
    case 'raw_html':
      return data.rawHtml || data.html || '';
    case 'text':
      return formatText(data);
    case 'csv':
      return formatCSV(data);
    case 'ndjson':
      return formatNDJSON(data);
    case 'xml':
      return formatXML(data);
    case 'rss':
      return formatRSS(data);
    case 'links':
      return formatLinks(data);
    case 'screenshot':
      return { screenshotUrl: data.screenshotUrl || null };
    case 'pdf':
      return { pdfUrl: data.pdfUrl || null };
    default:
      return formatJSON(data);
  }
}

function formatJSON(data) {
  return {
    success: data.success !== false,
    url: data.url,
    statusCode: data.statusCode,
    ...(data.success === false ? {
      error: data.error || null,
      blocked: data.blocked || false,
      challengeType: data.challengeType || null,
    } : {}),
    extractedData: data.extractedData || {},
    aiExtracted: data.aiExtracted || null,
    nlpExtracted: data.nlpExtracted || null,
    metadata: data.metadata || {},
    timestamp: new Date().toISOString(),
  };
}

function formatMarkdown(data, options = {}) {
  const html = data.html || data.rawHtml || '';
  if (!html) return data.markdown || '';

  let md = turndown.turndown(html);

  if (options.main_content_only) {
    // Strip navigation, footer, sidebar-like content (simplified heuristic)
    md = md.replace(/^(#{1,6}\s+)?(Navigation|Menu|Footer|Sidebar|Header|Copyright).*$/gim, '');
  }

  if (!options.include_links) {
    md = md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  if (!options.include_images) {
    md = md.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  }

  return md.trim();
}

function formatHTML(data) {
  return data.html || data.rawHtml || '';
}

function formatText(data) {
  const html = data.html || data.rawHtml || '';
  // Simple HTML-to-text: strip tags
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCSV(data) {
  const extracted = data.extractedData || data.aiExtracted;
  if (!extracted) return '';

  const items = Array.isArray(extracted) ? extracted : [extracted];
  if (items.length === 0) return '';

  try {
    const parser = new CsvParser();
    return parser.parse(items);
  } catch {
    return '';
  }
}

function formatNDJSON(data) {
  const extracted = data.extractedData || data.aiExtracted;
  if (!extracted) return '';

  const items = Array.isArray(extracted) ? extracted : [extracted];
  return items.map(item => JSON.stringify(item)).join('\n');
}

function formatXML(data) {
  const extracted = data.extractedData || {};

  function objToXml(obj, rootTag = 'data') {
    let xml = `<${rootTag}>`;
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        xml += `<${key}>`;
        value.forEach((item, i) => {
          if (typeof item === 'object') {
            xml += objToXml(item, 'item');
          } else {
            xml += `<item>${escapeXml(String(item))}</item>`;
          }
        });
        xml += `</${key}>`;
      } else if (typeof value === 'object' && value !== null) {
        xml += objToXml(value, key);
      } else {
        xml += `<${key}>${escapeXml(String(value ?? ''))}</${key}>`;
      }
    }
    xml += `</${rootTag}>`;
    return xml;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${objToXml(extracted, 'scrapeResult')}`;
}

function formatRSS(data) {
  const items = Array.isArray(data.extractedData) ? data.extractedData : [];
  let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>ScrapeForge Results</title>
    <link>${escapeXml(data.url || '')}</link>
    <description>Scraped data</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;

  for (const item of items) {
    rss += `
    <item>
      <title>${escapeXml(item.title || item.name || 'Item')}</title>
      <link>${escapeXml(item.url || item.link || '')}</link>
      <description>${escapeXml(item.description || item.snippet || JSON.stringify(item))}</description>
    </item>`;
  }

  rss += `
  </channel>
</rss>`;
  return rss;
}

function formatLinks(data) {
  return {
    url: data.url,
    links: data.links || [],
    totalLinks: (data.links || []).length,
  };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { formatOutput };
