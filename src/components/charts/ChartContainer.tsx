import { useRef, useState, useEffect, ReactElement, cloneElement } from 'react';

interface ChartContainerProps {
  children: ReactElement;
  minHeight?: number;
  className?: string;
}

/**
 * A container that measures its own dimensions and passes explicit width/height
 * to chart components, avoiding ResponsiveContainer issues on some desktop browsers.
 */
export function ChartContainer({ children, minHeight = 300, className }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
        setIsReady(true);
      }
    };

    // Initial measurement after a small delay to ensure layout is complete
    const timeoutId = setTimeout(updateDimensions, 50);
    
    // Use ResizeObserver for subsequent updates
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
          setIsReady(true);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={className}
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight,
        position: 'relative'
      }}
    >
      {isReady && dimensions.width > 0 && dimensions.height > 0 ? (
        cloneElement(children, {
          width: dimensions.width,
          height: dimensions.height,
        })
      ) : (
        <div 
          className="flex items-center justify-center" 
          style={{ width: '100%', height: minHeight }}
        >
          <div className="text-muted-foreground text-sm">Loading chart...</div>
        </div>
      )}
    </div>
  );
}
