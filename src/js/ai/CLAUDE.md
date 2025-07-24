# CLAUDE.md - AI Provider System

This file provides guidance for working with the WebWire AI provider abstraction system.

## Directory Structure
```
src/js/ai/
├── abstract-ai-client.js      # Base class with common functionality
├── ai-client-factory.js       # Factory for creating provider-specific clients
└── providers/                 # Concrete implementations
    ├── aimind-client.js      # AIMind provider
    ├── aistudio-client.js    # Google AI Studio provider
    ├── featherless-client.js # Featherless.ai provider
    └── openai-client.js      # OpenAI and OpenAI-compatible providers
```

## Overview

The AI provider system provides a unified interface for integrating multiple AI providers into WebWire. It handles:

- **Provider Abstraction** - Single interface for all AI providers
- **Streaming Support** - Real-time response streaming with chunk events
- **Error Handling** - Intelligent reconnection and timeout management
- **Tool Integration** - Support for OpenAI-format function calling
- **Configuration Management** - Unified sampler config across providers

## Architecture

### Abstract AI Client (`abstract-ai-client.js`)

The base class providing common functionality for all AI providers:

```javascript
class AbstractAIClient {
    constructor(clientName, eventBus, config = {}) {
        this.clientName = clientName;
        this.eventBus = eventBus;
        this.apiKey = config.apiKey || null;
        this.provider = config.provider || null;
        this.model = config.model || null;
        this.samplerConfig = config.samplerConfig || {
            temperature: 0.8,
            minP: 0.05,
            maxTokens: 2048
        };
        
        // Connection state management
        this.state = {
            connected: !!this.apiKey,
            reconnecting: false,
            consecutiveErrors: 0,
            consecutiveTimeouts: 0,
            lastRequestTime: 0,
            reconnectAttempts: 0
        };
    }
}
```

#### Key Methods

**Configuration:**
- `isConfigured()` - Check if client has valid API key
- `setApiKey(apiKey)` - Set authentication credentials
- `setModel(model)` - Set the AI model to use
- `setTemperature(temperature)` - Set generation temperature (0-2)
- `getSamplerConfig()` - Get snake_case config for API compatibility

**Core Functionality:**
- `generateTurn(userTurn, history, options)` - Abstract method for generating responses
- `streamChatCompletion(messages, options)` - Stream chat completion with error handling
- `processStreamResponse(response, options)` - Process SSE stream into text

**State Management:**
- `handleError(error)` - Intelligent error handling with reconnection logic
- `startReconnection()` - Exponential backoff reconnection
- `getStats()` - Get client statistics and state
- `reset()` - Reset error counters and state

**Streaming:**
- `emitStreamingChunk(chunk)` - Emit chunk via event bus
- Built-in support for `onChunk` callbacks or event-based streaming

### AI Client Factory (`ai-client-factory.js`)

Factory for creating provider-specific clients:

```javascript
class AIClientFactory {
    static createClient(eventBus, modelConfig) {
        // Validates configuration
        // Creates appropriate client based on provider
        // Configures client with API key, model, sampler config
        // Returns configured client instance
    }
}
```

#### Supported Providers

1. **Native Implementations:**
   - `aimind` - AIMind provider (custom implementation)
   - `featherless` - Featherless.ai (custom implementation)
   - `google` - Google AI Studio (custom implementation)
   - `openai` - OpenAI GPT models

2. **OpenAI-Compatible Providers:**
   - `openrouter` - Uses OpenAI client with custom baseUrl
   - `groq` - Fast inference with Groq cloud
   - `anthropic` - Claude models (via compatibility layer)
   - `meta` - Llama models via Meta's API

### Provider Implementations (`providers/`)

Each provider extends AbstractAIClient with specific implementation:

```javascript
class OpenAIClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('OpenAIClient', eventBus, config);
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        if (!this.model) {
            this.model = 'gpt-4-turbo';
        }
    }
    
    async generateTurn(userTurn, history = [], options = {}) {
        // Build messages array
        // Stream completion via parent class
        // Handle response and errors
    }
}
```

## Streaming Architecture

### Request Flow

1. **Message Building** - Format conversation for API
2. **Stream Initiation** - POST to `/chat/completions` with `stream: true`
3. **SSE Processing** - Handle Server-Sent Events line by line
4. **Chunk Emission** - Emit content via callbacks or events
5. **Error Recovery** - Handle timeouts and connection issues

### Stream Processing

```javascript
async processStreamResponse(response, { onChunk = null } = {}) {
    // Read response body as stream
    // Decode UTF-8 chunks
    // Parse SSE format (data: {...})
    // Extract content from delta
    // Emit via onChunk or eventBus
    // Accumulate full response
    // Handle [DONE] marker
}
```

### Tool Support

Tools are passed through the `streamChatCompletion` options:

```javascript
const response = await client.streamChatCompletion(messages, {
    tools: [
        {
            type: 'function',
            function: {
                name: 'get_weather',
                description: 'Get weather for location',
                parameters: { /* JSON Schema */ }
            }
        }
    ],
    onChunk: (chunk) => console.log(chunk)
});
```

## Configuration

### Sampler Configuration

All providers support unified sampler config with automatic snake_case conversion:

```javascript
{
    temperature: 0.8,        // Randomness (0-2)
    maxTokens: 2048,        // Max response length
    minP: 0.05,             // Minimum probability
    frequencyPenalty: 0.1,  // Reduce repetition
    presencePenalty: 0.1,   // Encourage new topics
    model: 'gpt-4-turbo'    // Override model
}
```

### Provider Configuration

```javascript
{
    provider: 'openai',
    api_key: 'sk-...',
    model: 'gpt-4-turbo',
    apiEndpoint: 'https://custom.openai.com/v1', // Optional custom endpoint
    sampler_config: {
        temperature: 0.7,
        max_tokens: 4096
    }
}
```

## Error Handling

### Timeout Management

- Default timeout: 30 seconds (configurable)
- Automatic abort on timeout
- Consecutive timeout tracking
- Reconnection after 3 consecutive timeouts

### Reconnection Logic

```javascript
// Exponential backoff with jitter
delay = min(baseDelay * pow(1.5, attempts - 1), 10000)
```

### Error States

- `consecutiveErrors` - General error count
- `consecutiveTimeouts` - Timeout-specific count
- `reconnecting` - Currently in reconnection
- `reconnectAttempts` - Total reconnection attempts

## Event Integration

### Streaming Events

```javascript
// Emitted for each content chunk
eventBus.emit(EVENTS.AI.STREAM_CHUNK, { chunk: 'content...' });

// Listen for chunks
eventBus.on(EVENTS.AI.STREAM_CHUNK, ({ chunk }) => {
    // Update UI with streaming content
});
```

### State Events

Providers can emit state change events for UI updates:
- Connection status changes
- Error occurrences
- Reconnection attempts

## Development Patterns

### Adding New Providers

1. **Create Provider Class:**
```javascript
// src/js/ai/providers/new-provider-client.js
import { AbstractAIClient } from '../abstract-ai-client.js';

export class NewProviderClient extends AbstractAIClient {
    constructor(eventBus, config = {}) {
        super('NewProviderClient', eventBus, config);
        this.baseUrl = config.baseUrl || 'https://api.newprovider.com/v1';
    }
    
    async generateTurn(userTurn, history = [], options = {}) {
        // Implementation
    }
}
```

2. **Register in Factory:**
```javascript
// In ai-client-factory.js
case 'newprovider':
    client = new NewProviderClient(eventBus, modelConfig);
    break;
```

3. **Add to Supported Providers:**
```javascript
static getSupportedProviders() {
    return [...existing, 'newprovider'];
}
```

### Extending Streaming

For providers with different streaming formats:

1. **Override processStreamResponse:**
```javascript
async processStreamResponse(response, options) {
    // Custom stream parsing logic
}
```

2. **Handle Provider-Specific Events:**
```javascript
// Parse custom streaming format
// Extract content/tokens
// Emit via standard interface
```

## Usage Examples

### Basic Generation

```javascript
const client = AIClientFactory.createClient(eventBus, {
    provider: 'openai',
    api_key: 'sk-...',
    model: 'gpt-4-turbo'
});

const response = await client.generateTurn(
    "Hello, how are you?",
    [], // empty history
    { systemPrompt: "You are a helpful assistant" }
);
```

### Streaming with Callbacks

```javascript
const response = await client.generateTurn(userMessage, history, {
    systemPrompt: "Be concise",
    onChunk: (chunk) => {
        // Update UI with each chunk
        document.getElementById('output').textContent += chunk;
    }
});
```

### With Tool Support

```javascript
const messages = client.buildMessages(userTurn, history, systemPrompt);
const response = await client.streamChatCompletion(messages, {
    tools: availableTools,
    onChunk: handleChunk
});
```

## Performance Considerations

### Connection Management
- Reuse client instances when possible
- Monitor consecutive errors for provider health
- Implement circuit breaker pattern for failing providers

### Streaming Optimization
- Use onChunk callbacks for immediate UI updates
- Avoid accumulating large buffers unnecessarily
- Handle backpressure in stream processing

### Memory Management
- Clear conversation history periodically
- Limit history context sent to API
- Monitor response sizes and implement limits

## Important Implementation Notes

### Snake Case Conversion
The `getSamplerConfig()` method automatically converts camelCase keys to snake_case for API compatibility:
- `maxTokens` → `max_tokens`
- `frequencyPenalty` → `frequency_penalty`

### Provider Quirks
- **OpenRouter**: Requires custom apiEndpoint configuration
- **Groq**: Uses fixed baseUrl `https://api.groq.com/openai/v1`
- **Anthropic**: Currently uses OpenAI compatibility layer (not optimal)
- **Meta**: Fixed endpoint at `https://api.llama.com/compat/v1`

### Streaming Format
All providers are expected to support OpenAI's SSE format:
```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: [DONE]
```

### Error Recovery
- Clients automatically reset error counters on successful requests
- Reconnection is non-blocking - new requests can be attempted
- Failed requests preserve original error for debugging