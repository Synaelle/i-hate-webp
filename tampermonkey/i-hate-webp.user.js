// ==UserScript==
// @name         I Hate WebP
// @namespace    https://github.com/Synaelle/i-hate-webp
// @version      1.3.0
// @description  Right-click images and save them as PNG files while preserving their original names.
// @author       Synaelle
// @license      GPL-3.0-or-later
// @homepageURL  https://github.com/Synaelle/i-hate-webp
// @icon         https://raw.githubusercontent.com/Synaelle/i-hate-webp/master/chrome/icon-128.png
// @downloadURL  https://raw.githubusercontent.com/Synaelle/i-hate-webp/master/tampermonkey/i-hate-webp.user.js
// @updateURL    https://raw.githubusercontent.com/Synaelle/i-hate-webp/master/tampermonkey/i-hate-webp.user.js
// @match        *://*/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_notification
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  // A right-click older than this is ignored, so a stale image from an
  // earlier right-click is never saved by mistake.
  const RIGHT_CLICK_MAX_AGE_MS = 60_000;

  const GENERIC_FILENAMES = new Set([
    "download", "downloads", "image", "images", "img", "file", "files", "media",
    "photo", "picture", "pic", "view", "raw", "original", "get", "fetch", "attachment",
    "index", "default", "unknown", "untitled", "blob", "content", "data", "src", "thumb",
    "thumbnail", "preview", "proxy", "render", "asset", "assets", "static", "public"
  ]);

  let lastRightClick = null;

  document.addEventListener("contextmenu", (event) => {
    const image = findImageAt(event);

    lastRightClick = image ? {
      image,
      time: Date.now()
    } : null;
  }, true);

  GM_registerMenuCommand("Save image as PNG", () => {
    void handleMenuCommand();
  }, {
    accessKey: "p",
    clickedFrame: true
  });

  async function handleMenuCommand() {
    const image = lastRightClick && Date.now() - lastRightClick.time < RIGHT_CLICK_MAX_AGE_MS ?
      lastRightClick.image :
      null;

    if (!image) {
      // Other frames may hold the right-clicked image, so only the top frame complains.
      if (window.top === window) {
        showNotification("Right-click an image first, then choose Save image as PNG.");
      }
      return;
    }

    lastRightClick = null;

    try {
      const srcUrl = image.currentSrc || image.src;
      const source = await getSourceBlob(srcUrl, image);
      const pngBlob = await convertBlobToPng(source.blob, image);
      const filename = buildFilename([
        getExplicitImageFilenameHint(image),
        source.filenameHint,
        getFilenameFromUrl(srcUrl)
      ]);

      await downloadBlob(pngBlob, filename);
    } catch (error) {
      if (isUserCancellation(error)) {
        return;
      }

      console.error("Failed to save image as PNG:", error);
      showNotification(`Could not save that image as PNG. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function findImageAt(event) {
    if (event.target instanceof HTMLImageElement) {
      return event.target;
    }

    // Many sites put a transparent overlay on top of their images.
    return document.elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element instanceof HTMLImageElement) || null;
  }

  async function getSourceBlob(srcUrl, image) {
    if (!srcUrl) {
      return {
        blob: await imageToBlob(image),
        filenameHint: null
      };
    }

    if (srcUrl.startsWith("blob:") || srcUrl.startsWith("data:")) {
      const response = await fetch(srcUrl);

      return {
        blob: await response.blob(),
        filenameHint: null
      };
    }

    try {
      return await requestImage(srcUrl);
    } catch {
      return {
        blob: await imageToBlob(image),
        filenameHint: null
      };
    }
  }

  function requestImage(srcUrl) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: srcUrl,
        responseType: "blob",
        onload: (response) => {
          if (response.status < 200 || response.status >= 300 || !response.response) {
            reject(new Error(`Image request failed with status ${response.status}.`));
            return;
          }

          resolve({
            blob: response.response,
            filenameHint: getContentDispositionFilename(getHeader(response.responseHeaders, "content-disposition")) ||
              getFilenameFromUrl(response.finalUrl) ||
              getFilenameFromUrl(srcUrl)
          });
        },
        onerror: () => reject(new Error("Image request failed.")),
        ontimeout: () => reject(new Error("Image request timed out."))
      });
    });
  }

  function getHeader(rawHeaders, name) {
    const line = (rawHeaders || "").split(/\r?\n/)
      .find((header) => header.toLowerCase().startsWith(`${name}:`));

    return line ? line.slice(name.length + 1).trim() : null;
  }

  async function convertBlobToPng(sourceBlob, image) {
    let source;

    try {
      source = await createImageBitmap(sourceBlob);
    } catch {
      // Formats createImageBitmap cannot decode (SVG, for example) are drawn
      // from the page's own image instead.
      return imageToBlob(image);
    }

    try {
      return await drawToPng(source, source.width, source.height);
    } finally {
      source.close();
    }
  }

  async function imageToBlob(image) {
    if (!image.complete) {
      await waitForImage(image);
    }

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error("The selected image has no size.");
    }

    return drawToPng(image, width, height);
  }

  function drawToPng(source, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create a canvas context.");
    }

    context.drawImage(source, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Could not read image data from the page."));
          }
        }, "image/png");
      } catch {
        reject(new Error("The site does not allow reading this image."));
      }
    });
  }

  function waitForImage(image) {
    return new Promise((resolve, reject) => {
      image.addEventListener("load", () => resolve(), {
        once: true
      });
      image.addEventListener("error", () => reject(new Error("The selected image did not finish loading.")), {
        once: true
      });
    });
  }

  function downloadBlob(blob, filename) {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(blob);
      const cleanup = () => setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      // Recent Tampermonkey versions accept a Blob directly; older ones get
      // the blob: URL. If GM_download is unavailable or refuses, fall back
      // to a plain link click, which saves without a "Save as" dialog.
      const fallback = () => {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.style.display = "none";
        document.documentElement.append(link);
        link.click();
        link.remove();
        cleanup();
        resolve();
      };

      if (typeof GM_download !== "function") {
        fallback();
        return;
      }

      try {
        GM_download({
          url: blob,
          name: filename,
          saveAs: true,
          conflictAction: "uniquify",
          onload: () => {
            cleanup();
            resolve();
          },
          onerror: (error) => {
            if (isUserCancellation(error?.details || error?.error)) {
              cleanup();
              reject(new Error("Download canceled by the user."));
              return;
            }

            fallback();
          }
        });
      } catch {
        fallback();
      }
    });
  }

  function isUserCancellation(error) {
    return /cancel/i.test(error instanceof Error ? error.message : String(error ?? ""));
  }

  function showNotification(text) {
    if (typeof GM_notification === "function") {
      GM_notification({
        title: "I Hate WebP",
        text
      });
    } else {
      alert(text);
    }
  }

  function buildFilename(candidates) {
    for (const candidate of candidates) {
      const name = cleanFilenameCandidate(candidate);

      if (name) {
        return `${name}.png`;
      }
    }

    return `${getTimestampFilename()}.png`;
  }

  function cleanFilenameCandidate(value) {
    if (!value) {
      return null;
    }

    const nameWithoutExtension = value.replace(/\.[^.]+$/, "");
    const sanitized = sanitizeFilename(nameWithoutExtension);

    if (!sanitized || GENERIC_FILENAMES.has(sanitized.toLowerCase())) {
      return null;
    }

    return sanitized;
  }

  function getTimestampFilename() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
      `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  }

  function sanitizeFilename(name) {
    const sanitized = name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, 200);

    if (!sanitized || /^_*$/.test(sanitized) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)) {
      return null;
    }

    return sanitized;
  }

  function getExplicitImageFilenameHint(image) {
    return image.dataset.filename ||
      image.dataset.fileName ||
      image.closest("a[download]")?.getAttribute("download");
  }

  function getFilenameFromUrl(value) {
    if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
      return null;
    }

    try {
      const url = new URL(value, location.href);
      const pathName = decodeURIComponent(url.pathname.split("/").pop() || "");

      if (/\.[a-z0-9]{2,8}$/i.test(pathName)) {
        return pathName;
      }

      for (const key of ["filename", "file", "name", "download"]) {
        const queryName = url.searchParams.get(key);

        if (queryName) {
          return decodeURIComponent(queryName.split(/[\\/]/).pop());
        }
      }

      return pathName || null;
    } catch {
      return null;
    }
  }

  function getContentDispositionFilename(header) {
    if (!header) {
      return null;
    }

    const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = header.match(/filename="([^"]+)"|filename=([^;]+)/i);
    const value = encodedMatch?.[1] || plainMatch?.[1] || plainMatch?.[2];

    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value.trim()).split(/[\\/]/).pop();
    } catch {
      return value.trim().split(/[\\/]/).pop();
    }
  }
})();
