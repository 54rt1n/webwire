/**
 * DOM Agent - Browser Automation Tool Executor
 *
 * Provides DOM manipulation tools that can be called directly. This agent
 * finds elements on the page and performs actions like clicking, filling forms,
 * and navigating. It is the final executor for local browser automation tasks.
 */
import { SemanticPageExtractor } from './page-utils.js';
import { generateUUID } from '../utils/id-generator.js';

export class DOMAgent {
    constructor(eventBus) {
        // EventBus is kept for potential future use (e.g., logging) but is no longer used for core actions.
        this.eventBus = eventBus;
        this.pageExtractor = new SemanticPageExtractor();
        this.sessionId = generateUUID();
        
        // Available DOM tools
        this.tools = [
            {
                name: 'navigate_to_url',
                description: 'Navigate the current tab to a specific URL.',
                parameters: {
                    type: 'object',
                    properties: { url: { type: 'string', description: 'The full URL to navigate to.' } },
                    required: ['url'],
                },
            },
            {
                name: 'click_element',
                description: 'Click on a page element using a robust set of identification strategies.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string', description: 'CSS selector for the element.' },
                        text: { type: 'string', description: 'Text content to match as an alternative.' },
                        elementIndex: { type: 'number', description: 'Index from page extraction (most reliable).' },
                        ariaLabel: { type: 'string', description: 'Aria-label attribute to match.' },
                    },
                },
            },
            {
                name: 'form_fill',
                description: 'Fill out form fields based on provided data.',
                parameters: {
                    type: 'object',
                    properties: {
                        fields: { type: 'object', description: 'Object mapping field identifiers to values.' },
                        formSelector: { type: 'string', description: 'Optional selector for a specific form.' },
                    },
                    required: ['fields'],
                },
            },
        ];
    }

    /**
     * Get available DOM tools.
     * @returns {Array} Array of available tools with their schemas.
     */
    getAvailableTools() {
        return this.tools;
    }

    /**
     * Check if a tool name is a known DOM tool.
     * @param {string} toolName - Name of the tool.
     * @returns {boolean} True if it's a DOM tool.
     */
    isTool(toolName) {
        return this.tools.some(tool => tool.name === toolName);
    }

    /**
     * Execute a DOM tool. This is the main entry point.
     * @param {string} toolName - Name of the tool to execute.
     * @param {Object} parameters - Tool parameters.
     * @returns {Promise<Object>} Tool execution result.
     */
    async executeTool(toolName, parameters = {}) {
        const executionStart = Date.now();
        const toolCallId = generateUUID();

        console.log(`[DOMAgent] Executing tool: ${toolName}`, parameters);

        try {
            if (!this.isTool(toolName)) {
                throw new Error(`Unknown DOM tool: ${toolName}`);
            }

            const result = await this[toolName](parameters);

            return {
                callId: toolCallId,
                name: toolName,
                parameters,
                success: true,
                result: result || { status: 'completed' },
                executionTime: Date.now() - executionStart,
            };

        } catch (error) {
            console.error(`[DOMAgent] Tool ${toolName} execution failed:`, error);
            return {
                callId: toolCallId,
                name: toolName,
                parameters,
                success: false,
                error: error.message,
                executionTime: Date.now() - executionStart,
            };
        }
    }

    // --- Tool Implementations ---

    /**
     * Navigates the browser to the specified URL.
     * @param {Object} params - { url: string }.
     */
    async navigate_to_url({ url }) {
        if (!url || typeof url !== 'string') {
            throw new Error('URL parameter is required and must be a string.');
        }
        console.log(`[DOMAgent] Navigating to: ${url}`);
        window.location.href = url;
        // The page will reload, so this promise might not resolve in the current context.
        return { message: `Navigation to ${url} initiated.` };
    }

    /**
     * Clicks on a DOM element identified by various strategies.
     * @param {Object} params - { selector?, text?, elementIndex?, ariaLabel? }.
     */
    async click_element(params) {
        const element = this.findElement(params);
        if (!element) {
            throw new Error(`Element not found for parameters: ${JSON.stringify(params)}`);
        }
        
        console.log('[DOMAgent] Clicking element:', element);
        element.click();
        
        return {
            message: `Clicked element successfully.`,
            tagName: element.tagName,
            text: element.textContent?.trim().slice(0, 50),
        };
    }

    /**
     * Fills form fields based on provided data.
     * @param {Object} params - { fields: { identifier: value, ... }, formSelector? }.
     */
    async form_fill({ fields, formSelector }) {
        if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
            throw new Error('`fields` parameter is required and must be a non-empty object.');
        }

        const form = formSelector ? document.querySelector(formSelector) : document;
        if (!form) {
            throw new Error(`Form with selector "${formSelector}" not found.`);
        }

        let fieldsFilled = 0;
        for (const [identifier, value] of Object.entries(fields)) {
            // Try to find by name, id, or placeholder
            const input = form.querySelector(`[name="${identifier}"], #${identifier}, [placeholder="${identifier}"]`);
            if (input) {
                input.value = value;
                // Dispatch input event to trigger any reactive frameworks
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                fieldsFilled++;
            } else {
                console.warn(`[DOMAgent] Could not find form field with identifier: ${identifier}`);
            }
        }

        if (fieldsFilled === 0) {
            throw new Error('No matching form fields were found to fill.');
        }

        return { message: `Filled ${fieldsFilled} of ${Object.keys(fields).length} provided fields.` };
    }

    // --- Helper Methods ---

    /**
     * Finds a single element using multiple strategies.
     * @param {Object} params - The search parameters.
     * @returns {Element|null} The found element or null.
     */
    findElement(params) {
        const strategies = [
            // Most specific first
            () => params.elementIndex !== undefined ? this.findByElementIndex(params.elementIndex) : null,
            () => params.selector ? document.querySelector(params.selector) : null,
            () => params.ariaLabel ? document.querySelector(`[aria-label="${params.ariaLabel}"]`) : null,
            // Text-based matching (less specific)
            () => params.text ? this.findByText(params.text) : null,
        ];

        for (const strategy of strategies) {
            const element = strategy();
            if (element && this.isElementVisible(element)) {
                return element;
            }
        }
        return null;
    }

    /**
     * Finds an element by its index from the page extraction data.
     * @param {number} index - The element's index.
     * @returns {Element|null} The found element.
     */
    findByElementIndex(index) {
        const pageContent = this.pageExtractor.extractPageContent();
        const elementData = pageContent.interactiveElements[index];
        if (!elementData) return null;

        // Try the most unique selector first
        if (elementData.selectors?.unique) {
            const uniqueEl = document.querySelector(elementData.selectors.unique);
            if (uniqueEl) return uniqueEl;
        }
        
        // Fallback to XPath if unique selector fails
        if (elementData.selectors?.xpath) {
            try {
                return document.evaluate(elementData.selectors.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            } catch (e) {
                console.warn(`[DOMAgent] Invalid XPath: ${elementData.selectors.xpath}`);
            }
        }
        return null;
    }

    /**
     * Finds an element by its text content (case-insensitive, partial match).
     * @param {string} text - The text to search for.
     * @returns {Element|null} The found element.
     */
    findByText(text) {
        const searchText = text.toLowerCase();
        const elements = document.querySelectorAll('button, a, [role="button"], [role="link"]');
        for (const el of elements) {
            if (el.textContent.toLowerCase().includes(searchText)) {
                return el;
            }
        }
        return null;
    }

    /**
     * Checks if an element is visible and intractable.
     * @param {Element} element - The element to check.
     * @returns {boolean} True if the element is visible.
     */
    isElementVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    }
}