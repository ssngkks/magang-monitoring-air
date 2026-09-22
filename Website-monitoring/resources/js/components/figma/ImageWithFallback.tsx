import { useState } from "react";

export function ImageWithFallback({
  src,
  alt,
  fallback = "https://via.placeholder.com/400x300?text=No+Image",
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { fallback?: string }) {
  const [imgSrc, setImgSrc] = useState(src);
  return (
    <img
      {...props}
      src={imgSrc}
      alt={alt}
      onError={() => setImgSrc(fallback)}
      loading="lazy"
    />
  );
}
