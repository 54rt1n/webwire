import { generateMessageId } from '../js/utils/id-generator.js';
import { buildToolMessages } from './message-utils.js';

const MESSAGE_ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    ERROR: 'error'
};

/**
 * MessageBuilder - Handles constructing API-ready messages
 * Extracted from ChatService.handleUserMessage
 */
export class MessageBuilder {
    constructor(pageUtils) {
        this.pageUtils = pageUtils;
    }

    /**
     * Build page context from stash and page content
     */
    buildPageContext(stateService, forcePageContent) {
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
            const pageContext = this.pageUtils.buildPageContext();
            // Convert page context object to string representation
            const pageContextString = typeof pageContext === 'object' 
                ? JSON.stringify(pageContext, null, 2) 
                : pageContext;
            syntheticMessages.push(pageContextString);
            syntheticSources.push('page');
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
        if (!lastAssistantMessage?.toolCalls?.length) {
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
     */
    prepareMessagesForAPI(threadId, userMessage, stateService, pageContext, conversation) {
        let messagesForAPI = [];
        
        // Get conversation history
        const messages = stateService.conversation.getConversationMessages(threadId);
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
        const toolMessagesHeader = this.buildToolMessagesHeader(conversation?.messages?.[conversation.messages.length - 1]);
        if (toolMessagesHeader) {
            syntheticHeaders.push(toolMessagesHeader);
        }

        // Enhance first user message or current message
        const firstUserIndex = messagesForAPI.findIndex(msg => msg.role === MESSAGE_ROLES.USER);
        if (firstUserIndex !== -1 && pageContext.syntheticMessages.length > 0) {
            messagesForAPI[firstUserIndex] = {
                ...messagesForAPI[firstUserIndex],
                content: pageContext.syntheticMessages.join('\n\n') + '\n\n' + messagesForAPI[firstUserIndex].content
            };
        }

        // Build enhanced user message
        const enhancedUserMessage = syntheticHeaders.length > 0 
            ? syntheticHeaders.join('\n\n') + '\n\n' + userMessage
            : userMessage;

        return { messagesForAPI, enhancedUserMessage };
    }
}