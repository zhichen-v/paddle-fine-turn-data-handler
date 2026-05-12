import { useEffect, useState } from "react";

export function useImageElement(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }

    let active = true;
    const element = new Image();
    element.onload = () => {
      if (active) {
        setImage(element);
        setFailed(false);
      }
    };
    element.onerror = () => {
      if (active) {
        setImage(null);
        setFailed(true);
      }
    };
    element.src = url;

    return () => {
      active = false;
    };
  }, [url]);

  return { image, failed };
}
