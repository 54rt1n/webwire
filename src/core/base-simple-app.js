import { EventBindableComponent } from '../js/core/event-bindable-panel.js';
import { initializeContext } from '../js/context/context-init.js';
import { EventBus } from '../js/core/event-bus.js';
import { EVENT_CONTEXT } from '../js/core/events.js';
import { logger } from '../js/core/logging.js';

/**
 * BaseSimpleApp - Template Method Pattern for Simple Applications
 * 
 * This base class defines the initialization sequence for simple apps that only need
 * state management and storage, without the full WebWireClientCore overhead.
 * 
 * Template Method Pattern:
 * - initialize() is the template method that defines the algorithm skeleton
 * - Hook methods are overridden by subclasses for customization
 * - Ensures consistent initialization while allowing customization
 */
export class BaseSimpleApp extends EventBindableComponent {
    constructor(config, domain = 'base-simple') {
        const eventBus = new EventBus({ domain, debug: true });
        super(eventBus);
        
        this.config = config;
        this.stateService = null;
        this.storage = null;
        this.dispatcher = null;
        this.panel = null; // Will be instantiated by the template method
    }

    /**
     * TEMPLATE METHOD - The main initialization algorithm
     * This method is final - subclasses should not override it.
     * Instead, they should implement the hook methods below.
     */
    async initialize() {
        logger.log(this, 'Initializing simple app...');

        // 1. Initialize context with minimal services (invariant)
        const { dispatcher, stateService, storage } = await initializeContext(
            this.eventBus, 
            EVENT_CONTEXT.SIMPLE
        );
        this.dispatcher = dispatcher;
        this.stateService = stateService;
        this.storage = storage;

        // 2. Subclass-specific dependency setup (variant hook)
        this._initializeDependencies();

        // 3. Instantiate the specific UI panel (variant hook)
        const PanelComponent = this._getPanelComponent();
        this.panel = new PanelComponent(this.eventBus);

        // 4. Wire up dependencies (variant hook)
        this._wireUpDependencies();

        // 5. Setup UI handlers (variant hook)
        const handlers = this._getUIHandlers();
        this.panel.initialize?.(handlers);

        // 6. Load initial data (variant hook)
        await this._loadData();

        logger.log(this, 'Initialization complete');
    }

    // --- HOOK METHODS: To be implemented by subclasses ---

    /**
     * Return the specific Panel UI class (e.g., OptionsPanel)
     * @returns {Function} The Panel constructor
     */
    _getPanelComponent() {
        throw new Error("Subclasses must implement _getPanelComponent()");
    }
    
    /**
     * Set up any dependencies needed by this specific app
     * This is called after context initialization but before panel creation
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
        return {}; // Default to empty handlers
    }

    /**
     * Load the initial data for the app
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
        // Minimal cleanup for simple apps
    }
}