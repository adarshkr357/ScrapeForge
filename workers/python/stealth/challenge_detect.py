"""
================================================================
Stealth: Anti-Bot Challenge Detection
================================================================
Detects Cloudflare, DataDome, PerimeterX, Akamai, Kasada challenges.
"""
import re


# Known challenge signatures
CHALLENGE_SIGNATURES = {
    'cloudflare': {
        'body_patterns': [
            'Checking your browser',
            'cf-browser-verification',
            'challenge-platform',
            'cf_chl_opt',
            'Just a moment...',
            'Enable JavaScript and cookies to continue',
            'ray ID:',
        ],
        'header_patterns': [
            ('server', 'cloudflare'),
            ('cf-ray', ''),
        ],
    },
    'cloudflare_turnstile': {
        'body_patterns': [
            'challenges.cloudflare.com/turnstile',
            'cf-turnstile',
        ],
    },
    'datadome': {
        'body_patterns': [
            'datadome',
            'dd.js',
            'DataDome',
        ],
        'cookie_patterns': ['datadome'],
    },
    'perimeterx': {
        'body_patterns': [
            '_pxhd',
            'perimeterx',
            'human challenge',
            'px-captcha',
            'px-block',
        ],
        'cookie_patterns': ['_px', '_pxhd'],
    },
    'akamai': {
        'body_patterns': [
            'akamai',
            'ak_bmsc',
            'bm_sz',
        ],
        'cookie_patterns': ['ak_bmsc', 'bm_sz'],
    },
    'imperva': {
        'body_patterns': [
            'incapsula',
            'imperva',
            '_incap_ses',
        ],
        'header_patterns': [
            ('x-cdn', 'imperva'),
        ],
    },
    'kasada': {
        'body_patterns': [
            'kasada',
            'cd.js',
            'ips.js',
        ],
    },
    'shape_security': {
        'body_patterns': [
            'shape security',
            'f5 networks',
        ],
    },
    'aws_waf': {
        'body_patterns': [
            'aws-waf',
            'captcha verification',
        ],
        'header_patterns': [
            ('x-amzn-waf', ''),
        ],
    },
    'generic_block': {
        'body_patterns': [
            'access denied',
            'access to this page has been denied',
            'you have been blocked',
            'request blocked',
            'bot detected',
            'automated access',
            'suspicious activity',
            'please verify you are a human',
            'your ip has been',
            'rate limit exceeded',
            'too many requests',
            'forbidden',
            'error 403',
            'error 429',
            '403 forbidden',
            '429 too many requests',
        ],
    },
}


def detect_challenge(status_code, body, headers):
    """
    Detect anti-bot challenges from response.
    
    Returns: {
        'detected': bool,
        'type': str,
        'confidence': float,
        'details': str
    }
    """
    result = {
        'detected': False,
        'type': 'none',
        'confidence': 0,
        'details': '',
    }
    
    is_blocked_status = status_code in (403, 429, 503)
    
    # Status code check — 403/429/503 is a strong signal
    if is_blocked_status:
        result['confidence'] += 0.5
        result['type'] = 'http_block'
    
    body_lower = body.lower() if body else ''
    
    # Check each known challenge type
    for challenge_type, signatures in CHALLENGE_SIGNATURES.items():
        score = 0
        
        # Body patterns
        for pattern in signatures.get('body_patterns', []):
            if pattern.lower() in body_lower:
                score += 0.4
        
        # Header patterns
        for header_name, header_value in signatures.get('header_patterns', []):
            header_actual = headers.get(header_name, '') if isinstance(headers, dict) else ''
            if header_actual:
                if not header_value or header_value.lower() in header_actual.lower():
                    score += 0.3
        
        # If we have a known challenge type with pattern matches, prefer it over generic
        if score > 0 and (score + result['confidence']) > result['confidence']:
            result['confidence'] = max(result['confidence'], score + (0.5 if is_blocked_status else 0))
            if score > 0:
                result['type'] = challenge_type
    
    # Empty body or suspiciously small response on blocked status
    if body and len(body) < 1000 and is_blocked_status:
        result['confidence'] += 0.2
    
    # Redirect loops (check for meta refresh)
    if body and 'meta http-equiv="refresh"' in body_lower:
        result['confidence'] += 0.2
    
    # A 403/429/503 with very little real content is almost certainly a block
    if is_blocked_status and body:
        # Check if response has any meaningful <body> content
        stripped = re.sub(r'<[^>]+>', '', body).strip()
        if len(stripped) < 200:
            result['confidence'] = max(result['confidence'], 0.7)
    
    # Determine if challenge is actually detected
    if result['confidence'] >= 0.4:
        result['detected'] = True
        result['details'] = f"Challenge type: {result['type']}, confidence: {result['confidence']:.2f}"
    
    return result


def is_blocked(status_code, body='', headers=None):
    """Simple boolean check if the response looks blocked."""
    challenge = detect_challenge(status_code, body, headers or {})
    return challenge['detected']
