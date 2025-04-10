const room = new WebsimSocket();
const container = document.getElementById('container');

// Track cursor positions and images
let cursors = {};
const DEFAULT_CURSOR = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);

function toggleFullscreen() {
  const container = document.getElementById('container');
  container.classList.toggle('fullscreen');
  
  if (container.classList.contains('fullscreen')) {
    // Calculate scale factor to fit screen while maintaining aspect ratio
    const vw = Math.min(window.innerWidth, window.innerHeight * (640/480));
    const vh = Math.min(window.innerHeight, window.innerWidth * (480/640));
    const scale = Math.min(vw/640, vh/480);
    
    // Apply scale as CSS variable
    container.style.setProperty('--scale-factor', scale);
  }
}

async function initialize() {
  await room.initialize();

  // Initialize my cursor position with default cursor
  room.updatePresence({
    x: 0,
    y: 0,
    cursorImage: DEFAULT_CURSOR
  });

  // Listen for cursor movements
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Ensure we always include the current cursor image in updates
    const currentCursorImage = room.presence[room.clientId]?.cursorImage || DEFAULT_CURSOR;
    
    room.updatePresence({
      x,
      y,
      cursorImage: currentCursorImage
    });
  });

  // Subscribe to presence changes
  room.subscribePresence((presence) => {
    updateCursors(presence);
  });
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
    if (!data) continue;

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
    
    // Make sure we include both position and image in the update
    const currentX = room.presence[room.clientId]?.x || 0;
    const currentY = room.presence[room.clientId]?.y || 0;
    
    room.updatePresence({
      x: currentX,
      y: currentY,
      cursorImage: cursorUrl // Now using the uploaded image URL instead of data URL
    });

  } catch (error) {
    console.error('Error generating cursor:', error);
  }
}

initialize();

window.addEventListener('resize', () => {
  const container = document.getElementById('container');
  if (container.classList.contains('fullscreen')) {
    const vw = Math.min(window.innerWidth, window.innerHeight * (640/480));
    const vh = Math.min(window.innerHeight, window.innerWidth * (480/640));
    const scale = Math.min(vw/640, vh/480);
    container.style.setProperty('--scale-factor', scale);
  }
});