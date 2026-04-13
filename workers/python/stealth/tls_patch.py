"""
================================================================
Stealth: TLS Fingerprint Mimicry (JA3/JA4)
================================================================
Uses curl_cffi to match real browser TLS fingerprints.
"""
import httpx


# Supported curl_cffi impersonation targets (ordered by preference)
# These are the actual supported values across curl_cffi versions
SUPPORTED_BROWSERS = [
    'chrome124', 'chrome123', 'chrome120', 'chrome119',
    'chrome116', 'chrome110', 'chrome107', 'chrome104',
    'chrome101', 'chrome100', 'chrome99',
]

SUPPORTED_SAFARI = ['safari17_0', 'safari15_5', 'safari15_3']
SUPPORTED_EDGE = ['edge101', 'edge99']


def create_stealth_client(fingerprint=None, timeout=30, proxy=None):
    """
    Create an HTTP client with TLS fingerprint mimicry.
    Uses curl_cffi for JA3/JA4 hash matching when available,
    falls back to httpx with HTTP/2.
    """
    try:
        from curl_cffi import requests as curl_requests
        
        # Map browser version to TLS fingerprint
        ua = fingerprint.get('user_agent', '') if fingerprint else ''
        browser_impersonate = _detect_browser(ua)
        
        # Try creating session with the detected browser, fall back through
        # supported versions if the installed curl_cffi doesn't support it
        session = _create_session_with_fallback(curl_requests, browser_impersonate, timeout, proxy)
        
        if session:
            return TLSClientWrapper(session, is_curl=True)
    except ImportError:
        pass
    except Exception as e:
        print(f"[TLS] curl_cffi error: {e}, falling back to httpx")
    
    # Fallback to standard httpx
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        http2=True,
        proxy=proxy,
    )


def _create_session_with_fallback(curl_requests, preferred, timeout, proxy=None):
    """
    Try creating a curl_cffi session with the preferred browser.
    If it fails, fall through a list of known-supported browsers.
    """
    # Build the fallback chain: preferred first, then all supported
    candidates = [preferred] + [b for b in SUPPORTED_BROWSERS if b != preferred]
    
    for browser in candidates:
        try:
            session = curl_requests.Session(
                impersonate=browser,
                proxy=proxy,
            )
            session.timeout = timeout
            return session
        except Exception:
            continue
    
    return None


def _detect_browser(user_agent):
    """Map User-Agent to the closest supported curl_cffi impersonation target."""
    ua = user_agent.lower()
    
    # Chrome — map to closest supported version
    if 'chrome/' in ua:
        # Extract Chrome version number
        try:
            idx = ua.index('chrome/')
            version_str = ua[idx + 7:].split('.')[0]
            version = int(version_str)
            
            # Find the closest supported version that doesn't exceed the actual version
            best = 'chrome124'
            for supported in SUPPORTED_BROWSERS:
                supported_ver = int(supported.replace('chrome', ''))
                if supported_ver <= version:
                    best = supported
                    break
            return best
        except (ValueError, IndexError):
            return 'chrome124'
    
    # Edge
    if 'edg/' in ua or 'edge/' in ua:
        return SUPPORTED_EDGE[0]
    
    # Safari (pure, not Chrome-based)
    if 'safari/' in ua and 'chrome' not in ua:
        return SUPPORTED_SAFARI[0]
    
    # Firefox — curl_cffi doesn't support Firefox impersonation
    # Fall back to Chrome (best TLS fingerprint coverage)
    if 'firefox/' in ua:
        return 'chrome124'
    
    # Default
    return 'chrome124'


class TLSClientWrapper:
    """Wrapper to unify curl_cffi and httpx interfaces."""
    
    def __init__(self, session, is_curl=False):
        self.session = session
        self.is_curl = is_curl
    
    def request(self, method, url, headers=None, **kwargs):
        if self.is_curl:
            response = self.session.request(method, url, headers=headers, **kwargs)
            return CurlResponseWrapper(response)
        return self.session.request(method, url, headers=headers, **kwargs)
    
    def get(self, url, headers=None, **kwargs):
        return self.request('GET', url, headers=headers, **kwargs)
    
    def post(self, url, headers=None, **kwargs):
        return self.request('POST', url, headers=headers, **kwargs)
    
    def close(self):
        if hasattr(self.session, 'close'):
            self.session.close()


class CurlResponseWrapper:
    """Wrap curl_cffi response to match httpx interface."""
    
    def __init__(self, response):
        self._response = response
        self.status_code = response.status_code
        self.text = response.text
        self.headers = dict(response.headers)
        self.url = str(response.url)
        self.content = response.content
