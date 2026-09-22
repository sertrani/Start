import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AuthImage({ path, alt, className, fallback = null }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    let objUrl = null;
    if (!path) {
      setUrl(null);
      return;
    }
    api
      .get(`/files/${path}`, { responseType: "blob" })
      .then((res) => {
        if (!active) return;
        objUrl = URL.createObjectURL(res.data);
        setUrl(objUrl);
      })
      .catch(() => active && setErr(true));
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [path]);

  if (err || !path) return fallback;
  if (!url) return <div className={`${className} bg-slate-100 animate-pulse`} />;
  return <img src={url} alt={alt} className={className} />;
}
