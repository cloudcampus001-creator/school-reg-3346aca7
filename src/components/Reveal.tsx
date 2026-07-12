import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
  y?: number;
};

/** Fade + slide-up on viewport enter. Respects prefers-reduced-motion. */
export function Reveal({ children, delay = 0, as = "div", className = "", style, y = 16 }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const Tag = as as any;

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as any}
      className={className}
      style={{
        transform: shown ? "translate3d(0,0,0)" : `translate3d(0, ${y}px, 0)`,
        opacity: shown ? 1 : 0,
        transition: `opacity 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        willChange: "opacity, transform",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/** Stagger children by wrapping each in a Reveal with incrementing delay. */
export function RevealStagger({
  children,
  step = 80,
  initial = 0,
  className,
}: { children: ReactNode[]; step?: number; initial?: number; className?: string }) {
  return (
    <>
      {children.map((child, i) => (
        <Reveal key={i} delay={initial + i * step} className={className}>{child}</Reveal>
      ))}
    </>
  );
}
