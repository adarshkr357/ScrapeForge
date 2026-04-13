"""
================================================================
Stealth: CAPTCHA Detection + Solving Pipeline
================================================================
Detection → Classification → Solving → Injection → Retry
"""
import os
import time
import json


CAPTCHA_SERVICES = {
    '2captcha': os.environ.get('TWO_CAPTCHA_API_KEY', ''),
    'capsolver': os.environ.get('CAPSOLVER_API_KEY', ''),
    'anticaptcha': os.environ.get('ANTICAPTCHA_API_KEY', ''),
}


def detect_captcha(html, url=''):
    """
    Detect CAPTCHA type from page HTML.
    Returns: {'detected': bool, 'type': str, 'sitekey': str}
    """
    result = {'detected': False, 'type': None, 'sitekey': None}
    
    html_lower = html.lower()
    
    # reCAPTCHA v2
    if 'g-recaptcha' in html_lower or 'recaptcha/api.js' in html_lower:
        result['detected'] = True
        result['type'] = 'recaptcha_v2'
        # Extract sitekey
        import re
        sitekey_match = re.search(r'data-sitekey="([^"]+)"', html)
        if sitekey_match:
            result['sitekey'] = sitekey_match.group(1)
    
    # reCAPTCHA v3
    elif 'recaptcha/api.js?render=' in html_lower:
        result['detected'] = True
        result['type'] = 'recaptcha_v3'
        import re
        sitekey_match = re.search(r'render=([a-zA-Z0-9_-]+)', html)
        if sitekey_match:
            result['sitekey'] = sitekey_match.group(1)
    
    # hCaptcha
    elif 'hcaptcha.com' in html_lower or 'h-captcha' in html_lower:
        result['detected'] = True
        result['type'] = 'hcaptcha'
        import re
        sitekey_match = re.search(r'data-sitekey="([^"]+)"', html)
        if sitekey_match:
            result['sitekey'] = sitekey_match.group(1)
    
    # Cloudflare Turnstile
    elif 'challenges.cloudflare.com/turnstile' in html_lower:
        result['detected'] = True
        result['type'] = 'turnstile'
        import re
        sitekey_match = re.search(r'data-sitekey="([^"]+)"', html)
        if sitekey_match:
            result['sitekey'] = sitekey_match.group(1)
    
    # DataDome
    elif 'datadome' in html_lower and ('captcha' in html_lower or 'dd.js' in html_lower):
        result['detected'] = True
        result['type'] = 'datadome'
    
    return result


def solve_captcha(captcha_type, sitekey, url, page_html=''):
    """
    Solve CAPTCHA using external services.
    Returns token string or None.
    """
    # Try each service in order
    for service_name, api_key in CAPTCHA_SERVICES.items():
        if not api_key:
            continue
        
        try:
            if service_name == '2captcha':
                return _solve_2captcha(captcha_type, sitekey, url, api_key)
            elif service_name == 'capsolver':
                return _solve_capsolver(captcha_type, sitekey, url, api_key)
        except Exception as e:
            print(f"[CAPTCHA] {service_name} failed: {e}")
            continue
    
    print("[CAPTCHA] No CAPTCHA solving service configured or all failed")
    return None


def _solve_2captcha(captcha_type, sitekey, url, api_key):
    """Solve CAPTCHA via 2captcha API."""
    import httpx
    
    type_map = {
        'recaptcha_v2': 'NormalRecaptcha',
        'recaptcha_v3': 'RecaptchaV3TaskProxyless',
        'hcaptcha': 'HCaptchaTaskProxyless',
        'turnstile': 'TurnstileTaskProxyless',
    }
    
    # Submit task
    task_type = type_map.get(captcha_type, 'NormalRecaptcha')
    
    submit_data = {
        'clientKey': api_key,
        'task': {
            'type': task_type,
            'websiteURL': url,
            'websiteKey': sitekey,
        }
    }
    
    client = httpx.Client(timeout=120)
    
    # Submit
    response = client.post('https://2captcha.com/in.php', json=submit_data)
    result = response.json()
    
    if result.get('status') != 1:
        raise Exception(f"2captcha submit error: {result}")
    
    task_id = result.get('request')
    
    # Poll for result
    for _ in range(60):
        time.sleep(5)
        poll_response = client.get(f'https://2captcha.com/res.php?key={api_key}&action=get&id={task_id}&json=1')
        poll_result = poll_response.json()
        
        if poll_result.get('status') == 1:
            client.close()
            return poll_result.get('request')
        
        if poll_result.get('request') != 'CAPCHA_NOT_READY':
            raise Exception(f"2captcha error: {poll_result}")
    
    client.close()
    raise Exception("2captcha timeout")


def _solve_capsolver(captcha_type, sitekey, url, api_key):
    """Solve CAPTCHA via CapSolver API."""
    import httpx
    
    type_map = {
        'recaptcha_v2': 'ReCaptchaV2TaskProxyLess',
        'recaptcha_v3': 'ReCaptchaV3TaskProxyLess',
        'hcaptcha': 'HCaptchaTaskProxyLess',
        'turnstile': 'AntiTurnstileTaskProxyLess',
    }
    
    client = httpx.Client(timeout=120)
    
    response = client.post('https://api.capsolver.com/createTask', json={
        'appId': api_key,
        'task': {
            'type': type_map.get(captcha_type, 'ReCaptchaV2TaskProxyLess'),
            'websiteURL': url,
            'websiteKey': sitekey,
        }
    })
    
    result = response.json()
    task_id = result.get('taskId')
    if not task_id:
        raise Exception(f"CapSolver submit error: {result}")
    
    for _ in range(60):
        time.sleep(3)
        poll_response = client.post('https://api.capsolver.com/getTaskResult', json={
            'appId': api_key,
            'taskId': task_id,
        })
        poll_result = poll_response.json()
        
        if poll_result.get('status') == 'ready':
            client.close()
            return poll_result.get('solution', {}).get('gRecaptchaResponse') or poll_result.get('solution', {}).get('token')
    
    client.close()
    raise Exception("CapSolver timeout")
