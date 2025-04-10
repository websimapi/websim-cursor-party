const room = new WebsimSocket();
const container = document.getElementById('container');
const gallery = document.getElementById('gallery');

// Track cursor positions and images
let cursors = {};
const DEFAULT_CURSOR = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);

let currentPage = 1;
const itemsPerPage = 20;
let totalCursors = 0;

let customContainers = {};
let activeContainer = 'main';

async function createCustomContainer() {
  const prompt = document.getElementById('container-prompt').value;
  if (!prompt) return;

  try {
    // Query the LLM to generate container code
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a web developer specializing in interactive containers.
Generate HTML, CSS, and JS for a 640x480 container based on the user's description.
The container must include:
- A div with class "custom-container" and unique id
- Internal styling in a <style> tag
- Any custom JavaScript in a <script> tag
- Must maintain 640x480 dimensions
- Must support cursor presence/movement tracking
Respond with pure HTML including all necessary code, no explanation needed.`
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    // Create container record in database
    const container = await room.collection('custom_container').create({
      prompt: prompt,
      code: completion.content,
      host: room.clientId
    });

    // Add to local tracking
    await loadCustomContainer(container);

  } catch (error) {
    console.error('Error creating custom container:', error);
  }
}

async function loadCustomContainer(container) {
  if (!container || !container.id || !container.code) {
    console.error('Invalid container data:', container);
    return;
  }

  const customContainersDiv = document.getElementById('custom-containers');
  if (!customContainersDiv) {
    console.error('Custom containers div not found');
    return;
  }
  
  // Remove existing container if it exists
  const existingWrapper = document.getElementById(`wrapper-${container.id}`);
  if (existingWrapper) {
    existingWrapper.remove();
  }
  
  try {
    // Create wrapper for the custom container
    const wrapper = document.createElement('div');
    wrapper.className = 'container-wrapper';
    wrapper.id = `wrapper-${container.id}`;
    
    // Add container header
    const header = document.createElement('div');
    header.className = 'container-header';
    header.innerHTML = `
      <div class="container-title">${container.prompt || 'Untitled Container'}</div>
      <div class="container-host">Host: ${container.username || 'Anonymous'}</div>
      <div class="container-status" id="status-${container.id}">Waiting for host</div>
    `;
    
    wrapper.appendChild(header);
    
    // Parse the LLM response into a document fragment
    const parser = new DOMParser();
    const doc = parser.parseFromString(container.code, 'text/html');
    
    // Extract and inject styles
    const styles = doc.querySelectorAll('style');
    styles.forEach(style => {
      if (style && style.textContent) {
        const scopedStyle = document.createElement('style');
        scopedStyle.textContent = style.textContent.replace(
          /\.custom-container/g, 
          `#wrapper-${container.id} .custom-container`
        );
        wrapper.appendChild(scopedStyle);
      }
    });
    
    // Extract and inject the container HTML
    const containerEl = doc.querySelector('.custom-container');
    if (containerEl) {
      containerEl.id = `container-${container.id}`;
      wrapper.appendChild(containerEl);
    } else {
      console.error('No .custom-container element found in generated code');
      return;
    }
    
    // Extract and inject scripts
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => {
      if (script && script.textContent) {
        const newScript = document.createElement('script');
        // Add container ID as a property to help scope any JS
        newScript.textContent = `
          (function() {
            try {
              const containerId = '${container.id}';
              const containerElement = document.querySelector('#container-${container.id}');
              if (!containerElement) {
                console.error('Container element not found:', containerId);
                return;
              }
              ${script.textContent}
            } catch (error) {
              console.error('Error in container script:', error);
            }
          })();
        `;
        wrapper.appendChild(newScript);
      }
    });
    
    customContainersDiv.appendChild(wrapper);
    
    // Store reference to container
    customContainers[container.id] = {
      element: wrapper,
      host: container.host,
      active: false
    };
    
    // Setup mouse tracking for this container
    const containerElement = wrapper.querySelector('.custom-container');
    if (containerElement) {
      containerElement.addEventListener('mousemove', (e) => {
        if (!room.presence[container.host]?.isActive) return;
        
        const rect = containerElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        room.updatePresence({
          x,
          y,
          cursorImage: room.presence[room.clientId]?.cursorImage || DEFAULT_CURSOR,
          isActive: true,
          containerId: container.id
        });
      });
      
      // Add container exit listener
      containerElement.addEventListener('mouseleave', () => {
        const currentPresence = room.presence[room.clientId];
        if (currentPresence?.containerId === container.id) {
          room.updatePresence({
            ...currentPresence,
            containerId: null
          });
        }
      });
    }
  } catch (error) {
    console.error('Error loading custom container:', error);
  }
}

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

  // Subscribe to custom containers
  room.collection('custom_container').subscribe(async (containers) => {
    // Load any new containers
    for (const container of containers) {
      if (!customContainers[container.id]) {
        await loadCustomContainer(container);
      }
    }
    
    // Update container statuses based on presence
    for (const container of containers) {
      const statusEl = document.getElementById(`status-${container.id}`);
      if (statusEl) {
        const isHostPresent = room.presence[container.host]?.isActive;
        statusEl.textContent = isHostPresent ? 'Host Active' : 'Waiting for host';
        statusEl.classList.toggle('active', isHostPresent);
      }
    }
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
    if (!data || !data.isActive) {
      if (cursors[clientId]) {
        cursors[clientId].element.remove();
        delete cursors[clientId];
      }
      continue;
    }

    // Determine which container to show the cursor in
    const targetContainer = data.containerId ? 
      document.querySelector(`#wrapper-${data.containerId} .custom-container`) : 
      container;

    if (!targetContainer) continue;

    if (!cursors[clientId]) {
      // Create new cursor element
      const cursorEl = document.createElement('div');
      cursorEl.className = 'cursor';

      const img = document.createElement('img');
      img.src = data.cursorImage || DEFAULT_CURSOR;
      cursorEl.appendChild(img);

      const username = document.createElement('div');
      username.className = 'username';
      username.textContent = room.peers[clientId]?.username || 'Anonymous';
      cursorEl.appendChild(username);

      targetContainer.appendChild(cursorEl);
      cursors[clientId] = { element: cursorEl };
    }

    // Update cursor position and image
    const cursor = cursors[clientId];
    cursor.element.style.left = `${data.x}px`;
    cursor.element.style.top = `${data.y}px`;

    // Move cursor to correct container if needed
    if (cursor.element.parentElement !== targetContainer) {
      targetContainer.appendChild(cursor.element);
    }

    const img = cursor.element.querySelector('img');
    const imageUrl = data.cursorImage || DEFAULT_CURSOR;
    if (img.src !== imageUrl) {
      img.src = imageUrl;
    }
  }
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

initialize();