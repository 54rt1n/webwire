/**
 * DOM Agent - Browser Automation Tool Integration
 * 
 * Provides DOM manipulation tools that integrate with the WebWire chat system.
 * Mimics the MCP connector interface but executes browser automation actions.
 */

import { PageContentExtractor } from './page-utils.js';
import { generateUUID } from '../utils/id-generator.js';
import { EVENTS } from '../core/events.js';

export class DOMAgent {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.pageExtractor = new PageContentExtractor();
        this.sessionId = generateUUID();
        
        // Available DOM tools
        this.tools = [
            {
                name: 'navigate_to_url',
                description: 'Navigate to a specific URL',
                parameters: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The URL to navigate to'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'click_element',
                description: 'Click on an element using multiple identification strategies with automatic fallbacks',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for the element'
                        },
                        text: {
                            type: 'string',
                            description: 'Text content to match (alternative to selector)'
                        },
                        elementType: {
                            type: 'string',
                            description: 'Type of element (button, link, etc.)',
                            enum: ['button', 'link', 'input', 'any']
                        },
                        elementIndex: {
                            type: 'number',
                            description: 'Index from page extraction (most reliable identification)'
                        },
                        position: {
                            type: 'object',
                            description: 'Element position for coordinate-based clicking',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' }
                            }
                        },
                        ariaLabel: {
                            type: 'string',
                            description: 'Aria label to match'
                        },
                        title: {
                            type: 'string',
                            description: 'Title attribute to match'
                        },
                        nearbyText: {
                            type: 'string',
                            description: 'Text content near the element for context-based identification'
                        },
                        fallbackStrategies: {
                            type: 'boolean',
                            description: 'Enable automatic fallback strategies (default: true)',
                            default: true
                        }
                    }
                }
            },
            {
                name: 'form_fill',
                description: 'Fill out form fields',
                parameters: {
                    type: 'object',
                    properties: {
                        fields: {
                            type: 'object',
                            description: 'Object mapping field names/selectors to values'
                        },
                        formSelector: {
                            type: 'string',
                            description: 'Optional selector for the specific form'
                        }
                    },
                    required: ['fields']
                }
            },
            {
                name: 'extract_elements',
                description: 'Extract information about elements matching a selector',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for elements to extract'
                        },
                        attributes: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'List of attributes to extract (default: text, href, src)'
                        }
                    },
                    required: ['selector']
                }
            },
            {
                name: 'scroll_to',
                description: 'Scroll to an element or position',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for element to scroll to'
                        },
                        x: {
                            type: 'number',
                            description: 'X coordinate (alternative to selector)'
                        },
                        y: {
                            type: 'number',
                            description: 'Y coordinate (alternative to selector)'
                        }
                    }
                }
            },
            {
                name: 'wait_for_element',
                description: 'Wait for an element to appear on the page',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'CSS selector for element to wait for'
                        },
                        timeout: {
                            type: 'number',
                            description: 'Timeout in milliseconds (default: 5000)',
                            default: 5000
                        }
                    },
                    required: ['selector']
                }
            }
        ];
    }

    /**
     * Get available DOM tools (mimics MCP connector interface)
     * @returns {Array} Array of available tools
     */
    getAvailableTools() {
        return this.tools;
    }

    /**
     * Execute a DOM tool (mimics MCP connector interface)
     * @param {string} toolName - Name of the tool to execute
     * @param {Object} parameters - Tool parameters
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Tool execution result
     */
    async executeTool(toolName, parameters = {}, options = {}) {
        const executionStart = Date.now();
        const toolCallId = generateUUID();

        console.log(`[DOMAgent] Executing tool: ${toolName}`, parameters);

        try {
            let result;
            
            switch (toolName) {
                case 'navigate_to_url':
                    result = await this.navigateToUrl(parameters);
                    break;
                case 'click_element':
                    result = await this.clickElement(parameters);
                    break;
                case 'form_fill':
                    result = await this.formFill(parameters);
                    break;
                case 'extract_elements':
                    result = await this.extractElements(parameters);
                    break;
                case 'scroll_to':
                    result = await this.scrollTo(parameters);
                    break;
                case 'wait_for_element':
                    result = await this.waitForElement(parameters);
                    break;
                default:
                    throw new Error(`Unknown DOM tool: ${toolName}`);
            }

            const executionTime = Date.now() - executionStart;
            
            return {
                callId: toolCallId,
                name: toolName,
                parameters: parameters,
                success: true,
                result: result,
                executionTime: executionTime
            };

        } catch (error) {
            console.error(`[DOMAgent] Tool ${toolName} execution failed:`, error);
            
            return {
                callId: toolCallId,
                name: toolName,
                parameters: parameters,
                success: false,
                error: error.message,
                executionTime: Date.now() - executionStart
            };
        }
    }

    /**
     * Navigate to a URL
     * @param {Object} params - Parameters containing url
     * @returns {Promise<Object>} Navigation result
     */
    async navigateToUrl(params) {
        const { url } = params;
        
        if (!url) {
            throw new Error('URL parameter is required');
        }

        // Emit event for the content script to handle
        this.eventBus.emit(EVENTS.DOM.NAVIGATE, { url });
        
        // Wait a moment for navigation to begin
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
            action: 'navigate',
            url: url,
            timestamp: Date.now(),
            message: `Navigation to ${url} initiated`
        };
    }

    /**
     * Click on an element using multiple identification strategies
     * @param {Object} params - Parameters with multiple identification options
     * @returns {Promise<Object>} Click result
     */
    async clickElement(params) {
        const { 
            selector, 
            text, 
            elementType = 'any',
            elementIndex,
            position,
            ariaLabel,
            title,
            nearbyText,
            fallbackStrategies = true
        } = params;
        
        // Try to find the element using various strategies
        const element = await this.findElementWithFallbacks(params);
        
        if (!element) {
            throw new Error('Element not found using any identification strategy');
        }

        // Get the final selector or coordinates for the click
        const clickTarget = this.getClickTarget(element, params);

        // Emit event for the content script to handle
        this.eventBus.emit(EVENTS.DOM.CLICK, { 
            element: clickTarget.element,
            selector: clickTarget.selector,
            coordinates: clickTarget.coordinates,
            method: clickTarget.method,
            elementType,
            originalParams: params
        });
        
        return {
            action: 'click',
            target: clickTarget.description,
            method: clickTarget.method,
            element: {
                tagName: element.tagName.toLowerCase(),
                text: element.textContent?.trim().slice(0, 50) || '',
                position: {
                    x: Math.round(element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2),
                    y: Math.round(element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)
                }
            },
            timestamp: Date.now(),
            message: `Click action initiated using ${clickTarget.method}`
        };
    }

    /**
     * Find element using multiple fallback strategies
     * @param {Object} params - Search parameters
     * @returns {Promise<Element|null>} Found element or null
     */
    async findElementWithFallbacks(params) {
        const strategies = this.buildSearchStrategies(params);
        
        for (const strategy of strategies) {
            console.log(`[DOMAgent] Trying strategy: ${strategy.name}`);
            
            try {
                const element = await strategy.finder();
                if (element && this.isElementClickable(element)) {
                    console.log(`[DOMAgent] Found element using: ${strategy.name}`);
                    return element;
                }
            } catch (error) {
                console.log(`[DOMAgent] Strategy ${strategy.name} failed:`, error.message);
            }
        }
        
        return null;
    }

    /**
     * Build ordered list of search strategies based on available parameters
     * @param {Object} params - Search parameters
     * @returns {Array} Ordered array of search strategies
     */
    buildSearchStrategies(params) {
        const strategies = [];
        const pageContent = this.pageExtractor.extractPageContent();
        
        // Strategy 1: Element index (most reliable if available)
        if (typeof params.elementIndex === 'number' && pageContent.interactiveElements) {
            strategies.push({
                name: 'element-index',
                finder: () => this.findByElementIndex(params.elementIndex, pageContent.interactiveElements)
            });
        }
        
        // Strategy 2: Direct CSS selector
        if (params.selector) {
            strategies.push({
                name: 'css-selector',
                finder: () => document.querySelector(params.selector)
            });
        }
        
        // Strategy 3: Aria label
        if (params.ariaLabel) {
            strategies.push({
                name: 'aria-label',
                finder: () => document.querySelector(`[aria-label="${params.ariaLabel}"]`)
            });
        }
        
        // Strategy 4: Title attribute
        if (params.title) {
            strategies.push({
                name: 'title-attribute',
                finder: () => document.querySelector(`[title="${params.title}"]`)
            });
        }
        
        // Strategy 5: Exact text match
        if (params.text) {
            strategies.push({
                name: 'exact-text',
                finder: () => this.findByExactText(params.text, params.elementType)
            });
        }
        
        // Strategy 6: Partial text match
        if (params.text) {
            strategies.push({
                name: 'partial-text',
                finder: () => this.findByPartialText(params.text, params.elementType)
            });
        }
        
        // Strategy 7: Nearby text context
        if (params.nearbyText) {
            strategies.push({
                name: 'nearby-text',
                finder: () => this.findByNearbyText(params.nearbyText, params.elementType)
            });
        }
        
        // Strategy 8: Position-based (coordinate matching)
        if (params.position?.x && params.position?.y) {
            strategies.push({
                name: 'position-based',
                finder: () => this.findByPosition(params.position.x, params.position.y)
            });
        }
        
        return strategies;
    }

    /**
     * Find element by index from page extraction
     * @param {number} index - Element index
     * @param {Array} interactiveElements - Interactive elements from page extraction
     * @returns {Element|null} Found element
     */
    findByElementIndex(index, interactiveElements) {
        const elementData = interactiveElements[index];
        if (!elementData) return null;
        
        // Try the unique selector first
        if (elementData.selectors?.unique) {
            const element = document.querySelector(elementData.selectors.unique);
            if (element) return element;
        }
        
        // Try other selectors from the element data
        const selectorStrategies = ['id', 'className', 'byAriaLabel', 'byTitle', 'xpath'];
        for (const strategy of selectorStrategies) {
            const selector = elementData.selectors?.[strategy];
            if (selector && selector !== 'null') {
                try {
                    const element = document.querySelector(selector);
                    if (element) return element;
                } catch (e) {
                    // Invalid selector, continue
                }
            }
        }
        
        return null;
    }

    /**
     * Find element by exact text content
     * @param {string} text - Text to match
     * @param {string} elementType - Element type filter
     * @returns {Element|null} Found element
     */
    findByExactText(text, elementType) {
        const selectors = this.getSelectorsForElementType(elementType);
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (this.getElementDisplayText(element).toLowerCase() === text.toLowerCase()) {
                    return element;
                }
            }
        }
        
        return null;
    }

    /**
     * Find element by partial text content
     * @param {string} text - Text to match
     * @param {string} elementType - Element type filter
     * @returns {Element|null} Found element
     */
    findByPartialText(text, elementType) {
        const selectors = this.getSelectorsForElementType(elementType);
        const searchText = text.toLowerCase();
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (this.getElementDisplayText(element).toLowerCase().includes(searchText)) {
                    return element;
                }
            }
        }
        
        return null;
    }

    /**
     * Find element by nearby text context
     * @param {string} nearbyText - Text that should be near the element
     * @param {string} elementType - Element type filter
     * @returns {Element|null} Found element
     */
    findByNearbyText(nearbyText, elementType) {
        const selectors = this.getSelectorsForElementType(elementType);
        const searchText = nearbyText.toLowerCase();
        
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                // Check text in parent, siblings, and nearby elements
                const contextText = this.getElementContextText(element).toLowerCase();
                if (contextText.includes(searchText)) {
                    return element;
                }
            }
        }
        
        return null;
    }

    /**
     * Find element by position (closest to coordinates)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Element|null} Found element
     */
    findByPosition(x, y) {
        const element = document.elementFromPoint(x, y);
        if (element && this.isElementClickable(element)) {
            return element;
        }
        
        // If direct hit doesn't work, find closest clickable element
        const clickableElements = document.querySelectorAll(
            'button, a[href], input[type="button"], input[type="submit"], [role="button"], [onclick]'
        );
        
        let closest = null;
        let minDistance = Infinity;
        
        for (const el of clickableElements) {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
            
            if (distance < minDistance && distance < 50) { // Within 50 pixels
                minDistance = distance;
                closest = el;
            }
        }
        
        return closest;
    }

    /**
     * Get selectors based on element type
     * @param {string} elementType - Element type filter
     * @returns {Array} Array of CSS selectors
     */
    getSelectorsForElementType(elementType) {
        const selectorMap = {
            button: ['button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]'],
            link: ['a[href]'],
            input: ['input', 'textarea', 'select'],
            any: [
                'button', 'a[href]', 'input', 'textarea', 'select', 
                '[role="button"]', '[onclick]', '.btn', '.button'
            ]
        };
        
        return selectorMap[elementType] || selectorMap.any;
    }

    /**
     * Get display text from element
     * @param {Element} element - Target element
     * @returns {string} Display text
     */
    getElementDisplayText(element) {
        return element.textContent?.trim() || 
               element.value || 
               element.getAttribute('aria-label') || 
               element.getAttribute('title') || 
               element.getAttribute('alt') || '';
    }

    /**
     * Get context text around element
     * @param {Element} element - Target element
     * @returns {string} Context text
     */
    getElementContextText(element) {
        const texts = [];
        
        // Parent text
        if (element.parentElement) {
            const parentClone = element.parentElement.cloneNode(true);
            Array.from(parentClone.children).forEach(child => child.remove());
            texts.push(parentClone.textContent?.trim() || '');
        }
        
        // Sibling text
        if (element.previousElementSibling) {
            texts.push(element.previousElementSibling.textContent?.trim() || '');
        }
        if (element.nextElementSibling) {
            texts.push(element.nextElementSibling.textContent?.trim() || '');
        }
        
        return texts.join(' ');
    }

    /**
     * Check if element is clickable
     * @param {Element} element - Element to check
     * @returns {boolean} True if clickable
     */
    isElementClickable(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return (
            rect.width > 0 && 
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.pointerEvents !== 'none' &&
            !element.disabled
        );
    }

    /**
     * Get click target information for the found element
     * @param {Element} element - Found element
     * @param {Object} params - Original parameters
     * @returns {Object} Click target information
     */
    getClickTarget(element, params) {
        const rect = element.getBoundingClientRect();
        const centerX = Math.round(rect.left + rect.width / 2);
        const centerY = Math.round(rect.top + rect.height / 2);
        
        // Generate a reliable selector for the element
        let selector = null;
        if (element.id) {
            selector = `#${element.id}`;
        } else if (element.className) {
            selector = `.${element.className.replace(/\s+/g, '.')}`;
        } else {
            selector = element.tagName.toLowerCase();
        }
        
        return {
            element: element,
            selector: selector,
            coordinates: { x: centerX, y: centerY },
            method: params.elementIndex !== undefined ? 'element-index' : 
                    params.selector ? 'css-selector' : 
                    params.text ? 'text-match' : 'fallback',
            description: `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ')[0] : ''}`
        };
    }

    /**
     * Fill form fields
     * @param {Object} params - Parameters containing fields and optional formSelector
     * @returns {Promise<Object>} Form fill result
     */
    async formFill(params) {
        const { fields, formSelector } = params;
        
        if (!fields || typeof fields !== 'object') {
            throw new Error('Fields parameter is required and must be an object');
        }

        // Emit event for the content script to handle
        this.eventBus.emit(EVENTS.DOM.FORM_FILL, { 
            fields, 
            formSelector 
        });
        
        return {
            action: 'form_fill',
            fields: Object.keys(fields),
            formSelector,
            timestamp: Date.now(),
            message: `Form fill initiated for ${Object.keys(fields).length} field(s)`
        };
    }

    /**
     * Extract elements from the page
     * @param {Object} params - Parameters containing selector and optional attributes
     * @returns {Promise<Object>} Extracted elements data
     */
    async extractElements(params) {
        const { selector, attributes = ['textContent', 'href', 'src'] } = params;
        
        if (!selector) {
            throw new Error('Selector parameter is required');
        }

        try {
            const elements = document.querySelectorAll(selector);
            const extracted = [];

            elements.forEach((element, index) => {
                const elementData = {
                    index,
                    tagName: element.tagName.toLowerCase()
                };

                attributes.forEach(attr => {
                    if (attr === 'textContent') {
                        elementData.textContent = element.textContent.trim();
                    } else if (attr === 'innerHTML') {
                        elementData.innerHTML = element.innerHTML;
                    } else if (element.hasAttribute(attr)) {
                        elementData[attr] = element.getAttribute(attr);
                    } else if (element[attr] !== undefined) {
                        elementData[attr] = element[attr];
                    }
                });

                extracted.push(elementData);
            });

            return {
                action: 'extract_elements',
                selector,
                count: extracted.length,
                elements: extracted,
                timestamp: Date.now()
            };

        } catch (error) {
            throw new Error(`Failed to extract elements: ${error.message}`);
        }
    }

    /**
     * Scroll to an element or position
     * @param {Object} params - Parameters containing selector or x/y coordinates
     * @returns {Promise<Object>} Scroll result
     */
    async scrollTo(params) {
        const { selector, x, y } = params;
        
        if (!selector && (x === undefined || y === undefined)) {
            throw new Error('Either selector or x/y coordinates are required');
        }

        // Emit event for the content script to handle
        this.eventBus.emit(EVENTS.DOM.SCROLL, { 
            selector, 
            x, 
            y 
        });
        
        return {
            action: 'scroll',
            target: selector || `coordinates (${x}, ${y})`,
            timestamp: Date.now(),
            message: `Scroll action initiated`
        };
    }

    /**
     * Wait for an element to appear
     * @param {Object} params - Parameters containing selector and optional timeout
     * @returns {Promise<Object>} Wait result
     */
    async waitForElement(params) {
        const { selector, timeout = 5000 } = params;
        
        if (!selector) {
            throw new Error('Selector parameter is required');
        }

        try {
            const startTime = Date.now();
            
            return new Promise((resolve, reject) => {
                const checkElement = () => {
                    const element = document.querySelector(selector);
                    
                    if (element) {
                        resolve({
                            action: 'wait_for_element',
                            selector,
                            found: true,
                            waitTime: Date.now() - startTime,
                            timestamp: Date.now(),
                            message: `Element found after ${Date.now() - startTime}ms`
                        });
                    } else if (Date.now() - startTime >= timeout) {
                        reject(new Error(`Element not found within ${timeout}ms timeout`));
                    } else {
                        setTimeout(checkElement, 100);
                    }
                };
                
                checkElement();
            });

        } catch (error) {
            throw new Error(`Wait for element failed: ${error.message}`);
        }
    }

    /**
     * Check if a tool name is a DOM tool
     * @param {string} toolName - Name of the tool
     * @returns {boolean} True if it's a DOM tool
     */
    isDOMTool(toolName) {
        return this.tools.some(tool => tool.name === toolName);
    }

    /**
     * Get page context (similar to MCP tools that might need page info)
     * @returns {Object} Current page context
     */
    getPageContext() {
        return this.pageExtractor.extractPageContent();
    }
}