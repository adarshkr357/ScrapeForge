"""
================================================================
SERP Worker — Search engine results scraper
================================================================
Google, Bing, Yahoo, DuckDuckGo, Yandex, Baidu.

Engine strategy:
  - Google Web: googlesearch-python (lightweight, reliable)
  - Google News/Images/Videos: DuckDuckGo library
  - Bing/Yahoo: BeautifulSoup + curl_cffi with DDG fallback
  - DuckDuckGo: duckduckgo-search library (native)
  - Yandex/Baidu: DuckDuckGo proxy (direct scraping unreliable)
"""
import os
import time
import json
import random
import logging
import urllib.parse
from queue_consumer import QueueConsumer
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

# ── Structured logging ──
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
logger = logging.getLogger('serp_worker')

# ── Engine Capabilities ──────────────────────────────────────
# Defines which result types each engine actually supports.
# This map is also exposed via GET /search/capabilities in the API.
ENGINE_CAPABILITIES = {
    "duckduckgo": ["web", "news", "images", "videos"],
    "bing":       ["web"],
    "yahoo":      ["web"],
}

# ── User Agent Pool ──────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

LANG_HEADERS = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9,en-US;q=0.8",
    "en-US,en;q=0.8,fr;q=0.5",
]


def get_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": random.choice(LANG_HEADERS),
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    }


class SERPWorker:
    def __init__(self):
        self.concurrency = int(os.environ.get('WORKER_CONCURRENCY', 200))
        self.consumer = QueueConsumer('serp', concurrency=self.concurrency)

    def start(self):
        logger.info(f"[SERPWorker] Starting with concurrency={self.concurrency}")
        self.consumer.start(self.process_job)

    # ── Retry wrapper ──
    def _retry_with_backoff(self, fn, engine, query, max_retries=3, base_delay=1.0):
        """Execute fn with exponential backoff retries."""
        last_error = None
        for attempt in range(max_retries):
            try:
                return fn()
            except Exception as e:
                last_error = e
                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    f"[SERP] {engine} attempt {attempt+1}/{max_retries} failed: {e}. "
                    f"Retrying in {delay:.1f}s..."
                )
                time.sleep(delay)
        logger.error(f"[SERP] {engine} failed after {max_retries} attempts for '{query}': {last_error}")
        raise last_error

    # ── DuckDuckGo search helper ───────────────────────────────
    def _ddg_search(self, query, num_results, result_type='web', source_label='duckduckgo'):
        """
        Use DuckDuckGo library for searching.
        Used natively for DDG engine, and as a proxy for engines that can't be scraped directly.
        """
        from proxy_pool import proxy_pool
        results = {'organic_results': [], 'related_searches': []}

        proxy_url = proxy_pool.get_random_proxy()

        with DDGS(proxy=proxy_url) as ddgs:
            if result_type == 'images':
                raw = ddgs.images(query, region="wt-wt", safesearch="off", max_results=num_results)
            elif result_type == 'news':
                raw = ddgs.news(query, region="wt-wt", safesearch="off", max_results=num_results)
            elif result_type == 'videos':
                raw = ddgs.videos(query, region="wt-wt", safesearch="off", max_results=num_results)
            else:
                raw = ddgs.text(query, region="wt-wt", safesearch="off", max_results=num_results)

            for idx, res in enumerate(raw):
                if result_type == 'images':
                    results['organic_results'].append({
                        'position': idx + 1,
                        'title': res.get('title', ''),
                        'url': res.get('url', res.get('image', '')),
                        'image': res.get('image', ''),
                        'thumbnail': res.get('thumbnail', ''),
                        'source': source_label,
                    })
                elif result_type == 'videos':
                    results['organic_results'].append({
                        'position': idx + 1,
                        'title': res.get('title', ''),
                        'url': res.get('content', res.get('href', '')),
                        'snippet': res.get('description', res.get('body', '')),
                        'publisher': res.get('publisher', ''),
                        'duration': res.get('duration', ''),
                        'source': source_label,
                    })
                elif result_type == 'news':
                    results['organic_results'].append({
                        'position': idx + 1,
                        'title': res.get('title', ''),
                        'url': res.get('url', res.get('href', '')),
                        'snippet': res.get('body', res.get('abstract', '')),
                        'date': res.get('date', ''),
                        'source': source_label,
                    })
                else:
                    results['organic_results'].append({
                        'position': idx + 1,
                        'title': res.get('title', ''),
                        'url': res.get('href', res.get('url', '')),
                        'snippet': res.get('body', res.get('abstract', '')),
                        'source': source_label,
                    })

        results['total_results'] = len(results['organic_results'])
        return results

    def process_job(self, job_data):
        """Process a SERP scrape job."""
        request_id = job_data.get('requestId', 'unknown')
        engine = job_data.get('engine', 'google').lower()
        query = job_data.get('query', '')
        num_results = int(job_data.get('num_results', 10))
        result_type = job_data.get('type', 'web')
        country = job_data.get('country') or 'us'
        language = job_data.get('language') or 'en'
        page = int(job_data.get('page', 1))
        parse = job_data.get('parse', True)

        # Validate result_type against engine capabilities
        supported_types = ENGINE_CAPABILITIES.get(engine, ['web'])
        if result_type not in supported_types:
            result_type = 'web'

        start_time = time.time()

        try:
            if engine == 'bing':
                results = self._scrape_bing(query, num_results, country, language, page)
            elif engine == 'duckduckgo':
                results = self._scrape_duckduckgo(query, num_results, result_type)
            elif engine == 'yahoo':
                results = self._scrape_yahoo(query, num_results, page)
            else:
                # Unknown engine → DDG fallback
                results = self._ddg_search(query, num_results, result_type, engine)

            latency_ms = int((time.time() - start_time) * 1000)
            results['search_time'] = latency_ms / 1000
            results['engine'] = engine
            results['query'] = query

            if not parse:
                return {
                    'requestId': request_id,
                    'success': True,
                    'extractedData': results,
                    'latencyMs': latency_ms,
                }

            # Slice to requested num_results
            if 'organic_results' in results:
                results['organic_results'] = results['organic_results'][:num_results]

            logger.info(
                f"[SERP] {engine} returned {len(results.get('organic_results', []))} "
                f"results for '{query}' (type={result_type}) in {latency_ms}ms"
            )

            return {
                'requestId': request_id,
                'success': True,
                'extractedData': results,
                'statusCode': 200,
                'latencyMs': latency_ms,
            }

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            logger.error(f"[SERP] {engine} search failed for '{query}': {e}")
            return {
                'requestId': request_id,
                'success': False,
                'error': f'{engine} search failed: {str(e)}',
                'engine': engine,
                'latencyMs': latency_ms,
            }

    # ── DuckDuckGo (native) ────────────────────────────────────
    def _scrape_duckduckgo(self, query, num_results, result_type):
        """DuckDuckGo — native library, supports web, news, images, videos using proxies."""
        def attempt():
            return self._ddg_search(query, num_results, result_type, 'duckduckgo')
        return self._retry_with_backoff(attempt, 'duckduckgo', query, max_retries=2, base_delay=1.0)

    # ── Bing ───────────────────────────────────────────────────
    def _scrape_bing(self, query, num_results, country, language, page):
        """Bing SERP scraper — BeautifulSoup + curl_cffi. Web only."""
        params = {
            'q': query,
            'count': min(num_results + 5, 50),
            'first': (page - 1) * 10 + 1,
            'mkt': f'{language}-{country.upper()}',
        }

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://www.bing.com/'
            from curl_cffi import requests as cffi_requests
            time.sleep(random.uniform(0.3, 1.0))

            resp = cffi_requests.get(
                'https://www.bing.com/search',
                params=params,
                headers=headers,
                impersonate="chrome110",
                timeout=20,
            )

            if resp.status_code != 200:
                raise Exception(f"Bing returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {'organic_results': [], 'related_searches': []}
            position = 1

            items = soup.select('li.b_algo')
            if not items:
                items = soup.select('ol#b_results > li.b_algo, .b_ans .b_lBottom')

            for li in items:
                title_el = li.select_one('h2 a, h2 > a')
                snippet_el = li.select_one('div.b_caption p, .b_algoSlug, p.b_lineclamp2, .b_paractl')
                url = title_el.get('href', '') if title_el else ''

                if title_el and url.startswith('http'):
                    results['organic_results'].append({
                        'position': position,
                        'title': title_el.get_text(strip=True),
                        'url': url,
                        'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                        'source': 'bing',
                    })
                    position += 1

            if len(results['organic_results']) == 0:
                raise Exception("Bing returned 0 results")

            for r in soup.select('.b_rs a, .b_no a'):
                text = r.get_text(strip=True)
                if text:
                    results['related_searches'].append(text)

            results['total_results'] = len(results['organic_results'])
            return results

        try:
            return self._retry_with_backoff(attempt, 'bing', query, max_retries=3, base_delay=1.0)
        except Exception as e:
            logger.warning(f"[SERP] Bing direct scraping failed: {e}, falling back to DuckDuckGo")
            results = self._ddg_search(query, num_results, 'web', 'bing')
            results['note'] = 'Results sourced via DuckDuckGo (direct Bing scraping was blocked)'
            return results

    # ── Yahoo ──────────────────────────────────────────────────
    def _scrape_yahoo(self, query, num_results, page):
        """Yahoo search scraper — BeautifulSoup + curl_cffi. Web only."""
        params = {'p': query, 'n': min(num_results, 50), 'b': (page - 1) * 10 + 1}

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://search.yahoo.com/'
            from curl_cffi import requests as cffi_requests

            resp = cffi_requests.get(
                'https://search.yahoo.com/search',
                params=params,
                headers=headers,
                impersonate="chrome110",
                timeout=20,
            )

            if resp.status_code != 200:
                raise Exception(f"Yahoo returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {'organic_results': []}
            position = 1

            containers = soup.select('div.dd.algo, div.algo, div[data-pos], li.ov-a')
            if not containers:
                containers = soup.select('div.Sr, .searchCenterMiddle li')

            for div in containers:
                title_el = div.select_one('h3 a, a.d-ib, h3.title a, a[href^="http"]')
                snippet_el = div.select_one('.compText, p, .fc-falcon, div.compText p')
                if not title_el:
                    continue
                raw_url = title_el.get('href', '')
                # Yahoo redirects through RU links
                if '/RU=' in raw_url:
                    try:
                        import re
                        match = re.search(r'/RU=([^/]+)/', raw_url)
                        if match:
                            raw_url = urllib.parse.unquote(match.group(1))
                    except Exception:
                        pass

                if not raw_url.startswith('http'):
                    continue

                results['organic_results'].append({
                    'position': position,
                    'title': title_el.get_text(strip=True),
                    'url': raw_url,
                    'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                    'source': 'yahoo',
                })
                position += 1

            if len(results['organic_results']) == 0:
                raise Exception("Yahoo returned 0 results")

            results['total_results'] = len(results['organic_results'])
            return results

        try:
            return self._retry_with_backoff(attempt, 'yahoo', query, max_retries=3, base_delay=1.0)
        except Exception as e:
            logger.warning(f"[SERP] Yahoo direct scraping failed: {e}, falling back to DuckDuckGo")
            results = self._ddg_search(query, num_results, 'web', 'yahoo')
            results['note'] = 'Results sourced via DuckDuckGo (direct Yahoo scraping was blocked)'
            return results


