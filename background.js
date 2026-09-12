const MENU_ID = "save-image-as-png";
const NOTIFICATION_ID = "save-image-as-png-status";

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) {
    return;
  }

  void handleImageClick(info, tab);
});

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Save image as PNG",
      contexts: ["image"]
    });
  });
}

async function handleImageClick(info, tab) {
  try {
    const source = await getSourceBlob(info, tab);
    const downloadUrl = await convertBlobToPngDataUrl(source.blob);
    const filename = buildFilename(info.srcUrl, source.filenameHint);

    await chrome.downloads.download({
      url: downloadUrl,
      filename,
      saveAs: true,
      conflictAction: "uniquify"
    });
  } catch (error) {
    console.error("Failed to save image as PNG:", error);
    await showNotification(
      "Could not save that image as PNG.",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function getSourceBlob(info, tab) {
  if (info.srcUrl.startsWith("blob:")) {
    return getBlobFromPageContext(info, tab);
  }

  try {
    const response = await fetch(info.srcUrl, {
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Image request failed with status ${response.status}.`);
    }

    return {
      blob: await response.blob(),
      filenameHint: getContentDispositionFilename(response.headers.get("content-disposition")) ||
        getFilenameFromUrl(info.srcUrl) ||
        getFilenameFromUrl(response.url)
    };
  } catch (error) {
    if (tab?.id) {
      return getBlobFromPageContext(info, tab, error);
    }

    throw error;
  }
}

async function getBlobFromPageContext(info, tab, originalError) {
  if (!tab?.id) {
    throw originalError ?? new Error("Could not access the page image.");
  }

  const messageOptions = Number.isInteger(info.frameId) ? {
    frameId: info.frameId
  } : {};
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "GET_IMAGE_BLOB",
    srcUrl: info.srcUrl
  }, messageOptions);

  if (!response?.ok || !response.blob) {
    throw new Error(response?.error || originalError?.message || "Could not read the selected image from the page.");
  }

  const bytes = Uint8Array.from(atob(response.blob), (char) => char.charCodeAt(0));

  return {
    blob: new Blob([bytes], {
      type: response.type || "application/octet-stream"
    }),
    filenameHint: response.filenameHint
  };
}

async function convertBlobToPngDataUrl(sourceBlob) {
  const imageBitmap = await createImageBitmap(sourceBlob);

  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create a canvas context.");
    }

    context.drawImage(imageBitmap, 0, 0);

    const pngBlob = await canvas.convertToBlob({
      type: "image/png"
    });

    return blobToDataUrl(pngBlob);
  } finally {
    imageBitmap.close();
  }
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function showNotification(title, message) {
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icon-128.png",
    title,
    message
  });
}

function buildFilename(imageUrl, filenameHint) {
  const originalName = filenameHint || getFilenameFromUrl(imageUrl) || "image";
  const nameWithoutExtension = originalName.replace(/\.[^.]+$/, "") || "image";

  return `${sanitizeFilename(nameWithoutExtension)}.png`;
}

function sanitizeFilename(name) {
  const sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 200);

  if (!sanitized || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)) {
    return "image";
  }

  return sanitized;
}

function getFilenameFromUrl(value) {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
    return null;
  }

  try {
    const url = new URL(value);
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
