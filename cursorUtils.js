// Utility functions for cursor generation and download

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
    
    // Get image data in RGBA format
    const imageData = ctx.getImageData(0, 0, 32, 32);
    const data = imageData.data;
    
    // Create a bitmap with proper format (BITMAPINFOHEADER + pixel data)
    // BITMAPINFOHEADER is 40 bytes
    const bitmapInfoHeader = new ArrayBuffer(40);
    const bmpView = new DataView(bitmapInfoHeader);
    
    bmpView.setUint32(0, 40, true); // biSize: BITMAPINFOHEADER size (40 bytes)
    bmpView.setInt32(4, 32, true);  // biWidth: 32 pixels
    bmpView.setInt32(8, 64, true);  // biHeight: 32 * 2 (XOR mask + AND mask)
    bmpView.setUint16(12, 1, true); // biPlanes: 1 plane
    bmpView.setUint16(14, 32, true); // biBitCount: 32 bits per pixel (RGBA)
    bmpView.setUint32(16, 0, true);  // biCompression: no compression (BI_RGB)
    bmpView.setUint32(20, 32 * 32 * 4 * 2, true); // biSizeImage: size of XOR + AND mask
    bmpView.setInt32(24, 0, true);   // biXPelsPerMeter: not used
    bmpView.setInt32(28, 0, true);   // biYPelsPerMeter: not used
    bmpView.setUint32(32, 0, true);  // biClrUsed: no color palette
    bmpView.setUint32(36, 0, true);  // biClrImportant: all colors are important
    
    // Create pixel data for the XOR and AND masks
    // XOR mask has BGRA format (Little-endian), AND mask is 1 bit per pixel
    const xorMaskSize = 32 * 32 * 4;
    const andMaskSize = 32 * 32 / 8; // 1 bit per pixel, padded to 32-bit boundaries
    const pixelData = new ArrayBuffer(xorMaskSize + andMaskSize);
    const pixelView = new Uint8Array(pixelData);
    
    // Fill XOR mask with BGRA pixel data (flipped vertically as BMP is bottom-up)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const srcIdx = (y * 32 + x) * 4;
        const dstIdx = ((31 - y) * 32 + x) * 4; // Flip vertically
        
        pixelView[dstIdx] = data[srcIdx + 2];     // B
        pixelView[dstIdx + 1] = data[srcIdx + 1]; // G
        pixelView[dstIdx + 2] = data[srcIdx];     // R
        pixelView[dstIdx + 3] = data[srcIdx + 3]; // A
        
        // Prepare AND mask based on alpha (will be filled after XOR mask)
        const andMaskRowBytes = Math.ceil(32 / 8);
        const andMaskByteOffset = xorMaskSize + (31 - y) * andMaskRowBytes;
        const andMaskBitOffset = x % 8;
        
        // Set bit if transparent (alpha < 128)
        if (data[srcIdx + 3] < 128) {
          // Set bit in AND mask (1 = transparent)
          pixelView[andMaskByteOffset + Math.floor(x / 8)] |= (1 << (7 - andMaskBitOffset));
        }
      }
    }
    
    // Create .cur file format structure
    // Header + Directory Entry + Bitmap data
    const headerSize = 6;
    const dirEntrySize = 16;
    const fileSize = headerSize + dirEntrySize + bitmapInfoHeader.byteLength + pixelData.byteLength;
    
    const buffer = new ArrayBuffer(fileSize);
    const fileView = new DataView(buffer);
    
    // Header: 6 bytes
    fileView.setUint16(0, 0, true);    // Reserved, must be 0
    fileView.setUint16(2, 2, true);    // Type: 2 for CUR files
    fileView.setUint16(4, 1, true);    // Number of images: 1
    
    // Directory Entry: 16 bytes
    fileView.setUint8(6, 32);          // Width: 32 pixels
    fileView.setUint8(7, 32);          // Height: 32 pixels
    fileView.setUint8(8, 0);           // Color count: 0 (using true color)
    fileView.setUint8(9, 0);           // Reserved: 0
    fileView.setUint16(10, 16, true);  // Hot spot X: center of image
    fileView.setUint16(12, 16, true);  // Hot spot Y: center of image
    fileView.setUint32(14, bitmapInfoHeader.byteLength + pixelData.byteLength, true); // Data size
    fileView.setUint32(18, headerSize + dirEntrySize, true); // Data offset (22)
    
    // Copy BITMAPINFOHEADER
    new Uint8Array(buffer, headerSize + dirEntrySize, bitmapInfoHeader.byteLength)
      .set(new Uint8Array(bitmapInfoHeader));
    
    // Copy pixel data (XOR + AND masks)
    new Uint8Array(buffer, headerSize + dirEntrySize + bitmapInfoHeader.byteLength, pixelData.byteLength)
      .set(new Uint8Array(pixelData));
    
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
    
    // X cursor file format constants
    const XCURSOR_MAGIC = 0x72756358; // "Xcur" in little-endian
    const XCURSOR_IMAGE_TYPE = 0xfffd0002; // ARGB image type
    
    // Calculate file size
    const headerSize = 16; // Xcursor header size
    const TOC_SIZE = 12; // Table of Contents entry size
    const imageHeaderSize = 36; // Image header size
    const imageDataSize = 32 * 32 * 4; // 32×32 pixels × 4 bytes per pixel
    const totalSize = headerSize + TOC_SIZE + imageHeaderSize + imageDataSize;
    
    // Create buffer for the entire file
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // Write Xcursor file header
    view.setUint32(0, XCURSOR_MAGIC, true); // Magic "Xcur"
    view.setUint32(4, 0x00010000, true);    // File version (1.0)
    view.setUint32(8, 1, true);             // Number of images (1)
    
    // Table of Contents entry
    view.setUint32(12, XCURSOR_IMAGE_TYPE, true); // Type (ARGB)
    view.setUint32(16, 32, true);                // Nominal size (32×32)
    view.setUint32(20, headerSize + TOC_SIZE, true); // Offset to image data
    
    // Image header
    const imageOffset = headerSize + TOC_SIZE;
    view.setUint32(imageOffset, imageHeaderSize + imageDataSize, true); // Total size of this image entry
    view.setUint32(imageOffset + 4, XCURSOR_IMAGE_TYPE, true);         // Type (ARGB)
    view.setUint32(imageOffset + 8, 32, true);                        // Nominal size
    view.setUint32(imageOffset + 12, 32, true);                       // Width
    view.setUint32(imageOffset + 16, 32, true);                       // Height
    view.setUint32(imageOffset + 20, 16, true);                       // Hotspot X
    view.setUint32(imageOffset + 24, 16, true);                       // Hotspot Y
    view.setUint32(imageOffset + 28, 0, true);                        // Delay (for animations, 0 for static)
    
    // Copy pixel data (converting RGBA to ARGB format)
    const pixelDataOffset = imageOffset + imageHeaderSize;
    
    for (let i = 0; i < imageDataSize / 4; i++) {
      const srcIdx = i * 4;
      const dstIdx = pixelDataOffset + i * 4;
      
      const a = data[srcIdx + 3]; // Alpha
      const r = Math.floor(data[srcIdx] * a / 255);     // Red (premultiplied)
      const g = Math.floor(data[srcIdx + 1] * a / 255); // Green (premultiplied)
      const b = Math.floor(data[srcIdx + 2] * a / 255); // Blue (premultiplied)
      
      view.setUint8(dstIdx, b);     // B
      view.setUint8(dstIdx + 1, g); // G
      view.setUint8(dstIdx + 2, r); // R
      view.setUint8(dstIdx + 3, a); // A
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

export { downloadCursorAsWin, downloadCursorAsLinux };