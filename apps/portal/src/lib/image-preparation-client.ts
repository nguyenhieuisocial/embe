type ImagePreparationOptions = {
  filename: string;
  maxBytes: number;
  maxDimension: number;
  quality: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("invalid_image")); };
    image.src = url;
  });
}

export async function prepareImageForUpload(file: File, options: ImagePreparationOptions): Promise<File> {
  if ((file.type && !file.type.startsWith("image/")) || file.size < 1) throw new Error("invalid_image");
  const image = await loadImage(file);
  const scale = Math.min(1, options.maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("invalid_image");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", options.quality));
  if (!blob || blob.size > options.maxBytes) throw new Error("image_too_large");
  return new File([blob], options.filename, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
}
