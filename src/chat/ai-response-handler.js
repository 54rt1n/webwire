import { generateMessageId } from '../js/utils/id-generator.js';
import { EVENTS } from '../js/core/events.js';

/**
 * AIResponseHandler - Processes streaming and final AI responses
 * Extracted from ChatService streaming logic
 */
export class AIResponseHandler {
    constructor(eventBus, stateService, panel) {
        this.eventBus = eventBus;
        this.panel = panel;
        this.stateService = stateService;

        this.streamingState = {
            isActive: false,
            currentContent: '',
            messageId: null,
            currentMessage: null,
            streamingText: '',
            messageCounter: 0,
            abortController: null
        };
    }

    /**
     * Add a thinking message and return handle for streaming updates
     */
    addThinkingMessage(message = 'Thinking...') {
        const messageId = generateMessageId();
        
        // Display thinking message in panel
        this.panel.displayThinkingMessage({
            messageId: messageId,
            content: message,
            role: 'assistant'
        }, this.stateService.aim.getAimMessageOptions());
        
        return { messageId };
    }

    /**
     * Set up streaming for a request
     */
    setupStreaming(thinkingMessage) {
        this.streamingState.currentMessage = thinkingMessage;
        this.streamingState.streamingText = '';
        
        // Set up exclusive stream handler for this request
        const unsubscribeStream = this.eventBus.onExclusive(EVENTS.AI.STREAM_CHUNK, (data) => {
            this.handleStreamingChunk(data.chunk, thinkingMessage);
        });
        
        return unsubscribeStream;
    }

    /**
     * Handle streaming chunks for a specific message
     */
    handleStreamingChunk(chunk, messageHandle) {
        if (!this.streamingState.isActive) {
            this.streamingState.isActive = true;
            this.streamingState.streamingText = '';
            this.streamingState.currentMessage = messageHandle;
        }
        
        this.streamingState.streamingText += chunk;
        
        // Update panel directly
        this.panel.updateStreamingMessage(messageHandle.messageId, this.streamingState.streamingText);
    }

    /**
     * Finalize streaming and clean up the thinking message
     */
    finalizeStreamingMessage(messageHandle, assistantMessage) {
        this.streamingState.isActive = false;
        this.streamingState.currentMessage = null;
        this.streamingState.streamingText = '';

        // Finalize in panel
        this.panel.finalizeThinkingMessage(
            messageHandle.messageId, 
            assistantMessage.content, 
            assistantMessage.toolCalls
        );
    }

    /**
     * Handle AI response generation with streaming
     */
    async generateAIResponse(aiClient, enhancedUserMessage, messagesForAPI, systemPrompt, { apiArgs = {} } = {}) {
        // Create abort controller for this request
        this.streamingState.abortController = new AbortController();
        
        // Create thinking message
        const thinkingMessage = this.addThinkingMessage();
        
        // Set up streaming
        const unsubscribeStream = this.setupStreaming(thinkingMessage);

        console.log('[AIResponseHandler]', 'API args:', apiArgs);
        
        try {
            const response = await aiClient.generateTurn(enhancedUserMessage, messagesForAPI, { 
                systemPrompt,
                maxHistory: 100,
                abortController: this.streamingState.abortController,
                apiArgs: apiArgs
            });

            if (!response) {
                throw new Error('No response received from AI client');
            }
            
            return { response, thinkingMessage };
        } finally {
            unsubscribeStream();
            this.streamingState.abortController = null;
        }
    }

    /**
     * Cancel the current streaming request
     */
    cancelStreaming() {
        if (this.streamingState.abortController) {
            this.streamingState.abortController.abort();
            this.streamingState.abortController = null;
            this.streamingState.isActive = false;
        }
    }

    /**
     * Get current streaming state
     */
    getStreamingState() {
        return this.streamingState;
    }
}