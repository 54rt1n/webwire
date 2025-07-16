/**
 * DOM Connector - Event-based Browser Automation Interface
 * 
 * Provides a connector interface that mimics MCP connector but dispatches
 * DOM manipulation events to the content script for execution.
 * This runs in the ChatService context and communicates via events.
 */

import { generateUUID } from '../utils/id-generator.js';
import { EVENTS } from '../core/events.js';

export class DOMConnector {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.sessionId = generateUUID();
        this.pendingOperations = new Map(); // Track pending DOM operations
        
        // Available DOM tools (same as DOMAgent but for discovery)
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
                description: 'Click on an element by selector or text content',
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

        this.setupEventListeners();
    }

    /**
     * Setup event listeners for DOM operation responses
     */
    setupEventListeners() {
        // Listen for DOM operation results from content script
        this.eventBus.on(EVENTS.DOM.OPERATION_COMPLETE, this.handleOperationComplete.bind(this));
        this.eventBus.on(EVENTS.DOM.OPERATION_ERROR, this.handleOperationError.bind(this));
    }

    /**
     * Get available DOM tools (mimics MCP connector interface)
     * @returns {Array} Array of available tools
     */
    getAvailableTools() {
        return this.tools;
    }

    /**
     * Execute a DOM tool by dispatching events to content script
     * @param {string} toolName - Name of the tool to execute
     * @param {Object} parameters - Tool parameters
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Tool execution result
     */
    async executeTool(toolName, parameters = {}, options = {}) {
        const executionStart = Date.now();
        const operationId = generateUUID();

        console.log(`[DOMConnector] Executing tool: ${toolName}`, parameters);

        try {
            // Validate tool exists
            if (!this.isTool(toolName)) {
                throw new Error(`Unknown DOM tool: ${toolName}`);
            }

            // Create promise that will be resolved when operation completes
            const operationPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pendingOperations.delete(operationId);
                    reject(new Error(`DOM operation timeout for ${toolName}`));
                }, options.timeout || 10000);

                this.pendingOperations.set(operationId, {
                    resolve,
                    reject,
                    timeout,
                    toolName,
                    parameters,
                    startTime: executionStart
                });
            });

            // Dispatch the DOM operation event to content script
            this.eventBus.emit('dispatch:outbound', {
                target: 'host',
                event: EVENTS.DOM.EXECUTE,
                data: {
                    operationId,
                    toolName,
                    parameters
                }
            });

            // Wait for the operation to complete
            const result = await operationPromise;

            return {
                callId: operationId,
                name: toolName,
                parameters: parameters,
                success: true,
                result: result,
                executionTime: Date.now() - executionStart
            };

        } catch (error) {
            console.error(`[DOMConnector] Tool ${toolName} execution failed:`, error);
            
            return {
                callId: operationId,
                name: toolName,
                parameters: parameters,
                success: false,
                error: error.message,
                executionTime: Date.now() - executionStart
            };
        }
    }

    /**
     * Handle operation completion from content script
     * @param {Object} payload - Operation result payload
     */
    handleOperationComplete(payload) {
        const { operationId, result } = payload;
        const operation = this.pendingOperations.get(operationId);

        if (operation) {
            clearTimeout(operation.timeout);
            this.pendingOperations.delete(operationId);
            operation.resolve(result);
        } else {
            console.warn(`[DOMConnector] Received result for unknown operation: ${operationId}`);
        }
    }

    /**
     * Handle operation error from content script
     * @param {Object} payload - Operation error payload
     */
    handleOperationError(payload) {
        const { operationId, error } = payload;
        const operation = this.pendingOperations.get(operationId);

        if (operation) {
            clearTimeout(operation.timeout);
            this.pendingOperations.delete(operationId);
            operation.reject(new Error(error));
        } else {
            console.warn(`[DOMConnector] Received error for unknown operation: ${operationId}`);
        }
    }

    /**
     * Check if a tool name is a DOM tool
     * @param {string} toolName - Name of the tool
     * @returns {boolean} True if it's a DOM tool
     */
    isTool(toolName) {
        return this.tools.some(tool => tool.name === toolName);
    }

    /**
     * Initialize the DOM connector (mimics MCP connector interface)
     * @returns {Promise<Array>} Promise resolving to array of available tools
     */
    async initialize() {
        console.log('[DOMConnector] Initializing DOM connector...');
        return this.tools;
    }

    /**
     * Disconnect the DOM connector (mimics MCP connector interface)
     */
    disconnect() {
        // Clear any pending operations
        for (const [operationId, operation] of this.pendingOperations) {
            clearTimeout(operation.timeout);
            operation.reject(new Error('DOM connector disconnected'));
        }
        this.pendingOperations.clear();
        console.log('[DOMConnector] DOM connector disconnected');
    }

    /**
     * Check if DOM tools are available
     * @returns {boolean} True if DOM tools are available
     */
    isConnected() {
        // DOM tools are always available in browser context
        return typeof window !== 'undefined' && typeof document !== 'undefined';
    }
}