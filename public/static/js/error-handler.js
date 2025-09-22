/**
 * Error Handler Module
 * Provides consistent error handling patterns and user feedback
 * Consolidates error display and logging functionality
 */

/**
 * @typedef {Object} ErrorConfig
 * @property {number} defaultTimeout - Default timeout for error messages (ms)
 * @property {boolean} logToConsole - Whether to log errors to console
 * @property {string} errorPrefix - Prefix for console log messages
 */

/**
 * @typedef {Object} ToastOptions
 * @property {number} timeout - How long to show the toast (ms)
 * @property {string} type - Type of toast ('error', 'warning', 'success', 'info')
 * @property {boolean} persistent - Whether toast should stay until manually dismissed
 * @property {Function} onDismiss - Callback when toast is dismissed
 */

class ErrorHandler {
	/**
	 * Create an error handler instance
	 * @param {ErrorConfig} config - Configuration options
	 */
	constructor(config = {}) {
		this.config = {
			defaultTimeout: 5000,
			logToConsole: true,
			errorPrefix: "NeuroPlace",
			...config,
		};

		this.toasts = new Map();
		this.errorCounts = new Map();
		this.lastErrors = new Map();
	}

	/**
	 * Show an error message to the user
	 * @param {string} message - Error message to display
	 * @param {ToastOptions} options - Toast display options
	 * @returns {string} - Toast ID
	 */
	showError(message, options = {}) {
		return this.showToast(message, { type: "error", ...options });
	}

	/**
	 * Show a warning message to the user
	 * @param {string} message - Warning message to display
	 * @param {ToastOptions} options - Toast display options
	 * @returns {string} - Toast ID
	 */
	showWarning(message, options = {}) {
		return this.showToast(message, { type: "warning", ...options });
	}

	/**
	 * Show a success message to the user
	 * @param {string} message - Success message to display
	 * @param {ToastOptions} options - Toast display options
	 * @returns {string} - Toast ID
	 */
	showSuccess(message, options = {}) {
		return this.showToast(message, { type: "success", ...options });
	}

	/**
	 * Show an info message to the user
	 * @param {string} message - Info message to display
	 * @param {ToastOptions} options - Toast display options
	 * @returns {string} - Toast ID
	 */
	showInfo(message, options = {}) {
		return this.showToast(message, { type: "info", ...options });
	}

	/**
	 * Show a pixel-specific error (for rate limiting, placement errors, etc.)
	 * @param {string} message - Error message
	 * @param {ToastOptions} options - Additional options
	 * @returns {string} - Toast ID
	 */
	showPixelError(message, options = {}) {
		return this.showToast(message, {
			type: "error",
			timeout: 3000,
			id: "pixel-error-toast",
			...options,
		});
	}

	/**
	 * Show a generic toast notification
	 * @param {string} message - Message to display
	 * @param {ToastOptions} options - Toast options
	 * @returns {string} - Toast ID
	 */
	showToast(message, options = {}) {
		const opts = {
			timeout: this.config.defaultTimeout,
			type: "info",
			persistent: false,
			id: null,
			onDismiss: null,
			...options,
		};

		// Generate unique ID if not provided
		const toastId =
			opts.id ||
			`toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Check for duplicate recent errors
		if (this.isDuplicateError(message, opts.type)) {
			return toastId;
		}

		// Remove existing toast if replacing
		if (this.toasts.has(toastId)) {
			this.dismissToast(toastId);
		}

		const toast = this.createToast(toastId, message, opts);
		this.toasts.set(toastId, toast);

		// Add to DOM
		document.body.appendChild(toast.element);

		// Show with animation
		requestAnimationFrame(() => {
			toast.element.classList.add("show");
		});

		// Auto-dismiss if not persistent
		if (!opts.persistent && opts.timeout > 0) {
			toast.timeoutId = setTimeout(() => {
				this.dismissToast(toastId);
			}, opts.timeout);
		}

		// Track error for duplicate detection
		this.trackError(message, opts.type);

		return toastId;
	}

	/**
	 * Create a toast element
	 * @private
	 * @param {string} id - Toast ID
	 * @param {string} message - Message content
	 * @param {ToastOptions} options - Toast options
	 * @returns {Object} - Toast object
	 */
	createToast(id, message, options) {
		const element = document.createElement("div");
		element.id = id;
		element.className = `error-toast ${options.type}-toast`;
		element.textContent = message;

		// Add close button for persistent toasts
		if (options.persistent) {
			const closeBtn = document.createElement("button");
			closeBtn.className = "toast-close-btn";
			closeBtn.innerHTML = "×";
			closeBtn.setAttribute("aria-label", "Close notification");
			closeBtn.addEventListener("click", () => this.dismissToast(id));
			element.appendChild(closeBtn);
		}

		// Add click to dismiss for non-persistent toasts
		if (!options.persistent) {
			element.addEventListener("click", () => this.dismissToast(id));
			element.style.cursor = "pointer";
		}

		return {
			element,
			id,
			message,
			options,
			timeoutId: null,
			createdAt: Date.now(),
		};
	}

	/**
	 * Dismiss a toast by ID
	 * @param {string} toastId - Toast ID to dismiss
	 */
	dismissToast(toastId) {
		const toast = this.toasts.get(toastId);
		if (!toast) return;

		// Clear timeout if exists
		if (toast.timeoutId) {
			clearTimeout(toast.timeoutId);
		}

		// Remove with animation
		toast.element.classList.remove("show");

		setTimeout(() => {
			if (toast.element.parentNode) {
				toast.element.parentNode.removeChild(toast.element);
			}
			this.toasts.delete(toastId);

			// Call dismiss callback
			if (toast.options.onDismiss) {
				toast.options.onDismiss(toastId);
			}
		}, 300); // Match CSS transition duration
	}

	/**
	 * Dismiss all toasts
	 */
	dismissAll() {
		for (const toastId of this.toasts.keys()) {
			this.dismissToast(toastId);
		}
	}

	/**
	 * Check if an error is a duplicate of recent errors
	 * @private
	 * @param {string} message - Error message
	 * @param {string} type - Error type
	 * @returns {boolean} - Whether this is a duplicate
	 */
	isDuplicateError(message, type) {
		const key = `${type}:${message}`;
		const now = Date.now();
		const lastTime = this.lastErrors.get(key) || 0;

		// Consider duplicates if within 2 seconds
		return now - lastTime < 2000;
	}

	/**
	 * Track error for duplicate detection
	 * @private
	 * @param {string} message - Error message
	 * @param {string} type - Error type
	 */
	trackError(message, type) {
		const key = `${type}:${message}`;
		const now = Date.now();

		this.lastErrors.set(key, now);
		this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

		// Clean up old entries (older than 10 minutes)
		for (const [errorKey, timestamp] of this.lastErrors.entries()) {
			if (now - timestamp > 600000) {
				this.lastErrors.delete(errorKey);
				this.errorCounts.delete(errorKey);
			}
		}
	}

	/**
	 * Handle JavaScript errors and network errors
	 * @param {Error|Event} error - Error object or error event
	 * @param {Object} context - Additional context information
	 */
	handleError(error, context = {}) {
		let message = "An unexpected error occurred";
		let details = "";

		if (error instanceof Error) {
			message = error.message || message;
			details = error.stack || "";
		} else if (error.type === "error" && error.target) {
			// Network or resource loading error
			message = `Failed to load resource: ${error.target.src || error.target.href || "unknown"}`;
		} else if (typeof error === "string") {
			message = error;
		}

		// Log to console if enabled
		if (this.config.logToConsole) {
			console.error(`${this.config.errorPrefix}: ${message}`, {
				error,
				context,
				details,
				timestamp: new Date().toISOString(),
			});
		}

		// Show user-friendly error based on context
		if (context.showToUser !== false) {
			this.showError(this.getUserFriendlyMessage(message, context), {
				timeout: context.timeout || this.config.defaultTimeout,
			});
		}

		// Report to error tracking service if configured
		this.reportError(error, context);
	}

	/**
	 * Get user-friendly error message
	 * @private
	 * @param {string} message - Original error message
	 * @param {Object} context - Error context
	 * @returns {string} - User-friendly message
	 */
	getUserFriendlyMessage(message, context) {
		// Map technical errors to user-friendly messages
		const friendlyMessages = {
			NetworkError:
				"Connection problem. Please check your internet connection.",
			"Failed to fetch": "Unable to connect to server. Please try again.",
			"WebSocket connection failed":
				"Real-time connection lost. Attempting to reconnect...",
			"Canvas context not available":
				"Graphics initialization failed. Please refresh the page.",
			"Authentication failed": "Login session expired. Please log in again.",
			"Rate limited":
				"You are performing actions too quickly. Please slow down.",
			"Invalid coordinates": "Invalid pixel location selected.",
			"Color validation failed": "Invalid color selected.",
		};

		// Check for known error patterns
		for (const [pattern, friendlyMsg] of Object.entries(friendlyMessages)) {
			if (message.includes(pattern)) {
				return friendlyMsg;
			}
		}

		// Context-specific messages
		if (context.type === "websocket") {
			return "Connection issue detected. Attempting to reconnect...";
		}

		if (context.type === "pixel") {
			return "Failed to place pixel. Please try again.";
		}

		if (context.type === "auth") {
			return "Authentication error. Please log in again.";
		}

		// Return original message if no friendly alternative found
		return message;
	}

	/**
	 * Report error to external service (placeholder for analytics/monitoring)
	 * @private
	 * @param {Error|Event} error - Error object
	 * @param {Object} context - Error context
	 */
	reportError(_error, _context) {
		// Placeholder for error reporting service integration
		// This could integrate with services like Sentry, LogRocket, etc.

		// Only report in production and if user has consented
		if (process.env.NODE_ENV !== "production") {
			return;
		}

		// Example implementation:
		// errorReportingService.report({
		//     message: error.message,
		//     stack: error.stack,
		//     context,
		//     url: window.location.href,
		//     userAgent: navigator.userAgent,
		//     timestamp: new Date().toISOString()
		// });
	}

	/**
	 * Get error statistics
	 * @returns {Object} - Error statistics
	 */
	getStats() {
		return {
			totalToasts: this.toasts.size,
			errorCounts: Object.fromEntries(this.errorCounts),
			activeToasts: Array.from(this.toasts.values()).map((toast) => ({
				id: toast.id,
				message: toast.message,
				type: toast.options.type,
				createdAt: toast.createdAt,
			})),
		};
	}

	/**
	 * Clear all error tracking data
	 */
	clearStats() {
		this.errorCounts.clear();
		this.lastErrors.clear();
	}
}

// Global error handler instance
let globalErrorHandler = null;

/**
 * Get or create the global error handler instance
 * @param {ErrorConfig} config - Configuration options
 * @returns {ErrorHandler} - Global error handler instance
 */
export function getErrorHandler(config = {}) {
	if (!globalErrorHandler) {
		globalErrorHandler = new ErrorHandler(config);

		// Set up global error listeners
		window.addEventListener("error", (event) => {
			globalErrorHandler.handleError(event.error || event, {
				type: "javascript",
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
			});
		});

		window.addEventListener("unhandledrejection", (event) => {
			globalErrorHandler.handleError(event.reason, {
				type: "promise",
				showToUser: false, // Don't show promise rejections to user by default
			});
		});
	}

	return globalErrorHandler;
}

/**
 * Create a new error handler instance
 * @param {ErrorConfig} config - Configuration options
 * @returns {ErrorHandler} - New error handler instance
 */
export function createErrorHandler(config = {}) {
	return new ErrorHandler(config);
}

export default ErrorHandler;
