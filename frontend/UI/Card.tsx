
import type { CSSProperties, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
};

export function Card({
  children,
  width = "100%",
  height = "auto",
  className = "",
}: CardProps) {
  return (
    <div
      style={{ width, height }}
      className={`box-border max-w-full rounded-xl bg-white p-6 shadow-[0px_4px_24px_rgba(0,0,0,0.02)] ${className}`}
    >
      {children}
    </div>
  );
}
