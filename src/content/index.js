import { EventBus } from '../js/core/event-bus.js';
import { EVENTS } from '../js/core/events.js';
import { ChatService } from '../chat/chat-service.js';
import { PageUtils } from '../js/browser/page-utils.js';
import { DOMAgent } from '../js/browser/dom-agent.js';
import { WebWireClientCore } from '../js/client/webwire-client-core.js';
import { setupDebugMethods, setupGlobalDebugAccess } from './debug.js';
import { TabIndicator } from './tab-indicator.js';
import {
    BACKGROUND_ACTIONS,
    CONTENT_ACTIONS,
    KEYBOARD_SHORTCUTS,
    DOM_READY_STATES
} from '../js/core/cc-actions.js';
import '../shared/global.scss';
import '../chat/chat.scss';
import { ContentEventHandlers, EarlyEventHandlers } from '../js/client/content-event-handlers.js';
import { BrowserEventHandlers } from '../js/client/browser-event-handlers.js';

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
    constructor(config) {
        // Global app config
        this.config = config;

        // Create event bus for communication with ChatService
        this.eventBus = new EventBus({domain: 'content', debug: true});
        
        // Create WebWire core for infrastructure
        this.core = new WebWireClientCore(this.eventBus, this.config);
        
        // Create the chat service (platform-agnostic core)
        this.chatService = new ChatService(this.eventBus, this.config);
        
        // Host state
        this.pageUtils = new PageUtils();
        this.domAgent = new DOMAgent(this.eventBus);
        
        // Tab indicator for streaming status
        this.tabIndicator = new TabIndicator(this.eventBus);

        // Browser event handlers for play/copy functionality
        this.browserEventHandlers = null;

        this.initialized = false;
        
        this.eventHandlers = new EarlyEventHandlers(this.eventBus, this);
        this.eventHandlers.setupEventListeners();
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
        
        console.log('[WebWireContentHost] Extension communication ready via EventDispatcher');

        this.eventHandlers = new ContentEventHandlers(this.core);
        this.eventHandlers.setupEventListeners();

        // Set up keyboard shortcuts and injection listeners
        this.setupUIListeners();
        console.log('[WebWireContentHost] UI listeners set up');

        // Set up content action listeners
        this.setupContentActions();
        console.log('[WebWireContentHost] Content actions set up');

        // Initialize ChatService with the core services
        await this.chatService.initialize(this.core.mcpConnector, this.core.stateService);
        console.log('[WebWireContentHost] ChatService initialized');
        
        // Initialize browser event handlers for copy/play functionality
        this.browserEventHandlers = new BrowserEventHandlers(this.eventBus, this.core.stateService);
        console.log('[WebWireContentHost] BrowserEventHandlers initialized');

        await this.core.connect();
        
        
        // Handle auto-inject - only inject if autoInject setting is true
        try {
            const shouldInject = await this.shouldAutoInject();
            
            console.log('[WebWireContentHost] Auto-inject check:', {
                shouldInject,
                autoInjectSetting: this.core.stateService.settings?.getSettings()?.ui?.autoInject,
                assistantEnabled: this.core.stateService.ui?.getAssistantEnabled()
            });
            
            if (shouldInject) {
                console.log('[WebWireContentHost] Auto-inject enabled, injecting panel...');
                await this.injectPanel();
                
                // After injecting, check if we should also show it
                const shouldShowPanel = this.core.stateService.ui?.isPanelVisible() || false;
                if (shouldShowPanel) {
                    console.log('[WebWireContentHost] Panel was previously visible, showing it...');
                    await this.chatService.showPanel();
                }
            } else {
                console.log('[WebWireContentHost] Auto-inject disabled, not injecting panel');
            }
        } catch (error) {
            console.error('[WebWireContentHost] Auto-inject failed:', error);
        }
        
        console.log('[WebWireContentHost] Initialization complete');
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
        
        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * Setup content action listeners for cross-context events
     */
    setupContentActions() {
        // Handle panel update commands via EventBus
        this.eventBus.onAsync(CONTENT_ACTIONS.UPDATE_PANEL, async (data) => {
            console.log('[WebWireContentHost] UPDATE_PANEL request:', data);
            
            try {
                const { action, forceInject = false } = data;
                
                if (!this.chatService) {
                    return { success: false, error: 'Chat service not initialized' };
                }
                
                switch (action) {
                    case 'hide':
                        // Hide and destroy the panel
                        if (this.chatService.panel) {
                            this.chatService.panel.destroy();
                            this.eventBus.emit(EVENTS.ASSISTANT.HIDDEN);
                            return { success: true, action: 'hidden', timestamp: Date.now() };
                        }
                        return { success: true, action: 'already_hidden' };
                        
                    case 'show':
                        // Check autoInject setting first (unless forceInject is true)
                        if (!forceInject) {
                            const autoInject = this.core.stateService?.ui?.getAutoInject() || false;
                            if (!autoInject && !this.chatService.panel.isReady()) {
                                console.log('[WebWireContentHost] Auto-inject disabled, not injecting panel');
                                return { 
                                    success: false, 
                                    error: 'Auto-inject is disabled', 
                                    autoInjectDisabled: true 
                                };
                            }
                        }
                        
                        // Show the panel (ChatService will handle initialization and state)
                        await this.chatService.showPanel();
                        this.eventBus.emit(EVENTS.ASSISTANT.SHOWN);
                        return { success: true, action: 'shown', timestamp: Date.now() };
                        
                    case 'toggle':
                        // Toggle between show/hide
                        if (this.chatService.panel.isVisible) {
                            // Hide it
                            this.chatService.hidePanel();
                            return { success: true, action: 'hidden', visible: false };
                        } else if (this.chatService.panel.isReady()) {
                            // Show it if already injected
                            this.chatService.showPanel();
                            return { success: true, action: 'shown', visible: true };
                        } else {
                            // Not injected - check autoInject
                            if (!forceInject) {
                                const autoInject = this.core.stateService?.ui?.getAutoInject() || false;
                                if (!autoInject) {
                                    return { 
                                        success: false, 
                                        error: 'Auto-inject is disabled', 
                                        autoInjectDisabled: true 
                                    };
                                }
                            }
                            // Show the panel (showPanel will initialize if needed)
                            await this.chatService.showPanel();
                            this.eventBus.emit(EVENTS.ASSISTANT.SHOWN);
                            return { success: true, action: 'shown', visible: true };
                        }
                        
                    default:
                        return { success: false, error: `Unknown action: ${action}` };
                }
            } catch (error) {
                console.error('[WebWireContentHost] Error updating panel:', error);
                return { success: false, error: error.message };
            }
        });

        this.eventBus.onAsync(CONTENT_ACTIONS.PING, async () => {
            return { success: true, alive: true };
        });

        this.eventBus.onAsync(CONTENT_ACTIONS.GET_PANEL_STATE, async () => {
            console.log('[WebWireContentHost] Getting panel state...', {
                hasChatService: !!this.chatService,
                hasPanel: !!this.chatService?.panel,
                isInjected: this.chatService?.panel?.isInjected,
                isVisible: this.chatService?.panel?.isVisible
            });
            
            try {
                const panelState = {
                    isInjected: this.chatService?.panel?.isInjected || false,
                    isVisible: this.chatService?.panel?.isVisible || false
                };
                
                console.log('[WebWireContentHost] Returning panel state:', panelState);
                return { success: true, ...panelState };
            } catch (error) {
                console.error('[WebWireContentHost] Error getting panel state:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Check if auto-inject is enabled
     */
    async shouldAutoInject() {
        try {
            // Use the accessor method which checks both assistantEnabled and autoInject
            const autoInject = this.core.stateService?.ui?.getAutoInject();
            console.log('[WebWireContentHost] shouldAutoInject:', autoInject);
            return autoInject || false;
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
            // Initialize the panel without showing it
            await this.chatService.ensurePanelInitialized();
            
            // Send initial state to the panel now that it's ready
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
            const stateService = this.core.stateService;
            
            // Get active thread directly from state service
            let currentThread = stateService.conversation.getActiveThread();
            
            // If no active thread, try to recover one
            if (!currentThread) {
                console.log('[WebWireContentHost] No active thread found, attempting to recover...');
                const recoveredThreadId = stateService.conversation.recoverActiveForTab();
                if (recoveredThreadId) {
                    currentThread = stateService.conversation.getActiveThread();
                } else {
                    // No conversations to recover, create a new one
                    console.log('[WebWireContentHost] No conversations to recover, creating new conversation...');
                    stateService.conversation.createNewConversation();
                    currentThread = stateService.conversation.getActiveThread();
                }
            }

            const messageOptions = {
                ...stateService.aim.getAimMessageOptions(),
                ...(currentThread?.metadata || {})
            };
            
            // Get connection states directly from services
            const state = {
                currentThread: currentThread,
                mcpConnected: stateService.mcp.isMcpConnected() || false,
                aiClientConfigured: !!this.core.aiClient,
                includePageContent: stateService.ui.getIncludePageContent() !== false,
                useMCP: stateService.ui.getUseMCP() !== false,
                useBrowserTools: stateService.ui.getUseBrowserTools() !== false,
                autoExecuteTools: stateService.ui.getAutoExecuteTools() !== false,
                tabId: stateService.ui.getTabId(),
                messageOptions: messageOptions
            };
            
            // Send to ChatService
            await this.chatService.sendInitialState(state);
            
            console.log('[WebWireContentHost] Initial state sent to ChatService');
        } catch (error) {
            console.error('[WebWireContentHost] Failed to send initial state:', error);
        }
    }
    
    /**
     * Clean up before page unload
     */
    cleanup() {
        console.log('[WebWireContentHost] Cleaning up before page unload...');

        if (this.browserEventHandlers) {
            this.browserEventHandlers.cleanup();
        }
        
        if (this.chatService) {
            this.chatService.destroy();
        }
        
        if (this.tabIndicator) {
            this.tabIndicator.destroy();
        }
        
        if (this.core) {
            this.core.disconnect();
        }
    }
}

/**
 * Static factory for creating and initializing WebWireContentHost instances
 * 
 * @param {Object} config - Configuration object from AppConfig
 * @returns {Promise<WebWireContentHost>} Initialized content host instance
 */
WebWireContentHost.factory = async function(config) {
    if (!config) {
        throw new Error('WebWire config not found');
    }
    
    console.log('[WebWireContentHost] Factory creating instance...');
    
    // Setup debug methods
    setupDebugMethods(WebWireContentHost);
    
    // Create and initialize the host
    const webwireContentHost = new WebWireContentHost(config);
    await webwireContentHost.initialize();
    
    // Setup global debug access
    setupGlobalDebugAccess(webwireContentHost);
    
    console.log('[WebWireContentHost] Factory initialization complete');
    return webwireContentHost;
};

export { WebWireContentHost };