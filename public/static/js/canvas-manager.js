/**
 * Canvas Manager Module
 * Handles all canvas operations for the neuro.place application
 * Provides utilities for main grid, live view, and highlight rendering
 */

/**
 * @typedef {Object} CanvasConfig
 * @property {number} gridWidth - Grid width in pixels
 * @property {number} gridHeight - Grid height in pixels
 * @property {number} pixelSize - Size of each pixel in canvas units
 * @property {number} liveViewPixelSizeFactor - Scale factor for live view
 */

/**
 * @typedef {Object} CanvasElements
 * @property {HTMLCanvasElement} mainCanvas - Main grid canvas
 * @property {HTMLCanvasElement} highlightCanvas - Highlight overlay canvas
 * @property {HTMLCanvasElement} liveViewCanvas - Mini map canvas
 */

/**
 * @typedef {Object} ViewportState
 * @property {number} offsetX - X offset for panning
 * @property {number} offsetY - Y offset for panning
 * @property {number} scale - Zoom scale factor
 */

class CanvasManager {
	/**
	 * Create a canvas manager instance
	 * @param {CanvasElements} canvasElements - Canvas DOM elements
	 * @param {CanvasConfig} config - Configuration options
	 */
	constructor(canvasElements, config) {
		this.config = {
			gridWidth: 500,
			gridHeight: 500,
			pixelSize: 10,
			liveViewPixelSizeFactor: 2,
			...config,
		};

		// Canvas elements
		this.mainCanvas = canvasElements.mainCanvas;
		this.highlightCanvas = canvasElements.highlightCanvas;
		this.liveViewCanvas = canvasElements.liveViewCanvas;

		// Canvas contexts
		this.mainCtx = this.mainCanvas?.getContext("2d");
		this.highlightCtx = this.highlightCanvas?.getContext("2d");
		this.liveViewCtx = this.liveViewCanvas?.getContext("2d");

		// Offscreen canvas for performance
		this.offscreenCanvas = null;
		this.offscreenCtx = null;

		// Live view image data for efficient pixel manipulation
		this.liveViewImageData = null;
		this.liveViewPixelData = null;

		// Calculated dimensions
		this.liveViewCanvasWidth =
			this.config.gridWidth / this.config.liveViewPixelSizeFactor;
		this.liveViewCanvasHeight =
			this.config.gridHeight / this.config.liveViewPixelSizeFactor;

		this.init();
	}

	/**
	 * Initialize the canvas manager
	 * @private
	 */
	init() {
		this.setupCanvasProperties();
		this.createOffscreenCanvas();
		this.initLiveViewImageData();
		this.setCanvasSize();
		this.initializeEmptyGrid();
	}

	/**
	 * Setup canvas properties for crisp pixel rendering
	 * @private
	 */
	setupCanvasProperties() {
		const canvases = [
			this.mainCanvas,
			this.highlightCanvas,
			this.liveViewCanvas,
		].filter(Boolean);

		canvases.forEach((canvas) => {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.imageSmoothingEnabled = false;
				ctx.webkitImageSmoothingEnabled = false;
				ctx.mozImageSmoothingEnabled = false;
				ctx.msImageSmoothingEnabled = false;
			}
		});
	}

	/**
	 * Create offscreen canvas for performance optimization
	 * @private
	 */
	createOffscreenCanvas() {
		this.offscreenCanvas = document.createElement("canvas");
		this.offscreenCanvas.width = this.config.gridWidth * this.config.pixelSize;
		this.offscreenCanvas.height =
			this.config.gridHeight * this.config.pixelSize;
		this.offscreenCtx = this.offscreenCanvas.getContext("2d");

		if (this.offscreenCtx) {
			this.offscreenCtx.imageSmoothingEnabled = false;
		}
	}

	/**
	 * Initialize live view image data for efficient pixel manipulation
	 * @private
	 */
	initLiveViewImageData() {
		if (!this.liveViewCtx) return;

		this.liveViewImageData = this.liveViewCtx.createImageData(
			this.liveViewCanvasWidth,
			this.liveViewCanvasHeight,
		);
		this.liveViewPixelData = this.liveViewImageData.data;
	}

	/**
	 * Set canvas sizes based on container dimensions
	 */
	setCanvasSize() {
		const canvasContainer = document.querySelector(".canvas-container");

		if (canvasContainer && this.mainCanvas && this.highlightCanvas) {
			this.mainCanvas.width = canvasContainer.clientWidth;
			this.mainCanvas.height = canvasContainer.clientHeight;
			this.highlightCanvas.width = canvasContainer.clientWidth;
			this.highlightCanvas.height = canvasContainer.clientHeight;
		}

		if (this.liveViewCanvas) {
			this.liveViewCanvas.width = this.liveViewCanvasWidth;
			this.liveViewCanvas.height = this.liveViewCanvasHeight;
		}
	}

	/**
	 * Draw a single pixel to the offscreen canvas
	 * @param {number} x - Grid X coordinate
	 * @param {number} y - Grid Y coordinate
	 * @param {string} color - Hex color string
	 */
	drawPixelToOffscreen(x, y, color) {
		if (!this.offscreenCtx) {
			console.error("Offscreen canvas context not available for drawPixel.");
			return;
		}

		const pixelX = x * this.config.pixelSize;
		const pixelY = y * this.config.pixelSize;

		this.offscreenCtx.fillStyle = color;
		this.offscreenCtx.fillRect(
			pixelX,
			pixelY,
			this.config.pixelSize,
			this.config.pixelSize,
		);
	}

	/**
	 * Draw the complete grid to the offscreen canvas
	 * @param {Array<Array<string>>} grid - 2D array of hex color strings
	 */
	drawFullOffscreenGrid(grid) {
		if (!this.offscreenCtx || !this.offscreenCanvas) return;

		this.offscreenCtx.clearRect(
			0,
			0,
			this.offscreenCanvas.width,
			this.offscreenCanvas.height,
		);

		for (let y = 0; y < this.config.gridHeight; y++) {
			for (let x = 0; x < this.config.gridWidth; x++) {
				if (grid[y] && grid[y][x] !== undefined) {
					this.drawPixelToOffscreen(x, y, grid[y][x]);
				}
			}
		}

		console.log("Full grid drawn to offscreen canvas.");
	}

	/**
	 * Render the main grid canvas with viewport transformation
	 * @param {ViewportState} viewport - Current viewport state
	 */
	drawGrid(viewport) {
		if (!this.mainCtx || !this.offscreenCanvas) return;

		this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);

		this.mainCtx.save();

		// Apply viewport transformation
		this.mainCtx.translate(viewport.offsetX, viewport.offsetY);
		this.mainCtx.scale(viewport.scale, viewport.scale);

		this.mainCtx.drawImage(this.offscreenCanvas, 0, 0);

		this.mainCtx.restore();
	}

	/**
	 * Draw highlight overlay for selected pixel
	 * @param {ViewportState} viewport - Current viewport state
	 * @param {Object} selectedPixel - Selected pixel coordinates
	 * @param {number} selectedPixel.x - X coordinate
	 * @param {number} selectedPixel.y - Y coordinate
	 * @param {string} accentColor - Highlight color
	 */
	drawHighlight(viewport, selectedPixel, accentColor = "orange") {
		if (!this.highlightCtx) return;

		this.highlightCtx.clearRect(
			0,
			0,
			this.highlightCanvas.width,
			this.highlightCanvas.height,
		);

		if (selectedPixel.x !== null && selectedPixel.y !== null) {
			this.highlightCtx.save();

			// Apply same transformation as main canvas
			this.highlightCtx.translate(viewport.offsetX, viewport.offsetY);
			this.highlightCtx.scale(viewport.scale, viewport.scale);

			this.highlightCtx.strokeStyle = accentColor;
			this.highlightCtx.lineWidth = 3 / viewport.scale;
			this.highlightCtx.strokeRect(
				selectedPixel.x * this.config.pixelSize,
				selectedPixel.y * this.config.pixelSize,
				this.config.pixelSize,
				this.config.pixelSize,
			);

			this.highlightCtx.restore();
		}
	}

	/**
	 * Draw the live view minimap
	 * @param {Array<Array<string>>} grid - 2D array of hex color strings
	 */
	drawLiveViewGrid(grid) {
		if (!this.liveViewCtx || !this.liveViewPixelData) {
			console.error("Live View Canvas Context or ImageData not available.");
			return;
		}

		for (let y = 0; y < this.config.gridHeight; y++) {
			for (let x = 0; x < this.config.gridWidth; x++) {
				const color =
					grid[y] && grid[y][x] !== undefined ? grid[y][x] : "#000000";
				const [r, g, b, a] = this.hexToRgba(color);

				const targetX = Math.floor(x / this.config.liveViewPixelSizeFactor);
				const targetY = Math.floor(y / this.config.liveViewPixelSizeFactor);

				const imageDataIndex =
					(targetY * this.liveViewCanvasWidth + targetX) * 4;

				if (
					imageDataIndex >= 0 &&
					imageDataIndex + 3 < this.liveViewPixelData.length
				) {
					this.liveViewPixelData[imageDataIndex] = r;
					this.liveViewPixelData[imageDataIndex + 1] = g;
					this.liveViewPixelData[imageDataIndex + 2] = b;
					this.liveViewPixelData[imageDataIndex + 3] = a;
				}
			}
		}

		this.liveViewCtx.putImageData(this.liveViewImageData, 0, 0);
	}

	/**
	 * Redraw all canvases
	 * @param {Array<Array<string>>} grid - Grid data
	 * @param {ViewportState} viewport - Viewport state
	 * @param {Object} selectedPixel - Selected pixel
	 * @param {string} accentColor - Highlight color
	 */
	redrawAll(grid, viewport, selectedPixel, accentColor) {
		if (grid && grid.length > 0) {
			this.drawGrid(viewport);
			this.drawLiveViewGrid(grid);
		}
		this.drawHighlight(viewport, selectedPixel, accentColor);
	}

	/**
	 * Convert hex color to RGBA array
	 * @param {string} hex - Hex color string
	 * @returns {number[]} - RGBA array [r, g, b, a]
	 */
	hexToRgba(hex) {
		const bigint = parseInt(hex.slice(1), 16);
		const r = (bigint >> 16) & 255;
		const g = (bigint >> 8) & 255;
		const b = bigint & 255;
		return [r, g, b, 255];
	}

	/**
	 * Convert RGB to hex color
	 * @param {string|Array|number[]} rgb - RGB input in various formats
	 * @returns {string} - Hex color string
	 */
	rgbToHex(rgb) {
		if (typeof rgb === "string" && rgb.startsWith("#")) {
			return rgb;
		}

		if (Array.isArray(rgb)) {
			const [r, g, b] = rgb;
			return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
		}

		if (
			typeof rgb === "string" &&
			(rgb.startsWith("rgb(") || rgb.startsWith("rgba("))
		) {
			const values = rgb.match(/\d+/g).map(Number);
			const [r, g, b] = values;
			return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
		}

		return "#000000";
	}

	/**
	 * Convert canvas coordinates to grid coordinates
	 * @param {number} canvasX - Canvas X coordinate
	 * @param {number} canvasY - Canvas Y coordinate
	 * @param {ViewportState} viewport - Current viewport state
	 * @returns {Object} - Grid coordinates {x, y}
	 */
	canvasToGrid(canvasX, canvasY, viewport) {
		const gridX = Math.floor(
			(canvasX - viewport.offsetX) / (this.config.pixelSize * viewport.scale),
		);
		const gridY = Math.floor(
			(canvasY - viewport.offsetY) / (this.config.pixelSize * viewport.scale),
		);

		return {
			x: Math.max(0, Math.min(this.config.gridWidth - 1, gridX)),
			y: Math.max(0, Math.min(this.config.gridHeight - 1, gridY)),
		};
	}

	/**
	 * Convert grid coordinates to canvas coordinates
	 * @param {number} gridX - Grid X coordinate
	 * @param {number} gridY - Grid Y coordinate
	 * @param {ViewportState} viewport - Current viewport state
	 * @returns {Object} - Canvas coordinates {x, y}
	 */
	gridToCanvas(gridX, gridY, viewport) {
		const canvasX =
			gridX * this.config.pixelSize * viewport.scale + viewport.offsetX;
		const canvasY =
			gridY * this.config.pixelSize * viewport.scale + viewport.offsetY;

		return { x: canvasX, y: canvasY };
	}

	/**
	 * Check if coordinates are within grid bounds
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @returns {boolean} - Whether coordinates are valid
	 */
	isValidCoordinate(x, y) {
		return (
			x >= 0 &&
			x < this.config.gridWidth &&
			y >= 0 &&
			y < this.config.gridHeight
		);
	}

	/**
	 * Get pixel color at grid coordinates
	 * @param {Array<Array<string>>} grid - Grid data
	 * @param {number} x - Grid X coordinate
	 * @param {number} y - Grid Y coordinate
	 * @returns {string} - Hex color string
	 */
	getPixelColor(grid, x, y) {
		if (!this.isValidCoordinate(x, y) || !grid[y] || grid[y][x] === undefined) {
			return "#000000";
		}
		return grid[y][x];
	}

	/**
	 * Handle canvas resize
	 */
	handleResize() {
		this.setCanvasSize();
		this.initLiveViewImageData();
	}

	/**
	 * Clear all canvases
	 */
	clearAll() {
		if (this.mainCtx) {
			this.mainCtx.clearRect(
				0,
				0,
				this.mainCanvas.width,
				this.mainCanvas.height,
			);
		}
		if (this.highlightCtx) {
			this.highlightCtx.clearRect(
				0,
				0,
				this.highlightCanvas.width,
				this.highlightCanvas.height,
			);
		}
		if (this.liveViewCtx) {
			this.liveViewCtx.clearRect(
				0,
				0,
				this.liveViewCanvas.width,
				this.liveViewCanvas.height,
			);
		}
		if (this.offscreenCtx) {
			this.offscreenCtx.clearRect(
				0,
				0,
				this.offscreenCanvas.width,
				this.offscreenCanvas.height,
			);
		}
	}

	/**
	 * Initialize canvas with white background for empty grid
	 */
	initializeEmptyGrid() {
		if (this.offscreenCtx) {
			this.offscreenCtx.fillStyle = "#ffffff";
			this.offscreenCtx.fillRect(
				0,
				0,
				this.offscreenCanvas.width,
				this.offscreenCanvas.height,
			);
		}

		if (this.liveViewCtx) {
			this.liveViewCtx.fillStyle = "#ffffff";
			this.liveViewCtx.fillRect(
				0,
				0,
				this.liveViewCanvas.width,
				this.liveViewCanvas.height,
			);
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose() {
		this.clearAll();
		this.offscreenCanvas = null;
		this.offscreenCtx = null;
		this.liveViewImageData = null;
		this.liveViewPixelData = null;
	}
}

/**
 * Factory function to create a canvas manager instance
 * @param {CanvasElements} canvasElements - Canvas DOM elements
 * @param {CanvasConfig} config - Configuration options
 * @returns {CanvasManager} - Canvas manager instance
 */
export function createCanvasManager(canvasElements, config) {
	return new CanvasManager(canvasElements, config);
}

export default CanvasManager;
