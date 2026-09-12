# Save Image as PNG

A Chrome extension that adds a **Save image as PNG** option to the right-click menu.

The extension converts images to PNG before saving them. It keeps the original filename when one is available. For example, `photo.webp` is saved as `photo.png`.

## Install

This extension is not available on the Chrome Web Store. It must be loaded manually:

1. Download this repository and extract the ZIP file.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the extracted extension folder. This is the folder containing `manifest.json`.

The extension will remain installed unless you remove it. If you move or delete the extension folder, Chrome will no longer be able to load it.

## Use

1. Right-click an image on a web page.
2. Select **Save image as PNG**.
3. Choose where to save the file.

## Update

After replacing the extension files with a newer version, open `chrome://extensions` and click the reload button on the extension card.

## Remove

Open `chrome://extensions`, find **Save Image as PNG**, and click **Remove**.

## Notes

- Some browser pages, including the Chrome Web Store and `chrome://` pages, do not allow extensions to run.
- If an image does not provide a filename, the extension uses `image.png`.
