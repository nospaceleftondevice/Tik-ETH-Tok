from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import sys
import time
import requests
import json

# Initialize browser
browser = webdriver.Chrome()
browser.get("https://ethglobal.com/showcase")

time.sleep(10)

# Click on the dropdown
browser.find_element(By.CLASS_NAME, "css-b62m3t-container").click()

# Collect options from dropdown (this remains unchanged)
try:
    dropdown_container = WebDriverWait(browser, 10).until(
        EC.visibility_of_element_located((By.ID, "react-select-2-listbox"))
    )
    print("Dropdown is visible.", flush=True)
    options = []
    index = 0
    time.sleep(3)
    while True:
        try:
            option_id = f"react-select-2-option-{index}"
            option = browser.find_element(By.ID, option_id)
            options.append(option.text)
            print(f"Option {index}: {option.text}", flush=True)
            index += 1
        except NoSuchElementException:
            break
except TimeoutException:
    print("Dropdown did not appear in the expected time.", flush=True)

# Fetch projects and navigate through pages
projects = []
if len(sys.argv) > 1:
    browser.get("https://ethglobal.com/showcase/page/{}".format(sys.argv[1]))
else:
    print("No command-line arguments were provided.", flush=True)

endpage = False
last_url = ""
while not endpage:
    pages = browser.find_elements(By.CLASS_NAME, "w-10")
    anchors = browser.find_elements(By.XPATH, "//a[contains(@class, 'block') and contains(@class, 'border-2') and contains(@class, 'border-black') and contains(@class, 'rounded') and contains(@class, 'overflow-hidden') and contains(@class, 'relative')]")

    try:
        xpath = '//span[@class="w-10 h-10 border-2 flex items-center justify-center rounded-full opacity-50 cursor-not-allowed border-black-100"]/svg/path[@stroke="currentColor" and @stroke-width="2"]'
        element = browser.find_element(By.XPATH, xpath)
        endpage = True
    except NoSuchElementException:
        print("End Page Element does not exist.", flush=True)

    current_url = browser.current_url
    if last_url == current_url:
        endpage = True

    time.sleep(1)
    if len(anchors) < 1:
        browser.refresh()
        time.sleep(5)
        continue

    for anchor in anchors:
        link = anchor.get_attribute("href")
        projects.append(link)

    if len(pages) > 1 and not endpage and len(anchors) > 0:
        last_url = current_url
        while last_url == browser.current_url and pages[-1].tag_name != "span":
            pages[-1].click()
            time.sleep(5)
            pages = browser.find_elements(By.CLASS_NAME, "w-10")

link_list = list(set(projects))
if len(sys.argv) > 2:
    link_list = [browser.get(sys.argv[2])]
else:
    browser.get(link_list[-1])

time.sleep(3)
count = 0
video_data = []

# Loop through project links
for page_to_load in link_list:
    count += 1
    print(f"Loading page {count} of {len(link_list)}", flush=True)
    browser.get(page_to_load)
    time.sleep(5)
    
    project_name = browser.find_elements(By.CLASS_NAME, "text-4xl")
    for project_title in project_name:
        if project_title.tag_name == "h1":
            project_handle = project_title.get_attribute("innerHTML")
            print(f"Project name: {project_handle}", flush=True)
            try:
                buttons = browser.find_elements(By.TAG_NAME, "button")
                for button in buttons:
                    if button.get_attribute("class") == "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16":
                        button.click()
                        time.sleep(5)
                        videos = browser.find_elements(By.TAG_NAME, "video")
                        for video in videos:
                            video_url = video.get_attribute("src")
                            if video_url:
                                print(f"Video URL: {video_url}", flush=True)
                                
                                # Get userPic from the specified path
                                user_pic_element = browser.find_element(By.CSS_SELECTOR, "body > div > div > div.flex.flex-col.flex-1.w-full > div > div.pt-24.lg\\:pt-28.pb-24.lg\\:pb-12.overflow-hidden > div > div.mt-8.lg\\:mt-12.pb-20.lg\\:pb-0.lg\\:mr-\\[464px\\] > header > p")
                                user_pic = user_pic_element.get_attribute("innerHTML")

                                # Append the data to video_data list
                                video_data.append({
                                    "userName": project_handle,
                                    "likes": "0",
                                    "comments": "0",
                                    "url": video_url,
                                    "userPic": user_pic,
                                    "showcase_url": page_to_load
                                })

                                # Download the video
                                response = requests.get(video_url, stream=True)
                                project_url = page_to_load.replace("/", "-")
                                with open(f"/Volumes/SSD Passpor/eth_videos/mp4/{project_url}-{project_handle} video.mp4", 'wb') as file:
                                    for chunk in response.iter_content(chunk_size=1024):
                                        if chunk:
                                            file.write(chunk)
                                print("Video downloaded successfully!", flush=True)

            except Exception as e:
                print(f"Exception: {e}", flush=True)

# Save the video data to a JSON file
with open("video_data.json", "w") as json_file:
    json.dump(video_data, json_file, indent=4)

print("JSON file created successfully!", flush=True)

# Close the browser
browser.quit()
