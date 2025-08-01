import { generateSessionId } from '../utils/id-generator.js';
import { logger } from '../core/logging.js';

/**
 * Creates the initial state structure for the app.
 * @returns {Object} The initial state object.
 */
export function createInitialState(tabId = undefined) {
    return {
        session: {
            sessionId: generateSessionId(),
            streamingInProgress: false,
            created: Date.now(),
            lastSaved: null,
            autoSaveEnabled: true,
        },

        tabs: {
            default: createInitialTabState(),
        },

        settings: createInitialSettingsState(),

        aim: {
            pinnedMessages: [],
            activeDocument: undefined,
            workspaceContent: undefined,
            thoughtContent: undefined,
            systemMessage: undefined,
            location: undefined,
            disableGuidance: false,
            disablePif: false,
        },
    
        mcp: {
            isAvailable: false,
            error: undefined,
            systemMessage: undefined,
            connection: {
                serverUrl: undefined, // string
                sessionId: undefined, // string
                postEndpoint: undefined, // string | undefined
                isConnected: false, // boolean
                isInitialized: false, // boolean
                lastConnected: undefined, // number | undefined
                connectionError: undefined, // string | undefined
            },

            /* tools
                {
                    name: string,
                    description: string,
                    type: 'function',
                    function: {
                        name: string,
                        description: string,
                        parameters: object
                    }
                }
            */
            tools: [], // available MCP tools in OpenAI format

            /* requests
                {
                    id: number,
                    method: string,
                    params: object,
                    timestamp: number,
                    status: 'pending' | 'completed' | 'failed' | 'timeout',
                    response: object | undefined,
                    error: string | undefined,
                }
            */
            pendingRequests: {}, // key is request_id, value is request info
        },

        conversation: {
            /* message
                {
                    role: string,
                    content: string,
                    timestamp: number,
                    think: string, // optional extracted thought content
                    url: string, // optional url of the page
                    title: string, // optional title of the page
                    model: string, // optional model used for the message
                    saved: boolean, // optional whether the message is saved
                }
            */
            history: {}, // key is conversation_id, value is array of messages

            /* metadata
                {
                    userName: string,
                    personaName: string,
                    mood: string | undefined,
                    systemMessage: string | undefined,
                    location: string | undefined,
                    startTime: number,
                    endTime: number | undefined,
                    duration: number | undefined,
                    status: string, // 'active', 'completed', 'saved', 'error'
                    error: string | undefined, // optional error message
                    errorCode: string | undefined, // optional error code
                    errorType: string | undefined, // optional error type
                }
            */
            metadata: {}, // key is conversation_id, value is the current metadata for the conversation
        },

        ui: createInitialUiState(tabId),

        stash: {
            // Stash state - persists across browser sessions
        },

        /*
            prompt-id: {
                buttonIcon: string,
                buttonText: string,
                systemPrompt: string,
                userPrompt: string,
                features: {
                    pageContent: boolean,
                    mcp: boolean,
                    autoThink: boolean,
                    noBaseSystemPrompt: boolean,
                    browserTools: boolean,
                    autoExecuteTools: boolean,
                },
                version: number,
                created: number,
                updated: number,
            }
        */
        prompts: {},
    };
}

export function createInitialSettingsState() {
    return {
        ai: {
            models: {
                chat: {
                    model: undefined,
                    provider: undefined,
                    tokenizer: undefined,
                    minimalMode: false,
                    samplerConfig: {
                        temperature: 0.8,
                        maxTokens: 2048,
                        maxContentTokens: 16384,
                        topP: undefined,
                        minP: 0.05,
                        topK: undefined,
                        frequencyPenalty: undefined,
                        presencePenalty: undefined,
                    }
                },
                thought: undefined,
                tool: undefined,
                creative: undefined,
            },
            providers: {
                featherless: {
                    apiKey: undefined,
                },
                openai: {
                    apiKey: undefined,
                },
                aimind: {
                    apiEndpoint: undefined,
                    apiKey: undefined,
                },
                google: {
                    apiKey: undefined,
                },
                openrouter: {
                    apiEndpoint: undefined,
                    apiKey: undefined,
                },
                groq: {
                    apiKey: undefined,
                },
                anthropic: {
                    apiKey: undefined,
                },
                meta: {
                    apiKey: undefined,
                },
            }
        },
        aim: {
            userName: undefined,
            personaName: undefined,
            showThought: false,
            autoThink: false,
            systemMessage: undefined,
            userHeader: undefined,
            userFooter: undefined,
        },
        mcp: {
            serverUrl: undefined,
            autoConnect: false,
            systemMessage: undefined,
        },
        reporting: {
            crashReportingEnabled: false,
        },
        ui: {
            autoInject: false,
            voice: {
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                lang: 'en-US',
                voice: undefined
            }
        },
    };
}

export function createInitialUiState(tabId = undefined) {
    return {
        tabId: tabId,
    };
}

export function createInitialTabState() {
    return {
        trackedThreadId: undefined,
        selectedModel: 'chat',
        includePageContent: true,
        useMCP: false,
        useBrowserTools: false,
        autoExecuteTools: false,
        panelVisible: false,
    };
}

/**
 * Serialize state for saving
 * @param {Object} state - The current state object
 * @returns {Object} Serialized state
 */
export function serializeState(state) {
    return {
        version: state.version,
        session: state.session,
        // Settings are managed separately via settings adapter, don't duplicate
        // settings: state.settings,
        aim: state.aim,
        mcp: {
            // Only serialize connection info and tools, not pending requests
            connection: {
                serverUrl: state.mcp.connection.serverUrl,
                // Don't serialize sessionId, postEndpoint, connection status
                isConnected: false, // Always start disconnected on restore
                isInitialized: false,
                lastConnected: state.mcp.connection.lastConnected,
                connectionError: undefined, // Clear errors on restore
            },
            tools: state.mcp.tools,
            pendingRequests: {}, // Clear pending requests on restore
        },
        conversation: state.conversation,
    };
}

/**
 * Deserialize saved state data
 * @param {Object} saveData - The saved state data to restore
 * @param {Object} currentState - The current state object to update
 * @returns {Object} The deserialized state
 */
export function deserializeState(saveData, currentState) {
    try {
        if (typeof saveData !== 'object' || saveData === null) {
            throw new Error('Invalid save data');
        }

        const newState = { ...currentState };

        if (saveData.version) newState.version = saveData.version;
        // Skip settings if they're already loaded (to avoid overwriting with stale data)
        // Settings are managed separately via the settings adapter
        // if (saveData.settings) newState.settings = saveData.settings;
        if (saveData.aim) newState.aim = saveData.aim;
        if (saveData.mcp) {
            // Merge MCP state carefully, preserving current connection state
            newState.mcp = {
                ...newState.mcp,
                connection: {
                    ...newState.mcp.connection,
                    ...(saveData.mcp.connection || {}),
                    // Force disconnected state on restore
                    isConnected: false,
                    isInitialized: false,
                    sessionId: undefined,
                    postEndpoint: undefined,
                    connectionError: undefined,
                },
                tools: saveData.mcp.tools || [],
                pendingRequests: {}, // Always start with empty pending requests
            };
        }
        if (saveData.conversation) newState.conversation = saveData.conversation;

        return newState;

    } catch (error) {
        logger.error('StateContainer', 'Failed to deserialize state:', error);
        throw error;
    }
} 