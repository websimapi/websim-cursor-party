const room = new WebsimSocket();
const container = document.getElementById('container');
const gallery = document.getElementById('gallery');

import pako from 'pako';

// Track cursor positions and images
let cursors = {};
const DEFAULT_CURSOR = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);

let currentPage = 1;
const itemsPerPage = 20;
let totalCursors = 0;

async function convertToCur(imageUrl) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  
  // Create an image to get dimensions
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 32;  // Standard cursor size
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  
  // Draw and scale image
  ctx.drawImage(img, 0, 0, 32, 32);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, 32, 32);
  const data = imageData.data;
  
  // CUR file header (22 bytes)
  const header = new Uint8Array([
    0x00, 0x00,             // Reserved
    0x02, 0x00,             // Type (1 for ICO, 2 for CUR)
    0x01, 0x00,             // Number of images
    0x20, 0x20,             // Width, height (32x32)
    0x00,                   // Color palette
    0x00,                   // Reserved
    0x01, 0x00,             // Color planes
    0x08, 0x00,             // Bits per pixel
    0x16, 0x00, 0x00, 0x00, // Size of image data
    0x16, 0x00, 0x00, 0x00  // Offset to image data
  ]);

  // Hotspot data (4 bytes)
  const hotspot = new Uint8Array([
    0x00, 0x00,             // X hotspot
    0x00, 0x00              // Y hotspot
  ]);

  // Convert RGBA to AND and XOR masks
  const masks = new Uint8Array(32 * 32 * 2);  // Space for both AND and XOR masks
  let andIdx = 0;
  let xorIdx = 32 * 32;
  
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      const alpha = data[i + 3];
      
      // Set AND mask (1 for transparent, 0 for opaque)
      if (alpha < 128) {
        masks[andIdx + Math.floor(x / 8)] |= (1 << (7 - (x % 8)));
      }
      
      // Set XOR mask (actual color data)
      if (alpha >= 128) {
        masks[xorIdx + y * 32 + x] = 0xFF;  // White for visible pixels
      }
    }
    andIdx += 4;  // 32 bits = 4 bytes per row
  }

  // Combine all parts
  const curData = new Uint8Array(header.length + hotspot.length + masks.length);
  curData.set(header, 0);
  curData.set(hotspot, header.length);
  curData.set(masks, header.length + hotspot.length);
  
  return new Blob([curData], { type: 'application/x-cursor' });
}

async function convertToXCursor(imageUrl) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  
  // Create an image to get dimensions
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  
  // Draw and scale image
  ctx.drawImage(img, 0, 0, 32, 32);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, 32, 32);
  const data = imageData.data;

  // Xcursor header
  const header = new Uint8Array([
    0x58, 0x63, 0x75, 0x72, // Magic "Xcur"
    0x00, 0x00, 0x00, 0x00, // Header size
    0x01, 0x00, 0x00, 0x00, // Version
    0x01, 0x00, 0x00, 0x00  // Number of images
  ]);

  // Image header
  const imgHeader = new Uint8Array([
    0x20, 0x00, 0x00, 0x00, // Width (32)
    0x20, 0x00, 0x00, 0x00, // Height (32)
    0x00, 0x00, 0x00, 0x00, // Xhot (0)
    0x00, 0x00, 0x00, 0x00, // Yhot (0)
    0x00, 0x04, 0x00, 0x00  // Delay (1024ms)
  ]);

  // Convert RGBA to ARGB format
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let i = 0; i < data.length; i += 4) {
    const offset = i;
    pixels[offset] = data[i + 3];     // Alpha
    pixels[offset + 1] = data[i];     // Red
    pixels[offset + 2] = data[i + 1]; // Green
    pixels[offset + 3] = data[i + 2]; // Blue
  }

  // Compress pixel data with GZIP
  const compressed = pako.gzip(pixels);

  // Create final xcursor file
  const xcursorData = new Uint8Array(header.length + imgHeader.length + compressed.length);
  xcursorData.set(header, 0);
  xcursorData.set(imgHeader, header.length);
  xcursorData.set(compressed, header.length + imgHeader.length);

  return new Blob([xcursorData], { type: 'application/x-cursor' });
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

async function initialize() {
  await room.initialize();

  // Add event listener for generate button
  document.getElementById('generate-button').addEventListener('click', generateCursor);

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

      // Add download buttons container
      const downloadButtons = document.createElement('div');
      downloadButtons.className = 'download-buttons';

      // Windows .cur download button
      const winButton = document.createElement('button');
      winButton.className = 'download-btn';
      winButton.textContent = 'Win';
      winButton.onclick = async (e) => {
        e.stopPropagation();
        const curBlob = await convertToCur(cursor.imageUrl);
        const curUrl = URL.createObjectURL(curBlob);
        const a = document.createElement('a');
        a.href = curUrl;
        a.download = `${cursor.prompt || 'cursor'}.cur`;
        a.click();
        URL.revokeObjectURL(curUrl);
      };

      // Linux .xcursor download button
      const linuxButton = document.createElement('button');
      linuxButton.className = 'download-btn';
      linuxButton.textContent = 'Linux';
      linuxButton.onclick = async (e) => {
        e.stopPropagation();
        const xcursorBlob = await convertToXCursor(cursor.imageUrl);
        const xcursorUrl = URL.createObjectURL(xcursorBlob);
        const a = document.createElement('a');
        a.href = xcursorUrl;
        a.download = `${cursor.prompt || 'cursor'}.xcursor`;
        a.click();
        URL.revokeObjectURL(xcursorUrl);
      };

      downloadButtons.appendChild(winButton);
      downloadButtons.appendChild(linuxButton);
      item.appendChild(downloadButtons);

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

// Initialize everything
initialize();