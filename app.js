const room = new WebsimSocket();
const container = document.getElementById('container');
const gallery = document.getElementById('gallery');

// Track cursor positions and images
let cursors = {};
const DEFAULT_CURSOR = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);

let currentPage = 1;
const itemsPerPage = 20;
let totalCursors = 0;

async function initialize() {
  await room.initialize();

  // Add start button functionality
  const startButton = document.getElementById('start-button');

  startButton.addEventListener('click', () => {
    const isActive = container.classList.toggle('cursor-active');
    startButton.textContent = isActive ? 'Click to Stop' : 'Click to Start';
    startButton.classList.toggle('active', isActive);

    // Update presence with active state
    const currentPresence = room.presence[room.clientId] || {};
    room.updatePresence({
      ...currentPresence,
      isActive: isActive
    });
  });

  // Add escape key handler to exit cursor mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && container.classList.contains('cursor-active')) {
      container.classList.remove('cursor-active');
      startButton.textContent = 'Click to Start';
      startButton.classList.remove('active');

      // Update presence when deactivating
      const currentPresence = room.presence[room.clientId] || {};
      room.updatePresence({
        ...currentPresence,
        isActive: false
      });
    }
  });

  // Load and display the cursor gallery
  updateGallery();
  
  // Set up a subscription to the cursor collection to keep the gallery updated
  room.collection('cursor').subscribe(() => {
    updateGallery();
  });

  // Initialize my cursor position with default cursor
  room.updatePresence({
    x: 0,
    y: 0,
    cursorImage: DEFAULT_CURSOR
  });

  // Listen for cursor movements
  container.addEventListener('mousemove', (e) => {
    if (!container.classList.contains('cursor-active')) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ensure we always include the current cursor image in updates
    const currentCursorImage = room.presence[room.clientId]?.cursorImage || DEFAULT_CURSOR;

    room.updatePresence({
      x,
      y,
      cursorImage: currentCursorImage,
      isActive: true
    });
  });

  // Subscribe to presence changes
  room.subscribePresence((presence) => {
    updateCursors(presence);
  });
}

// Function to update the gallery display
async function updateGallery() {
  try {
    const cursorsList = await room.collection('cursor').getList();
    gallery.innerHTML = '';

    // Add default cursor option
    const defaultItem = document.createElement('div');
    defaultItem.className = 'gallery-item';

    const defaultImg = document.createElement('img');
    defaultImg.src = DEFAULT_CURSOR;

    const defaultPrompt = document.createElement('div');
    defaultPrompt.className = 'prompt';
    defaultPrompt.textContent = 'Default';

    defaultItem.appendChild(defaultImg);
    defaultItem.appendChild(defaultPrompt);

    defaultItem.onclick = () => {
      const currentX = room.presence[room.clientId]?.x || 0;
      const currentY = room.presence[room.clientId]?.y || 0;

      room.updatePresence({
        x: currentX,
        y: currentY,
        cursorImage: DEFAULT_CURSOR
      });
    };

    gallery.appendChild(defaultItem);

    // Sort cursors by creation date, newest first
    cursorsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Calculate pagination
    totalCursors = cursorsList.length;
    const totalPages = Math.ceil(totalCursors / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, cursorsList.length);

    // Update page info and button states
    document.getElementById('page-info').textContent = `Page ${currentPage} of ${Math.max(1, totalPages)}`;
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;

    // Display only the cursors for the current page
    const pageItems = cursorsList.slice(startIndex, endIndex);

    pageItems.forEach(cursor => {
      if (!cursor.imageUrl) return; // Skip if no image URL

      const item = document.createElement('div');
      item.className = 'gallery-item';

      const img = document.createElement('img');
      img.src = cursor.imageUrl;
      img.onerror = () => {
        img.src = DEFAULT_CURSOR; // Fallback if image fails to load
        console.error('Failed to load cursor image:', cursor.imageUrl);
      };

      const prompt = document.createElement('div');
      prompt.className = 'prompt';
      prompt.title = cursor.prompt || 'Unknown';
      prompt.textContent = cursor.prompt || 'Unknown';

      item.appendChild(img);
      item.appendChild(prompt);

      // Add download options
      const downloadContainer = document.createElement('div');
      downloadContainer.className = 'download-options';
      
      const winBtn = document.createElement('button');
      winBtn.className = 'download-btn win';
      winBtn.title = 'Download for Windows';
      winBtn.innerHTML = '<span>Win</span>';
      winBtn.onclick = (e) => {
        e.stopPropagation();
        downloadCursorAsWin(cursor.imageUrl, (cursor.prompt || 'cursor').replace(/\s+/g, '_'));
      };
      
      const linuxBtn = document.createElement('button');
      linuxBtn.className = 'download-btn linux';
      linuxBtn.title = 'Download for Linux';
      linuxBtn.innerHTML = '<span>Linux</span>';
      linuxBtn.onclick = (e) => {
        e.stopPropagation();
        downloadCursorAsLinux(cursor.imageUrl, (cursor.prompt || 'cursor').replace(/\s+/g, '_'));
      };
      
      downloadContainer.appendChild(winBtn);
      downloadContainer.appendChild(linuxBtn);
      item.appendChild(downloadContainer);

      item.onclick = () => {
        const currentX = room.presence[room.clientId]?.x || 0;
        const currentY = room.presence[room.clientId]?.y || 0;

        room.updatePresence({
          x: currentX,
          y: currentY,
          cursorImage: cursor.imageUrl
        });

        document.querySelectorAll('.gallery-item').forEach(el => {
          el.style.border = '1px solid #ddd';
        });
        item.style.border = '2px solid #0066ff';
      };

      gallery.appendChild(item);
    });
  } catch (error) {
    console.error('Error updating gallery:', error);
  }
}

function updateCursors(presence) {
  // Remove disconnected cursors
  for (const cursorId in cursors) {
    if (!presence[cursorId]) {
      cursors[cursorId].element.remove();
      delete cursors[cursorId];
    }
  }

  // Update or create cursors
  for (const clientId in presence) {
    const data = presence[clientId];
    if (!data || !data.isActive) {
      // Remove cursor element if user is not active
      if (cursors[clientId]) {
        cursors[clientId].element.remove();
        delete cursors[clientId];
      }
      continue;
    }

    if (!cursors[clientId]) {
      // Create new cursor element
      const cursorEl = document.createElement('div');
      cursorEl.className = 'cursor';

      const img = document.createElement('img');
      img.src = data.cursorImage || DEFAULT_CURSOR; // Use default if not provided
      cursorEl.appendChild(img);

      const username = document.createElement('div');
      username.className = 'username';
      username.textContent = room.peers[clientId]?.username || 'Anonymous';
      cursorEl.appendChild(username);

      container.appendChild(cursorEl);
      cursors[clientId] = { element: cursorEl };
    }

    // Update cursor position and image
    const cursor = cursors[clientId];
    cursor.element.style.left = `${data.x}px`;
    cursor.element.style.top = `${data.y}px`;

    const img = cursor.element.querySelector('img');
    // Always ensure the cursor image is set and up to date
    const imageUrl = data.cursorImage || DEFAULT_CURSOR;
    if (img.src !== imageUrl) {
      img.src = imageUrl;
    }
  }
}

function nextPage() {
  const totalPages = Math.ceil(totalCursors / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    updateGallery();
  }
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    updateGallery();
  }
}

async function generateCursor() {
  const prompt = document.getElementById('prompt').value;
  if (!prompt) return;

  try {
    // Generate image with white background
    const result = await websim.imageGen({
      prompt: prompt + " on pure white background",
      width: 256,
      height: 256
    });

    // Use the generated image URL directly
    const generatedImageUrl = result.url;

    // Create a canvas to process the image
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = generatedImageUrl;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Remove white background
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // If pixel is close to white, make it transparent
      if (r > 240 && g > 240 && b > 240) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Convert the canvas to a blob and upload it
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    // Upload the image and get a URL
    const cursorUrl = await websim.upload(blob);

    // Store the cursor in the database
    await room.collection('cursor').create({
      imageUrl: cursorUrl,
      prompt: prompt
    });

    // Make sure we include both position and image in the update
    const currentX = room.presence[room.clientId]?.x || 0;
    const currentY = room.presence[room.clientId]?.y || 0;

    room.updatePresence({
      x: currentX,
      y: currentY,
      cursorImage: cursorUrl
    });

  } catch (error) {
    console.error('Error generating cursor:', error);
  }
}

// Function to convert and download cursor as Windows .cur file
async function downloadCursorAsWin(imageUrl, fileName) {
  try {
    // Load the image
    const img = await loadImage(imageUrl);
    
    // Create a canvas with 32x32 size (standard cursor size)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // Draw the image on the canvas, scaling it to fit
    ctx.drawImage(img, 0, 0, 32, 32);
    
    // Create .cur file format (binary format)
    // CUR file header structure:
    // 0-1: Reserved, must be 0
    // 2-3: Type (1 for CUR files)
    // 4-5: Number of images in the file (1 in our case)
    const headerReserved = new Uint16Array([0]);
    const headerType = new Uint16Array([2]); // 2 for CUR files
    const headerCount = new Uint16Array([1]); // 1 image
    
    // Directory entry structure for the image:
    // 0: Width (32)
    // 1: Height (32)
    // 2: Color palette size (0, using true color)
    // 3: Reserved (0)
    // 4-5: Hotspot X (center point: 16)
    // 6-7: Hotspot Y (center point: 16)
    // 8-11: Size of image data in bytes (calculate after getting image data)
    // 12-15: Offset of image data from start of file (always 22 for one image)
    const dirWidth = new Uint8Array([32]);
    const dirHeight = new Uint8Array([32]);
    const dirColorCount = new Uint8Array([0]);
    const dirReserved = new Uint8Array([0]);
    const dirHotspotX = new Uint16Array([16]); // Center of 32x32 image
    const dirHotspotY = new Uint16Array([16]); // Center of 32x32 image
    
    // Get image data as PNG
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png');
    });
    
    const imageData = await blob.arrayBuffer();
    const imageDataSize = new Uint32Array([imageData.byteLength]);
    const imageDataOffset = new Uint32Array([22]); // Header(6) + Directory entry(16)
    
    // Combine all parts into a single binary file
    const fileSize = 6 + 16 + imageData.byteLength;
    const buffer = new ArrayBuffer(fileSize);
    const dataView = new DataView(buffer);
    
    let position = 0;
    
    // Write header
    new Uint8Array(buffer, position, 2).set(new Uint8Array(headerReserved.buffer));
    position += 2;
    new Uint8Array(buffer, position, 2).set(new Uint8Array(headerType.buffer));
    position += 2;
    new Uint8Array(buffer, position, 2).set(new Uint8Array(headerCount.buffer));
    position += 2;
    
    // Write directory entry
    new Uint8Array(buffer, position, 1).set(dirWidth);
    position += 1;
    new Uint8Array(buffer, position, 1).set(dirHeight);
    position += 1;
    new Uint8Array(buffer, position, 1).set(dirColorCount);
    position += 1;
    new Uint8Array(buffer, position, 1).set(dirReserved);
    position += 1;
    new Uint8Array(buffer, position, 2).set(new Uint8Array(dirHotspotX.buffer));
    position += 2;
    new Uint8Array(buffer, position, 2).set(new Uint8Array(dirHotspotY.buffer));
    position += 2;
    new Uint8Array(buffer, position, 4).set(new Uint8Array(imageDataSize.buffer));
    position += 4;
    new Uint8Array(buffer, position, 4).set(new Uint8Array(imageDataOffset.buffer));
    position += 4;
    
    // Write image data
    new Uint8Array(buffer, position).set(new Uint8Array(imageData));
    
    // Create and download the file
    const curBlob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(curBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.cur`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading Windows cursor:', error);
  }
}

// Function to convert and download cursor as Linux .xcursor file
async function downloadCursorAsLinux(imageUrl, fileName) {
  try {
    // Load the image
    const img = await loadImage(imageUrl);
    
    // Create a canvas with 32x32 size (standard cursor size)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // Draw the image on the canvas
    ctx.drawImage(img, 0, 0, 32, 32);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, 32, 32);
    const data = imageData.data;
    
    // Create Xcursor file header and chunks
    // Xcursor header: "Xcur" + file version (0x0100) + number of chunks (1)
    const xcursorMagic = 0x72756358; // "Xcur" in little-endian
    const xcursorVersion = 0x0100; // Version 1.0
    const numChunks = 1;
    
    // Chunk header: chunk type + subtype + nominal size + version + length
    const chunkType = 0xFFFD0002; // ARGB image data
    const subtype = 1; // Cursor subtype
    const nominalSize = 32; // 32x32 pixels
    const chunkVersion = 1;
    const chunkLength = 36 + (32 * 32 * 4); // 36 bytes header + pixel data
    
    // Prepare the buffer
    const bufferSize = 16 + chunkLength; // 16 for file header + chunk data
    const buffer = new ArrayBuffer(bufferSize);
    const dataView = new DataView(buffer);
    
    // Write file header
    dataView.setUint32(0, xcursorMagic, true); // true for little-endian
    dataView.setUint32(4, xcursorVersion, true);
    dataView.setUint32(8, numChunks, true);
    
    // Write chunk header
    let offset = 12; // After file header
    dataView.setUint32(offset, chunkType, true);
    offset += 4;
    dataView.setUint32(offset, subtype, true);
    offset += 4;
    dataView.setUint32(offset, nominalSize, true);
    offset += 4;
    dataView.setUint32(offset, 16, true); // Hotspot X
    offset += 4;
    dataView.setUint32(offset, 16, true); // Hotspot Y
    offset += 4;
    dataView.setUint32(offset, 0, true); // Delay (unused for static cursors)
    offset += 4;
    
    // Write pixel data - ARGB format with premultiplied alpha
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      
      // Write a premultiplied ARGB pixel at current position
      dataView.setUint8(offset++, blue);
      dataView.setUint8(offset++, green);
      dataView.setUint8(offset++, red);
      dataView.setUint8(offset++, alpha);
    }
    
    // Create and download the file
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.xcursor`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading Linux cursor:', error);
  }
}

// Helper function to load an image and return a Promise
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

initialize();