import { EventBindableComponent } from '../js/core/event-bindable-panel.js';
import { WebWireClientCore } from '../js/client/webwire-client-core.js';
import { PanelEventHandlers } from '../js/client/panel-event-handlers.js';
import { BrowserEventHandlers } from '../js/client/browser-event-handlers.js';
import { EventBus } from '../js/core/event-bus.js';

/**
 * BasePanelApp - Template Method Pattern for Panel Applications
 * 
 * This base class defines the invariant initialization sequence for all panel apps
 * while allowing subclasses to customize specific steps through hook methods.
 * 
 * Template Method Pattern:
 * - initialize() is the template method that defines the algorithm skeleton
 * - Hook methods (_getPanelComponent, _initializeDependencies, etc.) are overridden by subclasses
 * - This ensures consistent initialization while allowing customization
 */
export class BasePanelApp extends EventBindableComponent {
    constructor(config, domain = 'base-panel') {
        const eventBus = new EventBus({ domain, debug: true });
        super(eventBus);
        
        this.config = config;
        this.core = new WebWireClientCore(this.eventBus, config);
        this.panel = null; // Will be instantiated by the template method
        this.panelEventHandlers = null; // Created during initialization
        this.browserEventHandlers = null; // Created during initialization
        
        // Setup base event listeners (subclasses can extend this)
        this.setupEventListeners();
    }

    /**
     * TEMPLATE METHOD - The main initialization algorithm
     * This method is final - subclasses should not override it.
     * Instead, they should implement the hook methods below.
     */
    async initialize() {
        console.log(`[${this.constructor.name}] Initializing panel...`);

        // 1. Core infrastructure setup (invariant)
        await this.core.initialize();
        this.panelEventHandlers = new PanelEventHandlers(this.core);
        this.panelEventHandlers.setupEventListeners();
        
        // 2. Initialize browser event handlers for play/copy functionality (invariant)
        this.browserEventHandlers = new BrowserEventHandlers(this.eventBus, this.core.stateService);

        // 3. Subclass-specific dependency setup (variant hook)
        this._initializeDependencies();

        // 4. Instantiate the specific UI panel (variant hook)
        const PanelComponent = this._getPanelComponent();
        this.panel = new PanelComponent(this.eventBus);

        // 5. Wire up the panel (invariant)
        if (this.core.stateService) {
            this.panel.setStateService(this.core.stateService);
            this._wireUpDependencies();
        }

        // 6. Setup UI handlers (variant hook)
        const handlers = this._getUIHandlers();
        this.panel.initialize(handlers);

        // 7. Load initial data (variant hook)
        await this._loadData();

        console.log(`[${this.constructor.name}] Initialization complete`);
    }

    /**
     * Setup base event listeners - can be extended by subclasses
     */
    setupEventListeners() {
        // Base implementation - subclasses can extend this
    }

    // --- HOOK METHODS: To be implemented by subclasses ---

    /**
     * Return the specific Panel UI class (e.g., ConversationsPanel)
     * @returns {Function} The Panel constructor
     */
    _getPanelComponent() {
        throw new Error("Subclasses must implement _getPanelComponent()");
    }
    
    /**
     * Set up any dependencies needed by this specific app
     * This is called after core initialization but before panel creation
     */
    _initializeDependencies() {
        // Optional hook, defaults to no-op
    }

    /**
     * Wire up dependencies to have access to state service
     * This is called after the panel is created and state service is available
     */
    _wireUpDependencies() {
        // Optional hook, defaults to no-op
    }

    /**
     * Return the map of handlers for the UI Panel
     * @returns {Object} Handler functions mapped to event names
     */
    _getUIHandlers() {
        throw new Error("Subclasses must implement _getUIHandlers()");
    }

    /**
     * Load the initial data for the panel
     * This is called last, after everything is set up
     */
    async _loadData() {
        throw new Error("Subclasses must implement _loadData()");
    }

    /**
     * Cleanup method called on page unload
     * Subclasses can override to add custom cleanup
     */
    cleanup() {
        if (this.browserEventHandlers) {
            this.browserEventHandlers.cleanup();
        }
    }
}