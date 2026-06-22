# from playwright.sync_api import sync_playwright

# def fetch_result(usn):
#     with sync_playwright() as p:
#         browser = p.chromium.launch(headless=False)
#         page = browser.new_page()

#         # Open VTU Results Page
#         page.goto("https://results.vtu.ac.in/DJcbcs25/index.php")

#         # Fill USN
#         page.fill("input[name='lns']", usn)

#         print("\nCAPTCHA is visible on screen.")
#         captcha = input("Enter CAPTCHA manually: ")

#         # Fill CAPTCHA
#         page.fill("input[name='captchacode']", captcha)

#         # Click Submit
#         page.click("input[type='submit']")

#         # Wait for result page
#         page.wait_for_load_state("networkidle")

#         # Extract Result Text
#         result_text = page.inner_text("body")

#         print("\n===== RESULT PAGE DATA =====")
#         print(result_text[:2000])  # first 2000 chars preview

#         browser.close()


# usn = ['2BL21CI006', '2BL21CI007']  # Example USNs
# for id in usn:
#     print(f"\nFetching result for USN: {id}")
#     fetch_result(id)
#     # print(f"Output for USN {id}: {output}")

import re
import os
import pandas as pd
from playwright.sync_api import sync_playwright

def parse_result(text):
    usn = re.search(r"University Seat Number\s*:\s*(\S+)", text).group(1)
    name = re.search(r"Student Name\s*:\s*(.+)", text).group(1).strip()
    sem = re.search(r"Semester\s*:\s*(\d+)", text).group(1)

    pattern = r"(\w+)\s+([A-Z0-9\s&\-,]+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+([PF])\s+(\d{4}-\d{2}-\d{2})"
    matches = re.findall(pattern, text)

    return [[
        usn, name, sem,
        m[0], m[1].strip(),
        m[2], m[3], m[4],
        m[5], m[6]
    ] for m in matches]


def fetch_result(usn, headless=False):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()

        page.goto("https://results.vtu.ac.in/DJcbcs25/index.php")
        page.fill("input[name='lns']", usn)

        print("\nCAPTCHA is visible.")
        captcha = input("Enter CAPTCHA: ")

        page.fill("input[name='captchacode']", captcha)
        page.click("input[type='submit']")
        page.wait_for_load_state("networkidle")

        text = page.inner_text("body")
        browser.close()
        return text

def load_usns_from_file(file_path, column_name="USN"):
    if not os.path.exists(file_path):
        raise FileNotFoundError("❌ File not found")

    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".csv":
        df = pd.read_csv(file_path)
    elif ext in [".xls", ".xlsx"]:
        df = pd.read_excel(file_path)
    else:
        raise ValueError("❌ Unsupported file type")

    if column_name not in df.columns:
        raise ValueError(f"❌ Column '{column_name}' missing")

    return (
        df[column_name]
        .dropna()
        .astype(str)
        .str.strip()
        .tolist()
    )
def get_usns():
    print("\nChoose input method:")
    print("1️⃣  Upload CSV / Excel")
    print("2️⃣  Enter USNs manually")

    choice = input("Enter choice (1 or 2): ").strip()

    if choice == "1":
        path = input("Enter file path: ").strip()
        return load_usns_from_file(path)

    elif choice == "2":
        usns = input("Enter USNs (comma separated): ")
        return [u.strip() for u in usns.split(",") if u.strip()]

    else:
        raise ValueError("❌ Invalid choice")

def process_usns(usn_list, output_file):
    columns = [
        "USN", "Student Name", "Semester",
        "Subject Code", "Subject Name",
        "Internal Marks", "External Marks",
        "Total Marks", "Result", "Date"
    ]

    failed_usns = []

    # Create file with header if not exists
    if not os.path.exists(output_file):
        pd.DataFrame(columns=columns).to_csv(output_file, index=False)

    for usn in usn_list:
        print(f"\nFetching result for {usn}")

        try:
            text = fetch_result(usn)
            rows = parse_result(text)

            df = pd.DataFrame(rows, columns=columns)
            df.to_csv(output_file, mode="a", header=False, index=False)

            print(f"✅ Saved data for {usn}")

        except Exception as e:
            print(f"❌ Failed for {usn}: {e}")
            failed_usns.append(usn)

    return failed_usns

def save_failed_usns(failed_usns, file_name="failed_usns.csv"):
    if failed_usns:
        pd.DataFrame({"USN": failed_usns}).to_csv(file_name, index=False)
        print(f"\n⚠️ Failed USNs saved to {file_name}")
def main():
    output_file = "VTU_Results_All.csv"

    usn_list = get_usns()
    failed = process_usns(usn_list, output_file)
    save_failed_usns(failed)

    print("\n✅ Process completed")


if __name__ == "__main__":
    main()
