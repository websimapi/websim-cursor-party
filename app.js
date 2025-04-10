// Initialize all components of the application

// Initialize the WebSocket connection
async function initializeApp() {
  // Initialize websocket connection
  await websocketService.initializeWebSocket();
  
  // Initialize cursor tracking
  cursorService.initCursorTracking();
  
  // Initialize gallery controls
  galleryService.initGalleryControls();
  
  // Load gallery data
  galleryService.updateGallery();
  
  // Set up the playground controls
  setupPlaygroundControls();
  
  // Set up cursor generator
  setupCursorGenerator();
  
  // Add toast styles dynamically
  addToastStyles();
}

function setupPlaygroundControls() {
  const container = document.getElementById('container');
  const startButton = document.getElementById('start-button');

  startButton.addEventListener('click', () => {
    const isActive = container.classList.toggle('cursor-active');
    startButton.textContent = isActive ? 'Exit Playground' : 'Enter Playground';
    startButton.classList.toggle('active', isActive);

    // Update presence with active state
    const currentPresence = websocketService.getCurrentPresence()[websocketService.getClientId()] || {};
    websocketService.updateUserPresence({
      ...currentPresence,
      isActive: isActive
    });
  });

  // Add escape key handler to exit cursor mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && container.classList.contains('cursor-active')) {
      container.classList.remove('cursor-active');
      startButton.textContent = 'Enter Playground';
      startButton.classList.remove('active');

      // Update presence when deactivating
      const currentPresence = websocketService.getCurrentPresence()[websocketService.getClientId()] || {};
      websocketService.updateUserPresence({
        ...currentPresence,
        isActive: false
      });
    }
  });

  // Listen for cursor movements
  container.addEventListener('mousemove', (e) => {
    if (!container.classList.contains('cursor-active')) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ensure we always include the current cursor image in updates
    const currentCursorImage = websocketService.getCurrentPresence()[websocketService.getClientId()]?.cursorImage || websocketService.DEFAULT_CURSOR;

    websocketService.updateUserPresence({
      x,
      y,
      cursorImage: currentCursorImage,
      isActive: true
    });
  });

  // Subscribe to presence changes
  websocketService.subscribePresence((presence) => {
    cursorService.updateCursors(presence);
  });
}

function setupCursorGenerator() {
  // Add event listener to generate button
  document.getElementById('generate-button').addEventListener('click', cursorService.generateCursor);
  
  // Allow Enter key to submit form
  document.getElementById('prompt').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      cursorService.generateCursor();
    }
  });
}

function addToastStyles() {
  // Create styles for toast notifications
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--primary-color);
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 1000;
      opacity: 0;
      transition: all 0.3s ease;
    }
    
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    
    .toast.error {
      background: #f44336;
    }
  `;
  document.head.appendChild(style);
}

// Start the application
initializeApp();