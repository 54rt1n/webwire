import { EVENTS } from '../../core/events.js';
import { logger } from '../../core/logging.js';

/**
 * Plugin for handling AIM (AI Mind) related state management.
 */
export class AIMStatePlugin {
    constructor(stateService) {
        this.stateService = stateService;
        this.eventBus = stateService.eventBus;
    }

    /**
     * Gets the current AIM state.
     * @returns {Object} The current aim state
     */
    getAimState() {
        return this.stateService.state.aim;
    }

    /**
     * Get AIM metadata
     * 
     * AI Mind Metadata:
    user_id: string | undefined;
    persona_id: string | undefined;
    pinned_messages: string[] | undefined;
    active_document: string | undefined;
    workspace_content: string | undefined; (a webpage or document)
    thought_content: string | undefined;
    disable_guidance: boolean | undefined;
    disable_pif: boolean | undefined;
    system_message: string | undefined;
    location: string | undefined;
     */
    getAimMetadata() {
        logger.log('StateService::AIMState', 'getAimMetadata()', this.stateService.state);
        return {
            user_id: this.stateService.state.settings.aim.userName,
            persona_id: this.stateService.state.settings.aim.personaName,
            pinned_messages: this.stateService.state.aim.pinnedMessages,
            active_document: this.stateService.state.aim.activeDocument,
            workspace_content: this.stateService.state.aim.workspaceContent,
            thought_content: this.stateService.state.aim.thoughtContent,
            system_message: this.stateService.state.aim.systemMessage,
            disable_guidance: this.stateService.state.aim.disableGuidance,
            disable_pif: this.stateService.state.aim.disablePif,
            location: this.stateService.state.aim.location,
        };
    }

    /**
     * Get AIM message options
     */
    getAimMessageOptions() {
        return {
            userName: this.stateService.state.settings?.aim?.userName,
            personaName: this.stateService.state.settings?.aim?.personaName,
            mood: this.stateService.state.aim?.mood,
            location: this.stateService.state.aim?.location,
        };
    }

    /**
     * Toggles the showThought flag.
     * @returns {boolean} The new showThought value
     */
    toggleShowThought() {
        const currentValue = this.stateService.state.aim.showThought;
        const newValue = !currentValue;
        this.stateService.state.aim.showThought = newValue;
        
        logger.log('StateService::AIMState', `Toggled showThought from ${currentValue} to ${newValue}`);
        this.eventBus.emit(EVENTS.AIM.THOUGHT_TOGGLED, { showThought: newValue });
        
        return newValue;
    }

    /**
     * Sets the showThought flag to a specific value.
     * @param {boolean} value - The value to set
     * @returns {boolean} The new showThought value
     */
    setShowThought(value) {
        const oldValue = this.stateService.state.aim.showThought;
        this.stateService.state.aim.showThought = Boolean(value);
        
        if (oldValue !== this.stateService.state.aim.showThought) {
            logger.log('StateService::AIMState', `Set showThought to ${this.stateService.state.aim.showThought}`);
            this.eventBus.emit(EVENTS.AIM.THOUGHT_TOGGLED, { showThought: this.stateService.state.aim.showThought });
        }
        
        return this.stateService.state.aim.showThought;
    }

    /**
     * Toggles the autoThink flag.
     * @returns {boolean} The new autoThink value
     */
    toggleAutoThink() {
        const currentValue = this.stateService.state.aim.autoThink;
        const newValue = !currentValue;
        this.stateService.state.aim.autoThink = newValue;
        
        logger.log('StateService::AIMState', `Toggled autoThink from ${currentValue} to ${newValue}`);
        this.eventBus.emit(EVENTS.AIM.AUTO_THINK_TOGGLED, { autoThink: newValue });
        
        return newValue;
    }

    /**
     * Sets the autoThink flag to a specific value.
     * @param {boolean} value - The value to set
     * @returns {boolean} The new autoThink value
     */
    setAutoThink(value) {
        const oldValue = this.stateService.state.aim.autoThink;
        this.stateService.state.aim.autoThink = Boolean(value);
        
        if (oldValue !== this.stateService.state.aim.autoThink) {
            logger.log('StateService::AIMState', `Set autoThink to ${this.stateService.state.aim.autoThink}`);
            this.eventBus.emit(EVENTS.AIM.AUTO_THINK_TOGGLED, { autoThink: this.stateService.state.aim.autoThink });
        }
        
        return this.stateService.state.aim.autoThink;
    }

    /**
     * Sets the thought content.
     * @param {string|undefined} content - The thought content to set
     * @returns {string|undefined} The new thought content
     */
    setThoughtContent(content) {
        const oldContent = this.stateService.state.aim.thoughtContent;
        this.stateService.state.aim.thoughtContent = content;
        
        if (oldContent !== content) {
            logger.log('StateService::AIMState', `Updated thought content (${content ? content.length : 0} characters)`);
            this.eventBus.emit(EVENTS.AIM.THOUGHT_CONTENT_CHANGED, { 
                thoughtContent: content,
                hasContent: Boolean(content)
            });
        }
        
        return this.stateService.state.aim.thoughtContent;
    }

    /**
     * Clears the thought content.
     * @returns {undefined} Always returns undefined
     */
    clearThoughtContent() {
        const hadContent = Boolean(this.stateService.state.aim.thoughtContent);
        this.stateService.state.aim.thoughtContent = undefined;
        
        if (hadContent) {
            logger.log('StateService::AIMState', 'Cleared thought content');
            this.eventBus.emit(EVENTS.AIM.THOUGHT_CLEARED, {});
        }
        
        return this.stateService.state.aim.thoughtContent;
    }

    /**
     * Gets the current thought content.
     * @returns {string|undefined} The current thought content
     */
    getThoughtContent() {
        return this.stateService.state.aim.thoughtContent;
    }

    /**
     * Checks if thought content is currently available.
     * @returns {boolean} True if thought content exists
     */
    hasThoughtContent() {
        return Boolean(this.stateService.state.aim.thoughtContent);
    }

    /**
     * Gets the system message.
     * @returns {string|undefined} The current system message
     */
    getSystemMessage() {
        // Check if the current model is in minimal mode, if so use the minimal system message
        const currentModel = this.stateService.ui.getSelectedModel();
        const minimalMode = this.stateService.settings.getModelConfig(currentModel)?.minimalMode;
        if (minimalMode) {
            return this.stateService.state.settings.aim.minimalSystemMessage;
        }
        return this.stateService.state.settings.aim.systemMessage;
    }

    /**
     * Sets the system message.
     * @param {string|undefined} message - The system message to set
     */
    setSystemMessage(message) {
        this.stateService.state.settings.aim.systemMessage = message;
    }

    /**
     * Gets the user header.
     * @returns {string|undefined} The current user header
     */
    getUserHeader() {
        return this.stateService.state.settings.aim.userHeader;
    }

    /**
     * Sets the user header.
     * @param {string|undefined} header - The user header to set
     */
    setUserHeader(header) {
        this.stateService.state.settings.aim.userHeader = header;
    }

    /**
     * Gets the user footer.
     * @returns {string|undefined} The current user footer
     */
    getUserFooter() {
        return this.stateService.state.settings.aim.userFooter;
    }

    /**
     * Sets the user footer.
     * @param {string|undefined} footer - The user footer to set
     */
    setUserFooter(footer) {
        this.stateService.state.settings.aim.userFooter = footer;
    }

    /**
     * Gets a summary of the current AIM configuration.
     * @returns {Object} Summary object with current settings
     */
    getAimSummary() {
        const aim = this.stateService.state.aim;
        return {
            showThought: aim.showThought,
            autoThink: aim.autoThink,
            hasThoughtContent: Boolean(aim.thoughtContent),
            thoughtContentLength: aim.thoughtContent ? aim.thoughtContent.length : 0
        };
    }
}
