/**
 * Semantic Page Utilities
 * 
 * Re-architected to extract structured, semantic information from a webpage,
 * providing a clean and context-aware representation for an LLM instead of a
 * raw text dump. This improves the AI's ability to reason about the page's
 * content, structure, and interactive capabilities.
 */

export class SemanticPageExtractor {
    constructor() {
        this.config = {
            maxTextLength: 50000, // Much higher limit - let LLM handle large content
            maxInteractiveElements: 200,
        };
        // Selectors for truly non-content elements (only technical/UI elements)
        this.ignoreSelectors = 'script, style, #webwire-container, .ww-panel, [class*="webwire"], [id*="webwire"]';
    }

    /**
     * Main extraction method. Produces a structured object representing the page.
     * @returns {Object} A structured representation of the page.
     */
    extract({ includePageNavigation = false, maxTextTokens = null } = {}) {
        let extractedData = {
            url: window.location.href,
            title: document.title,
            language: document.documentElement.lang || 'en',
            links: this.extractLinks(),
            metadata: this.extractMetadata(),
            timestamp: new Date().toISOString(),
        };

        if (includePageNavigation) {
            extractedData.headings = this.extractHeadings();
            extractedData.images = this.extractImages();
            extractedData.interactiveElements = this.extractInteractiveElements();
        }

        if (maxTextTokens) {
            const dataTokens = JSON.stringify(extractedData).split(' ').length * 1.75;
            if (dataTokens < maxTextTokens) {
                console.log('[SemanticPageExtractor] Extracting main content with maxTextTokens:', maxTextTokens - dataTokens);
                extractedData.mainContent = this.extractMainContent({ maxTextTokens: maxTextTokens - dataTokens });
            }
        } else {
            extractedData.mainContent = this.extractMainContent();
        }

        console.log('[SemanticPageExtractor] Extracted structured content:', extractedData);

        return extractedData;
    }
    
    /**
     * Extracts the main textual content of the page, preserving structure.
     * Uses a comprehensive approach to capture meaningful content.
     * @returns {string} Cleaned, structurally-preserved text content.
     */
    extractMainContent({ maxTextTokens = null } = {}) {
        // Create a copy of the document to manipulate
        const tempDoc = document.cloneNode(true);
        
        // Remove elements that don't contribute to meaningful content
        const elementsToRemove = tempDoc.querySelectorAll(this.ignoreSelectors);
        elementsToRemove.forEach(el => el.remove());
        
        // Extract text from the cleaned document
        const text = tempDoc.body ? tempDoc.body.innerText : '';
        
        // Clean up whitespace and limit length
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        if (maxTextTokens) {
            const words = cleanedText.split(' ');
            const tokens = words.length * 0.75;
            if (tokens > maxTextTokens) {
                const wordsToKeep = Math.floor(maxTextTokens / 0.75);
                cleanedText = words.slice(0, wordsToKeep).join(' ');
            }
        }
            
        return cleanedText;
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

    /**
     * Extract page headings with hierarchy
     * @returns {Array} Array of heading objects
     */
    extractHeadings() {
        const headings = [];
        const selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(heading => {
                // Skip our own UI elements
                if (heading.closest(this.ignoreSelectors)) return;
                
                const text = heading.textContent.trim();
                if (text) {
                    headings.push({
                        level: parseInt(selector.charAt(1)),
                        text: text,
                        tag: selector.toUpperCase()
                    });
                }
            });
        });
        
        return headings;
    }

    /**
     * Extract meaningful links from the page
     * @returns {Array} Array of link objects
     */
    extractLinks() {
        const links = [];
        const maxLinks = 100;
        
        document.querySelectorAll('a[href]').forEach(link => {
            // Skip our own UI elements
            if (link.closest(this.ignoreSelectors)) return;
            
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            
            // Filter out meaningless links
            if (href && text && href !== '#' && text.length > 1 && links.length < maxLinks) {
                // Resolve relative URLs
                let resolvedHref = href;
                try {
                    resolvedHref = new URL(href, window.location.href).href;
                } catch (e) {
                    // Keep original href if URL construction fails
                }
                
                links.push({ 
                    href: resolvedHref, 
                    text: text.slice(0, 200), // Reasonable text length
                    isExternal: !resolvedHref.startsWith(window.location.origin)
                });
            }
        });
        
        return links;
    }

    /**
     * Extract images with alt text and context
     * @returns {Array} Array of image objects
     */
    extractImages() {
        const images = [];
        const maxImages = 50;
        
        document.querySelectorAll('img[src]').forEach(img => {
            if (images.length >= maxImages) return;
            
            // Skip our own UI elements
            if (img.closest(this.ignoreSelectors)) return;
            
            const src = img.getAttribute('src');
            const alt = img.getAttribute('alt') || '';
            const title = img.getAttribute('title') || '';
            
            if (src) {
                // Resolve relative URLs
                let resolvedSrc = src;
                try {
                    resolvedSrc = new URL(src, window.location.href).href;
                } catch (e) {
                    // Keep original src if URL construction fails
                }
                
                images.push({ 
                    src: resolvedSrc, 
                    alt: alt.slice(0, 200),
                    title: title.slice(0, 200),
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height
                });
            }
        });
        
        return images;
    }

    /**
     * Extract comprehensive page metadata
     * @returns {Object} Metadata object
     */
    extractMetadata() {
        const metadata = {
            description: this.getMetaContent('description'),
            keywords: this.getMetaContent('keywords'),
            author: this.getMetaContent('author'),
            ogTitle: this.getMetaContent('og:title'),
            ogDescription: this.getMetaContent('og:description'),
            ogImage: this.getMetaContent('og:image'),
            twitterTitle: this.getMetaContent('twitter:title'),
            twitterDescription: this.getMetaContent('twitter:description'),
            canonical: '',
            robots: this.getMetaContent('robots'),
            viewport: this.getMetaContent('viewport'),
            charset: document.characterSet || '',
            lang: document.documentElement.lang || ''
        };
        
        // Extract canonical URL
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
            metadata.canonical = canonical.getAttribute('href');
        }
        
        return metadata;
    }
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
    getCurrentPageContent({ includePageNavigation = false, maxTextTokens = null } = {}) {
        return this.extractor.extract({ includePageNavigation, maxTextTokens });
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