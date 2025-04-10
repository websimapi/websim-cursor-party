// Default cursor SVG
const DEFAULT_CURSOR = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);

// Track cursor positions and images
let cursors = {};
let currentCursorImage = DEFAULT_CURSOR;

function getDefaultCursor() {
  return DEFAULT_CURSOR;
}

function getCurrentCursorImage() {
  return currentCursorImage;
}

function updateCurrentCursor(imageUrl) {
  currentCursorImage = imageUrl;
  
  // Update presence with new cursor image
  const currentPresence = room.presence[room.clientId] || {};
  const x = currentPresence.x || 0;
  const y = currentPresence.y || 0;
  
  room.updatePresence({
    x,
    y,
    cursorImage: imageUrl,
    isActive: currentPresence.isActive || false
  });
}

function updateCursors(presence) {
  const container = document.getElementById('container');
  const clientId = room.clientId;
  const peers = room.peers;
  let activeUsers = 0;
  
  // Remove disconnected cursors
  for (const cursorId in cursors) {
    if (!presence[cursorId]) {
      cursors[cursorId].element.remove();
      delete cursors[cursorId];
    }
  }

  // Update or create cursors
  for (const userId in presence) {
    const data = presence[userId];
    if (!data || !data.isActive) {
      // Remove cursor element if user is not active
      if (cursors[userId]) {
        cursors[userId].element.remove();
        delete cursors[userId];
      }
      continue;
    }
    
    // Count active users
    activeUsers++;

    if (!cursors[userId]) {
      // Create new cursor element
      const cursorEl = document.createElement('div');
      cursorEl.className = 'cursor';

      const img = document.createElement('img');
      img.src = data.cursorImage || DEFAULT_CURSOR;
      cursorEl.appendChild(img);

      const username = document.createElement('div');
      username.className = 'username';
      username.textContent = peers[userId]?.username || 'Anonymous';
      cursorEl.appendChild(username);

      container.appendChild(cursorEl);
      cursors[userId] = { element: cursorEl };
      
      // Add entrance animation
      cursorEl.style.opacity = '0';
      cursorEl.style.transform = 'translate(-50%, -50%) scale(0.5)';
      setTimeout(() => {
        cursorEl.style.transition = 'all 0.3s ease';
        cursorEl.style.opacity = '1';
        cursorEl.style.transform = 'translate(-50%, -50%) scale(1)';
      }, 10);
    }

    // Update cursor position and image
    const cursor = cursors[userId];
    cursor.element.style.left = `${data.x}px`;
    cursor.element.style.top = `${data.y}px`;

    const img = cursor.element.querySelector('img');
    // Always ensure the cursor image is set and up to date
    const imageUrl = data.cursorImage || DEFAULT_CURSOR;
    if (img.src !== imageUrl) {
      img.src = imageUrl;
    }
  }
  
  // Update active user count
  document.getElementById('user-count').textContent = activeUsers;
}

async function generateCursor() {
  const prompt = document.getElementById('prompt').value;
  if (!prompt) {
    alert('Please enter a description for your cursor');
    return;
  }

  try {
    // Show loading indicator
    document.getElementById('loading-indicator').classList.remove('hidden');
    document.getElementById('generate-button').disabled = true;
    
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

    // Update current cursor
    updateCurrentCursor(cursorUrl);
    
    // Clear the prompt input
    document.getElementById('prompt').value = '';
    
    // Show success feedback
    showToast('Cursor created successfully!');

  } catch (error) {
    console.error('Error generating cursor:', error);
    showToast('Error creating cursor. Please try again.', 'error');
  } finally {
    // Hide loading indicator
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('generate-button').disabled = false;
  }
}

function showToast(message, type = 'success') {
  // Create toast element if it doesn't exist
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  // Set message and type
  toast.textContent = message;
  toast.className = `toast ${type}`;
  
  // Show toast
  toast.classList.add('show');
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize cursor tracking
function initCursorTracking() {
  const container = document.getElementById('container');
  
  // Subscribe to presence changes
  room.subscribePresence(updateCursors);
  
  // Listen for cursor movements
  container.addEventListener('mousemove', (e) => {
    if (!container.classList.contains('cursor-active')) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    room.updatePresence({
      x,
      y,
      cursorImage: currentCursorImage,
      isActive: true
    });
  });
}

window.cursorService = {
  getDefaultCursor,
  getCurrentCursorImage,
  updateCurrentCursor,
  generateCursor,
  initCursorTracking,
  updateCursors
};