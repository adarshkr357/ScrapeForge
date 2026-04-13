"""
================================================================
Browser Worker — Selenium + undetected-chromedriver
================================================================
For JS-rendered pages and anti-bot bypass. 50 concurrent.
"""
import os
import time
import hashlib
from queue_consumer import QueueConsumer
from stealth.fingerprints import get_random_fingerprint
from stealth.behavioral import simulate_human_behavior
from stealth.challenge_detect import detect_challenge


class BrowserWorker:
    def __init__(self):
        self.concurrency = int(os.environ.get('WORKER_CONCURRENCY', 50))
        self.consumer = QueueConsumer('scrape-python-browser', concurrency=self.concurrency)
    
    def start(self):
        print(f"[BrowserWorker] Starting with concurrency={self.concurrency}")
        self.consumer.start(self.process_job)
    
    def process_job(self, job_data):
        """Process a browser-based scrape job."""
        request_id = job_data.get('requestId', 'unknown')
        url = job_data.get('url')
        params = job_data.get('params', {})
        routing = job_data.get('routing', {})
        
        start_time = time.time()
        driver = None
        
        try:
            import undetected_chromedriver as uc
            
            fingerprint = get_random_fingerprint()
            stealth_level = routing.get('stealthLevel', 2)
            
            # Chrome options
            options = uc.ChromeOptions()
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-blink-features=AutomationControlled')
            
            # Viewport
            viewport = params.get('viewport', {})
            width = viewport.get('width', fingerprint.get('viewport_width', 1920))
            height = viewport.get('height', fingerprint.get('viewport_height', 1080))
            options.add_argument(f'--window-size={width},{height}')
            
            # Language
            options.add_argument(f'--lang={fingerprint.get("language", "en-US")}')
            
            # Block resources if requested
            if params.get('block_resources'):
                # Resource blocking handled via CDP after launch
                pass
            
            # Launch browser
            driver = uc.Chrome(options=options, headless=True)
            driver.set_page_load_timeout(params.get('timeout', 30000) / 1000)
            
            # Set cookies before navigation
            if params.get('custom_cookies'):
                driver.get(url.split('/')[0] + '//' + url.split('/')[2])
                for cookie in params['custom_cookies']:
                    driver.add_cookie({
                        'name': cookie['name'],
                        'value': cookie['value'],
                        'domain': cookie.get('domain', ''),
                    })
            
            # Navigate to URL
            driver.get(url)
            
            # Wait for selector
            if params.get('wait_for_selector'):
                from selenium.webdriver.common.by import By
                from selenium.webdriver.support.ui import WebDriverWait
                from selenium.webdriver.support import expected_conditions as EC
                
                WebDriverWait(driver, params.get('wait_for_delay', 10000) / 1000).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, params['wait_for_selector']))
                )
            
            # Wait for delay
            if params.get('wait_for_delay'):
                time.sleep(params['wait_for_delay'] / 1000)
            
            # Behavioral simulation
            if stealth_level >= 3:
                simulate_human_behavior(driver)
            
            # Get page source
            html = driver.page_source
            
            # Try to get actual HTTP status code via JS (Selenium doesn't expose it natively)
            try:
                status_code = driver.execute_script(
                    "return window.performance.getEntries()[0]?.responseStatus || 200"
                )
            except Exception:
                status_code = 200
            
            # Check for challenges
            challenge = detect_challenge(status_code, html, {})
            if challenge['detected']:
                latency_ms = int((time.time() - start_time) * 1000)
                return {
                    'requestId': request_id,
                    'success': False,
                    'blocked': True,
                    'error': f"Challenge detected: {challenge['type']}",
                    'challengeType': challenge['type'],
                    'statusCode': status_code,
                    'latencyMs': latency_ms,
                }
            
            # Secondary block check for error status codes
            if status_code >= 400:
                latency_ms = int((time.time() - start_time) * 1000)
                return {
                    'requestId': request_id,
                    'success': False,
                    'blocked': status_code in (403, 429, 503),
                    'error': f"HTTP {status_code} — request was blocked by target site",
                    'statusCode': status_code,
                    'latencyMs': latency_ms,
                    'html': html[:5000],
                }
            
            # Screenshots
            screenshot_data = None
            if params.get('screenshot', {}).get('enabled'):
                screenshot_data = driver.get_screenshot_as_base64()
            
            # Extract links
            links = driver.execute_script("""
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(h => h.startsWith('http'))
                    .slice(0, 500);
            """)
            
            # Get title
            title = driver.title
            
            latency_ms = int((time.time() - start_time) * 1000)
            content_hash = hashlib.sha256(html.encode()).hexdigest()
            
            return {
                'requestId': request_id,
                'success': True,
                'url': driver.current_url,
                'statusCode': status_code,
                'html': html,
                'rawHtml': html,
                'contentHash': content_hash,
                'links': links,
                'screenshotBase64': screenshot_data,
                'metadata': {
                    'title': title,
                    'contentLength': len(html),
                    'loadTimeMs': latency_ms,
                },
                'latencyMs': latency_ms,
            }
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            return {
                'requestId': request_id,
                'success': False,
                'error': str(e),
                'latencyMs': latency_ms,
            }
        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass
