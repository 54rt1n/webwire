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

        await this.core.connect();
        
        
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
                console.log('[WebWireContentHost] ChatService not ready, initializing...');
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
            const stateService = this.core.stateService;
            
            // Get active thread directly from state service
            const currentThread = stateService.conversation.getActiveThread();

            const messageOptions = {
                ...stateService.aim.getAimMessageOptions(),
                ...currentThread.metadata
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
                messageOptions: messageOptions
            };
            
            // Send to ChatService
            await this.chatService.sendInitialState(state);
            
            console.log('[WebWireContentHost] Initial state sent to ChatService');
        } catch (error) {
            console.error('[WebWireContentHost] Failed to send initial state:', error);
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