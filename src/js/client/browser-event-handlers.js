/**
 * BrowserEventHandlers
 * 
 * Lightweight event handlers for browser-specific actions like clipboard operations
 * and text-to-speech. This module provides basic browser functionality without requiring
 * the full ChatService for simple UI interactions.
 * 
 * Used by contexts that need play/copy functionality but don't need full chat capabilities.
 */

import { EVENTS } from '../core/events.js';
import { EventBindableComponent } from '../core/event-bindable-panel.js';
import { SpeechUtil } from '../utils/speech-util.js';

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
        console.log('[BrowserEventHandlers] Handling copy message request:', data);
        
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
                console.warn('[BrowserEventHandlers] Message not found:', messageId);
            }
        }
        
        if (!textToCopy) {
            console.warn('[BrowserEventHandlers] No content found to copy');
            throw new Error('No content found to copy');
        }

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log('[BrowserEventHandlers] Text copied to clipboard successfully');
            return { success: true, message: 'Text copied to clipboard successfully' };
        } catch (clipboardError) {
            console.error('[BrowserEventHandlers] Failed to copy to clipboard:', clipboardError);
            
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
                    console.log('[BrowserEventHandlers] Text copied using fallback method');
                    return { success: true, message: 'Text copied to clipboard successfully (fallback method)' };
                } else {
                    console.error('[BrowserEventHandlers] execCommand copy failed');
                    throw new Error('execCommand copy failed');
                }
            } catch (fallbackError) {
                console.error('[BrowserEventHandlers] Fallback copy method also failed:', fallbackError);
                throw new Error(`Failed to copy to clipboard: ${fallbackError.message}`);
            }
        }
    }

    /**
     * Handle play audio event using SpeechUtil
     * Supports both messageId lookup and direct content playing
     */
    async handlePlayAudio(data, options) {
        console.log('[BrowserEventHandlers] Handling play audio request:', data);
        
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
                    console.warn('[BrowserEventHandlers] Message not found:', messageId);
                }
            }
            
            if (!textToSpeak) {
                console.warn('[BrowserEventHandlers] No content found to play');
                throw new Error('No content found to play');
            }

            try {
                this.speechUtil.speak(textToSpeak).then(onComplete, onError);
                return { success: true, message: 'Speech started' };
            } catch (speechError) {
                console.error('[BrowserEventHandlers] Failed to play audio:', speechError);
                throw new Error(`Failed to play audio: ${speechError.message}`);
            }
        }
        
        // Unknown action
        throw new Error(`Unknown action: ${action}`);
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