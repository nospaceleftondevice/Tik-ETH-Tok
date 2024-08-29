from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException,NoSuchElementException

import time

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
    print("Dropdown is visible.")
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
            print(f"Option {index}: {option.text}")
            
            index += 1  # Increment the index to check the next option
            
        except NoSuchElementException:
            # Break the loop when no more options are found
            break

    if options:
        print("All options found:", options)
    else:
        print("No options found in the dropdown.")

except TimeoutException:
    print("Dropdown did not appear in the expected time.")

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
    print("Option: {}".format(option))

# Output the selected option text if found
if selected_option:
    print("Selected option:", selected_option.text)
else:
    print("No option is selected")

time.sleep(30)

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
    print(value)

actions = ActionChains(browser)
#actions.send_keys(Keys.ARROW_DOWN).perform()
#actions.send_keys(Keys.RETURN).perform()
time.sleep(1)
#actions.send_keys(Keys.ESCAPE).perform()

endpage = False
projects = []

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
        print("End Page Element exists.")
        endpage = True
    except NoSuchElementException:
        print("End Page Element does not exist.")

    current_url = browser.current_url
    if last_url == current_url:
        endpage = True

    print("Current URL:", current_url)
    print("End page:", endpage)

    time.sleep(1)
    if len(anchors) < 1:
        browser.refresh()
        time.sleep(5)
        continue

    # Iterate over each anchor element
    for anchor in anchors:
        # Print the href attribute of each anchor
        link=anchor.get_attribute("href")
        print(link)
        projects.append(link)
        # Perform any other desired actions on the anchor elements
        # For example, you could click on each anchor:
        # anchor.click()

    if len(pages) > 1 and not endpage and len(anchors) > 0:
        print("There are more pages")
        last_url = current_url
        pages[-1].click()
        time.sleep(10)

time.sleep(30)
# Optional: Close the browser
browser.quit()


