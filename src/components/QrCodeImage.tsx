import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeImageProps {
  value: string;
  size?: number;
  color?: string;
  bgColor?: string;
  alt?: string;
  className?: string;
}

export const generateQrDataUrl = async (
  value: string,
  size: number = 320,
  color: string = "#0f172a",
  bgColor: string = "#ffffff"
): Promise<string> => {
  return QRCode.toDataURL(value || " ", {
    width: size,
    margin: 1,
    color: {
      dark: color,
      light: bgColor,
    },
  });
};

export const downloadQrPng = async (
  value: string,
  fileName: string = "dof-qr-kod.png",
  size: number = 600,
  color: string = "#0f172a"
): Promise<boolean> => {
  try {
    const dataUrl = await generateQrDataUrl(value, size, color);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error("QR PNG download error:", err);
    return false;
  }
};

export const QrCodeImage: React.FC<QrCodeImageProps> = ({
  value,
  size = 320,
  color = "#0f172a",
  bgColor = "#ffffff",
  alt = "QR Kod",
  className = "",
}) => {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    generateQrDataUrl(value, size, color, bgColor)
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch((err) => {
        console.error("Local QR generation failed:", err);
      });
    return () => {
      active = false;
    };
  }, [value, size, color, bgColor]);

  if (!dataUrl) {
    return (
      <div
        className={`bg-slate-100 animate-pulse rounded-lg ${className}`}
        aria-label={alt}
      />
    );
  }

  return <img src={dataUrl} alt={alt} className={className} />;
};
