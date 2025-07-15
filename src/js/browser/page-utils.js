/**
 * Page Content Utilities
 * 
 * Handles webpage content extraction and synthetic context building
 * Based on patterns from chatpanel but enhanced for WebWire
 */

import { buildMarkdownReportPrompt } from '../prompts/analysis-prompt.js';

export class PageContentExtractor {
    constructor() {
        this.maxTextLength = 10000; // 10KB limit for text content
        this.maxHeadings = 20;
        this.maxLinks = 50;
        this.maxImages = 20;
    }

    /**
     * Extract comprehensive page content
     * @returns {Object} Complete page content data
     */
    extractPageContent() {
        const content = {
            title: document.title || '',
            url: window.location.href,
            text: this.extractTextContent(),
            headings: this.extractHeadings(),
            links: this.extractLinks(),
            images: this.extractImages(),
            metadata: this.extractMetadata(),
            forms: this.extractForms(),
            interactiveElements: this.extractInteractiveElements(),
            timestamp: Date.now()
        };
        
        console.log('[PageContentExtractor] Extracted content:', {
            url: content.url,
            title: content.title,
            textLength: content.text.length,
            headingsCount: content.headings.length,
            linksCount: content.links.length,
            imagesCount: content.images.length,
            interactiveElementsCount: content.interactiveElements.length
        });
        
        return content;
    }

    /**
     * Extract clean text content from the page
     * @returns {string} Cleaned text content
     */
    extractTextContent() {
        // Create a copy of the document to manipulate
        const tempDoc = document.cloneNode(true);
        
        // Remove elements that don't contribute to meaningful content
        const elementsToRemove = tempDoc.querySelectorAll(
            'script, style, nav, footer, aside, .sidebar, .navigation, .menu, .ad, .advertisement, .popup, .modal, .cookie-banner, .newsletter-signup, #webwire-container, .ww-panel, .ww-fab, .ww-notification, .ww-error-notification, [class*="ww-"], [id*="webwire"]'
        );
        elementsToRemove.forEach(el => el.remove());
        
        // Extract text from the cleaned document
        const text = tempDoc.body ? tempDoc.body.innerText : '';
        
        // Clean up whitespace and limit length
        const cleanedText = text
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .slice(0, this.maxTextLength);
            
        return cleanedText;
    }

    /**
     * Extract page headings with hierarchy
     * @returns {Array} Array of heading objects
     */
    extractHeadings() {
        const headings = [];
        const selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(heading => {
                // Skip WebWire elements
                if (this.isWebWireElement(heading)) return;
                
                const text = heading.textContent.trim();
                if (text && headings.length < this.maxHeadings) {
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
        
        document.querySelectorAll('a[href]').forEach(link => {
            // Skip WebWire elements
            if (this.isWebWireElement(link)) return;
            
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            
            // Filter out meaningless links
            if (href && text && href !== '#' && text.length > 2 && links.length < this.maxLinks) {
                // Resolve relative URLs
                let resolvedHref = href;
                try {
                    resolvedHref = new URL(href, window.location.href).href;
                } catch (e) {
                    // Keep original href if URL construction fails
                }
                
                links.push({ 
                    href: resolvedHref, 
                    text: text.slice(0, 100), // Limit text length
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
        
        document.querySelectorAll('img[src]').forEach(img => {
            if (images.length >= this.maxImages) return;
            
            // Skip WebWire elements
            if (this.isWebWireElement(img)) return;
            
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
     * Extract page metadata
     * @returns {Object} Metadata object
     */
    extractMetadata() {
        const metadata = {
            description: '',
            keywords: '',
            author: '',
            ogTitle: '',
            ogDescription: '',
            ogImage: '',
            twitterTitle: '',
            twitterDescription: '',
            canonical: '',
            robots: '',
            viewport: '',
            charset: '',
            lang: document.documentElement.lang || ''
        };
        
        // Extract meta tags
        document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv');
            const content = meta.getAttribute('content');
            
            if (name && content) {
                const lowerName = name.toLowerCase();
                
                switch (lowerName) {
                    case 'description':
                        metadata.description = content;
                        break;
                    case 'keywords':
                        metadata.keywords = content;
                        break;
                    case 'author':
                        metadata.author = content;
                        break;
                    case 'og:title':
                        metadata.ogTitle = content;
                        break;
                    case 'og:description':
                        metadata.ogDescription = content;
                        break;
                    case 'og:image':
                        metadata.ogImage = content;
                        break;
                    case 'twitter:title':
                        metadata.twitterTitle = content;
                        break;
                    case 'twitter:description':
                        metadata.twitterDescription = content;
                        break;
                    case 'robots':
                        metadata.robots = content;
                        break;
                    case 'viewport':
                        metadata.viewport = content;
                        break;
                    case 'charset':
                        metadata.charset = content;
                        break;
                }
            }
        });
        
        // Extract canonical URL
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
            metadata.canonical = canonical.getAttribute('href');
        }
        
        return metadata;
    }

    /**
     * Extract form information
     * @returns {Array} Array of form objects
     */
    extractForms() {
        const forms = [];
        
        document.querySelectorAll('form').forEach(form => {
            const inputs = [];
            form.querySelectorAll('input, textarea, select').forEach(input => {
                const type = input.type || input.tagName.toLowerCase();
                const name = input.name || input.id || '';
                const placeholder = input.placeholder || '';
                const label = this.findInputLabel(input);
                
                if (name) {
                    inputs.push({
                        type,
                        name,
                        placeholder,
                        label,
                        required: input.required || false
                    });
                }
            });
            
            if (inputs.length > 0) {
                forms.push({
                    action: form.action || '',
                    method: form.method || 'get',
                    inputs: inputs
                });
            }
        });
        
        return forms;
    }

    /**
     * Find label text for an input element
     * @param {Element} input - The input element
     * @returns {string} Label text
     */
    findInputLabel(input) {
        // Try to find associated label
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) return label.textContent.trim();
        }
        
        // Try parent label
        const parentLabel = input.closest('label');
        if (parentLabel) {
            return parentLabel.textContent.replace(input.value || '', '').trim();
        }
        
        // Try previous sibling text
        let prev = input.previousElementSibling;
        if (prev && prev.textContent) {
            return prev.textContent.trim();
        }
        
        return '';
    }

    /**
     * Extract interactive elements for navigation automation
     * @returns {Array} Array of interactive element objects with multiple identification strategies
     */
    extractInteractiveElements() {
        const elements = [];
        const maxElements = 100;
        
        // Define safe interactive element selectors
        const safeSelectors = [
            'button',
            'input[type="button"]',
            'input[type="submit"]',
            'input[type="reset"]', 
            'a[href]',
            '[role="button"]',
            '[onclick]',
            '[ng-click]',
            '[data-action]',
            '.btn',
            '.button',
            '.clickable',
            'span[onclick]',
            'div[onclick]',
            '[tabindex]:not([tabindex="-1"])'
        ];
        
        // Collect all potentially interactive elements
        const foundElements = new Set();
        
        // Process safe selectors
        safeSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(element => {
                    if (!foundElements.has(element) && 
                        !this.isWebWireElement(element) && 
                        this.isElementVisible(element) && 
                        elements.length < maxElements) {
                        foundElements.add(element);
                        elements.push(this.analyzeInteractiveElement(element, elements.length));
                    }
                });
            } catch (error) {
                console.warn(`[PageContentExtractor] Invalid selector: ${selector}`, error);
            }
        });
        
        // Handle Vue.js elements separately using getElementsByTagName and checking attributes
        try {
            const allElements = document.getElementsByTagName('*');
            for (const element of allElements) {
                if (foundElements.has(element) || elements.length >= maxElements) continue;
                
                // Check for Vue.js click handlers (v-on:click, @click)
                if (element.hasAttribute('v-on:click') || 
                    element.hasAttribute('@click') ||
                    element.hasAttribute('v-on:click.prevent') ||
                    element.hasAttribute('@click.prevent')) {
                    
                    if (!this.isWebWireElement(element) && this.isElementVisible(element)) {
                        foundElements.add(element);
                        elements.push(this.analyzeInteractiveElement(element, elements.length));
                    }
                }
            }
        } catch (error) {
            console.warn('[PageContentExtractor] Error checking Vue.js elements:', error);
        }
        
        return elements;
    }

    /**
     * Check if element is visible and potentially clickable
     * @param {Element} element - Element to check
     * @returns {boolean} True if element appears clickable
     */
    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return (
            rect.width > 0 && 
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0'
        );
    }

    /**
     * Check if element is part of WebWire's UI and should be excluded from page content
     * @param {Element} element - Element to check
     * @returns {boolean} True if element is WebWire UI
     */
    isWebWireElement(element) {
        // Check if element is or is contained within WebWire container
        if (element.closest('#webwire-container, #ww-container')) {
            return true;
        }
        
        // Check element ID
        if (element.id && (element.id.includes('webwire') || element.id.includes('ww-'))) {
            return true;
        }
        
        // Check element classes
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.toLowerCase();
            if (classes.includes('ww-') || classes.includes('webwire')) {
                return true;
            }
        }
        
        // Check for WebWire-specific attributes
        if (element.hasAttribute('data-webwire') || element.hasAttribute('data-ww')) {
            return true;
        }
        
        return false;
    }

    /**
     * Analyze an interactive element and create multiple identification strategies
     * @param {Element} element - Interactive element to analyze
     * @param {number} index - Element index for unique identification
     * @returns {Object} Element analysis with identification strategies
     */
    analyzeInteractiveElement(element, index) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        const analysis = {
            index,
            tagName: element.tagName.toLowerCase(),
            type: element.type || '',
            role: element.getAttribute('role') || '',
            
            // Text content and labels
            text: this.getElementText(element),
            ariaLabel: element.getAttribute('aria-label') || '',
            title: element.getAttribute('title') || '',
            value: element.value || '',
            
            // Identification strategies
            selectors: this.generateElementSelectors(element),
            
            // Position and visibility
            position: {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            },
            
            // Context information
            context: this.getElementContext(element),
            
            // Interaction hints
            interactionType: this.determineInteractionType(element),
            
            // Attributes that might be useful for identification
            attributes: this.getRelevantAttributes(element),
            
            // Styling information that might affect interaction
            styling: {
                cursor: style.cursor,
                pointerEvents: style.pointerEvents,
                zIndex: style.zIndex
            }
        };
        
        return analysis;
    }

    /**
     * Get clean text content from element and its children
     * @param {Element} element - Element to extract text from
     * @returns {string} Clean text content
     */
    getElementText(element) {
        // Try various text sources in order of preference
        const sources = [
            element.textContent,
            element.innerText,
            element.value,
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.getAttribute('alt'),
            element.getAttribute('placeholder')
        ];
        
        for (const source of sources) {
            if (source && source.trim()) {
                return source.trim().slice(0, 100);
            }
        }
        
        return '';
    }

    /**
     * Generate multiple CSS selectors for robust element identification
     * @param {Element} element - Element to generate selectors for
     * @returns {Object} Object containing different selector strategies
     */
    generateElementSelectors(element) {
        const selectors = {
            // Basic selectors
            id: element.id ? `#${CSS.escape(element.id)}` : null,
            className: this.generateClassSelector(element),
            tagName: element.tagName.toLowerCase(),
            
            // Attribute-based selectors
            byText: null,
            byAriaLabel: element.getAttribute('aria-label') ? `[aria-label="${this.escapeAttributeValue(element.getAttribute('aria-label'))}"]` : null,
            byTitle: element.getAttribute('title') ? `[title="${this.escapeAttributeValue(element.getAttribute('title'))}"]` : null,
            byType: element.type ? `${element.tagName.toLowerCase()}[type="${element.type}"]` : null,
            byRole: element.getAttribute('role') ? `[role="${element.getAttribute('role')}"]` : null,
            
            // Position-based selectors
            nthChild: this.getNthChildSelector(element),
            nthOfType: this.getNthOfTypeSelector(element),
            
            // XPath
            xpath: this.generateXPath(element),
            
            // Combined selectors for uniqueness
            unique: this.generateUniqueSelector(element)
        };
        
        // Add text-based selector if element has meaningful text
        const text = this.getElementText(element);
        if (text) {
            // Note: :contains() is not standard CSS, this is for documentation only
            selectors.byText = `${element.tagName.toLowerCase()}[contains text "${this.escapeAttributeValue(text)}"]`;
        }
        
        return selectors;
    }

    /**
     * Generate a safe class selector from element className
     * @param {Element} element - Target element
     * @returns {string|null} Safe class selector or null
     */
    generateClassSelector(element) {
        if (!element.className) return null;
        
        try {
            // Split classes and filter out invalid ones
            const classes = element.className.trim().split(/\s+/)
                .filter(cls => cls.length > 0)
                .filter(cls => this.isValidCSSIdentifier(cls))
                .slice(0, 3); // Limit to first 3 valid classes to avoid overly long selectors
            
            if (classes.length === 0) return null;
            
            // Create selector with properly escaped classes
            const escapedClasses = classes.map(cls => CSS.escape(cls));
            return `.${escapedClasses.join('.')}`;
        } catch (error) {
            // Fallback to class attribute selector
            return `[class*="${element.className.split(/\s+/)[0]}"]`;
        }
    }

    /**
     * Check if a string is a valid CSS identifier
     * @param {string} identifier - String to check
     * @returns {boolean} True if valid CSS identifier
     */
    isValidCSSIdentifier(identifier) {
        // Basic check for CSS identifier validity
        // Must start with letter, underscore, or hyphen
        // Can contain letters, numbers, hyphens, underscores
        return /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(identifier);
    }

    /**
     * Escape attribute values for CSS selectors
     * @param {string} value - Attribute value to escape
     * @returns {string} Escaped value
     */
    escapeAttributeValue(value) {
        // Escape quotes and backslashes in attribute values
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    /**
     * Get nth-child selector for element
     * @param {Element} element - Target element
     * @returns {string} nth-child selector
     */
    getNthChildSelector(element) {
        const parent = element.parentElement;
        if (!parent) return null;
        
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-child(${index})`;
    }

    /**
     * Get nth-of-type selector for element
     * @param {Element} element - Target element
     * @returns {string} nth-of-type selector
     */
    getNthOfTypeSelector(element) {
        const parent = element.parentElement;
        if (!parent) return null;
        
        const siblings = Array.from(parent.children).filter(child => 
            child.tagName === element.tagName
        );
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
    }

    /**
     * Generate XPath for element
     * @param {Element} element - Target element
     * @returns {string} XPath selector
     */
    generateXPath(element) {
        if (element.id) {
            return `//*[@id="${element.id}"]`;
        }
        
        const parts = [];
        let current = element;
        
        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let part = current.tagName.toLowerCase();
            
            if (current.id) {
                part += `[@id="${current.id}"]`;
                parts.unshift(part);
                break;
            } else if (current.className) {
                const classes = current.className.trim().split(/\s+/);
                if (classes.length > 0) {
                    part += `[@class="${classes.join(' ')}"]`;
                }
            }
            
            // Add positional predicate if needed
            const siblings = Array.from(current.parentElement?.children || [])
                .filter(child => child.tagName === current.tagName);
            
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                part += `[${index}]`;
            }
            
            parts.unshift(part);
            current = current.parentElement;
        }
        
        return '//' + parts.join('/');
    }

    /**
     * Generate a unique selector for the element
     * @param {Element} element - Target element
     * @returns {string} Unique selector
     */
    generateUniqueSelector(element) {
        // Try ID first (most unique)
        if (element.id) {
            try {
                return `#${CSS.escape(element.id)}`;
            } catch (error) {
                // Fallback if ID is not valid
                return `[id="${this.escapeAttributeValue(element.id)}"]`;
            }
        }
        
        // Try combination of attributes
        const parts = [element.tagName.toLowerCase()];
        
        if (element.type) {
            parts.push(`[type="${element.type}"]`);
        }
        
        // Add safe class selector
        const classSelector = this.generateClassSelector(element);
        if (classSelector) {
            parts.push(classSelector.substring(1)); // Remove leading dot since we'll join
        }
        
        if (element.getAttribute('aria-label')) {
            parts.push(`[aria-label="${this.escapeAttributeValue(element.getAttribute('aria-label'))}"]`);
        }
        
        let selector = parts[0]; // Start with tag name
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (part.startsWith('[')) {
                selector += part; // Attribute selector
            } else {
                selector += '.' + part; // Class selector
            }
        }
        
        // Validate and test the selector
        try {
            const matches = document.querySelectorAll(selector);
            
            // If not unique, add nth-child
            if (matches.length > 1) {
                const nthChild = this.getNthChildSelector(element);
                if (nthChild) {
                    selector += ':' + nthChild.split(':')[1]; // Extract just the nth-child part
                }
            }
            
            // Final validation
            document.querySelectorAll(selector);
            return selector;
            
        } catch (error) {
            // Fallback to simple tag + nth-child if selector is invalid
            const nthChild = this.getNthChildSelector(element);
            return nthChild || element.tagName.toLowerCase();
        }
    }

    /**
     * Get context information about the element's surroundings
     * @param {Element} element - Target element
     * @returns {Object} Context information
     */
    getElementContext(element) {
        const context = {
            parentTag: element.parentElement?.tagName.toLowerCase(),
            parentClass: element.parentElement?.className || '',
            parentId: element.parentElement?.id || '',
            siblings: this.getSiblingInfo(element),
            nearbyText: this.getNearbyText(element),
            formContext: this.getFormContext(element)
        };
        
        return context;
    }

    /**
     * Get information about sibling elements
     * @param {Element} element - Target element
     * @returns {Object} Sibling information
     */
    getSiblingInfo(element) {
        const parent = element.parentElement;
        if (!parent) return { count: 0, position: 0 };
        
        const siblings = Array.from(parent.children);
        return {
            count: siblings.length,
            position: siblings.indexOf(element),
            hasNextSibling: !!element.nextElementSibling,
            hasPreviousSibling: !!element.previousElementSibling
        };
    }

    /**
     * Get nearby text content that might help identify the element
     * @param {Element} element - Target element
     * @returns {string} Nearby text content
     */
    getNearbyText(element) {
        const texts = [];
        
        // Check previous sibling text
        if (element.previousElementSibling) {
            const prevText = element.previousElementSibling.textContent?.trim();
            if (prevText && prevText.length < 50) texts.push(prevText);
        }
        
        // Check next sibling text
        if (element.nextElementSibling) {
            const nextText = element.nextElementSibling.textContent?.trim();
            if (nextText && nextText.length < 50) texts.push(nextText);
        }
        
        // Check parent text (excluding children)
        if (element.parentElement) {
            const parentClone = element.parentElement.cloneNode(true);
            Array.from(parentClone.children).forEach(child => child.remove());
            const parentText = parentClone.textContent?.trim();
            if (parentText && parentText.length < 50) texts.push(parentText);
        }
        
        return texts.join(' | ').slice(0, 200);
    }

    /**
     * Get form context if element is within a form
     * @param {Element} element - Target element
     * @returns {Object} Form context information
     */
    getFormContext(element) {
        const form = element.closest('form');
        if (!form) return null;
        
        return {
            formId: form.id || '',
            formClass: form.className || '',
            formAction: form.action || '',
            formMethod: form.method || 'get',
            fieldCount: form.querySelectorAll('input, textarea, select').length
        };
    }

    /**
     * Determine the type of interaction this element supports
     * @param {Element} element - Target element
     * @returns {string} Interaction type
     */
    determineInteractionType(element) {
        const tag = element.tagName.toLowerCase();
        const type = element.type?.toLowerCase();
        const role = element.getAttribute('role');
        
        // Form elements
        if (tag === 'input') {
            if (['button', 'submit', 'reset'].includes(type)) return 'button';
            if (['text', 'email', 'password', 'number'].includes(type)) return 'input';
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            return 'form-field';
        }
        
        if (tag === 'button') return 'button';
        if (tag === 'a') return 'link';
        if (tag === 'select') return 'dropdown';
        if (tag === 'textarea') return 'textarea';
        
        // Role-based detection
        if (role === 'button') return 'button';
        if (role === 'link') return 'link';
        if (role === 'checkbox') return 'checkbox';
        if (role === 'tab') return 'tab';
        if (role === 'menuitem') return 'menu-item';
        
        // Event-based detection
        if (element.hasAttribute('onclick') || element.hasAttribute('ng-click')) return 'clickable';
        
        // Class-based detection
        const className = element.className.toLowerCase();
        if (className.includes('btn') || className.includes('button')) return 'button';
        if (className.includes('link')) return 'link';
        if (className.includes('tab')) return 'tab';
        
        return 'unknown';
    }

    /**
     * Get relevant attributes for element identification
     * @param {Element} element - Target element
     * @returns {Object} Relevant attributes
     */
    getRelevantAttributes(element) {
        const relevantAttrs = [
            'id', 'class', 'name', 'data-*', 'aria-*', 'role', 'type', 
            'href', 'onclick', 'ng-click', 'v-on:click', 'data-action',
            'value', 'placeholder', 'alt', 'title', 'tabindex'
        ];
        
        const attributes = {};
        
        for (const attr of element.attributes) {
            const name = attr.name.toLowerCase();
            if (relevantAttrs.some(pattern => 
                pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern
            )) {
                attributes[name] = attr.value;
            }
        }
        
        return attributes;
    }
}

/**
 * Context Builder - Creates synthetic user turn headers
 */
export class ContextBuilder {
    constructor(pageExtractor) {
        this.pageExtractor = pageExtractor;
    }

    /**
     * Build a comprehensive page analysis request (chatpanel pattern)
     * @param {Object} pageContent - Page content data
     * @returns {string} Formatted analysis request
     */
    buildPageAnalysisRequest(pageContent) {
        // Use the markdown report prompt for page analysis
        return buildMarkdownReportPrompt();
    }

    /**
     * Build enhanced chat context (WebWire enhanced pattern)
     * @param {Object} pageContent - Page content data
     * @returns {string} Enhanced message with context
     */
    buildChatMessageWithContext(pageContent) {
        const contextSections = [];
        
        // Page context header
        contextSections.push('Page Context:');
        contextSections.push(`Title: ${pageContent.title}`);
        contextSections.push(`URL: ${pageContent.url}`);
        
        // Add key metadata
        if (pageContent.metadata.description) {
            contextSections.push(`Description: ${pageContent.metadata.description}`);
        }
        
        // Add condensed content (first part only for context)
        if (pageContent.text) {
            const contextText = pageContent.text.slice(0, 1000);
            contextSections.push(`Content Preview: ${contextText}${pageContent.text.length > 1000 ? '...' : ''}`);
        }
        
        // User message
        contextSections.push('');
        contextSections.push('User Message:');
        
        return contextSections.join('\n');
    }

    /**
     * Build workspace content for metadata (chatpanel pattern)
     * @param {Object} pageContent - Page content data
     * @returns {string} Formatted workspace content
     */
    buildWorkspaceContent(pageContent) {
        const sections = [];
        
        sections.push(`URL: ${pageContent.url}`);
        sections.push(`Title: ${pageContent.title}`);
        
        if (pageContent.metadata.description) {
            sections.push(`Description: ${pageContent.metadata.description}`);
        }
        
        sections.push(`Content: ${pageContent.text}`);
        
        return sections.join('\n');
    }

    /**
     * Build a quick page summary for display
     * @param {Object} pageContent - Page content data
     * @returns {Object} Summary object
     */
    buildPageSummary(pageContent) {
        return {
            title: pageContent.title,
            url: pageContent.url,
            description: pageContent.metadata.description || '',
            wordCount: pageContent.text.split(/\s+/).length,
            headingCount: pageContent.headings.length,
            linkCount: pageContent.links.length,
            imageCount: pageContent.images.length,
            hasMetadata: Object.values(pageContent.metadata).some(val => val !== ''),
            hasForms: pageContent.forms.length > 0,
            language: pageContent.metadata.lang || 'unknown',
            lastUpdated: new Date(pageContent.timestamp).toISOString()
        };
    }

    /**
     * Create a structured context object for AI processing
     * @param {Object} pageContent - Page content data
     * @param {string} userMessage - User's message
     * @returns {Object} Structured context object
     */
    buildStructuredContext(pageContent, userMessage) {
        return {
            page: {
                url: pageContent.url,
                title: pageContent.title,
                description: pageContent.metadata.description,
                language: pageContent.metadata.lang,
                wordCount: pageContent.text.split(/\s+/).length
            },
            content: {
                text: pageContent.text,
                headings: pageContent.headings,
                links: pageContent.links.map(link => ({
                    text: link.text,
                    href: link.href,
                    isExternal: link.isExternal
                })),
                images: pageContent.images.map(img => ({
                    alt: img.alt,
                    title: img.title
                })),
                interactiveElements: pageContent.interactiveElements?.map(element => ({
                    index: element.index,
                    text: element.text,
                    type: element.interactionType,
                    selectors: element.selectors,
                    position: element.position,
                    context: element.context
                })) || []
            },
            userMessage: userMessage,
            timestamp: pageContent.timestamp
        };
    }
}

/**
 * Main utility class that combines extraction and context building
 */
export class PageUtils {
    constructor() {
        this.extractor = new PageContentExtractor();
        this.contextBuilder = new ContextBuilder(this.extractor);
    }

    /**
     * Extract current page content
     * @returns {Object} Page content data
     */
    getCurrentPageContent() {
        return this.extractor.extractPageContent();
    }

    /**
     * Build a page analysis request
     * @returns {string} Analysis request message
     */
    buildAnalysisRequest() {
        const pageContent = this.getCurrentPageContent();
        return this.contextBuilder.buildPageAnalysisRequest(pageContent);
    }

    /**
     * Enhance a user message with page context
     * @returns {string} Enhanced message with context
     */
    buildPageContext() {
        const pageContent = this.getCurrentPageContent();
        return this.contextBuilder.buildChatMessageWithContext(pageContent);
    }

    /**
     * Build workspace content for AI metadata
     * @returns {string} Workspace content
     */
    buildWorkspaceContent() {
        const pageContent = this.getCurrentPageContent();
        return this.contextBuilder.buildWorkspaceContent(pageContent);
    }

    /**
     * Get page summary for display
     * @returns {Object} Page summary
     */
    getPageSummary() {
        const pageContent = this.getCurrentPageContent();
        return this.contextBuilder.buildPageSummary(pageContent);
    }

    /**
     * Build structured context for AI processing
     * @param {string} userMessage - User's message
     * @returns {Object} Structured context
     */
    buildStructuredContext(userMessage) {
        const pageContent = this.getCurrentPageContent();
        return this.contextBuilder.buildStructuredContext(pageContent, userMessage);
    }

    /**
     * Get the page location
     */
    getPageLocation() {
        if (typeof document === 'undefined') {
            return {
                title: '',
                url: ''
            };
        }
        if (typeof window === 'undefined') {
            return {
                title: document.title,
                url: ''
            };
        }
        return {
            title: document.title,
            url: window.location.href
        };
    }

}

// Add debug methods to window for testing
if (typeof window !== 'undefined') {
    window.webwirePageUtils = new PageUtils();
    
    // Add convenience methods to PageUtils prototype for debugging
    PageUtils.prototype.debugAnalyzeCurrentPage = function() {
        console.log('=== WebWire Page Analysis Debug ===');
        const content = this.getCurrentPageContent();
        const summary = this.getPageSummary();
        const analysisRequest = this.buildAnalysisRequest();
        
        console.log('Page Content:', content);
        console.log('Page Summary:', summary);
        console.log('Analysis Request:', analysisRequest);
        
        return {
            content,
            summary,
            analysisRequest
        };
    };
    
    PageUtils.prototype.debugEnhanceMessage = function(message) {
        console.log('=== WebWire Message Enhancement Debug ===');
        const enhanced = this.enhanceMessageWithContext(message);
        const workspace = this.buildWorkspaceContent();
        
        console.log('Original Message:', message);
        console.log('Enhanced Message:', enhanced);
        console.log('Workspace Content:', workspace);
        
        return {
            original: message,
            enhanced,
            workspace
        };
    };
} 