// Gallery management
let currentPage = 1;
const itemsPerPage = 20;
let totalCursors = 0;
const gallery = document.getElementById('gallery');

// Function to update the gallery display
async function updateGallery() {
  try {
    // Show loading state
    gallery.innerHTML = '<div class="loading-placeholder">Loading cursors...</div>';
    
    const cursorsList = await room.collection('cursor').getList();
    gallery.innerHTML = '';

    // Add default cursor option
    addDefaultCursorToGallery();

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

    pageItems.forEach(addCursorToGallery);
    
    // Re-select current cursor if any
    highlightSelectedCursor();

  } catch (error) {
    console.error('Error updating gallery:', error);
    gallery.innerHTML = '<div class="error-message">Error loading cursors. Please try again.</div>';
  }
}

function addDefaultCursorToGallery() {
  const defaultItem = document.createElement('div');
  defaultItem.className = 'gallery-item';
  defaultItem.dataset.cursorType = 'default';

  const defaultImg = document.createElement('img');
  defaultImg.src = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);
  defaultImg.alt = 'Default cursor';

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
      cursorImage: defaultImg.src
    });
    highlightGalleryItem(defaultItem);
  };

  gallery.appendChild(defaultItem);
}

function addCursorToGallery(cursor) {
  if (!cursor.imageUrl) return; // Skip if no image URL

  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.cursorId = cursor.id;

  const img = document.createElement('img');
  img.src = cursor.imageUrl;
  img.alt = cursor.prompt || 'Custom cursor';
  img.onerror = () => {
    img.src = "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);
    console.error('Failed to load cursor image:', cursor.imageUrl);
  };

  const prompt = document.createElement('div');
  prompt.className = 'prompt';
  prompt.title = cursor.prompt || 'Unknown';
  prompt.textContent = cursor.prompt || 'Unknown';

  const creator = document.createElement('div');
  creator.className = 'creator';
  creator.textContent = `by ${cursor.username || 'Anonymous'}`;

  item.appendChild(img);
  item.appendChild(prompt);
  item.appendChild(creator);

  item.onclick = () => {
    const currentX = room.presence[room.clientId]?.x || 0;
    const currentY = room.presence[room.clientId]?.y || 0;
    room.updatePresence({
      x: currentX,
      y: currentY,
      cursorImage: cursor.imageUrl
    });
    highlightGalleryItem(item);
  };

  gallery.appendChild(item);
}

function highlightGalleryItem(selectedItem) {
  // Remove selection from all items
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // Add selection to clicked item
  selectedItem.classList.add('selected');
}

function highlightSelectedCursor() {
  const currentCursorImage = room.presence[room.clientId]?.cursorImage || "data:image/svg+xml;base64," + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7,4 L25,16 L14,17 L12,28 L7,4" fill="white" stroke="black" stroke-width="1.5"/></svg>`);
  
  document.querySelectorAll('.gallery-item').forEach(item => {
    const itemImg = item.querySelector('img');
    if (itemImg && itemImg.src === currentCursorImage) {
      item.classList.add('selected');
    }
  });
}

function selectCursor(imageUrl) {
  const currentX = room.presence[room.clientId]?.x || 0;
  const currentY = room.presence[room.clientId]?.y || 0;
  room.updatePresence({
    x: currentX,
    y: currentY,
    cursorImage: imageUrl
  });
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

// Initialize gallery pagination controls
function initGalleryControls() {
  document.getElementById('next-page').addEventListener('click', nextPage);
  document.getElementById('prev-page').addEventListener('click', previousPage);
  
  // Subscribe to cursor collection changes
  room.collection('cursor').subscribe(() => {
    updateGallery();
  });
}

window.galleryService = {
  updateGallery,
  initGalleryControls
};