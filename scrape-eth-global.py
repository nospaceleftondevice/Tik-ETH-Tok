from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException,NoSuchElementException

import sys
import time
import requests

browser = webdriver.Chrome()
browser.get("https://ethglobal.com/showcase")

time.sleep(10)

browser.find_element(By.CLASS_NAME, "css-b62m3t-container").click()

last_url = ""

# Wait until the dropdown with id 'react-select-2-listbox' is visible
try:
    dropdown_container = WebDriverWait(browser, 10).until(
        EC.visibility_of_element_located((By.ID, "react-select-2-listbox"))
    )
    print("Dropdown is visible.",flush=True)
    options = []
    index = 0
    time.sleep(3) 
    while True:
        try:
            # Construct the option ID based on the pattern
            option_id = f"react-select-2-option-{index}"
            
            # Try to find the option element by its ID
            option = browser.find_element(By.ID, option_id)
            options.append(option.text)  # Store the option text
            print(f"Option {index}: {option.text}",flush=True)
            
            index += 1  # Increment the index to check the next option
            
        except NoSuchElementException:
            # Break the loop when no more options are found
            break

    if options:
        print("All options found:", options,flush=True)
    else:
        print("No options found in the dropdown.",flush=True)

except TimeoutException:
    print("Dropdown did not appear in the expected time.",flush=True)

# Locate the dropdown container
dropdown_container = browser.find_element(By.ID, "react-select-2-listbox")

# Find all the options inside the dropdown
options = dropdown_container.find_elements(By.CSS_SELECTOR, "div[role='option']")

# Iterate through options to find the selected one
selected_option = None
for option in options:
    # Check for a specific attribute or class indicating selection
    if option.get_attribute("aria-selected") == "true" or option.get_attribute("tabindex") == "0":
        selected_option = option
        break
    print("Option: {}".format(option),flush=True)

# Output the selected option text if found
if selected_option:
    print("Selected option:", selected_option.text)
else:
    print("No option is selected")

time.sleep(5)

# Find all elements with the class 'css-1p3m7a8-multiValue'
multi_value_elements = browser.find_elements(By.CLASS_NAME, "css-1p3m7a8-multiValue")

# Initialize a list to store the innerHTML values
values = []

# Iterate through each 'css-1p3m7a8-multiValue' element and find the nested 'css-9jq23d' element
for multi_value_element in multi_value_elements:
    nested_element = multi_value_element.find_element(By.CLASS_NAME, "css-9jq23d")
    values.append(nested_element.get_attribute("innerHTML"))

# Print the extracted values
for value in values:
    print(value,flush=True)

actions = ActionChains(browser)
#actions.send_keys(Keys.ARROW_DOWN).perform()
#actions.send_keys(Keys.RETURN).perform()
time.sleep(1)
#actions.send_keys(Keys.ESCAPE).perform()

endpage = False
projects = []

# Check if there are any command-line arguments passed
if len(sys.argv) > 1:
    # Print the first command-line argument (excluding the script name)
    print(f"First command-line argument: {sys.argv[1]}",flush=True)
    browser.get("https://ethglobal.com/showcase/page/{}".format(sys.argv[1]))
else:
    print("No command-line arguments were provided.",flush=True)

while not endpage:
    # Find all anchor elements with the class 'block'
    pages = browser.find_elements(By.CLASS_NAME, "w-10")
    #anchors = browser.find_elements(By.CSS_SELECTOR, "a.block.border-2.border-black.rounded.overflow-hidden.relative")
    anchors = browser.find_elements(By.XPATH, "//a[contains(@class, 'block') and contains(@class, 'border-2') and contains(@class, 'border-black') and contains(@class, 'rounded') and contains(@class, 'overflow-hidden') and contains(@class, 'relative')]")

    # Define the XPath of the element
    xpath = '//span[@class="w-10 h-10 border-2 flex items-center justify-center rounded-full opacity-50 cursor-not-allowed border-black-100"]/svg/path[@stroke="currentColor" and @stroke-width="2"]'

    try:
        # Attempt to find the element
        element = browser.find_element(By.XPATH, xpath)
        print("End Page Element exists.",flush=True)
        endpage = True
    except NoSuchElementException:
        print("End Page Element does not exist.",flush=True)

    current_url = browser.current_url
    if last_url == current_url:
        endpage = True

    print("Current URL:", current_url,flush=True)
    print("End page:", endpage,flush=True)

    time.sleep(1)
    if len(anchors) < 1:
        browser.refresh()
        time.sleep(5)
        continue

    # Iterate over each anchor element
    for anchor in anchors:
        # Print the href attribute of each anchor
        link=anchor.get_attribute("href")
        print(link,flush=True)
        projects.append(link)
        # Perform any other desired actions on the anchor elements
        # For example, you could click on each anchor:
        # anchor.click()

    if len(pages) > 1 and not endpage and len(anchors) > 0:
        last_url = current_url
        while last_url == browser.current_url and pages[-1].tag_name != "span":
            print("There are more pages",flush=True)
            print("Nav buttons: {}".format(len(pages)),flush=True)
            print("2nd button tag_names: {}".format(pages[-1].tag_name),flush=True)
            pages[-1].click()
            time.sleep(5)
            pages = browser.find_elements(By.CLASS_NAME, "w-10")


time.sleep(30)

link_list = list(set(projects))
print(link_list,flush=True)

if len(sys.argv) > 2:
    link_list = []
    link_list.append(browser.get(sys.argv[2]))
else:
    browser.get(link_list[-1])

time.sleep(3)
count=0
#loop through each project link
for page_to_load in link_list:
    count = count + 1
    print("\033[31mLoading page \033[0m{}".format(page_to_load),flush=True)
    print("Loading page {} of {}".format(count,len(link_list)),flush=True)
    browser.get(page_to_load)
    time.sleep(5)
    project_name =  browser.find_elements(By.CLASS_NAME, "text-4xl")
    print("project has {} names".format(len(project_name)),flush=True)

    for project_title in project_name:
        print("project tag: {}".format(project_title.tag_name),flush=True)
        check_for_iframe = True
        if project_title.tag_name == "h1":
            project_handle = project_title.get_attribute("innerHTML")
            print("\033[31mproject name: \033[0m{}".format(project_handle),flush=True)
            try:
                buttons = browser.find_elements(By.TAG_NAME, "button")
                for index, button in enumerate(buttons):
                    print(f"Button {index + 1}:",flush=True)
                    print("Text:", button.text,flush=True)
                    print("Class:", button.get_attribute("class"),flush=True)
                    if button.get_attribute("class") == "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16":
                        button.click()
                        time.sleep(5)
                        videos = browser.find_elements(By.TAG_NAME, "video")
                        for index, video in enumerate(videos):
                            print(f"Video {index + 1}:",flush=True)
                            video_url = video.get_attribute("src")
                            print("\033[31msrc: \033[0m", video_url ,flush=True)
                            if video_url:
                                print("\033[31mDownload -->: \033[0m", video_url ,flush=True)
                                response = requests.get(video_url, stream=True)
                                project_url = page_to_load.replace("/","-")
                                with open(f"/Volumes/SSD Passpor/eth_videos/mp4/{project_url}-{project_handle} video.mp4", 'wb') as file:
                                    for chunk in response.iter_content(chunk_size=1024):
                                        if chunk:
                                            file.write(chunk)
                                print("Video downloaded successfully!")
                            else:
                                print("No video URL found.")
                        check_for_iframe = False
            except Exception as e:
                print("!! Exception {}".format(e),flush=True)
                print("!! Did not find video button",flush=True)

            print("\033[31mcheck_for_iframe == True \033[0m", button == True)
            if check_for_iframe:
                try:
                    iframe = browser.find_element(By.CSS_SELECTOR, "iframe[title='{}']".format(project_title.get_attribute("innerHTML")))
                    print("Iframe: {}".format(iframe),flush=True)
                    print("\033[31mIframe src: \033[0m{}".format(iframe.get_attribute("src")),flush=True)
                    file1 = open("/Volumes/SSD Passpor/eth_videos/youtube.links", "a") 
                    file1.write("{} \n".format(iframe.get_attribute("src")))
                    file1.close()
                except Exception as e:
                    print("!! Exception {}".format(e),flush=True)
                    print("!!! Did not find youtube iframe",flush=True)
                    button = None

#time.sleep(3000)
# Optional: Close the browser
browser.quit()


