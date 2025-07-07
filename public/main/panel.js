// main/panel.js

export class MainPanel {
    constructor() {
        this.chatContainer = document.getElementById('chat-container');
        this.chatInput = document.getElementById('chat-input');
        this.sendButton = document.getElementById('send-button');
        this.resetButton = document.getElementById('reset-button');
        this.streamingMessageElement = null;
    }

    renderMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', role);
        msgDiv.textContent = content;
        this.chatContainer.appendChild(msgDiv);
        this.scrollToBottom();
    }

    updateStreamingMessage(chunk) {
        if (!this.streamingMessageElement) {
            this.streamingMessageElement = document.createElement('div');
            this.streamingMessageElement.classList.add('message', 'assistant');
            this.chatContainer.appendChild(this.streamingMessageElement);
        }
        this.streamingMessageElement.textContent += chunk;
        this.scrollToBottom();
    }

    clearStreamingMessage() {
        if (this.streamingMessageElement) {
            this.chatContainer.removeChild(this.streamingMessageElement);
        }
        this.streamingMessageElement = null;
    }

    clearInput() {
        this.chatInput.value = '';
    }

    setLoading(isLoading) {
        this.chatInput.disabled = isLoading;
        this.sendButton.disabled = isLoading;
        this.sendButton.textContent = isLoading ? '...' : 'Send';
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    clearChat() {
        this.chatContainer.innerHTML = '';
        this.clearStreamingMessage();
    }
}