# Save Image as PNG

I hate webP

Right-click any image and save it as a PNG, keeping its original name when possible.

The repository has one folder per browser:

- `chrome/`: Chrome, Edge, Brave and other Chromium browsers
- `firefox/`: Firefox

## Install on Chrome

This extension is not available on the Chrome Web Store. It must be loaded manually:

1. Download `save-image-as-png-chrome.zip` from the [latest release](https://github.com/Synaelle/i-hate-webp/releases/latest) and extract it.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the extracted folder. This is the folder containing `manifest.json`.

You can also clone this repository and select its `chrome` folder in step 5.

## Install on Firefox

This extension is not available on Firefox Add-ons. It must be loaded manually:

1. Download `save-image-as-png-firefox.zip` from the [latest release](https://github.com/Synaelle/i-hate-webp/releases/latest). There is no need to extract it.
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the downloaded ZIP file, or the `manifest.json` inside the `firefox` folder of this repository.

Firefox removes temporary add-ons when it restarts, so you need to load it again after each restart.

## Use

1. Right-click an image on a web page.
2. Select **Save image as PNG**.
3. Choose where to save the file.

If no useful name can be found for the image, the file is named with the current date and time, for example `2026-10-16_14-30-05.png`.
