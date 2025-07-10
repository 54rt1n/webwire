import { EventBus } from '../js/core/event-bus.js';
import { ChatService } from '../chat/chat-service.js';
import { PageUtils } from '../chat/page-utils.js';
import { setupDebugMethods, setupGlobalDebugAccess } from './debug.js';
import {
    BACKGROUND_ACTIONS,
    BACKGROUND_HANDLERS,
    PANEL_ACTIONS,
    PANEL_MESSAGE_TYPES,
    MESSAGE_ROLES,
    KEYBOARD_SHORTCUTS,
    DOM_READY_STATES
} from '../chat/chat-constants.js';
import '../shared/global.scss';
import '../chat/chat.css';

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
        // Create the chat service (platform-agnostic core)
        this.chatService = new ChatService(this.eventBus);
        
        // Host state
        this.currentSettings = {};
        this.currentThreadId = null;
        this.pageUtils = new PageUtils();
        
        // Setup host-specific event handlers
        this.setupHostEventHandlers();
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
     * Initialize the content host
     */
    async initialize() {
        console.log('[WebWireContentHost] Starting initialization...');
        
        // Set up Chrome extension communication
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            this.setupExtensionCommunication();
            console.log('[WebWireContentHost] Extension communication set up');
        } else {
            console.warn('[WebWireContentHost] Chrome runtime not available - running in non-extension context');
        }
        
        // Set up panel communication (DOM/window events)
        this.setupPanelCommunication();
        console.log('[WebWireContentHost] Panel communication set up');
        
        // Set up keyboard shortcuts and injection listeners
        this.setupUIListeners();
        console.log('[WebWireContentHost] UI listeners set up');
        
        // Load settings and initialize ChatService
        try {
            await this.loadSettingsFromBackground();
            console.log('[WebWireContentHost] Settings loaded successfully');

            // TODO we need to have these to contiune
            
            // Initialize the ChatService
            await this.chatService.initialize(aiClient, mcpConnector, stateService);
            console.log('[WebWireContentHost] ChatService initialized');
            
            // Send settings to ChatService
            this.eventBus.emit('chat:update-settings', { settings: this.currentSettings });
            
        } catch (error) {
            console.error('[WebWireContentHost] Settings loading failed:', error);
        }
        
        // Handle auto-inject and panel restoration
        try {
            const shouldInject = await this.shouldAutoInject();
            const backgroundState = await this.getBackgroundState();
            const shouldShowPanel = backgroundState?.ui?.panelVisible || false;
            
            console.log('[WebWireContentHost] Panel state from background:', {
                shouldInject,
                shouldShowPanel,
                backgroundState: backgroundState?.ui
            });
            
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
            case 'threads:get-or-create':
                const threadResponse = await chrome.runtime.sendMessage({
                    action: BACKGROUND_ACTIONS.GET_OR_CREATE_CURRENT_THREAD,
                    options: data
                });

                if (threadResponse.success) {
                    const { threadId, metadata, messages } = threadResponse.thread;
                    this.currentThreadId = threadId;
                    
                    // Send conversation history back to ChatService
                    this.eventBus.emit('chat:conversation-loaded', {
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

            case 'threads:save-message':
                const saveResponse = await chrome.runtime.sendMessage({
                    action: BACKGROUND_ACTIONS.SAVE_THREAD_MESSAGE,
                    threadId: this.currentThreadId,
                    userMessage: data.userMessage,
                    assistantMessage: data.assistantMessage,
                    options: data.options
                });

                if (!saveResponse.success) {
                    console.warn('[WebWireContentHost] Failed to save conversation:', saveResponse.error);
                }
                break;

            case 'ui:save-panel-visibility':
                const visibilityResponse = await chrome.runtime.sendMessage({
                    action: BACKGROUND_ACTIONS.SAVE_PANEL_VISIBILITY,
                    visible: data.visible
                });

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
            case 'ui:inject-panel':
                await this.injectPanel();
                break;

            default:
                console.warn('[WebWireContentHost] Unknown host event:', event);
        }
    }

    /**
     * Load settings from background script
     */
    async loadSettingsFromBackground() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.GET_WEBWIRE_SETTINGS
            });

            console.log('[WebWireContentHost] Settings from background:', response);
            
            if (!response) {
                console.error('[WebWireContentHost] No response from background script');
                this.currentSettings = {};
                return;
            }
            
            if (response.success) {
                this.currentSettings = response.settings || {};
                console.log('[WebWireContentHost] Successfully loaded settings:', this.currentSettings);
            } else {
                console.error('[WebWireContentHost] Background script returned error:', response.error);
                this.currentSettings = {};
            }
        } catch (error) {
            console.error('[WebWireContentHost] Failed to load settings from background:', error);
            this.currentSettings = {};
        }
    }

    /**
     * Setup Chrome extension communication
     */
    setupExtensionCommunication() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            return this.handleBackgroundMessage(message, sender, sendResponse);
        });
    }

    /**
     * Setup panel communication (window/DOM events)
     */
    setupPanelCommunication() {
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === PANEL_MESSAGE_TYPES.WEBWIRE_PANEL_MESSAGE) {
                this.handlePanelMessage(event.data);
            } else if (event.data.type === PANEL_MESSAGE_TYPES.WEBWIRE_PANEL_READY) {
                this.sendInitialStateToPanel();
            }
        });
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
     * Handle messages from the panel UI
     */
    async handlePanelMessage(message) {
        const { action, data } = message;

        try {
            switch (action) {
                case PANEL_ACTIONS.SEND_CHAT_MESSAGE:
                    // Delegate to ChatService
                    this.eventBus.emit('chat:send-message', { message: data.message });
                    break;
                    
                case PANEL_ACTIONS.ANALYZE_PAGE_CONTENT:
                    // Delegate to ChatService
                    this.eventBus.emit('chat:analyze-page', {});
                    break;
                    
                case PANEL_ACTIONS.CONNECT_MCP:
                    // Update settings and notify ChatService
                    this.currentSettings.mcp = { ...this.currentSettings.mcp, serverUrl: data.url };
                    this.eventBus.emit('chat:update-settings', { settings: this.currentSettings });
                    break;
                    
                case PANEL_ACTIONS.DISCONNECT_MCP:
                    // Update settings and notify ChatService
                    this.currentSettings.mcp = { ...this.currentSettings.mcp, serverUrl: '' };
                    this.eventBus.emit('chat:update-settings', { settings: this.currentSettings });
                    break;
                    
                case PANEL_ACTIONS.GET_PAGE_CONTENT:
                    // This is a host responsibility
                    const content = this.pageUtils.getCurrentPageContent();
                    // Send response directly to panel (if needed)
                    break;
                    
                case PANEL_ACTIONS.GET_STATE:
                    // Build state and send to ChatService
                    await this.sendInitialStateToPanel();
                    break;
                    
                case PANEL_ACTIONS.SAVE_SETTINGS:
                    try {
                        const response = await chrome.runtime.sendMessage({
                            action: BACKGROUND_ACTIONS.SAVE_WEBWIRE_SETTINGS,
                            settings: data.settings
                        });
                        // Update local settings and notify ChatService
                        if (response.success) {
                            this.currentSettings = data.settings;
                            this.eventBus.emit('chat:update-settings', { settings: this.currentSettings });
                        }
                    } catch (error) {
                        console.error('[WebWireContentHost] Failed to save settings:', error);
                    }
                    break;
                    
                default:
                    console.warn('[WebWireContentHost] Unknown panel message action:', action);
            }
        } catch (error) {
            console.error('[WebWireContentHost] Error handling panel message:', error);
        }
    }

    /**
     * Handle messages from background script
     */
    handleBackgroundMessage(message, sender, sendResponse) {
        console.log('[WebWireContentHost] Received background message:', message.action);
        
        try {
            switch (message.action) {
                case BACKGROUND_HANDLERS.INJECT_WEBWIRE_PANEL:
                    this.injectPanel()
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case BACKGROUND_HANDLERS.TOGGLE_WEBWIRE_PANEL:
                    this.chatService.togglePanel();
                    sendResponse({ success: true });
                    return false;
                    
                case BACKGROUND_HANDLERS.CAPTURE_PAGE_CONTENT:
                    sendResponse({
                        success: true,
                        data: this.pageUtils.getCurrentPageContent()
                    });
                    return false;
                    
                case BACKGROUND_HANDLERS.GET_WEBWIRE_STATE:
                    try {
                        sendResponse({
                            success: true,
                            state: {
                                panelInjected: this.chatService.isReady(),
                                mcpConnected: false, // ChatService would need to expose this
                                aiClientConfigured: false // ChatService would need to expose this
                            }
                        });
                    } catch (error) {
                        console.error('[WebWireContentHost] Error getting state:', error);
                        sendResponse({
                            success: true,
                            state: {
                                panelInjected: false,
                                mcpConnected: false,
                                aiClientConfigured: false
                            }
                        });
                    }
                    return false;
                    
                case BACKGROUND_HANDLERS.SETTINGS_CHANGED:
                    // Settings have been updated - notify ChatService
                    this.currentSettings = message.data.settings || {};
                    this.eventBus.emit('chat:update-settings', { settings: this.currentSettings });
                    sendResponse({ success: true });
                    return false;
                    
                case BACKGROUND_HANDLERS.CONVERSATION_UPDATED:
                    // Conversation has been updated - notify ChatService
                    this.eventBus.emit('chat:conversation-loaded', { conversation: message.data.conversation });
                    sendResponse({ success: true });
                    return false;
                    
                case BACKGROUND_HANDLERS.PING:
                    sendResponse({ success: true, status: 'ready' });
                    return false;
                    
                default:
                    console.warn('[WebWireContentHost] Unknown background message action:', message.action);
                    sendResponse({ success: false, error: 'Unknown action' });
                    return false;
            }
        } catch (error) {
            console.error('[WebWireContentHost] Error handling background message:', error);
            sendResponse({ success: false, error: error.message });
            return false;
        }
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
     * Get state from background script
     */
    async getBackgroundState() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: BACKGROUND_ACTIONS.GET_WEBWIRE_STATE
            });

            if (response && response.success) {
                return response.state;
            } else {
                console.warn('[WebWireContentHost] Failed to get background state:', response?.error);
                return null;
            }
        } catch (error) {
            console.error('[WebWireContentHost] Error getting background state:', error);
            return null;
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
                const threadResponse = await chrome.runtime.sendMessage({
                    action: BACKGROUND_ACTIONS.GET_ACTIVE_THREAD
                });
                if (threadResponse.success) {
                    currentThread = threadResponse.thread;
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
}

// Global instance
let webwireContentHost = null;

// Wait for DOM to be ready
if (document.readyState === DOM_READY_STATES.LOADING) {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

/**
 * Initialize the WebWire content host
 */
async function initialize() {
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