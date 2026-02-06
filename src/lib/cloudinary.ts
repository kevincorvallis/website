const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dvllhdgkf";

interface CloudinaryOptions {
  width?: number;
  height?: number;
  quality?: string;
  format?: string;
  crop?: string | false;
  gravity?: string;
}

export function getCloudinaryUrl(
  publicId: string,
  options: CloudinaryOptions = {}
): string {
  const transforms = [
    `q_${options.quality || "auto"}`,
    `f_${options.format || "auto"}`,
  ];

  if (options.width) transforms.push(`w_${options.width}`);
  if (options.height) transforms.push(`h_${options.height}`);

  if ((options.width || options.height) && options.crop !== false) {
    transforms.push(`c_${options.crop || "fill"}`);
    if (options.gravity) transforms.push(`g_${options.gravity}`);
  }

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transforms.join(",")}/${publicId}`;
}

export const PHOTO_CATEGORIES = [
  "portrait", "film", "travel", "candid", "street", "landscape",
] as const;

export const PHOTO_SECTIONS = [
  "hero", "featured", "gallery", "bento", "projects",
] as const;
