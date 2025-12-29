import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

/**
 * Custom hook for reactive terminal dimensions
 *
 * Unlike useStdout() which provides static dimensions,
 * this hook ensures component re-renders when terminal is resized.
 *
 * @returns {width: number, height: number} - Current terminal dimensions
 */
export const useTerminalSize = (): { width: number; height: number } => {
  const { stdout } = useStdout();

  // Initialize with current dimensions or fallback to 80x24
  const [dimensions, setDimensions] = useState({
    width: stdout?.columns || 80,
    height: stdout?.rows || 24,
  });

  useEffect(() => {
    if (!stdout) return;

    // Handler for terminal resize events (SIGWINCH)
    const handleResize = () => {
      setDimensions({
        width: stdout.columns || 80,
        height: stdout.rows || 24,
      });
    };

    // Listen for resize events
    // Ink automatically handles SIGWINCH and emits 'resize' on stdout
    stdout.on('resize', handleResize);

    // Update dimensions immediately in case they changed before listener was attached
    handleResize();

    // Cleanup listener on unmount
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return dimensions;
};
