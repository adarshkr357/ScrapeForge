"""
================================================================
SERP Worker — Search engine results scraper
================================================================
Google, Bing, Yahoo, DuckDuckGo, Yandex, Baidu, Naver.
Each engine works independently with retry + exponential backoff.
NO global DuckDuckGo fallback — each engine returns its own result or error.
"""
import os
import time
import json
import random
import logging
import urllib.parse
from queue_consumer import QueueConsumer
import httpx
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

# ── Structured logging ──
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
logger = logging.getLogger('serp_worker')

# ── User Agent Pool ──────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
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
        """Execute fn with exponential backoff retries. Rotates User-Agent per attempt."""
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

        start_time = time.time()

        try:
            if engine == 'google':
                results = self._scrape_google(query, num_results, result_type, country, language, page)
            elif engine == 'bing':
                results = self._scrape_bing(query, num_results, result_type, country, language, page)
            elif engine == 'duckduckgo':
                results = self._scrape_duckduckgo(query, num_results, result_type, country, language)
            elif engine == 'yahoo':
                results = self._scrape_yahoo(query, num_results, page)
            elif engine == 'yandex':
                results = self._scrape_yandex(query, num_results)
            elif engine == 'baidu':
                results = self._scrape_baidu(query, num_results)
            elif engine == 'naver':
                results = self._scrape_naver(query, num_results)
            else:
                results = self._scrape_bing(query, num_results, result_type, country, language, page)

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
                f"results for '{query}' in {latency_ms}ms"
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
                'error': f'{engine} search failed after retries: {str(e)}',
                'engine': engine,
                'latencyMs': latency_ms,
            }

    # ── DuckDuckGo ─────────────────────────────────────────────
    def _scrape_duckduckgo(self, query, num_results, result_type, country, language):
        """DuckDuckGo scraper wrapper using robust library."""
        results = {'organic_results': [], 'related_searches': []}

        try:
            with DDGS() as ddgs:
                if result_type == 'images':
                    r = ddgs.images(query, region=f"wt-wt", safesearch="off", max_results=num_results)
                elif result_type == 'news':
                    r = ddgs.news(query, region=f"wt-wt", safesearch="off", max_results=num_results)
                else:
                    r = ddgs.text(query, region=f"wt-wt", safesearch="off", max_results=num_results)

                for idx, res in enumerate(r):
                    if result_type == 'web' or result_type == 'news':
                        results['organic_results'].append({
                            'position': idx + 1,
                            'title': res.get('title', ''),
                            'url': res.get('href', res.get('url', '')),
                            'snippet': res.get('body', res.get('abstract', '')),
                        })
                    elif result_type == 'images':
                        results['organic_results'].append({
                            'position': idx + 1,
                            'title': res.get('title', ''),
                            'url': res.get('url', res.get('image', '')),
                            'image': res.get('image', ''),
                            'source': res.get('source', '')
                        })

        except Exception as e:
            logger.error(f"[DDG] Library error: {str(e)}")
            raise  # Let the caller handle it — no silent swallowing

        results['total_results'] = len(results['organic_results'])
        return results

    # ── Google ─────────────────────────────────────────────────
    def _scrape_google(self, query, num_results, result_type, country, language, page):
        """Google SERP scraper with retry + anti-detection."""
        params = {
            'q': query,
            'num': min(num_results + 5, 100),
            'hl': language,
            'gl': country,
            'start': (page - 1) * 10,
            'safe': 'off',
        }
        if result_type == 'news':
            params['tbm'] = 'nws'
        elif result_type == 'images':
            params['tbm'] = 'isch'
        elif result_type == 'videos':
            params['tbm'] = 'vid'
        elif result_type == 'shopping':
            params['tbm'] = 'shop'

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://www.google.com/'
            headers['Cookie'] = 'CONSENT=YES+cb.20210720-07-p0.en+FX+{}'.format(random.randint(100, 999))

            time.sleep(random.uniform(0.5, 1.5))

            with httpx.Client(
                timeout=25,
                follow_redirects=True,
                http2=True,
                headers=headers,
            ) as client:
                resp = client.get('https://www.google.com/search', params=params)

            if resp.status_code != 200:
                raise Exception(f"Google returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {
                'organic_results': [],
                'featured_snippet': None,
                'people_also_ask': [],
                'related_searches': [],
                'paid_results': [],
            }

            # Featured snippet
            fs = soup.select_one('.hgKElc, .xpdopen .LGOjhe, .xpdopen .u6YpT')
            if fs:
                results['featured_snippet'] = fs.get_text(strip=True)

            position = 1
            seen_urls = set()
            for div in soup.select('div.g, div.Gx5Zad'):
                title_el = div.select_one('h3')
                link_el = div.select_one('a[href^="http"], a[href^="/url"]')
                snippet_el = div.select_one('div.VwiC3b, span.aCOpRe, div[data-sncf] span')

                if not (title_el and link_el):
                    continue

                raw_url = link_el.get('href', '')
                if raw_url.startswith('/url?'):
                    parsed = urllib.parse.urlparse(raw_url)
                    raw_url = urllib.parse.parse_qs(parsed.query).get('q', [raw_url])[0]

                if not raw_url.startswith('http') or raw_url in seen_urls:
                    continue
                seen_urls.add(raw_url)

                results['organic_results'].append({
                    'position': position,
                    'title': title_el.get_text(strip=True),
                    'url': raw_url,
                    'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                    'source': 'google',
                })
                position += 1

            if len(results['organic_results']) == 0:
                raise Exception("Google returned 0 results (likely blocked)")

            # People Also Ask
            for paa in soup.select('div.related-question-pair, .xpc .JibNPf'):
                q = paa.select_one('.JCzEY, span[role="heading"]')
                if q:
                    results['people_also_ask'].append(q.get_text(strip=True))

            # Related searches
            for related in soup.select('div.s75CSd a, a.k8XOCe, p.DBM1Twe a'):
                text = related.get_text(strip=True)
                if text and len(text) > 2:
                    results['related_searches'].append(text)

            results['total_results'] = len(results['organic_results'])
            return results

        return self._retry_with_backoff(attempt, 'google', query, max_retries=3, base_delay=1.5)

    # ── Bing ───────────────────────────────────────────────────
    def _scrape_bing(self, query, num_results, result_type, country, language, page):
        """Bing SERP scraper with retry."""
        params = {
            'q': query,
            'count': min(num_results + 5, 50),
            'first': (page - 1) * 10 + 1,
            'mkt': f'{language}-{country.upper()}',
        }
        if result_type == 'news':
            params['qft'] = '+filterui:scenario-NewsIndex'

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://www.bing.com/'
            time.sleep(random.uniform(0.3, 0.8))

            with httpx.Client(timeout=20, follow_redirects=True, http2=True, headers=headers) as client:
                resp = client.get('https://www.bing.com/search', params=params)

            if resp.status_code != 200:
                raise Exception(f"Bing returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {'organic_results': [], 'related_searches': []}
            position = 1

            for li in soup.select('li.b_algo'):
                title_el = li.select_one('h2 a')
                snippet_el = li.select_one('div.b_caption p, .b_algoSlug')
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
                raise Exception("Bing returned 0 results (possibly blocked)")

            # Related
            for r in soup.select('.b_rs a, .b_no a'):
                text = r.get_text(strip=True)
                if text:
                    results['related_searches'].append(text)

            results['total_results'] = len(results['organic_results'])
            return results

        return self._retry_with_backoff(attempt, 'bing', query, max_retries=3, base_delay=1.0)

    # ── Yahoo ──────────────────────────────────────────────────
    def _scrape_yahoo(self, query, num_results, page):
        """Yahoo search scraper with retry."""
        params = {'p': query, 'n': min(num_results, 50), 'b': (page - 1) * 10 + 1}

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://search.yahoo.com/'

            with httpx.Client(timeout=20, follow_redirects=True, http2=True, headers=headers) as client:
                resp = client.get('https://search.yahoo.com/search', params=params)

            if resp.status_code != 200:
                raise Exception(f"Yahoo returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {'organic_results': []}
            position = 1

            for div in soup.select('div.dd.algo, div[data-pos]'):
                title_el = div.select_one('h3 a, a.mb-10')
                snippet_el = div.select_one('.compText, p')
                if not title_el:
                    continue
                raw_url = title_el.get('href', '')
                if '/bc/yahoo.com' in raw_url:
                    try:
                        parsed = urllib.parse.urlparse(raw_url)
                        raw_url = urllib.parse.parse_qs(parsed.query).get('dest', [raw_url])[0]
                    except Exception:
                        pass
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

        return self._retry_with_backoff(attempt, 'yahoo', query, max_retries=3, base_delay=1.0)

    # ── Yandex ─────────────────────────────────────────────────
    def _scrape_yandex(self, query, num_results):
        """Yandex SERP scraper with retry."""
        params = {'text': query, 'numdoc': min(num_results, 50), 'lr': 213}

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://yandex.com/'

            with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
                resp = client.get('https://yandex.com/search/', params=params)

            if resp.status_code != 200:
                raise Exception(f"Yandex returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {'organic_results': []}
            position = 1

            for div in soup.select('li.serp-item, div.Organic'):
                title_el = div.select_one('h2 a, .OrganicTitle-Link')
                snippet_el = div.select_one('.OrganicTextContentSpan, .TextContainer')
                if not title_el:
                    continue
                url = title_el.get('href', '')
                if not url.startswith('http'):
                    continue
                results['organic_results'].append({
                    'position': position,
                    'title': title_el.get_text(strip=True),
                    'url': url,
                    'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                    'source': 'yandex',
                })
                position += 1

            if len(results['organic_results']) == 0:
                raise Exception("Yandex returned 0 results (possibly captcha)")

            results['total_results'] = len(results['organic_results'])
            return results

        return self._retry_with_backoff(attempt, 'yandex', query, max_retries=3, base_delay=1.5)

    # ── Baidu ──────────────────────────────────────────────────
    def _scrape_baidu(self, query, num_results):
        """Baidu SERP scraper with retry and charset handling."""
        params = {'wd': query, 'rn': min(num_results, 50)}

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://www.baidu.com/'
            headers['Cookie'] = 'BAIDUID={}:FG=1'.format(
                ''.join(random.choices('0123456789ABCDEF', k=32))
            )

            with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
                resp = client.get('https://www.baidu.com/s', params=params)

            # Handle charset encoding
            text = resp.text
            if resp.encoding and resp.encoding.lower() not in ('utf-8', 'utf8'):
                try:
                    text = resp.content.decode('utf-8', errors='replace')
                except Exception:
                    pass

            soup = BeautifulSoup(text, 'lxml')
            results = {'organic_results': []}
            position = 1

            for div in soup.select('div.result, div.c-container'):
                title_el = div.select_one('h3 a, a[target="_blank"]')
                snippet_el = div.select_one('.c-abstract, .c-span9')
                if not title_el:
                    continue
                results['organic_results'].append({
                    'position': position,
                    'title': title_el.get_text(strip=True),
                    'url': title_el.get('href', ''),
                    'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                    'source': 'baidu',
                })
                position += 1

            if len(results['organic_results']) == 0:
                raise Exception("Baidu returned 0 results")

            results['total_results'] = len(results['organic_results'])
            return results

        return self._retry_with_backoff(attempt, 'baidu', query, max_retries=3, base_delay=1.0)

    # ── Naver ──────────────────────────────────────────────────
    def _scrape_naver(self, query, num_results):
        """Naver (Korean) search scraper with retry."""
        params = {'query': query, 'display': min(num_results, 30)}

        def attempt():
            headers = get_headers()
            headers['Referer'] = 'https://search.naver.com/'
            # Naver expects Korean locale User-Agent
            headers['Accept-Language'] = 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'

            with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
                resp = client.get('https://search.naver.com/search.naver', params=params)

            if resp.status_code != 200:
                raise Exception(f"Naver returned HTTP {resp.status_code}")

            soup = BeautifulSoup(resp.text, 'lxml')
            results = {'organic_results': []}
            position = 1

            for li in soup.select('.lst_total > li, .bx'):
                title_el = li.select_one('.link_tit, a.api_txt_lines')
                snippet_el = li.select_one('.dsc_wrap, .api_txt_lines.dsc_txt')
                if not title_el:
                    continue
                url = title_el.get('href', '')
                if not url.startswith('http'):
                    continue
                results['organic_results'].append({
                    'position': position,
                    'title': title_el.get_text(strip=True),
                    'url': url,
                    'snippet': snippet_el.get_text(strip=True) if snippet_el else '',
                    'source': 'naver',
                })
                position += 1

            if len(results['organic_results']) == 0:
                raise Exception("Naver returned 0 results")

            results['total_results'] = len(results['organic_results'])
            return results

        return self._retry_with_backoff(attempt, 'naver', query, max_retries=3, base_delay=1.0)
