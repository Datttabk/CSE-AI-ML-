import os
import base64
import time
import pandas as pd
from playwright.async_api import async_playwright
from app.core.config import settings

# Active scraping sessions cache
# Maps session_id -> { "page": page_obj, "browser": browser_obj, "captcha_img": base64_str, "usn": usn }
scraping_sessions = {}

def get_simulated_vtu_text(usn: str) -> str:
    """
    Simulates a VTU results page by reading from the local VTU_Results_All.csv file.
    This provides a zero-setup fallback when the VTU server is offline or during testing.
    """
    csv_path = "VTU_Results_All.csv"
    if not os.path.exists(csv_path):
        # Fallback to searching parent directory
        csv_path = "../VTU_Results_All.csv"
        if not os.path.exists(csv_path):
            return ""
            
    try:
        df = pd.read_csv(csv_path)
        student_rows = df[df["USN"].str.upper() == usn.upper()]
        
        if student_rows.empty:
            return ""
            
        first_row = student_rows.iloc[0]
        name = first_row["Student Name"]
        sem = first_row["Semester"]
        
        text_lines = [
            f"University Seat Number : {usn}",
            f"Student Name : {name}",
            f"Semester : {sem}",
            "Subject Code Subject Name Internal Marks External Marks Total Marks Result Date"
        ]
        
        for _, row in student_rows.iterrows():
            subj_code = row["Subject Code"]
            subj_name = row["Subject Name"]
            internal = row["Internal Marks"]
            external = row["External Marks"]
            total = row["Total Marks"]
            res = row["Result"]
            date = row["Date"]
            
            # Format subject code if it was parsed as 'on'
            if str(subj_code).strip() == "on":
                # Extract code from name
                parts = str(subj_name).split("\t")
                if len(parts) > 1:
                    subj_code = parts[0]
                    subj_name = parts[1]
                else:
                    subj_code = "BCS501" # fallback
                    
            text_lines.append(f"{subj_code} {subj_name} {internal} {external} {total} {res} {date}")
            
        return "\n".join(text_lines)
    except Exception as e:
        print(f"Error generating simulated VTU text: {e}")
        return ""

async def initiate_vtu_scrape(usn: str, session_id: str) -> str:
    """
    Initiates Playwright (async), opens VTU page, grabs the CAPTCHA screenshot,
    saves the session, and returns the CAPTCHA as a base64 string.
    If real scraping fails (e.g. offline testing), falls back to generating a mock CAPTCHA.
    """
    import os
    try:
        if os.getenv("SIMULATE_SCRAPE") == "true":
            raise Exception("Forced simulation mode enabled via env var.")
        p = await async_playwright().start()
        # Launch Chromium
        browser = await p.chromium.launch(headless=settings.PLAYWRIGHT_HEADLESS)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Navigate to VTU results (using latest working portal URL)
        response = await page.goto("https://results.vtu.ac.in/DJcbcs25/index.php", timeout=10000)
        if response is None or response.status >= 400:
            status_code = response.status if response else "unknown"
            raise Exception(f"VTU results page returned HTTP status code {status_code}")
        
        # Fill USN
        await page.fill("input[name='lns']", usn)
        
        # Find CAPTCHA image element
        captcha_img_el = page.locator("img[src*='captcha']")
        if await captcha_img_el.count() == 0:
            # Try generic image under the input form
            captcha_img_el = page.locator("form img")
            
        if await captcha_img_el.count() > 0:
            # Take screenshot of the captcha element
            captcha_bytes = await captcha_img_el.screenshot()
            captcha_base64 = base64.b64encode(captcha_bytes).decode('utf-8')
            
            # Cache the active page and browser session to resume later
            scraping_sessions[session_id] = {
                "playwright": p,
                "browser": browser,
                "page": page,
                "usn": usn,
                "captcha_img": captcha_base64,
                "created_at": time.time(),
                "simulated": False
            }
            return captcha_base64
        else:
            # Close playwright if captcha not found
            await browser.close()
            await p.stop()
            raise Exception("CAPTCHA image not found on VTU page.")
            
    except Exception as e:
        print(f"VTU Portal scrape failed, falling back to simulated session: {e}")
        # Return a mock CAPTCHA image base64
        mock_captcha_base64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAGQAAAAeCAYAAADt75rfAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB"
            "6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAACXBIWXMAAAsTAAALEwEAmpwYAAACk0"
            "lEQVR42u2YP0gbURzHz/3L3SXG2qTFoElMUIpCSwQLVToUBKeii2N1EId2cXEpFId2KXRwKDo4FId2"
            "KXRwKKiDg0MpglJQk9ZgU5vcpebe5+93+SaeF5NrcmneD3zce+/u3e99P+/3ez/eO7IsS5xHnEcQhC"
            "AIQRCCHr5QlmUJcR5BEOXzUvJ8Lq7vFMcgBEEIQhCEIAhBEOUQ67yUvJ874gxiEIIgBEEIghAEIYiy"
            "hK3keU+cQQxCEIQgCEEQgiAEUZawlTzv1fWd4hiEIAhBEIIQBCGIMggd+D7uFMcgBEEIQhCEIAhBkF"
            "+EvxI68B3EGYQgCEEQgiAEQQiCyhP1vM+d4hiEIAhBEIIQBCGIsgL/2nS80H2EGYQgCEEQgiAEQQiC"
            "IKiv1PNOlhzHGcQgBEEIghAEIQhC0P8X+mPoeK77CDMIQRCCIAhBEIQgCPJL1fM6yzGOM4hBCIIQBC"
            "k2P9qP8U7PMRc/1k9e5xjn/y3WwX/Y//fOznEXm51jLp5jLj8T9LzMssY5xCAEQQhS9KjZ2f/P75yV"
            "vI5xDEIQhCAEQeWJOsc5x3/V81RCEIQgCEEQgiAE/Xu0H+/H5f/h9YxziEEIghAEIQhCEMSZivvxf"
            "lzymiIEQQhCEIQgCEEQZyrud3XJGcQgBEEIghAEIQjizIT/XF2KM4hBCIIQBBUpavfL8d7aOefin6"
            "oRcxFvRoxFvM2IMRcxFzEX/6t6xjlB/z1t/sH+v/d2zrn4cXPm4nNz5nLOv/I5f/6vXsc5xiAEQZRP"
            "6L/69x/v/3tn58fF/1XPx2nEnEacRoxGjDn9U/UcxF8Hvef8/n+k//3rnPN/x/4/uP1/sB/vx+UfPe"
            "exnMEMQhCEIIhB/A4AAP//AwD/9Kz2H+JtYgAAAABJRU5ErkJggg=="
        )
        scraping_sessions[session_id] = {
            "usn": usn,
            "captcha_img": mock_captcha_base64,
            "created_at": time.time(),
            "simulated": True
        }
        return mock_captcha_base64

async def complete_vtu_scrape(session_id: str, captcha_code: str) -> str:
    """
    Resumes the scraping session, enters the CAPTCHA, submits the form,
    extracts the page body text, closes browser, and returns the result text.
    If the session is simulated, returns an empty string to trigger simulated fallback.
    """
    if session_id not in scraping_sessions:
        raise Exception("Scraping session expired or not found.")
        
    session = scraping_sessions[session_id]
    
    if session.get("simulated"):
        # Simulated session! Just clean up and return empty results to trigger fallback
        scraping_sessions.pop(session_id, None)
        return ""
        
    page = session["page"]
    browser = session["browser"]
    p = session["playwright"]
    
    dialog_messages = []
    
    async def handle_dialog(dialog):
        dialog_messages.append(dialog.message)
        await dialog.dismiss()
        
    page.on("dialog", handle_dialog)
    
    try:
        # Fill CAPTCHA and submit
        await page.fill("input[name='captchacode']", captcha_code)
        
        # Click Submit and handle potential dialog alert
        try:
            async with page.expect_navigation(timeout=5000):
                await page.click("input[type='submit']")
        except Exception:
            pass
            
        await page.wait_for_load_state("networkidle")
        
        # Check if an alert was triggered
        alert_text = " ".join(dialog_messages)
        print(f"Captured alert messages: '{alert_text}'")
        
        # Determine if CAPTCHA was incorrect based on alert text
        is_captcha_err = any(x in alert_text.lower() for x in ["captcha", "invalid captcha"])
        
        # If we are still on index.php or captchacode input is present
        # AND it was a captcha error (or no alert but we are still on index.php), assume invalid captcha
        current_url = page.url
        captchacode_present = await page.locator("input[name='captchacode']").count() > 0
        
        if (captchacode_present or "index.php" in current_url) and (is_captcha_err or "captcha" in alert_text.lower() or not alert_text):
            raise Exception("Invalid CAPTCHA code entered. Please try again.")
            
        # If we got "seat number not found" or "yet to be announced" in alert
        if "not found" in alert_text.lower() or "yet to be announced" in alert_text.lower() or "not available" in alert_text.lower():
            # CAPTCHA was correct but USN is mock/invalid! Return empty results to trigger fallback.
            return ""
            
        # Extract body text
        result_text = await page.inner_text("body")
        print("Results Retrieved")
        return result_text
    finally:
        # Clean up session resources
        try:
            await browser.close()
        except:
            pass
        try:
            await p.stop()
        except:
            pass
        scraping_sessions.pop(session_id, None)
