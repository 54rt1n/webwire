/**
 * Semantic Page Utilities
 * 
 * Re-architected to extract structured, semantic information from a webpage,
 * providing a clean and context-aware representation for an LLM instead of a
 * raw text dump. This improves the AI's ability to reason about the page's
 * content, structure, and interactive capabilities.
 */

class SemanticPageExtractor {
    constructor() {
        this.config = {
            maxTextLength: 15000, // Increased limit for richer context
            maxInteractiveElements: 100,
        };
        // Selectors for non-content elements to be ignored during text extraction.
        this.ignoreSelectors = 'script, style, nav, footer, aside, .ad, .popup, .modal, .cookie-banner, #webwire-container, .ww-panel';
    }

    /**
     * Main extraction method. Produces a structured object representing the page.
     * @returns {Object} A structured representation of the page.
     */
    extract() {
        const extractedData = {
            url: window.location.href,
            title: document.title,
            language: document.documentElement.lang || 'en',
            mainContent: this.extractMainContent(),
            summary: {
                description: this.getMetaContent('description'),
                ogTitle: this.getMetaContent('og:title'),
                ogDescription: this.getMetaContent('og:description'),
            },
            interactiveElements: this.extractInteractiveElements(),
            timestamp: new Date().toISOString(),
        };
        
        console.log('[SemanticPageExtractor] Extracted structured content:', {
            url: extractedData.url,
            title: extractedData.title,
            contentLength: extractedData.mainContent.length,
            interactiveElements: extractedData.interactiveElements.length
        });

        return extractedData;
    }
    
    /**
     * Extracts the main textual content of the page, preserving structure.
     * This uses a TreeWalker for an efficient, semantic traversal of the DOM.
     * @returns {string} Cleaned, structurally-preserved text content.
     */
    extractMainContent() {
        const root = document.body;
        if (!root) return '';

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                // Ignore text from our UI or elements we want to skip
                if (node.parentElement.closest(this.ignoreSelectors) || this.isElementHidden(node.parentElement)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });

        let content = [];
        let currentNode;
        while ((currentNode = walker.nextNode())) {
            let text = currentNode.nodeValue.trim();
            if (text) {
                // Add newlines for block-level elements to preserve paragraph structure.
                const parent = currentNode.parentElement;
                const display = window.getComputedStyle(parent).display;
                if (display === 'block' || display === 'list-item') {
                    content.push('\n');
                }
                content.push(text);
            }
        }
        
        // Normalize whitespace and join.
        return content.join(' ').replace(/\s*\n\s*/g, '\n\n').replace(/ {2,}/g, ' ').trim().slice(0, this.config.maxTextLength);
    }

    /**
     * Extracts actionable, interactive elements from the page.
     * Focuses on elements a user would likely click or type into.
     * @returns {Array<Object>} A list of interactive element objects.
     */
    extractInteractiveElements() {
        const selectors = [
            'a[href]', 'button', 'input[type="submit"]', 'input[type="button"]',
            '[role="button"]', '[role="link"]', '[role="tab"]',
            'input[type="text"]', 'input[type="email"]', 'input[type="search"]', 'input[type="password"]', 'textarea', 'select'
        ];

        const elements = new Set();
        document.querySelectorAll(selectors.join(', ')).forEach(el => {
            if (!el.closest(this.ignoreSelectors) && this.isElementVisible(el)) {
                elements.add(el);
            }
        });

        return Array.from(elements).slice(0, this.config.maxInteractiveElements).map((el, index) => ({
            id: index,
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            accessibleName: this.getAccessibleName(el),
            selector: this.getUniqueSelector(el),
        }));
    }

    /**
     * Gets the "accessible name" of an element, which is what a screen reader would announce.
     * This is the most reliable way for an LLM to understand an element's purpose.
     * @param {Element} el The element.
     * @returns {string} The accessible name.
     */
    getAccessibleName(el) {
        // 1. aria-labelledby
        const labelledby = el.getAttribute('aria-labelledby');
        if (labelledby) {
            const labelEl = document.getElementById(labelledby);
            if (labelEl) return labelEl.textContent.trim();
        }

        // 2. aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();

        // 3. Inner text or value
        const text = el.textContent?.trim() || el.value?.trim();
        if (text) return text;
        
        // 4. Placeholder or title as fallback
        return el.getAttribute('placeholder')?.trim() || el.getAttribute('title')?.trim() || '';
    }
    
    /**
     * Generates a reasonably stable and unique CSS selector for an element.
     * @param {Element} el The element.
     * @returns {string} A CSS selector.
     */
    getUniqueSelector(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;

        let path = '';
        while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector = `#${CSS.escape(el.id)}`;
                path = selector + (path ? ' > ' + path : '');
                break;
            }
            
            // Add a unique attribute if available
            const uniqueAttr = ['data-testid', 'name', 'data-cy'].find(attr => el.hasAttribute(attr));
            if (uniqueAttr) {
                selector += `[${uniqueAttr}="${CSS.escape(el.getAttribute(uniqueAttr))}"]`;
            } else if (el.className && typeof el.className === 'string') {
                const stableClass = el.className.split(' ').find(c => /^[a-zA-Z]/.test(c));
                if (stableClass) selector += `.${CSS.escape(stableClass)}`;
            }

            const siblings = Array.from(el.parentNode.children);
            const sameTagSiblings = siblings.filter(sibling => sibling.nodeName === el.nodeName);
            if (sameTagSiblings.length > 1) {
                const index = sameTagSiblings.indexOf(el) + 1;
                selector += `:nth-of-type(${index})`;
            }

            path = selector + (path ? ' > ' + path : '');
            el = el.parentNode;
        }
        return path;
    }

    /**
     * Utility to get meta tag content by name or property.
     * @param {string} name The name or property of the meta tag.
     * @returns {string} The content of the meta tag or an empty string.
     */
    getMetaContent(name) {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el ? el.getAttribute('content') || '' : '';
    }

    isElementVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    isElementHidden = (el) => window.getComputedStyle(el).display === 'none';
}


/**
 * Main utility class that provides a simple public API over the extractor.
 * This acts as the facade for the rest of the application.
 */
export class PageUtils {
    constructor() {
        this.extractor = new SemanticPageExtractor();
    }

    /**
     * The primary method to get all relevant page data in a structured format.
     * @returns {Object} A structured object containing all extracted page content.
     */
    getCurrentPageContent() {
        return this.extractor.extract();
    }

    /**
     * Builds a structured context object to be sent to the AI.
     * This replaces the old pattern of jamming text into the user prompt.
     * @returns {Object} A structured context object for the AI.
     */
    buildPageContext() {
        // In the new architecture, we just return the full structured object.
        // The ChatService will be responsible for placing this into the final API call payload.
        return this.getCurrentPageContent();
    }

    /**
     * Gets the page location and title.
     * @returns {{title: string, url: string}}
     */
    getPageLocation() {
        return {
            title: document.title,
            url: window.location.href
        };
    }
}