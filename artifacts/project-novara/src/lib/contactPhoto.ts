/** Edge length of a stored contact photo. Avatars show at most ~96 px, so 192
 *  is sharp on a 2x screen and keeps each photo around 10-20 KB. */
const SIZE = 192;

/**
 * Turns a picked image into the small square JPEG Novara stores: centre
 * cropped, rotated upright from the camera's orientation tag, and re-encoded
 * so a phone photo of several MB becomes a few KB. Returns a data URL.
 */
export async function squarePhotoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}
