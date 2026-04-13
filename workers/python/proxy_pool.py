"""
================================================================
Free Proxy Pool — Fetches and validates public proxies
================================================================
Scrapes free proxy lists, tests them, and stores healthy ones
in Redis for the workers to use.
"""
import os
import time
import threading
import httpx


# Public free proxy list APIs (no API key needed)
FREE_PROXY_SOURCES = [
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all',
    'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
]

REFRESH_INTERVAL = 600  # 10 minutes
TEST_URL = 'https://httpbin.org/ip'
TEST_TIMEOUT = 8


class FreeProxyPool:
    def __init__(self):
        self.redis_client = None
        self.proxies = []
        self._lock = threading.Lock()
    
    def _get_redis(self):
        if not self.redis_client:
            import redis
            self.redis_client = redis.Redis(
                host=os.environ.get('REDIS_HOST', '127.0.0.1'),
                port=int(os.environ.get('REDIS_PORT', 6379)),
                password=os.environ.get('REDIS_PASSWORD') or None,
                decode_responses=True,
            )
        return self.redis_client
    
    def fetch_proxies(self):
        """Fetch proxy lists from all free sources."""
        all_proxies = set()
        
        for source_url in FREE_PROXY_SOURCES:
            try:
                response = httpx.get(source_url, timeout=15)
                if response.status_code == 200:
                    lines = response.text.strip().split('\n')
                    for line in lines:
                        line = line.strip()
                        if ':' in line and len(line) < 50:
                            # Validate format: ip:port
                            parts = line.split(':')
                            if len(parts) == 2:
                                try:
                                    int(parts[1])
                                    all_proxies.add(line)
                                except ValueError:
                                    pass
                    print(f"[ProxyPool] Fetched {len(lines)} proxies from {source_url.split('/')[2]}")
            except Exception as e:
                print(f"[ProxyPool] Failed to fetch from {source_url.split('/')[2]}: {e}")
        
        print(f"[ProxyPool] Total unique proxies fetched: {len(all_proxies)}")
        return list(all_proxies)
    
    def test_proxy(self, proxy_addr):
        """Test if a proxy is working. Returns latency in ms or -1 if dead."""
        proxy_url = f"http://{proxy_addr}"
        try:
            start = time.time()
            response = httpx.get(
                TEST_URL,
                proxy=proxy_url,
                timeout=TEST_TIMEOUT,
            )
            latency = int((time.time() - start) * 1000)
            if response.status_code == 200:
                return latency
        except Exception:
            pass
        return -1
    
    def refresh(self):
        """Fetch, test, and store healthy proxies in Redis."""
        print("[ProxyPool] Refreshing proxy pool...")
        raw_proxies = self.fetch_proxies()
        
        if not raw_proxies:
            print("[ProxyPool] No proxies fetched. Skipping refresh.")
            return
        
        # Test a sample (testing all would take too long)
        sample_size = min(100, len(raw_proxies))
        import random
        sample = random.sample(raw_proxies, sample_size)
        
        healthy = []
        for proxy in sample:
            latency = self.test_proxy(proxy)
            if latency > 0:
                healthy.append((proxy, latency))
        
        print(f"[ProxyPool] {len(healthy)}/{sample_size} proxies are healthy")
        
        if healthy:
            try:
                r = self._get_redis()
                pipe = r.pipeline()
                
                # Clear old pool
                pipe.delete('proxy:pool:healthy')
                pipe.delete('proxy:pool:datacenter:healthy')
                
                # Add healthy proxies as http://ip:port format
                for proxy_addr, latency in healthy:
                    proxy_url = f"http://{proxy_addr}"
                    pipe.sadd('proxy:pool:healthy', proxy_url)
                    pipe.sadd('proxy:pool:datacenter:healthy', proxy_url)
                
                # Set pool metadata
                pipe.set('proxy:pool:lastRefresh', str(int(time.time())))
                pipe.set('proxy:pool:count', str(len(healthy)))
                
                pipe.execute()
                print(f"[ProxyPool] Stored {len(healthy)} healthy proxies in Redis")
            except Exception as e:
                print(f"[ProxyPool] Failed to store in Redis: {e}")
        
        with self._lock:
            self.proxies = [f"http://{p}" for p, _ in healthy]
    
    def start_background_refresh(self):
        """Start background thread that refreshes proxies periodically."""
        def _loop():
            while True:
                try:
                    self.refresh()
                except Exception as e:
                    print(f"[ProxyPool] Refresh error: {e}")
                time.sleep(REFRESH_INTERVAL)
        
        thread = threading.Thread(target=_loop, daemon=True)
        thread.start()
        print(f"[ProxyPool] Background refresh started (every {REFRESH_INTERVAL}s)")
    
    def get_random_proxy(self):
        """Get a random proxy URL from the pool."""
        with self._lock:
            if self.proxies:
                import random
                return random.choice(self.proxies)
        return None


# Singleton
proxy_pool = FreeProxyPool()
