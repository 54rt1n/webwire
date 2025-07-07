// main/main.js

import { AIClientFactory } from '../js/ai/ai-client-factory.js';
import { globalEventBus } from '../js/core/event-bus.js';
import { EVENTS } from '../js/constants/events.js';
import { StorageManager } from '../js/storage/storage-manager.js';
import { StateService } from '../js/state/state-service.js';
import { MainPanel } from './panel.js';

class WebWireApp {
    constructor() {
        this.ui = new MainPanel();
        this.storage = new StorageManager(globalEventBus);
        this.stateService = new StateService(globalEventBus, this.storage.storage);
        this.aiClient = null;
        this.conversationId = 'default-convo';
    }

    async initialize() {
        console.log('Initializing WebWire App...');
        this.ui.setLoading(true);

        // Get our model config from the state
        await this.stateService.settings.loadSettings();

        const modelConfig = this.stateService.settings.getModelConfig();
        console.log('[WebWireApp]', 'Model config:', modelConfig);

        if (modelConfig.apiKey === 'YOUR_API_KEY_HERE') {
            globalEventBus.emit(EVENTS.ERROR.KEY_NOT_SET, 'CRITICAL: API Key not set in apps/main.js');
            return;
        }

        this.aiClient = AIClientFactory.createClient(globalEventBus, modelConfig);
        
        // 2. Load previous state
        await this.stateService.disk.loadFromStorage();
        this.renderHistory();

        // 3. Wire up event listeners
        this.setupEventListeners();

        this.ui.setLoading(false);
        console.log('WebWire App Initialized.');
    }

    setupEventListeners() {
        this.ui.sendButton.addEventListener('click', () => this.sendMessage());
        this.ui.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        this.ui.resetButton.addEventListener('click', () => this.resetChat());

        globalEventBus.on(EVENTS.AI.STREAM_CHUNK, ({ chunk }) => {
            this.ui.updateStreamingMessage(chunk);
        });
    }

    renderHistory() {
        const messages = this.stateService.conversation.getConversationMessages(this.conversationId);
        messages.forEach(msg => {
            this.ui.renderMessage(msg.role, msg.content);
        });
    }

    async resetChat() {
        if (!confirm('Are you sure you want to reset the chat? This will clear the conversation history.')) {
            return;
        }
        
        console.log('Resetting chat...');
        this.ui.setLoading(true);

        try {
            await this.stateService.conversation.clearConversationHistory(this.conversationId);
            await this.stateService.disk.saveState();
            this.ui.clearChat();
            console.log('Chat reset successfully.');
        } catch (error) {
            console.error('Failed to reset chat:', error);
            // Optionally render an error in the chat
        } finally {
            this.ui.setLoading(false);
        }
    }

    async sendMessage() {
        const userInput = this.ui.chatInput.value.trim();
        if (!userInput) return;

        this.ui.setLoading(true);
        this.ui.clearInput();
        this.ui.renderMessage('user', userInput);

        // Store user message
        const history = this.stateService.conversation.getConversationMessages(this.conversationId);
        
        const systemPrompt = "You are a helpful assistant."; // Keep it simple for now

        try {
            const metadata = this.stateService.aim.getAimMetadata();
            console.log('[WebWireApp]', 'Metadata:', metadata);
            const assistantResponse = await this.aiClient.generateTurn(userInput, history, { systemPrompt, metadata });
            
            // Store assistant response
            const userMessage = { role: 'user', content: userInput };
            const assistantMessage = { role: 'assistant', content: assistantResponse };
            this.stateService.conversation.storeMessage(this.conversationId, userMessage, assistantMessage);

            // Since we already streamed, we just need to finalize the message.
            this.ui.clearStreamingMessage();
            this.ui.renderMessage('assistant', assistantResponse);

            // Save state after a successful turn
            this.stateService.disk.saveState();

        } catch (error) {
            console.error('AI generation failed:', error);
            this.ui.renderMessage('assistant', `Error: ${error.message}`);
        } finally {
            this.ui.setLoading(false);
            this.ui.clearStreamingMessage();
        }
    }
}

// Kick off the application
document.addEventListener('DOMContentLoaded', () => {
    const app = new WebWireApp();
    app.initialize();
});