import { generateMessageId } from '../js/utils/id-generator.js';
import { buildToolMessages } from './message-utils.js';
import { Tiktoken } from 'js-tiktoken/lite';

const MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    ERROR: 'error'
};

// Static list of available tokenizers
const AVAILABLE_TOKENIZERS = [
    { id: 'cl100k_base', name: 'cl100k_base (GPT-4, GPT-3.5-turbo)', description: 'Default tokenizer for OpenAI models' },
    { id: 'p50k_base', name: 'p50k_base (GPT-3)', description: 'Legacy tokenizer for GPT-3 models' },
    { id: 'r50k_base', name: 'r50k_base (Codex)', description: 'Tokenizer for code models' },
    { id: 'kimi-k2', name: 'Kimi-K2 (Moonshot AI)', description: 'Custom tokenizer for Kimi-K2-Instruct model' }
];

/**
 * MessageBuilder - Handles constructing API-ready messages
 * Extracted from ChatService.handleUserMessage
 */
export class MessageBuilder {
    constructor(pageUtils, options = {}) {
        this.pageUtils = pageUtils;
        this.encoder = null;
        this.encoderOptions = options;
        
        // Fallback values
        this.WORDS_PER_TOKEN = 0.75;
        
        // Initialize encoder asynchronously
        this.encoderPromise = this.initializeEncoder(options);
    }
    
    /**
     * Get list of available tokenizers
     * @returns {Array} List of available tokenizer configurations
     */
    static availableTokenizers() {
        return AVAILABLE_TOKENIZERS;
    }
    
    /**
     * Initialize the tiktoken encoder based on model configuration
     * @param {Object} options - Configuration options
     * @param {string} options.tokenizer - Tokenizer name (e.g., 'cl100k_base', 'kimi-k2')
     */
    async initializeEncoder(options = {}) {
        try {
            const tokenizerName = options.tokenizer || 'cl100k_base'; // Default to cl100k_base
            
            // Fetch the tokenizer JSON file
            const response = await fetch(chrome.runtime.getURL(`tokenizers/${tokenizerName}.json`));
            if (!response.ok) {
                throw new Error(`Failed to fetch tokenizer: ${response.status}`);
            }
            const ranks = await response.json();
            
            // Create Tiktoken instance with the loaded ranks
            this.encoder = new Tiktoken(ranks);
            console.log(`[MessageBuilder] Initialized with tokenizer: ${tokenizerName}`);
        } catch (error) {
            console.warn('[MessageBuilder] Failed to initialize tiktoken encoder, falling back to word-based estimation:', error);
            this.encoder = null;
            // Fallback: 1 token ≈ 0.75 words (common approximation for English text)
            this.WORDS_PER_TOKEN = 0.75;
        }
    }

    /**
     * Count approximate tokens in text
     * @param {string} text - Text to count tokens for
     * @returns {Promise<number>} Approximate token count
     */
    async countTokens(text) {
        if (!text || typeof text !== 'string') return 0;
        
        // Wait for encoder to be initialized
        await this.encoderPromise;
        
        if (this.encoder) {
            try {
                // Use tiktoken for accurate token counting
                const tokens = this.encoder.encode(text);
                const tokenCount = tokens.length;
                console.log('[MessageBuilder] Counting tokens with tiktoken:', text.substring(0, 50) + '...', 'tokens:', tokenCount);
                return tokenCount;
            } catch (error) {
                console.warn('[MessageBuilder] Error encoding text with tiktoken:', error);
                // Fall through to word-based estimation
            }
        }
        
        // Fallback: Count words (splitting on whitespace and punctuation)
        const words = text.split(/\s+/).filter(word => word.length > 0).length;
        
        // Convert to approximate tokens
        const tokens = Math.ceil(words / this.WORDS_PER_TOKEN);
        console.log('[MessageBuilder] Counting tokens (fallback):', text.substring(0, 50) + '...', 'words:', words, 'tokens:', tokens);
        return tokens;
    }

    async clipText(text, maxTokens) {
        const tokenizedText = this.encoder.encode(text);
        const clippedTokens = tokenizedText.slice(0, maxTokens);
        const clippedText = this.encoder.decode(clippedTokens);
        return clippedText;
    }


    /**
     * Build page context from stash and page content
     */
    async buildPageContext(stateService, {forcePageContent = false, include = { navigation: false, links: false }, maxTextTokens = null} = {}) {
        const syntheticMessages = [];
        const syntheticSources = [];
        
        // Add stash content
        const stashContent = this.buildStashContent(stateService);
        if (stashContent) {
            syntheticMessages.push(stashContent);
            syntheticSources.push('stash');
        }

        // Add page content
        if (forcePageContent || stateService.ui.getIncludePageContent() !== false) {
            const pageContext = this.pageUtils.getCurrentPageContent({ includePageNavigation: include.navigation, includeLinks: include.links });
            const { text, mainContent, ...metadata } = pageContext;
            const metadataString = JSON.stringify(metadata);
            const metadataTokens = await this.countTokens(metadataString);
            if (maxTextTokens !== null && metadataTokens > maxTextTokens) {
                return { syntheticMessages, syntheticSources, warning: `Page metadata exceeds max text tokens: ${metadataTokens} > ${maxTextTokens}` };
            }
            const remainingTokens = maxTextTokens - metadataTokens;
            syntheticMessages.push(JSON.stringify(metadata));
            syntheticSources.push('page_metadata');
            const pageContent = text || mainContent;
            const clippedPageContent = await this.clipText(pageContent, remainingTokens);
            syntheticMessages.push(clippedPageContent);
            syntheticSources.push('page_content');
        }

        return { syntheticMessages, syntheticSources };
    }

    /**
     * Build stash context
     */
    buildStashContent(stateService) {
        const stashContent = stateService.stash.getAllEntries();
        if (stashContent.length === 0) {
            return null;
        }
        return `Stash content:\n${stashContent.map(entry => `${entry.key}: ${entry.value}`).join('\n')}`;
    }

    /**
     * Build tool messages from last assistant message
     */
    buildToolMessagesHeader(lastAssistantMessage) {
        if (!lastAssistantMessage?.toolCallsn?.length) {
            return null;
        }

        const toolMessages = buildToolMessages(lastAssistantMessage.toolCalls, lastAssistantMessage.toolResults);
        return toolMessages.map(toolMessage => {
            const { callId, display, error, executionTime, name, parameters, success, ...results } = toolMessage;
            if (error) {
                return `|tool_error|\n\n${name}: ${error}\n\n|end_tool_error|`;
            } else {
                const resultString = JSON.stringify(results, null, 2);
                return `|tool_response|\n\n${name}: ${resultString}\n\n|end_tool_response|`;
            }
        }).join('\n\n');
    }

    /**
     * Prepare messages for API including conversation history
     *  the stateService will be used to get the conversation history
     */
    prepareMessagesForAPI(userMessage, conversationMessages, pageContext) {
        let messagesForAPI = [];
        
        // Get conversation history
        const messages = conversationMessages;
        if (messages) {
            messagesForAPI = messages
                .filter(msg => msg.role !== MESSAGE_ROLES.SYSTEM)
                .map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp
                }));
        }

        // Build synthetic headers
        const syntheticHeaders = [];
        if (pageContext.syntheticMessages.length > 0) {
            syntheticHeaders.push(...pageContext.syntheticMessages);
        }

        // Add tool messages from last assistant message
        const toolMessagesHeader = this.buildToolMessagesHeader(messagesForAPI[messagesForAPI.length - 1]);
        if (toolMessagesHeader) {
            syntheticHeaders.push(toolMessagesHeader);
        }

        // Enhance first user message or current message
        let enhanced = false;
        const firstUserIndex = messagesForAPI.findIndex(msg => msg.role === MESSAGE_ROLES.USER);
        if (firstUserIndex !== -1 && pageContext.syntheticMessages.length > 0) {
            messagesForAPI[firstUserIndex] = {
                ...messagesForAPI[firstUserIndex],
                content: pageContext.syntheticMessages.join('\n\n') + '\n\n' + messagesForAPI[firstUserIndex].content
            };
            enhanced = true;
        }

        // Build enhanced user message
        const enhancedUserMessage = syntheticHeaders.length > 0 && !enhanced
            ? syntheticHeaders.join('\n\n') + '\n\n' + userMessage
            : userMessage;

        return { messagesForAPI, enhancedUserMessage };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.encoder) {
            try {
                this.encoder.free();
            } catch (error) {
                console.warn('[MessageBuilder] Error freeing encoder:', error);
            }
            this.encoder = null;
        }
    }
}