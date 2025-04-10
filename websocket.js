const room = new WebsimSocket();

// Initialize the websocket connection
async function initializeWebSocket() {
  await room.initialize();
  return room;
}

// Update presence with user's cursor data
function updateUserPresence(data) {
  room.updatePresence(data);
}

// Get all current presence data
function getCurrentPresence() {
  return room.presence;
}

// Get current client ID
function getClientId() {
  return room.clientId;
}

// Get peer information
function getPeers() {
  return room.peers;
}

// Subscribe to presence changes with a callback
function subscribePresence(callback) {
  return room.subscribePresence(callback);
}

// Database operations
async function getCursorCollection() {
  return room.collection('cursor');
}

async function getCursorsList() {
  const collection = await getCursorCollection();
  return collection.getList();
}

async function createCursor(cursorData) {
  const collection = await getCursorCollection();
  return collection.create(cursorData);
}

async function subscribeToCursors(callback) {
  const collection = await getCursorCollection();
  return collection.subscribe(callback);
}

// Export all functions
window.websocketService = {
  initializeWebSocket,
  updateUserPresence,
  getCurrentPresence,
  getClientId,
  getPeers,
  subscribePresence,
  getCursorsList,
  createCursor,
  subscribeToCursors
};