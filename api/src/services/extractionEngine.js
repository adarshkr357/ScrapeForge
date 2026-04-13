// ================================================================
// Service: Extraction Engine (Tiers 1-3: CSS, XPath, Regex)
// ================================================================
const cheerio = require('cheerio');

/**
 * Multi-tier extraction pipeline.
 * Applies CSS selectors, XPath, and Regex rules to HTML content.
 */
class ExtractionEngine {
  /**
   * Run all extraction tiers on HTML content.
   * @param {string} html - Raw HTML
   * @param {Object} rules - Extraction rules
   * @returns {Object} Merged extracted data
   */
  extract(html, rules = {}) {
    const result = {};

    if (rules.extraction_rules) {
      Object.assign(result, this.extractCSS(html, rules.extraction_rules));
    }

    if (rules.xpath_rules) {
      Object.assign(result, this.extractXPath(html, rules.xpath_rules));
    }

    if (rules.regex_rules) {
      Object.assign(result, this.extractRegex(html, rules.regex_rules));
    }

    return result;
  }

  /**
   * Tier 1: CSS Selector Extraction
   * Supports: text, attributes, arrays, nested selectors.
   */
  extractCSS(html, rules) {
    const $ = cheerio.load(html);
    const result = {};

    for (const [key, selector] of Object.entries(rules)) {
      if (typeof selector === 'string') {
        result[key] = this._extractCSSValue($, selector);
      } else if (Array.isArray(selector)) {
        // Array selector: extract all matching elements
        result[key] = this._extractCSSArray($, selector[0]);
      } else if (typeof selector === 'object' && selector.selector) {
        // Nested extraction
        result[key] = this._extractCSSNested($, selector);
      }
    }

    return result;
  }

  _extractCSSValue($, selector) {
    // Parse attribute selector: "selector@attribute"
    const attrMatch = selector.match(/^(.+?)@(.+)$/);
    if (attrMatch) {
      return $(attrMatch[1]).first().attr(attrMatch[2]) || null;
    }

    // Parse ::text pseudo-element
    const textMatch = selector.match(/^(.+?)::text$/);
    if (textMatch) {
      return $(textMatch[1]).first().text().trim() || null;
    }

    // Default: get text content
    const el = $(selector).first();
    return el.length ? el.text().trim() : null;
  }

  _extractCSSArray($, selector) {
    const results = [];
    const attrMatch = selector.match(/^(.+?)@(.+)$/);
    const textMatch = selector.match(/^(.+?)::text$/);

    const actualSelector = attrMatch ? attrMatch[1] : textMatch ? textMatch[1] : selector;

    $(actualSelector).each((_, el) => {
      const $el = $(el);
      let value;

      if (attrMatch) {
        value = $el.attr(attrMatch[2]);
      } else {
        value = $el.text().trim();
      }

      if (value) results.push(value);
    });

    return results;
  }

  _extractCSSNested($, config) {
    const { selector, output } = config;
    const results = [];

    $(selector).each((_, el) => {
      const $el = $(el);
      const item = {};

      for (const [key, subSelector] of Object.entries(output)) {
        const attrMatch = subSelector.match(/^(.+?)@(.+)$/);
        const textMatch = subSelector.match(/^(.+?)::text$/);

        if (attrMatch) {
          item[key] = $el.find(attrMatch[1]).first().attr(attrMatch[2]) || null;
        } else if (textMatch) {
          item[key] = $el.find(textMatch[1]).first().text().trim() || null;
        } else {
          const subEl = $el.find(subSelector).first();
          item[key] = subEl.length ? subEl.text().trim() : null;
        }
      }

      results.push(item);
    });

    return results;
  }

  /**
   * Tier 2: XPath Extraction
   */
  extractXPath(html, rules) {
    const result = {};

    // Use cheerio's pseudo-XPath via CSS conversion for basic XPath support
    // For full XPath, we'd use xmldom + xpath — simplified here
    const $ = cheerio.load(html, { xmlMode: false });

    for (const [key, xpathExpr] of Object.entries(rules)) {
      try {
        // Convert common XPath to CSS-like selector (simplified mapping)
        const cssSelector = this._xpathToCSS(xpathExpr);
        if (cssSelector) {
          const elements = [];
          $(cssSelector).each((_, el) => {
            elements.push($(el).text().trim());
          });
          result[key] = elements.length === 1 ? elements[0] : elements;
        } else {
          result[key] = null;
        }
      } catch {
        result[key] = null;
      }
    }

    return result;
  }

  _xpathToCSS(xpath) {
    // Basic XPath to CSS conversion for common patterns
    let css = xpath;

    // //tag[@attr='val'] → tag[attr="val"]
    css = css.replace(/^\/\//, '');
    css = css.replace(/\//g, ' > ');
    css = css.replace(/@class='([^']+)'/g, 'class="$1"');
    css = css.replace(/@(\w+)='([^']+)'/g, '$1="$2"');
    css = css.replace(/\[(\w+)="([^"]+)"\]/g, '[$1="$2"]');
    css = css.replace(/\/text\(\)$/, '');
    css = css.replace(/\/@(\w+)$/, '');

    return css || null;
  }

  /**
   * Tier 3: Regex Extraction
   */
  extractRegex(text, rules) {
    const result = {};
    // Strip HTML tags for regex matching
    const plainText = text.replace(/<[^>]+>/g, ' ');

    for (const [key, pattern] of Object.entries(rules)) {
      try {
        const regex = new RegExp(pattern, 'gi');
        const matches = [];
        let match;

        while ((match = regex.exec(plainText)) !== null) {
          matches.push(match[0]);
          if (matches.length >= 1000) break;  // Safety limit
        }

        result[key] = matches.length === 1 ? matches[0] : matches;
      } catch {
        result[key] = null;
      }
    }

    return result;
  }
}

module.exports = new ExtractionEngine();
