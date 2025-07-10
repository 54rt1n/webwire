/**
 * Page Content Utilities
 * 
 * Handles webpage content extraction and synthetic context building
 * Based on patterns from chatpanel but enhanced for WebWire
 */

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
            timestamp: Date.now()
        };
        
        console.log('[PageContentExtractor] Extracted content:', {
            url: content.url,
            title: content.title,
            textLength: content.text.length,
            headingsCount: content.headings.length,
            linksCount: content.links.length,
            imagesCount: content.images.length
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
            'script, style, nav, footer, aside, .sidebar, .navigation, .menu, .ad, .advertisement, .popup, .modal, .cookie-banner, .newsletter-signup'
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
        const sections = [];
        
        // Basic page info (following chatpanel pattern)
        sections.push(`Please analyze this webpage:`);
        sections.push(`URL: ${pageContent.url}`);
        sections.push(`Title: ${pageContent.title}`);
        
        // Add description if available
        if (pageContent.metadata.description) {
            sections.push(`Description: ${pageContent.metadata.description}`);
        }
        
        // Main content
        if (pageContent.text) {
            sections.push(`\nContent: ${pageContent.text}`);
        }
        
        // Add structural information if meaningful
        if (pageContent.headings.length > 0) {
            sections.push(`\nPage Structure:`);
            pageContent.headings.slice(0, 10).forEach(heading => {
                sections.push(`${heading.tag}: ${heading.text}`);
            });
        }
        
        return sections.join('\n');
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
                }))
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