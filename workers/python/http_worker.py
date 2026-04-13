"""
================================================================
HTTP Worker — Lightweight scraper using httpx + BeautifulSoup4
================================================================
For static pages. Fastest, cheapest. 200 concurrent capacity.
"""
import os
import time
import hashlib
import httpx
from bs4 import BeautifulSoup
from queue_consumer import QueueConsumer
from stealth.fingerprints import get_random_fingerprint
from stealth.tls_patch import create_stealth_client
from stealth.challenge_detect import detect_challenge
from proxy_pool import proxy_pool


class HTTPWorker:
    def __init__(self):
        self.concurrency = int(os.environ.get('WORKER_CONCURRENCY', 200))
        self.consumer = QueueConsumer('scrape-python-http', concurrency=self.concurrency)
    
    def start(self):
        """Start processing HTTP scrape jobs."""
        # Start background proxy pool refresh
        proxy_pool.start_background_refresh()
        print(f"[HTTPWorker] Starting with concurrency={self.concurrency}")
        self.consumer.start(self.process_job)
    
    def process_job(self, job_data):
        """Process a single scrape job."""
        request_id = job_data.get('requestId', 'unknown')
        url = job_data.get('url')
        params = job_data.get('params', {})
        routing = job_data.get('routing', {})
        
        start_time = time.time()
        client = None
        
        try:
            # Get fingerprint for stealth
            stealth_level = routing.get('stealthLevel', 0)
            fingerprint = get_random_fingerprint() if stealth_level > 0 else {}
            
            # Build headers
            headers = {
                'User-Agent': fingerprint.get('user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': fingerprint.get('language', 'en-US,en;q=0.9'),
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
            
            # Apply custom headers
            if params.get('custom_headers'):
                headers.update(params['custom_headers'])
            
            # Build proxy URL from routing config
            proxy_url = self._get_proxy_url(routing)
            
            # Create HTTP client (with TLS mimicry for stealth level >= 2)
            if stealth_level >= 2:
                client = create_stealth_client(fingerprint, timeout=params.get('timeout', 30000) / 1000, proxy=proxy_url)
            else:
                client = httpx.Client(
                    timeout=params.get('timeout', 30000) / 1000,
                    follow_redirects=True,
                    http2=True,
                    proxy=proxy_url,
                )
            
            # Make request
            method = params.get('method', 'GET').upper()
            response = client.request(method, url, headers=headers)
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Check for anti-bot challenges
            challenge = detect_challenge(response.status_code, response.text, dict(response.headers))
            if challenge['detected']:
                return {
                    'requestId': request_id,
                    'success': False,
                    'blocked': True,
                    'error': f"Anti-bot challenge detected: {challenge['type']}",
                    'challengeType': challenge['type'],
                    'statusCode': response.status_code,
                    'latencyMs': latency_ms,
                }
            
            # Secondary block check: any 4xx/5xx without challenge detection
            # is still a failure — don't return success:true for error status codes
            if response.status_code >= 400:
                return {
                    'requestId': request_id,
                    'success': False,
                    'blocked': response.status_code in (403, 429, 503),
                    'error': f"HTTP {response.status_code} — request was {'blocked' if response.status_code in (403, 429, 503) else 'rejected'} by target site",
                    'statusCode': response.status_code,
                    'latencyMs': latency_ms,
                    'html': response.text[:5000],  # Include partial body for debugging
                }
            
            # Parse HTML
            html = response.text
            soup = BeautifulSoup(html, 'lxml')
            
            # Extract metadata
            title = soup.find('title')
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            
            # Extract links
            links = []
            for a in soup.find_all('a', href=True):
                href = a['href']
                if href.startswith('http'):
                    links.append(href)
            
            # Content hash for deduplication
            content_hash = hashlib.sha256(html.encode()).hexdigest()
            
            result = {
                'requestId': request_id,
                'success': True,
                'url': str(response.url),
                'statusCode': response.status_code,
                'html': html,
                'rawHtml': html,
                'contentHash': content_hash,
                'links': links[:500],
                'metadata': {
                    'title': title.string.strip() if title and title.string else None,
                    'description': meta_desc.get('content', '') if meta_desc else None,
                    'contentLength': len(html),
                    'loadTimeMs': latency_ms,
                },
                'latencyMs': latency_ms,
                'headers': dict(response.headers),
            }
            
            return result
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            return {
                'requestId': request_id,
                'success': False,
                'error': str(e),
                'latencyMs': latency_ms,
            }
        finally:
            if client:
                client.close()
    
    def _get_proxy_url(self, routing):
        """
        Resolve proxy URL from routing config.
        Priority: PROXY_URL env var > Redis pool > in-memory pool > None (direct).
        Proxies are only used when proxy_type is not 'none'.
        """
        proxy_config = routing.get('proxyConfig', {})
        proxy_type = proxy_config.get('type', 'none')
        
        # If proxy type is explicitly 'none', go direct (default for speed)
        if proxy_type == 'none':
            return None
        
        # Check for premium proxy URL set in environment
        proxy_env = os.environ.get('PROXY_URL')
        if proxy_env:
            return proxy_env
        
        # Try to get a proxy from the Redis pool
        try:
            import redis as redis_lib
            redis_host = os.environ.get('REDIS_HOST', '127.0.0.1')
            redis_port = int(os.environ.get('REDIS_PORT', 6379))
            r = redis_lib.Redis(host=redis_host, port=redis_port, decode_responses=True)
            
            # Try type-specific key first, then fallback to general pool
            proxy_data = r.srandmember(f'proxy:pool:{proxy_type}:healthy')
            if not proxy_data:
                proxy_data = r.srandmember('proxy:pool:healthy')
            
            if proxy_data:
                return proxy_data
        except Exception:
            pass
        
        # Fallback: in-memory pool from free proxy fetcher
        random_proxy = proxy_pool.get_random_proxy()
        if random_proxy:
            return random_proxy
        
        # No proxy available — go direct
        return None


if __name__ == '__main__':
    worker = HTTPWorker()
    worker.start()
