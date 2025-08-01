import { EVENTS } from '../core/events.js';
import { EventBindableComponent } from '../core/event-bindable-panel.js';
import { SpeechUtil } from '../utils/speech-util.js';
import { logger } from '../core/logging.js';

/**
 * BrowserEventHandlers
 * 
 * Lightweight event handlers for browser-specific actions like clipboard operations
 * and text-to-speech. This module provides basic browser functionality without requiring
 * the full ChatService for simple UI interactions.
 * 
 * Used by contexts that need play/copy functionality but don't need full chat capabilities.
 */

export class BrowserEventHandlers extends EventBindableComponent {
    constructor(eventBus, stateService = null) {
        super(eventBus);
        this.stateService = stateService;
        this.speechUtil = new SpeechUtil();
        
        this.setupEventListeners();
    }

    /**
     * Sets up event listeners for browser actions
     */
    setupEventListeners() {
        this.onAsync(EVENTS.CHAT.COPY_MESSAGE, this.handleCopyMessage);
        this.onAsync(EVENTS.CHAT.PLAY_AUDIO, this.handlePlayAudio);
    }

    /**
     * Handle copy message event
     * Supports both messageId lookup and direct content copying
     */
    async handleCopyMessage(data, options) {
        logger.log('BrowserEventHandlers', 'Handling copy message request:', data);
        
        let textToCopy = '';
        const { messageId, content } = data;

        // If content is provided directly, use it
        if (content) {
            textToCopy = content;
        }
        // Otherwise try to look up by messageId
        else if (messageId && this.stateService) {
            const message = this.stateService.conversation.getMessageById(messageId);
            if (message) {
                textToCopy = message.content || '';
            } else {
                logger.warn('BrowserEventHandlers', 'Message not found:', messageId);
            }
        }
        
        if (!textToCopy) {
            logger.warn('BrowserEventHandlers', 'No content found to copy');
            throw new Error('No content found to copy');
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            logger.log('BrowserEventHandlers', 'Text copied to clipboard successfully');
            return { success: true, message: 'Text copied to clipboard successfully' };
        } catch (clipboardError) {
            logger.error('BrowserEventHandlers', 'Failed to copy to clipboard:', clipboardError);
            
            // Fallback: try the older execCommand method
            try {
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (success) {
                    logger.log('BrowserEventHandlers', 'Text copied using fallback method');
                    return { success: true, message: 'Text copied to clipboard successfully (fallback method)' };
                } else {
                    logger.error('BrowserEventHandlers', 'execCommand copy failed');
                    throw new Error('execCommand copy failed');
                }
            } catch (fallbackError) {
                logger.error('BrowserEventHandlers', 'Fallback copy method also failed:', fallbackError);
                throw new Error(`Failed to copy to clipboard: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Handle play audio event using SpeechUtil
     * Supports both messageId lookup and direct content playing
     */
    async handlePlayAudio(data, options) {
        logger.log('BrowserEventHandlers', 'Handling play audio request:', data);
        
        const { messageId, action = 'play' } = data;
        const { onComplete, onError } = options;
        
        // Handle stop action
        if (action === 'stop') {
            this.speechUtil.stop();
            return { success: true, message: 'Speech stopped' };
        }
        
        // Handle pause action
        if (action === 'pause') {
            this.speechUtil.pause();
            return { success: true, message: 'Speech paused' };
        }
        
        // Handle resume action
        if (action === 'resume') {
            this.speechUtil.resume();
            return { success: true, message: 'Speech resumed' };
        }
        
        // Handle play action - only for starting new speech
        if (action === 'play') {
            let textToSpeak = '';
            
            // If content is provided directly, use it
            if (data.content) {
                textToSpeak = data.content;
            }
            // Otherwise try to look up by messageId
            else if (messageId && this.stateService) {
                const message = this.stateService.conversation.getMessageById(messageId);
                if (message) {
                    textToSpeak = message.content || '';
                } else {
                    logger.warn('BrowserEventHandlers', 'Message not found:', messageId);
                }
            }
            
            if (!textToSpeak) {
                logger.warn('BrowserEventHandlers', 'No content found to play');
                throw new Error('No content found to play');
            }

            try {
                // Get voice settings from state and pass as options
                const voiceSettings = this.getVoiceSettings();
                // This is not async on purpose. We don't want to block the UI.
                this.speechUtil.speak(textToSpeak, voiceSettings).then(onComplete, onError);
                return { success: true, message: 'Speech started' };
            } catch (speechError) {
                logger.error('BrowserEventHandlers', 'Failed to play audio:', speechError);
                throw new Error(`Failed to play audio: ${speechError.message}`);
            }
        }
        
        // Unknown action
        throw new Error(`Unknown action: ${action}`);
    }

    /**
     * Get voice settings from state
     * @returns {Object} Voice configuration object
     */
    getVoiceSettings() {
        if (!this.stateService || !this.stateService.ui) {
            return {};
        }
        
        const voiceSettings = this.stateService.ui.getVoiceSettings();
        if (!voiceSettings) {
            return {};
        }
        
        // Convert voice name to voice object if needed
        const config = { ...voiceSettings };
        if (config.voice && typeof config.voice === 'string') {
            config.voice = this.speechUtil.getVoiceByNameOrLang(config.voice);
        }
        
        return config;
    }

    /**
     * Check if speech synthesis is available
     */
    isSpeechSupported() {
        return 'speechSynthesis' in window;
    }

    /**
     * Get available voices
     */
    getAvailableVoices() {
        return this.speechUtil.getAvailableVoices();
    }

    /**
     * Cleanup when component is destroyed
     */
    cleanup() {
        this.speechUtil.destroy();
        super.cleanup();
    }
}