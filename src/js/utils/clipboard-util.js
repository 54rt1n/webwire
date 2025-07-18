/**
 * ClipboardUtil - Browser clipboard operations utility
 * Provides safe clipboard access with fallback methods
 */
export class ClipboardUtil {
    /**
     * Copy text to clipboard using modern Clipboard API with fallback
     * @param {string} text - Text to copy to clipboard
     * @returns {Promise<boolean>} - Success status
     */
    static async copyToClipboard(text) {
        if (!text || typeof text !== 'string') {
            console.warn('[ClipboardUtil] Invalid text provided for copying');
            return false;
        }

        try {
            // Try modern Clipboard API first (requires HTTPS or localhost)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }

            // Fallback to document.execCommand (deprecated but widely supported)
            return this.fallbackCopyToClipboard(text);
        } catch (error) {
            console.error('[ClipboardUtil] Error copying to clipboard:', error);
            
            // Try fallback method if modern API fails
            try {
                return this.fallbackCopyToClipboard(text);
            } catch (fallbackError) {
                console.error('[ClipboardUtil] Fallback copy method also failed:', fallbackError);
                return false;
            }
        }
    }

    /**
     * Fallback clipboard copy using deprecated execCommand
     * @param {string} text - Text to copy
     * @returns {boolean} - Success status
     */
    static fallbackCopyToClipboard(text) {
        // Create temporary textarea element
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        
        document.body.appendChild(textarea);
        
        try {
            // Select and copy the text
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            
            const successful = document.execCommand('copy');
            
            if (!successful) {
                throw new Error('execCommand copy returned false');
            }
            
            return true;
        } catch (error) {
            console.error('[ClipboardUtil] execCommand copy failed:', error);
            return false;
        } finally {
            // Clean up the temporary element
            document.body.removeChild(textarea);
        }
    }

    /**
     * Check if clipboard operations are supported
     * @returns {boolean} - Whether clipboard is supported
     */
    static isSupported() {
        return !!(navigator.clipboard?.writeText || document.execCommand);
    }

    /**
     * Copy text with user feedback (visual indication)
     * @param {string} text - Text to copy
     * @param {HTMLElement} [buttonElement] - Button element to show feedback on
     * @returns {Promise<boolean>} - Success status
     */
    static async copyWithFeedback(text, buttonElement = null) {
        const success = await this.copyToClipboard(text);
        
        if (buttonElement) {
            this.showFeedback(buttonElement, success);
        }
        
        return success;
    }

    /**
     * Show visual feedback on button element
     * @param {HTMLElement} element - Element to show feedback on
     * @param {boolean} success - Whether the operation was successful
     */
    static showFeedback(element, success) {
        if (!element) return;

        const originalText = element.textContent || element.innerHTML;
        const originalTitle = element.title;
        
        // Update button appearance
        if (success) {
            element.textContent = '✓';
            element.title = 'Copied!';
            element.classList.add('ww-copy-success');
        } else {
            element.textContent = '✗';
            element.title = 'Failed to copy';
            element.classList.add('ww-copy-error');
        }
        
        // Reset after delay
        setTimeout(() => {
            element.textContent = originalText;
            element.title = originalTitle;
            element.classList.remove('ww-copy-success', 'ww-copy-error');
        }, 1500);
    }
}