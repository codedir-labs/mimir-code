'use client';

import React, { useEffect, useRef, useState } from 'react';

interface GameOfLifeBackgroundProps {
  cellSize?: number;
  speed?: number;
  opacity?: number;
  density?: number;
}

// Pool of hacker-style ASCII characters for cells
const CORE_CHARS = [
  '#', '@', '$', '%', '&', '*',
  '0', '1', 'X', 'O',
];

const EDGE_CHARS = [
  '.', ',', ':', ';', '-', '_',
  '`', "'", '~', '^',
];

const ALL_CHARS = [
  '?', '<', '>', ';', '!', '@', '#', '$', '%', '^', '&', '*',
  '(', ')', '-', '+', '=', '|', '\\', '/', '~', '`',
  '[', ']', '{', '}', '_', '.', ',', ':',
  '0', '1', 'x', 'X', 'o', 'O',
];

// Detect if dark mode is active by checking both class and media query
const detectDarkMode = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Check for dark class on html or body element (Next.js/Nextra pattern)
  const htmlDark = document.documentElement.classList.contains('dark');
  const bodyDark = document.body.classList.contains('dark');

  // Check data-theme attribute (alternative pattern)
  const dataTheme = document.documentElement.getAttribute('data-theme');
  const dataThemeDark = dataTheme === 'dark';

  // Check prefers-color-scheme as fallback
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const isDark = htmlDark || bodyDark || dataThemeDark || prefersDark;

  console.log('[GameOfLife] Dark mode detection:', {
    htmlDark,
    bodyDark,
    dataThemeDark,
    prefersDark,
    result: isDark
  });

  return isDark;
};

export function GameOfLifeBackground({
  cellSize = 16,
  speed = 150,
  opacity = 0.7,
  density = 0.3,
}: GameOfLifeBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);

  // Track theme state to force re-renders
  const [isDarkMode, setIsDarkMode] = useState(() => detectDarkMode());

  // Watch for theme changes
  useEffect(() => {
    const updateTheme = () => {
      const newDarkMode = detectDarkMode();
      console.log('[GameOfLife] Theme update:', newDarkMode);
      setIsDarkMode(newDarkMode);
    };

    // Watch for class changes on html element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')
        ) {
          updateTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    // Also watch for prefers-color-scheme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => updateTheme();
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let grid: boolean[][] = [];
    let previousGrid: boolean[][] = [];
    let charGrid: string[][] = []; // Store character for each cell
    let cols = 0;
    let rows = 0;
    let generationCount = 0;

    // Detect theme and set color - use state to ensure re-render
    // Dark mode: very subtle gray (#777777) for ambient appearance
    // Light mode: very subtle gray (#777777) for ambient appearance
    const cellColor = isDarkMode ? '#777777' : '#777777';

    console.log('[GameOfLife] Rendering with:', { isDarkMode, cellColor, opacity });

    // Track cursor position
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      cursorPosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      cursorPosRef.current = null;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Initialize grid
    const initializeGrid = () => {
      cols = Math.floor(canvas.width / cellSize);
      rows = Math.floor(canvas.height / cellSize);

      grid = [];
      previousGrid = [];
      charGrid = [];

      // Create empty grid
      for (let i = 0; i < rows; i++) {
        grid[i] = [];
        previousGrid[i] = [];
        charGrid[i] = [];
        for (let j = 0; j < cols; j++) {
          grid[i][j] = false;
          previousGrid[i][j] = false;
          charGrid[i][j] = '';
        }
      }

      // Add random noise
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (Math.random() < density) {
            grid[i][j] = true;
            charGrid[i][j] = ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];
          }
        }
      }

      // Add classic Game of Life patterns
      addPatterns();
    };

    // Add various Game of Life patterns
    const addPatterns = () => {
      // Glider pattern
      const addGlider = (startRow: number, startCol: number) => {
        const pattern = [
          [0, 1, 0],
          [0, 0, 1],
          [1, 1, 1]
        ];
        applyPattern(pattern, startRow, startCol);
      };

      // Blinker pattern
      const addBlinker = (startRow: number, startCol: number) => {
        const pattern = [[1, 1, 1]];
        applyPattern(pattern, startRow, startCol);
      };

      // Toad pattern
      const addToad = (startRow: number, startCol: number) => {
        const pattern = [
          [0, 1, 1, 1],
          [1, 1, 1, 0]
        ];
        applyPattern(pattern, startRow, startCol);
      };

      // Beacon pattern
      const addBeacon = (startRow: number, startCol: number) => {
        const pattern = [
          [1, 1, 0, 0],
          [1, 1, 0, 0],
          [0, 0, 1, 1],
          [0, 0, 1, 1]
        ];
        applyPattern(pattern, startRow, startCol);
      };

      // Add multiple patterns across the canvas
      const patternCount = Math.floor((rows * cols) / 500);
      for (let i = 0; i < patternCount; i++) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);
        const patternType = Math.floor(Math.random() * 4);

        switch (patternType) {
          case 0: addGlider(r, c); break;
          case 1: addBlinker(r, c); break;
          case 2: addToad(r, c); break;
          case 3: addBeacon(r, c); break;
        }
      }
    };

    const applyPattern = (pattern: number[][], startRow: number, startCol: number) => {
      for (let i = 0; i < pattern.length; i++) {
        for (let j = 0; j < pattern[i].length; j++) {
          const row = startRow + i;
          const col = startCol + j;
          // Don't wrap around - only apply if within bounds
          if (row >= 0 && row < rows && col >= 0 && col < cols) {
            if (pattern[i][j] === 1) {
              grid[row][col] = true;
              charGrid[row][col] = ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];
            }
          }
        }
      }
    };

    // Count alive cells
    const countAliveCells = (): number => {
      let count = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (grid[i][j]) count++;
        }
      }
      return count;
    };

    // Spawn new patterns if grid is too empty
    const checkAndSpawnPatterns = () => {
      const aliveCount = countAliveCells();
      const totalCells = rows * cols;
      const aliveRatio = aliveCount / totalCells;

      // If less than 12% of cells are alive, spawn new patterns
      if (aliveRatio < 0.12) {
        addPatterns();
      }
    };

    // Count alive neighbors
    const countNeighbors = (row: number, col: number): number => {
      let count = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          const newRow = row + i;
          const newCol = col + j;
          // Use bounded edges instead of wrapping
          if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
            if (grid[newRow][newCol]) count++;
          }
        }
      }
      return count;
    };

    // Check if cell is at edge of a shape (has fewer neighbors)
    const isEdgeCell = (row: number, col: number): boolean => {
      if (!grid[row][col]) return false;
      const neighbors = countNeighbors(row, col);
      // If cell has 3 or fewer neighbors, it's at the edge
      return neighbors <= 3;
    };

    // Calculate displacement for a cell based on cursor position
    const getCellDisplacement = (row: number, col: number): { dRow: number; dCol: number } => {
      if (!cursorPosRef.current) {
        return { dRow: 0, dCol: 0 };
      }

      const { x, y } = cursorPosRef.current;
      const cursorCol = x / cellSize;
      const cursorRow = y / cellSize;
      const repulsionRadius = 4; // Radius in cells

      const dx = col - cursorCol;
      const dy = row - cursorRow;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < repulsionRadius && distance > 0) {
        // Calculate push direction (away from cursor)
        // Use stronger push strength for gradual movement
        const pushStrength = (1 - distance / repulsionRadius);

        // Normalize direction
        const dirX = dx / distance;
        const dirY = dy / distance;

        // Calculate displacement (in cells) - gradual push
        const displacementAmount = pushStrength * 1.5;

        return {
          dRow: dirY * displacementAmount,
          dCol: dirX * displacementAmount
        };
      }

      return { dRow: 0, dCol: 0 };
    };

    // Next generation
    const nextGeneration = () => {
      // Save current grid state
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          previousGrid[i][j] = grid[i][j];
        }
      }

      const newGrid: boolean[][] = [];
      const newCharGrid: string[][] = [];

      // Initialize new grids
      for (let i = 0; i < rows; i++) {
        newGrid[i] = [];
        newCharGrid[i] = [];
        for (let j = 0; j < cols; j++) {
          newGrid[i][j] = false;
          newCharGrid[i][j] = '';
        }
      }

      // Apply Conway's rules with displacement
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const neighbors = countNeighbors(i, j);
          const isAlive = grid[i][j];

          // Standard Conway's rules
          let willLive = false;
          if (isAlive) {
            willLive = neighbors === 2 || neighbors === 3;
          } else {
            willLive = neighbors === 3;
          }

          if (willLive) {
            // Calculate displacement due to cursor
            const { dRow, dCol } = getCellDisplacement(i, j);

            // Target position after displacement (can be fractional)
            let targetRow = i + dRow;
            let targetCol = j + dCol;

            // Keep within bounds
            targetRow = Math.max(0, Math.min(rows - 1, targetRow));
            targetCol = Math.max(0, Math.min(cols - 1, targetCol));

            // Round to nearest cell
            const finalRow = Math.round(targetRow);
            const finalCol = Math.round(targetCol);

            // If target position is occupied, try to find nearby empty cell
            if (newGrid[finalRow][finalCol]) {
              // Try nearby cells in a spiral pattern
              let found = false;
              for (let radius = 1; radius <= 3 && !found; radius++) {
                for (let dr = -radius; dr <= radius && !found; dr++) {
                  for (let dc = -radius; dc <= radius && !found; dc++) {
                    const nr = finalRow + dr;
                    const nc = finalCol + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !newGrid[nr][nc]) {
                      newGrid[nr][nc] = true;
                      // Keep character if moving existing cell
                      if (isAlive) {
                        newCharGrid[nr][nc] = charGrid[i][j];
                      } else {
                        newCharGrid[nr][nc] = ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];
                      }
                      found = true;
                    }
                  }
                }
              }
              // If still no space found, keep cell at original position
              if (!found) {
                newGrid[i][j] = true;
                if (isAlive) {
                  newCharGrid[i][j] = charGrid[i][j];
                } else {
                  newCharGrid[i][j] = ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];
                }
              }
            } else {
              // Place cell at target position
              newGrid[finalRow][finalCol] = true;

              // Keep character if moving existing cell, assign new if born
              if (isAlive) {
                newCharGrid[finalRow][finalCol] = charGrid[i][j];
              } else {
                newCharGrid[finalRow][finalCol] = ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)];
              }
            }
          }
        }
      }

      grid = newGrid;
      charGrid = newCharGrid;
      generationCount++;

      // Check if we need to spawn new patterns every 30 generations
      if (generationCount % 30 === 0) {
        checkAndSpawnPatterns();
      }
    };

    // Render with smooth fade effect
    const render = (progress: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const baseFontSize = Math.floor(cellSize * 0.75);
      const smallFontSize = Math.floor(cellSize * 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Render game of life cells first
      ctx.fillStyle = cellColor;

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const isAlive = grid[i][j];
          const wasAlive = previousGrid[i][j];

          if (isAlive || wasAlive) {
            let alpha = 1;

            // Smooth fade in/out ONLY for state changes
            if (isAlive && !wasAlive) {
              // Fading in - newly born cell
              alpha = progress;
            } else if (!isAlive && wasAlive) {
              // Fading out - dying cell
              alpha = 1 - progress;
            }
            // If isAlive && wasAlive: alpha stays 1 (no fade, stable)

            if (alpha > 0) {
              ctx.save();
              ctx.globalAlpha = alpha;

              // Use stored character (doesn't change randomly)
              const char = charGrid[i][j];

              // Use smaller font for edge cells in larger shapes
              const isEdge = isEdgeCell(i, j);
              const neighbors = countNeighbors(i, j);
              const isLargeShape = neighbors >= 4;

              if (isEdge && isLargeShape) {
                ctx.font = `${smallFontSize}px monospace`;
              } else {
                ctx.font = `${baseFontSize}px monospace`;
              }

              const x = j * cellSize + cellSize / 2;
              const y = i * cellSize + cellSize / 2;
              ctx.fillText(char, x, y);

              ctx.restore();
            }
          }
        }
      }

      // Render cursor radius indicator AFTER cells (on top)
      if (cursorPosRef.current) {
        const { x, y } = cursorPosRef.current;
        const cursorCol = Math.floor(x / cellSize);
        const cursorRow = Math.floor(y / cellSize);
        const repulsionRadius = 4;

        ctx.fillStyle = cellColor;
        ctx.font = `${baseFontSize}px monospace`;

        // Draw circle of # characters with higher opacity to be visible
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const dx = j - cursorCol;
            const dy = i - cursorRow;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= repulsionRadius) {
              // Only draw if cell is not occupied
              if (!grid[i][j]) {
                ctx.save();
                ctx.globalAlpha = 0.3; // More visible but still dim

                const cellX = j * cellSize + cellSize / 2;
                const cellY = i * cellSize + cellSize / 2;
                ctx.fillText('#', cellX, cellY);

                ctx.restore();
              }
            }
          }
        }
      }
    };

    // Animation loop with smooth transitions
    let lastUpdate = 0;
    let transitionProgress = 0;

    const animate = (timestamp: number) => {
      animationId = requestAnimationFrame(animate);

      const elapsed = timestamp - lastUpdate;

      if (elapsed >= speed) {
        // Move to next generation
        nextGeneration();
        lastUpdate = timestamp;
        transitionProgress = 0;
      } else {
        // Calculate transition progress (0 to 1)
        transitionProgress = Math.min(elapsed / speed, 1);
      }

      render(transitionProgress);
    };

    // Resize handler
    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const parentRect = parent.getBoundingClientRect();
      canvas.width = parentRect.width;
      canvas.height = parentRect.height;

      initializeGrid();
      render(1);
    };

    // Use ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    // Initial setup
    handleResize();
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [cellSize, speed, opacity, density, isDarkMode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity, pointerEvents: 'auto' }}
      aria-hidden="true"
      data-testid="game-of-life-canvas"
    />
  );
}
