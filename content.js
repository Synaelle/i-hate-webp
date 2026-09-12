chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_IMAGE_BLOB" || !message.srcUrl) {
    return undefined;
  }

  void extractImageBlob(message.srcUrl)
    .then((result) => sendResponse({
      ok: true,
      ...result
    }))
    .catch((error) => sendResponse({
      ok: false,
      error: error.message
    }));

  return true;
});

async function extractImageBlob(srcUrl) {
  const fetchedBlob = await fetchImageBlob(srcUrl);

  if (fetchedBlob) {
    return blobToPayload(fetchedBlob.blob, fetchedBlob.filenameHint);
  }

  const image = findImage(srcUrl);

  if (!image) {
    throw new Error("Could not find the selected image in the page.");
  }

  const blob = await imageToBlob(image);
  return blobToPayload(blob, getImageFilenameHint(image));
}

async function fetchImageBlob(srcUrl) {
  try {
    const response = await fetch(srcUrl);

    if (!response.ok) {
      return null;
    }

    return {
      blob: await response.blob(),
      filenameHint: getContentDispositionFilename(response.headers.get("content-disposition")) ||
        getFilenameFromUrl(srcUrl) ||
        getFilenameFromUrl(response.url)
    };
  } catch {
    return null;
  }
}

async function blobToPayload(blob, filenameHint) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return {
    blob: btoa(binary),
    type: blob.type || "application/octet-stream",
    filenameHint
  };
}

function findImage(srcUrl) {
  return [...document.images].find((image) =>
    image.currentSrc === srcUrl ||
    image.src === srcUrl ||
    image.getAttribute("src") === srcUrl
  );
}

function getImageFilenameHint(image) {
  const explicitName = image.dataset.filename ||
    image.dataset.fileName ||
    image.closest("a[download]")?.getAttribute("download");

  return explicitName || getFilenameFromUrl(image.currentSrc) || getFilenameFromUrl(image.src);
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

async function imageToBlob(image) {
  if (!image.complete) {
    await waitForImage(image);
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("The selected image has no size.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create a canvas context in the page.");
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Could not read image data from the page."));
      }
    }, "image/webp");
  });

  return blob;
}

function waitForImage(image) {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("The selected image did not finish loading."));
    };

    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };

    image.addEventListener("load", onLoad, {
      once: true
    });
    image.addEventListener("error", onError, {
      once: true
    });
  });
}
