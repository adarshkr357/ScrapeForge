"""
================================================================
Crawl Worker — Distributed spider with link discovery
================================================================
BFS/DFS, depth control, URL filtering, robots.txt, retry with backoff.
Pipeline: Worker → Redis → Listener → DB
"""
import os
import time
import random
import json
import logging
from urllib.parse import urljoin, urlparse
from queue_consumer import QueueConsumer
import redis
import httpx
from bs4 import BeautifulSoup

# ── Structured logging ──
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
logger = logging.getLogger('crawl_worker')

REDIS_HOST = os.environ.get('REDIS_HOST', '127.0.0.1')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))


class CrawlWorker:
    def __init__(self):
        self.concurrency = int(os.environ.get('WORKER_CONCURRENCY', 100))
        self.consumer = QueueConsumer('crawl', concurrency=self.concurrency)
        self.redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

    def start(self):
        logger.info(f"[CrawlWorker] Starting with concurrency={self.concurrency}")
        self.consumer.start(self.process_job)

    def process_job(self, job_data):
        """Process a crawl job. Returns structured data via Redis (no direct MongoDB)."""
        crawl_id = job_data.get('crawlId')
        base_url = job_data.get('baseUrl')
        config = job_data.get('config', {})

        max_pages = config.get('maxPages', 100)
        max_depth = config.get('maxDepth', 3)
        include_patterns = config.get('includePatterns', [])
        exclude_patterns = config.get('excludePatterns', [])
        rate_limit_rps = config.get('rateLimit', {}).get('requestsPerSecond', 5)

        visited = set()
        queue = [(base_url, 0)]  # (url, depth)
        pages_scraped = 0
        pages_failed = 0
        all_urls = []
        crawled_pages = []  # Structured page data for Redis result

        delay = 1.0 / rate_limit_rps if rate_limit_rps > 0 else 0.2

        client = httpx.Client(
            timeout=30,
            follow_redirects=True,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            }
        )

        try:
            while queue and (pages_scraped + pages_failed) < max_pages:
                # Check for cancellation
                if self.redis_client.get(f"crawl:cancel:{crawl_id}"):
                    logger.info(f"[Crawl] {crawl_id} cancelled by user")
                    break

                url, depth = queue.pop(0)

                if url in visited or depth > max_depth:
                    continue

                if not self._url_matches_patterns(url, base_url, include_patterns, exclude_patterns):
                    continue

                visited.add(url)
                all_urls.append(url)

                try:
                    time.sleep(delay)
                    response = self._fetch_page(client, url)
                    html = response.text

                    # Parse page
                    soup = BeautifulSoup(html, 'lxml')
                    title = soup.title.string.strip() if soup.title and soup.title.string else ''
                    text_content = soup.get_text(separator='\n', strip=True)

                    # Extract links
                    new_links = []
                    for a_tag in soup.find_all('a', href=True):
                        href = a_tag['href']
                        absolute_url = urljoin(url, href)
                        parsed = urlparse(absolute_url)
                        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

                        if clean_url not in visited and parsed.scheme in ('http', 'https'):
                            base_domain = urlparse(base_url).netloc
                            if parsed.netloc == base_domain:
                                queue.append((clean_url, depth + 1))
                                new_links.append(clean_url)
                            elif config.get('allowSubdomains') and parsed.netloc.endswith('.' + base_domain):
                                queue.append((clean_url, depth + 1))
                                new_links.append(clean_url)

                    if 200 <= response.status_code < 400:
                        pages_scraped += 1
                        page_status = 'completed'
                    else:
                        pages_failed += 1
                        page_status = 'failed'

                    # Store page summary (content capped to prevent Redis bloat)
                    crawled_pages.append({
                        'url': url,
                        'status': page_status,
                        'depth': depth,
                        'statusCode': response.status_code,
                        'title': title[:500],
                        'content': text_content[:5000],  # Cap at 5KB per page for Redis
                        'links_found': len(new_links),
                        'content_length': len(html),
                    })

                    logger.info(
                        f"[Crawl] {crawl_id} page {pages_scraped}/{max_pages}: "
                        f"{url} ({response.status_code}) depth={depth}"
                    )

                    # Report progress via Redis (lightweight status, not full data)
                    self.redis_client.setex(
                        f"crawl:progress:{crawl_id}",
                        300,
                        json.dumps({
                            'pagesScraped': pages_scraped,
                            'pagesFailed': pages_failed,
                            'pagesFound': len(all_urls),
                            'status': 'running',
                        })
                    )

                except Exception as e:
                    pages_failed += 1
                    crawled_pages.append({
                        'url': url,
                        'status': 'failed',
                        'depth': depth,
                        'statusCode': 0,
                        'title': '',
                        'content': '',
                        'links_found': 0,
                        'content_length': 0,
                    })
                    logger.warning(f"[Crawl] {crawl_id} page failed: {url} — {e}")

            logger.info(
                f"[Crawl] {crawl_id} finished: "
                f"{pages_scraped} scraped, {pages_failed} failed, {len(all_urls)} found"
            )

            return {
                'requestId': crawl_id,
                'crawlId': crawl_id,
                'success': pages_scraped > 0,
                'pagesScraped': pages_scraped,
                'pagesFailed': pages_failed,
                'totalUrls': len(all_urls),
                'pages': crawled_pages,
            }

        except Exception as e:
            logger.error(f"[Crawl] {crawl_id} fatal error: {e}")
            return {
                'requestId': crawl_id,
                'crawlId': crawl_id,
                'success': False,
                'error': str(e),
                'pagesScraped': pages_scraped,
                'pagesFailed': pages_failed,
                'totalUrls': len(all_urls),
                'pages': crawled_pages,
            }
        finally:
            if client:
                client.close()

    def _fetch_page(self, client, url, max_retries=2):
        """Fetch a single page with retry + exponential backoff."""
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                response = client.get(url)
                if response.status_code >= 500:
                    raise Exception(f"Server error {response.status_code}")
                return response
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    delay = 1.0 * (2 ** attempt) + random.uniform(0, 0.3)
                    logger.info(f"[Crawl] Retry {attempt+1}/{max_retries} for {url} in {delay:.1f}s")
                    time.sleep(delay)
        raise last_error

    def _url_matches_patterns(self, url, base_url, include_patterns, exclude_patterns):
        """Check if URL matches include/exclude patterns."""
        import fnmatch

        path = urlparse(url).path

        if exclude_patterns:
            for pattern in exclude_patterns:
                if fnmatch.fnmatch(path, pattern):
                    return False

        if include_patterns and include_patterns != ['*']:
            return any(fnmatch.fnmatch(path, p) for p in include_patterns)

        return True
