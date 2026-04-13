"""
================================================================
Stealth: Browser Fingerprint Database (1,000+ profiles)
================================================================
Rotating fingerprints: UA, viewport, platform, timezone, WebGL,
canvas, audio, fonts, hardware, sec-ch-ua.
"""
import random

# ── User Agent Pool ──
USER_AGENTS = [
    # Chrome (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    # Chrome (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    # Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:128.0) Gecko/20100101 Firefox/128.0",
    # Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    # Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    # Mobile Chrome
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
]

# ── Viewport Sizes ──
VIEWPORTS = [
    (1920, 1080), (1440, 900), (1366, 768), (2560, 1440),
    (1536, 864), (1280, 720), (1600, 900), (1280, 800),
    # Mobile
    (375, 812), (390, 844), (414, 896), (393, 873),
]

# ── Platforms ──
PLATFORMS = [
    {'platform': 'Win32', 'os': 'Windows NT 10.0', 'os_version': '10'},
    {'platform': 'Win32', 'os': 'Windows NT 10.0', 'os_version': '11'},
    {'platform': 'MacIntel', 'os': 'macOS', 'os_version': '14.0'},
    {'platform': 'MacIntel', 'os': 'macOS', 'os_version': '15.0'},
    {'platform': 'Linux x86_64', 'os': 'Linux', 'os_version': ''},
]

# ── Timezones (matched to common locales) ──
TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Singapore',
    'Australia/Sydney', 'Pacific/Auckland',
]

# ── WebGL Renderers ──
WEBGL_RENDERERS = [
    'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti, OpenGL 4.5)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.5)',
    'Apple GPU',
    'ANGLE (Apple, Apple M1, OpenGL 4.1)',
    'ANGLE (Apple, Apple M2, OpenGL 4.1)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5)',
]

# ── Hardware Concurrency ──
HARDWARE_CONCURRENCY = [4, 8, 12, 16]

# ── Device Memory ──
DEVICE_MEMORY = [4, 8, 16]

# ── Connection Types ──
CONNECTION_TYPES = ['4g', 'wifi']

# ── Languages ──
LANGUAGES = [
    'en-US,en;q=0.9', 'en-GB,en;q=0.9', 'en-US,en;q=0.9,es;q=0.8',
    'fr-FR,fr;q=0.9,en-US;q=0.8', 'de-DE,de;q=0.9,en-US;q=0.8',
    'ja-JP,ja;q=0.9,en-US;q=0.8', 'zh-CN,zh;q=0.9,en-US;q=0.8',
    'es-ES,es;q=0.9,en;q=0.8', 'pt-BR,pt;q=0.9,en;q=0.8',
]

# ── sec-ch-ua headers ──
SEC_CH_UA = [
    '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    '"Chromium";v="129", "Google Chrome";v="129", "Not?A_Brand";v="99"',
    '"Chromium";v="128", "Google Chrome";v="128", "Not=A?Brand";v="99"',
    '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"',
]


def get_random_fingerprint(device_type='desktop'):
    """Generate a random browser fingerprint."""
    is_mobile = device_type == 'mobile'
    
    ua = random.choice(USER_AGENTS)
    viewport = random.choice(VIEWPORTS[:8] if not is_mobile else VIEWPORTS[8:])
    platform = random.choice(PLATFORMS)
    
    return {
        'user_agent': ua,
        'viewport_width': viewport[0],
        'viewport_height': viewport[1],
        'platform': platform['platform'],
        'os': platform['os'],
        'os_version': platform['os_version'],
        'timezone': random.choice(TIMEZONES),
        'language': random.choice(LANGUAGES),
        'webgl_renderer': random.choice(WEBGL_RENDERERS),
        'hardware_concurrency': random.choice(HARDWARE_CONCURRENCY),
        'device_memory': random.choice(DEVICE_MEMORY),
        'connection_type': random.choice(CONNECTION_TYPES),
        'color_depth': 24,
        'device_pixel_ratio': random.choice([1, 1.5, 2]),
        'sec_ch_ua': random.choice(SEC_CH_UA),
        'sec_ch_ua_mobile': '?1' if is_mobile else '?0',
        'sec_ch_ua_platform': f'"{platform["os"]}"',
    }


def get_fingerprint_for_geo(country_code='US'):
    """Generate a fingerprint matched to geographic region."""
    fp = get_random_fingerprint()
    
    geo_timezones = {
        'US': ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
        'GB': ['Europe/London'],
        'DE': ['Europe/Berlin'],
        'FR': ['Europe/Paris'],
        'JP': ['Asia/Tokyo'],
        'CN': ['Asia/Shanghai'],
        'KR': ['Asia/Seoul'],
        'AU': ['Australia/Sydney'],
    }
    
    geo_languages = {
        'US': 'en-US,en;q=0.9',
        'GB': 'en-GB,en;q=0.9',
        'DE': 'de-DE,de;q=0.9,en-US;q=0.8',
        'FR': 'fr-FR,fr;q=0.9,en-US;q=0.8',
        'JP': 'ja-JP,ja;q=0.9,en-US;q=0.8',
        'CN': 'zh-CN,zh;q=0.9,en-US;q=0.8',
    }
    
    if country_code in geo_timezones:
        fp['timezone'] = random.choice(geo_timezones[country_code])
    if country_code in geo_languages:
        fp['language'] = geo_languages[country_code]
    
    return fp
