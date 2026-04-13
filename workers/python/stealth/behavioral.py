"""
================================================================
Stealth: Behavioral Simulation
================================================================
Human-like mouse movements, scrolling, typing, and idle patterns.
Uses Bézier curves for realistic mouse trajectories.
"""
import random
import time
import math


def simulate_human_behavior(driver, duration=3):
    """
    Simulate human-like behavior on a page.
    - Random mouse movements (Bézier curves)
    - Variable scroll patterns
    - Random idle periods
    """
    try:
        from selenium.webdriver.common.action_chains import ActionChains
        
        actions = ActionChains(driver)
        viewport_width = driver.execute_script("return window.innerWidth")
        viewport_height = driver.execute_script("return window.innerHeight")
        
        start = time.time()
        
        while time.time() - start < duration:
            action = random.choice(['mouse_move', 'scroll', 'idle'])
            
            if action == 'mouse_move':
                # Bézier curve mouse movement
                target_x = random.randint(100, viewport_width - 100)
                target_y = random.randint(100, viewport_height - 100)
                _bezier_mouse_move(driver, target_x, target_y)
            
            elif action == 'scroll':
                # Variable speed scroll
                scroll_amount = random.randint(100, 500)
                direction = random.choice([1, -1])
                steps = random.randint(3, 8)
                
                for _ in range(steps):
                    driver.execute_script(
                        f"window.scrollBy(0, {scroll_amount * direction / steps})"
                    )
                    time.sleep(random.uniform(0.05, 0.15))
            
            elif action == 'idle':
                time.sleep(random.uniform(0.5, 2.0))
        
    except Exception as e:
        # Behavioral sim is best-effort, don't fail on errors
        pass


def simulate_typing(driver, element, text, min_delay=50, max_delay=200):
    """
    Simulate human-like typing with variable delays.
    """
    for char in text:
        element.send_keys(char)
        delay = random.uniform(min_delay, max_delay) / 1000
        
        # Occasional longer pause (thinking)
        if random.random() < 0.05:
            delay += random.uniform(0.3, 0.8)
        
        time.sleep(delay)


def simulate_click(driver, element):
    """
    Click with position jitter (not dead-center).
    """
    try:
        from selenium.webdriver.common.action_chains import ActionChains
        
        # Get element size
        size = element.size
        
        # Offset from center with jitter
        offset_x = random.randint(-int(size['width'] * 0.3), int(size['width'] * 0.3))
        offset_y = random.randint(-int(size['height'] * 0.3), int(size['height'] * 0.3))
        
        actions = ActionChains(driver)
        actions.move_to_element_with_offset(element, offset_x, offset_y)
        
        # Small pre-click delay
        time.sleep(random.uniform(0.05, 0.2))
        
        actions.click()
        actions.perform()
        
    except Exception:
        # Fallback to regular click
        element.click()


def _bezier_mouse_move(driver, target_x, target_y, steps=15):
    """
    Move mouse along a Bézier curve for realistic movement.
    """
    try:
        from selenium.webdriver.common.action_chains import ActionChains
        
        # Current mouse position (approximate)
        current_x = random.randint(0, driver.execute_script("return window.innerWidth"))
        current_y = random.randint(0, driver.execute_script("return window.innerHeight"))
        
        # Control points for cubic Bézier
        cp1_x = current_x + random.randint(-200, 200)
        cp1_y = current_y + random.randint(-200, 200)
        cp2_x = target_x + random.randint(-200, 200)
        cp2_y = target_y + random.randint(-200, 200)
        
        for i in range(steps):
            t = i / steps
            x = _cubic_bezier(t, current_x, cp1_x, cp2_x, target_x)
            y = _cubic_bezier(t, current_y, cp1_y, cp2_y, target_y)
            
            driver.execute_script(f"""
                var event = new MouseEvent('mousemove', {{
                    clientX: {int(x)}, clientY: {int(y)},
                    bubbles: true
                }});
                document.dispatchEvent(event);
            """)
            
            time.sleep(random.uniform(0.01, 0.05))
            
    except Exception:
        pass


def _cubic_bezier(t, p0, p1, p2, p3):
    """Calculate point on cubic Bézier curve."""
    return (
        (1 - t) ** 3 * p0 +
        3 * (1 - t) ** 2 * t * p1 +
        3 * (1 - t) * t ** 2 * p2 +
        t ** 3 * p3
    )
