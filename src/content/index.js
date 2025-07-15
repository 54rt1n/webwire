import { EventBus } from '../js/core/event-bus.js';
import { EVENTS } from '../js/core/events.js';
import { ChatService } from '../chat/chat-service.js';
import { PageUtils } from '../js/browser/page-utils.js';
import { DOMAgent } from '../js/browser/dom-agent.js';
import { WebWireClientCore } from '../js/client/webwire-client-core.js';
import { setupDebugMethods, setupGlobalDebugAccess } from './debug.js';
import {
    BACKGROUND_ACTIONS,
    CONTENT_ACTIONS,
    KEYBOARD_SHORTCUTS,
    DOM_READY_STATES
} from '../chat/chat-constants.js';
import '../shared/global.scss';
import '../chat/chat.scss';

/**
 * WebWire Content Script - Thin Host/Adapter
 * 
 * This is now a lightweight adapter that hosts the ChatService and handles:
 * - Chrome extension APIs (chrome.runtime, chrome.tabs)
 * - Window/DOM event listeners
 * - Translation between Chrome APIs and ChatService events
 * 
 * All the core chat logic has been moved to ChatService.
 */
class WebWireContentHost {
    constructor() {
        // Create event bus for communication with ChatService
        this.eventBus = new EventBus({domain: 'content', debug: true});
        
        // Create WebWire core for infrastructure
        this.core = new WebWireClientCore(this.eventBus);
        
        // Create the chat service (platform-agnostic core)
        this.chatService = new ChatService(this.eventBus);
        
        // Host state
        this.currentSettings = {};
        this.currentThreadId = null;
        this.pageUtils = new PageUtils();
        this.domAgent = new DOMAgent(this.eventBus);

        this.initialized = false;
        
        // Setup host-specific event handlers
        this.setupHostEventHandlers();
        this.setupChatServiceEvents();
    }

    /**
     * Setup event handlers that the host manages
     */
    setupHostEventHandlers() {
        // Listen for outbound dispatch requests from ChatService
        this.eventBus.on('dispatch:outbound', this.handleOutboundDispatch.bind(this));
        
        console.log('[WebWireContentHost] Host event handlers set up');
    }

    /**
     * Setup event handling between ChatService and background using EventDispatcher
     */
    setupChatServiceEvents() {
        // Handle outbound requests from ChatService using dispatcher
        this.eventBus.onAsync(EVENTS.CHAT.SAVE_MESSAGE, this.handleSaveMessage.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.GET_OR_CREATE_THREAD, this.handleGetOrCreateThread.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.SAVE_PANEL_VISIBILITY, this.handleSavePanelVisibility.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.EXECUTE_TOOL, this.handleExecuteTool.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.CREATE_NEW_THREAD, this.handleCreateNewThread.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.END_CONVERSATION, this.handleEndConversation.bind(this));
        this.eventBus.onAsync(EVENTS.CHAT.UPDATE_SETTINGS, this.handleUpdateSettings.bind(this));
        
        // Handle content actions from background script
        this.eventBus.onAsync(CONTENT_ACTIONS.INJECT_WEBWIRE_PANEL, this.handleInjectPanel.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.TOGGLE_WEBWIRE_PANEL, this.handleTogglePanel.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.GET_WEBWIRE_STATE, this.handleGetWebwireState.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.SETTINGS_CHANGED, this.handleSettingsChanged.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.CONVERSATION_UPDATED, this.handleConversationUpdated.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.CAPTURE_PAGE_CONTENT, this.handleCapturePageContent.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.AI_CHAT_REQUEST, this.handleAIChatRequest.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.MCP_CONNECT_REQUEST, this.handleMCPConnectRequest.bind(this));
        this.eventBus.onAsync(CONTENT_ACTIONS.PING, this.handlePing.bind(this));
    }

    /**
     * Handle save message request using EventDispatcher
     */
    async handleSaveMessage(data) {
        try {
            const threadId = data.threadId;
            if (!threadId) {
                console.log('[WebWireContentHost] No threadId found in data:', data);
                throw new Error('[WebWireContentHost] No threadId found in data');
            }

            const response = await this.core.dispatcher.dispatch(
                BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE,
                data,
                { target: 'background' }
            );
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to save message:', error);
            throw error;
        }
    }

    /**
     * Handle get or create thread request using EventDispatcher
     */
    async handleGetOrCreateThread(data) {
        try {
            const response = await this.core.dispatcher.dispatch(
                BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD,
                data,
                { target: 'background' }
            );

            console.log('[WebWireContentHost] handleGetOrCreateThread', response);
            
            // Emit conversation loaded event for ChatService
            if (response.success && response.result) {
                // CRITICAL: Update local conversation state from background data
                if (this.core.stateService && this.core.stateService.conversation) {
                    console.log('[WebWireContentHost] Syncing thread state from background:', response.result.threadId);
                    this.core.stateService.conversation.patchConversation({
                        threadId: response.result.threadId,
                        metadata: response.result.metadata,
                        messages: response.result.messages,
                        isActive: true  // This is the current active thread
                    });
                }
                
                this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
                    conversation: response.result
                });
            } else {
                console.error('[WebWireContentHost] Failed to get/create thread:', response.error);
            }
            
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to get/create thread:', error);
            throw error;
        }
    }

    /**
     * Handle save panel visibility using EventDispatcher
     */
    async handleSavePanelVisibility(data) {
        try {
            const response = await this.core.dispatcher.dispatch(
                BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY,
                data,
                { target: 'background' }
            );
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to save panel visibility:', error);
            throw error;
        }
    }

    /**
     * Handle tool execution request from ChatService
     */
    async handleExecuteTool(data) {
        console.log('[WebWireContentHost] Handling execute tool request:', data);
        
        const { toolName, parameters } = data;
        
        // List of DOM tools that should be handled locally
        const domTools = ['navigate_to_url', 'click_element', 'form_fill', 'extract_elements', 'scroll_to', 'wait_for_element'];
        
        try {
            if (domTools.includes(toolName)) {
                // Handle DOM tools locally using the DOM agent
                console.log('[WebWireContentHost] Executing DOM tool locally:', toolName);
                const result = await this.domAgent.executeTool(toolName, parameters);
                console.log('[WebWireContentHost] DOM tool execution result:', result);
                return result;
            } else {
                // Handle MCP tools using the MCP connector
                if (!this.core.mcpConnector) {
                    console.error('[WebWireContentHost] No MCP connector available for tool execution');
                    throw new Error('MCP connector not available');
                }
                
                console.log('[WebWireContentHost] Executing MCP tool:', toolName);
                const result = await this.core.mcpConnector.executeTool(toolName, parameters);
                console.log('[WebWireContentHost] MCP tool execution result:', result);
                return result;
            }
        } catch (error) {
            console.error('[WebWireContentHost] Failed to execute tool:', error);
            throw error;
        }
    }

    /**
     * Handle end conversation request from ChatService
     */
    async handleEndConversation(data) {
        console.log('[WebWireContentHost] Handling end conversation request:', data);
        
        try {
            const response = await this.core.dispatcher.dispatch(
                BACKGROUND_ACTIONS.END_CONVERSATION,
                data,
                { target: 'background' }
            );
            
            console.log('[WebWireContentHost] End conversation response:', response);
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to end conversation:', error);
            throw error;
        }
    }

    /**
     * Handle create new thread request from ChatService
     */
    async handleCreateNewThread(data) {
        console.log('[WebWireContentHost] Handling create new thread request:', data);
        
        try {
            const response = await this.core.dispatcher.dispatch(
                BACKGROUND_ACTIONS.CREATE_NEW_THREAD,
                data,
                { target: 'background' }
            );
            
            if (response.success && response.thread) {
                this.currentThreadId = response.thread.threadId;
                
                // CRITICAL: Update local conversation state from background data
                if (this.core.stateService && this.core.stateService.conversation) {
                    console.log('[WebWireContentHost] Syncing new thread state from background:', response.thread.threadId);
                    this.core.stateService.conversation.patchConversation({
                        threadId: response.thread.threadId,
                        metadata: response.thread.metadata,
                        messages: response.thread.messages || [],
                        isActive: true  // This is the new active thread
                    });
                }
                
                // Emit conversation loaded event for ChatService
                this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
                    conversation: response.thread
                });
            }
            
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to create new thread:', error);
            throw error;
        }
    }

    /**
     * Handle update settings request using EventDispatcher
     */
    async handleUpdateSettings(data) {
        console.log('[WebWireContentHost] Handling settings update request:', data);
        try {
            const response = await this.core.dispatcher.dispatch(
                BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
                data,
                { target: 'background' }
            );
            console.log('[WebWireContentHost] Settings update response from background:', response);
            return response;
        } catch (error) {
            console.error('[WebWireContentHost] Failed to update settings:', error);
            throw error;
        }
    }

    /**
     * Initialize the content host
     */
    async initialize() {
        console.log('[WebWireContentHost] Starting initialization...');

        if (this.initialized) {
            throw new Error('[WebWireContentHost] Already initialized');
        }

        this.initialized = true;
        
        // Initialize WebWire core
        await this.core.initialize();
        
        console.log('[WebWireContentHost] Core initialized with:', {
            stateService: !!this.core.stateService,
            aiClient: !!this.core.aiClient,
            mcpConnector: !!this.core.mcpConnector
        });
        
        // Initialize ChatService with the core services
        await this.chatService.initialize(this.core.aiClient, this.core.mcpConnector, this.core.stateService);
        console.log('[WebWireContentHost] ChatService initialized');
        
        console.log('[WebWireContentHost] Extension communication ready via EventDispatcher');
        
        
        // Set up keyboard shortcuts and injection listeners
        this.setupUIListeners();
        console.log('[WebWireContentHost] UI listeners set up');
        
        // Handle auto-inject and panel restoration
        try {
            const shouldInject = await this.shouldAutoInject();
            const shouldShowPanel = this.core.stateService.ui?.panelVisible || false;
            
            if (shouldInject || shouldShowPanel) {
                console.log(shouldInject ? 'Auto-inject enabled, injecting panel...' : 'Panel was previously visible, restoring...');
                await this.injectPanel();
                
                if (shouldShowPanel) {
                    console.log('Showing panel based on background state');
                    setTimeout(() => {
                        this.chatService.showPanel();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('[WebWireContentHost] Auto-inject/restore failed:', error);
        }
        
        console.log('[WebWireContentHost] Initialization complete');
    }

    /**
     * Handle outbound dispatch requests from ChatService
     */
    async handleOutboundDispatch(payload) {
        console.log('[WebWireContentHost] Handling outbound dispatch:', payload);
        
        const { target, event, data } = payload;
        
        try {
            if (target === 'background') {
                await this.handleBackgroundDispatch(event, data);
            } else if (target === 'host') {
                await this.handleHostDispatch(event, data);
            } else {
                console.warn('[WebWireContentHost] Unknown dispatch target:', target);
            }
        } catch (error) {
            console.error('[WebWireContentHost] Error handling outbound dispatch:', error);
        }
    }

    /**
     * Handle dispatches to the background script
     */
    async handleBackgroundDispatch(event, data) {
        switch (event) {
            case EVENTS.THREADS.GET_OR_CREATE:
                const threadResponse = await this.core.dispatcher.dispatch(
                    BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD,
                    data,
                    { target: 'background' }
                );

                if (threadResponse.success) {
                    const { threadId, metadata, messages } = threadResponse.thread;
                    this.currentThreadId = threadId;
                    
                    // CRITICAL: Update local conversation state from background data
                    if (this.core.stateService && this.core.stateService.conversation) {
                        console.log('[WebWireContentHost] Syncing thread state from background dispatch:', threadId);
                        this.core.stateService.conversation.patchConversation({
                            threadId,
                            metadata,
                            messages,
                            isActive: true  // This is the current active thread
                        });
                    }
                    
                    // Send conversation history back to ChatService
                    this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, {
                        conversation: {
                            threadId,
                            metadata,
                            messages
                        }
                    });
                } else {
                    console.error('[WebWireContentHost] Failed to get thread:', threadResponse.error);
                }
                break;

            case EVENTS.THREADS.SAVE_MESSAGE:
                const saveResponse = await this.core.dispatcher.dispatch(
                    BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE,
                    data,
                    { target: 'background' }
                );

                if (!saveResponse.success) {
                    console.warn('[WebWireContentHost] Failed to save conversation:', saveResponse.error);
                }
                break;

            case EVENTS.UI.SAVE_PANEL_VISIBILITY:
                const visibilityResponse = await this.core.dispatcher.dispatch(
                    BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY,
                    data,
                    { target: 'background' }
                );

                if (!visibilityResponse.success) {
                    console.warn('[WebWireContentHost] Failed to save panel visibility:', visibilityResponse.error);
                }
                break;

            default:
                console.warn('[WebWireContentHost] Unknown background event:', event);
        }
    }

    /**
     * Handle dispatches to the host itself
     */
    async handleHostDispatch(event, data) {
        switch (event) {
            case EVENTS.UI.INJECT_PANEL:
                await this.injectPanel();
                break;
                
            case EVENTS.DOM.EXECUTE:
                await this.handleDOMExecute(data);
                break;

            default:
                console.warn('[WebWireContentHost] Unknown host event:', event);
        }
    }

    /**
     * Handle DOM operation execution request
     */
    async handleDOMExecute(data) {
        const { operationId, toolName, parameters } = data;
        
        try {
            console.log(`[WebWireContentHost] Executing DOM operation: ${toolName}`, parameters);
            
            // Execute the DOM operation using the DOM agent
            const result = await this.domAgent.executeTool(toolName, parameters);
            
            // Send success result back to chat service
            this.eventBus.emit(EVENTS.DOM.OPERATION_COMPLETE, {
                operationId,
                result: result.result
            });
            
        } catch (error) {
            console.error(`[WebWireContentHost] DOM operation failed:`, error);
            
            // Send error result back to chat service
            this.eventBus.emit(EVENTS.DOM.OPERATION_ERROR, {
                operationId,
                error: error.message
            });
        }
    }



    /**
     * Setup UI listeners (keyboard shortcuts, etc.)
     */
    setupUIListeners() {
        // Listen for extension icon clicks or other injection triggers
        document.addEventListener('webwire-inject', () => {
            this.injectPanel();
        });
        
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // Ctrl+Shift+W to toggle panel
            if (event.ctrlKey === KEYBOARD_SHORTCUTS.TOGGLE_PANEL.ctrlKey && 
                event.shiftKey === KEYBOARD_SHORTCUTS.TOGGLE_PANEL.shiftKey && 
                event.key === KEYBOARD_SHORTCUTS.TOGGLE_PANEL.key) {
                event.preventDefault();
                this.chatService.togglePanel();
            }
        });
    }



    /**
     * Check if auto-inject is enabled
     */
    async shouldAutoInject() {
        try {
            return this.currentSettings?.ui?.autoInject || false;
        } catch (error) {
            console.warn('[WebWireContentHost] Could not check auto-inject setting:', error);
            return false;
        }
    }

    /**
     * Inject the panel
     */
    async injectPanel() {
        console.log('[WebWireContentHost] Injecting panel...');
        
        try {
            // The ChatService handles its own panel initialization
            if (!this.chatService.isReady()) {
                await this.chatService.initialize();
            }
            
            await this.sendInitialStateToPanel();
            
            console.log('[WebWireContentHost] Panel injected successfully');
        } catch (error) {
            console.error('[WebWireContentHost] Failed to inject panel:', error);
        }
    }

    /**
     * Send initial state to ChatService/panel
     */
    async sendInitialStateToPanel() {
        try {
            // Get current thread from background if available
            let currentThread = null;
            try {
                const threadResponse = await this.core.dispatcher.dispatch(
                    BACKGROUND_ACTIONS.GET_ACTIVE_THREAD,
                    {},
                    { target: 'background' }
                );
                if (threadResponse.success) {
                    currentThread = threadResponse.thread;
                    
                    // CRITICAL: Update local conversation state from background data
                    if (this.core.stateService && this.core.stateService.conversation && currentThread) {
                        console.log('[WebWireContentHost] Syncing active thread state during panel init:', currentThread.threadId);
                        this.core.stateService.conversation.patchConversation({
                            threadId: currentThread.threadId,
                            metadata: currentThread.metadata,
                            messages: currentThread.messages,
                            isActive: true  // This is the active thread
                        });
                    }
                }
            } catch (error) {
                console.warn('[WebWireContentHost] Could not get active thread:', error);
            }
            
            const state = {
                currentThread: currentThread,
                mcpConnected: false, // Would need to get from ChatService
                aiClientConfigured: false, // Would need to get from ChatService
                settings: this.currentSettings,
                panelInjected: this.chatService.isReady(),
                frameworkReady: true
            };
            
            // Send to ChatService
            await this.chatService.sendInitialState(state);
            
            console.log('[WebWireContentHost] Initial state sent to ChatService');
        } catch (error) {
            console.error('[WebWireContentHost] Failed to send initial state:', error);
            const fallbackState = {
                currentThread: null,
                mcpConnected: false,
                aiClientConfigured: false,
                settings: {},
                panelInjected: this.chatService.isReady(),
                frameworkReady: false
            };
            await this.chatService.sendInitialState(fallbackState);
        }
    }

    /**
     * Handle content action: inject panel
     */
    async handleInjectPanel(data) {
        try {
            await this.injectPanel();
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to inject panel:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: toggle panel
     */
    async handleTogglePanel(data) {
        try {
            this.chatService.togglePanel();
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to toggle panel:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: get webwire state
     */
    async handleGetWebwireState(data) {
        try {
            return {
                success: true,
                state: {
                    panelInjected: this.chatService.isReady(),
                    mcpConnected: false, // ChatService would need to expose this
                    aiClientConfigured: false // ChatService would need to expose this
                }
            };
        } catch (error) {
            console.error('[WebWireContentHost] Error getting state:', error);
            return {
                success: true,
                state: {
                    panelInjected: false,
                    mcpConnected: false,
                    aiClientConfigured: false
                }
            };
        }
    }

    /**
     * Handle content action: settings changed
     */
    async handleSettingsChanged(data) {
        try {
            this.currentSettings = data.settings || {};
            this.eventBus.emit(EVENTS.CHAT.UPDATE_SETTINGS, { settings: this.currentSettings });
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to handle settings change:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: conversation updated
     */
    async handleConversationUpdated(data) {
        try {
            // The data IS the conversation update data from notifyTabsOfConversationUpdate
            const { conversation } = data;
            
            // CRITICAL: Update local conversation state from background data
            if (this.core.stateService && this.core.stateService.conversation && conversation) {
                console.log('[WebWireContentHost] Syncing conversation state from background:', conversation.threadId);
                this.core.stateService.conversation.patchConversation(conversation);
            }
            
            // Forward to ChatService for UI updates
            this.eventBus.emit(EVENTS.CHAT.CONVERSATION_LOADED, { conversation });
            return { success: true };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to handle conversation update:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: capture page content
     */
    async handleCapturePageContent(data) {
        try {
            const content = this.pageUtils.getCurrentPageContent();
            return { success: true, data: content };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to capture page content:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: AI chat request
     */
    async handleAIChatRequest(data) {
        try {
            // Delegate to ChatService - emit the appropriate event for processing
            this.eventBus.emit(EVENTS.CHAT.SEND_MESSAGE, { message: data.message || data });
            return { success: true, message: 'AI chat request processed' };
        } catch (error) {
            console.error('[WebWireContentHost] Failed to handle AI chat request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: MCP connect request
     */
    async handleMCPConnectRequest(data) {
        try {
            // Delegate to MCP system - connect to the MCP server
            if (this.core.mcpConnector) {
                await this.core.mcpConnector.connect(data.url || data.serverUrl);
                return { success: true, message: 'MCP connection initiated' };
            } else {
                return { success: false, error: 'MCP connector not available' };
            }
        } catch (error) {
            console.error('[WebWireContentHost] Failed to handle MCP connect request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle content action: ping
     */
    async handlePing(data) {
        return { success: true, status: 'ready' };
    }
}

// Global instance
let webwireContentHost = null;

// Wait for DOM to be ready
if (document.readyState === DOM_READY_STATES.LOADING) {
    document.addEventListener('DOMContentLoaded', factory);
} else {
    factory();
}

/**
 * Initialize the WebWire content host
 */
async function factory() {
    console.log('[WebWireContentHost] Initializing...');
    
    try {
        // Setup debug methods (will need to adapt for new architecture)
        setupDebugMethods(WebWireContentHost);
        
        // Create and initialize the host
        webwireContentHost = new WebWireContentHost();
        await webwireContentHost.initialize();
        
        console.log('[WebWireContentHost] Initialized successfully');
    } catch (error) {
        console.error('[WebWireContentHost] Failed to initialize:', error);
    } finally {
        // Setup global debug access
        setupGlobalDebugAccess(webwireContentHost);
    }
}