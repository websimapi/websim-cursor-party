const room = new WebsimSocket();
const container = document.getElementById('container');

// Track cursor positions and images
let cursors = {};

async function initialize() {
  await room.initialize();

  // Initialize my cursor position
  room.updatePresence({
    x: 0,
    y: 0,
    cursorImage: null
  });

  // Listen for cursor movements
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    room.updatePresence({
      x,
      y,
      cursorImage: room.presence[room.clientId]?.cursorImage
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
    if (data.cursorImage && img.src !== data.cursorImage) {
      img.src = data.cursorImage;
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

    // Create a canvas to process the image
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = result.url;
    
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

    // Update presence with new cursor image
    const cursorUrl = canvas.toDataURL('image/png');
    room.updatePresence({
      x: room.presence[room.clientId]?.x || 0,
      y: room.presence[room.clientId]?.y || 0,
      cursorImage: cursorUrl
    });

  } catch (error) {
    console.error('Error generating cursor:', error);
  }
}

initialize();

