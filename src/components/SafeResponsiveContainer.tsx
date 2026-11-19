import React, { useEffect, useRef, useState } from "react";
import { ResponsiveContainer } from "recharts";

interface SafeResponsiveContainerProps {
  children: React.ReactElement;
  className?: string;
  minWidth?: number;
  minHeight?: number;
  aspect?: number;
}

export const SafeResponsiveContainer: React.FC<SafeResponsiveContainerProps> = ({
  children,
  className = "",
  minWidth = 1,
  minHeight = 1,
  aspect,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const nextWidth = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);

      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateSize();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const hasValidDimensions = size.width >= minWidth && size.height >= minHeight;

  return (
    <div ref={hostRef} className={`w-full h-full min-w-0 min-h-0 ${className}`}>
      {hasValidDimensions ? (
        <ResponsiveContainer
          width={size.width}
          height={size.height}
          initialDimension={size}
          minWidth={minWidth}
          minHeight={minHeight}
          aspect={aspect}
        >
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
};
