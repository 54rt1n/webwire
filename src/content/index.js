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
} from '../js/core/cc-actions.js';
import '../shared/global.scss';
import '../chat/chat.scss';
import { ContentEventHandlers, EarlyEventHandlers } from '../js/client/content-event-handlers.js';

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

        this.eventHandlers = new ContentEventHandlers(this.core, this.chatService, this.domAgent);
        this.eventHandlers.setupEventListeners();

        // Set up keyboard shortcuts and injection listeners
        this.setupUIListeners();
        console.log('[WebWireContentHost] UI listeners set up');

        // Initialize ChatService with the core services
        await this.chatService.initialize(this.core.aiClient, this.core.mcpConnector, this.core.stateService);
        console.log('[WebWireContentHost] ChatService initialized');
        
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
            return this.core.stateService?.ui?.getAutoInject() || false;
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
                console.log('[WebWireContentHost] Thread response:', threadResponse);
                if (threadResponse.success && threadResponse.result && threadResponse.result.thread) {
                    currentThread = threadResponse.result.thread;
                    
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