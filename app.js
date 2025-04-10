const room = new WebsimSocket();
const container = document.getElementById('container');
const gallery = document.getElementById('gallery');

// Track cursor positions and images
let cursors = {};
const DEFAULT_CURSOR = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);

async function initialize() {
  await room.initialize();

  // Load and display the cursor gallery
  updateGallery();

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

// Function to update the gallery display
async function updateGallery() {
  const cursorsList = await room.collection('cursor').getList();
  gallery.innerHTML = '';
  
  // Sort cursors by creation date, newest first
  cursorsList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  cursorsList.forEach(cursor => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    const img = document.createElement('img');
    img.src = cursor.imageUrl;
    
    const prompt = document.createElement('div');
    prompt.className = 'prompt';
    prompt.title = cursor.prompt;
    prompt.textContent = cursor.prompt;
    
    item.appendChild(img);
    item.appendChild(prompt);
    
    item.onclick = () => {
      // Update the current user's cursor
      const currentX = room.presence[room.clientId]?.x || 0;
      const currentY = room.presence[room.clientId]?.y || 0;
      
      room.updatePresence({
        x: currentX,
        y: currentY,
        cursorImage: cursor.imageUrl
      });
    };
    
    gallery.appendChild(item);
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
    
    // Store the cursor in the database
    await room.collection('cursor').create({
      imageUrl: cursorUrl,
      prompt: prompt
    });
    
    // Update the gallery
    updateGallery();
    
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

initialize();