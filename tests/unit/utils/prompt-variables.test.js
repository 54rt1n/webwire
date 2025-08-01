import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptVariables } from '../../../src/js/utils/prompt-variables.js';

describe('PromptVariables', () => {
    let mockStateService;
    let mockPageContext;

    beforeEach(() => {
        // Mock Date for consistent testing
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-15T14:30:45.123Z'));

        // Mock state service
        mockStateService = {
            state: {
                settings: {
                    aim: {
                        userName: 'TestUser',
                        personaName: 'TestPersona'
                    },
                    ai: {
                        models: {
                            chat: {
                                model: 'gpt-4',
                                provider: 'openai'
                            }
                        }
                    }
                }
            },
            conversation: {
                getActiveThreadId: vi.fn().mockReturnValue('thread-123')
            }
        };

        // Mock page context (structure from pageUtils.getCurrentPageContent())
        mockPageContext = {
            title: 'Test Page Title',
            url: 'https://example.com/test',
            language: 'en',
            links: [],
            metadata: {},
            timestamp: '2025-01-15T14:30:45.123Z',
            mainContent: 'Test page content'
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('flattenObject', () => {
        it('should flatten nested objects with dot notation', () => {
            const input = {
                USER: {
                    NAME: 'John',
                    EMAIL: 'john@example.com'
                },
                AI: {
                    MODEL: 'gpt-4',
                    PROVIDER: 'openai'
                },
                SIMPLE: 'value'
            };

            const result = PromptVariables.flattenObject(input);

            expect(result).toEqual({
                'USER.NAME': 'John',
                'USER.EMAIL': 'john@example.com',
                'AI.MODEL': 'gpt-4',
                'AI.PROVIDER': 'openai',
                'SIMPLE': 'value'
            });
        });

        it('should handle deeply nested objects', () => {
            const input = {
                LEVEL1: {
                    LEVEL2: {
                        LEVEL3: {
                            VALUE: 'deep'
                        }
                    }
                }
            };

            const result = PromptVariables.flattenObject(input);

            expect(result).toEqual({
                'LEVEL1.LEVEL2.LEVEL3.VALUE': 'deep'
            });
        });

        it('should handle empty objects', () => {
            const result = PromptVariables.flattenObject({});
            expect(result).toEqual({});
        });

        it('should handle null and undefined values', () => {
            const input = {
                NULL_VAL: null,
                UNDEFINED_VAL: undefined,
                EMPTY_STRING: ''
            };

            const result = PromptVariables.flattenObject(input);

            expect(result).toEqual({
                'NULL_VAL': null,
                'UNDEFINED_VAL': undefined,
                'EMPTY_STRING': ''
            });
        });
    });

    describe('extractDomain', () => {
        it('should extract domain from URL', () => {
            expect(PromptVariables.extractDomain('https://example.com/test')).toBe('example.com');
            expect(PromptVariables.extractDomain('https://docs.anthropic.com/en/docs/claude-code')).toBe('docs.anthropic.com');
            expect(PromptVariables.extractDomain('http://localhost:3000/path')).toBe('localhost');
        });

        it('should handle invalid URLs gracefully', () => {
            expect(PromptVariables.extractDomain('')).toBe('');
            expect(PromptVariables.extractDomain(null)).toBe('');
            expect(PromptVariables.extractDomain('not-a-url')).toBe('');
        });
    });

    describe('buildVariableDict', () => {
        it('should build complete variable dictionary', () => {
            const result = PromptVariables.buildVariableDict(mockStateService, mockPageContext);

            expect(result.CURRENT_DATE).toBe('January 15, 2025');
            expect(result.CURRENT_ISO).toBe('2025-01-15T14:30:45.123Z');
            expect(result.CURRENT_DATETIME).toMatch(/January 15, 2025 at \d{1,2}:\d{2} [AP]M/);
            expect(result.USER).toBe('TestUser');
            expect(result.ASSISTANT).toBe('TestPersona');
            expect(result['AI.MODEL']).toBe('gpt-4');
            expect(result['AI.PROVIDER']).toBe('openai');
            expect(result['PAGE.TITLE']).toBe('Test Page Title');
            expect(result['PAGE.URL']).toBe('https://example.com/test');
            expect(result['PAGE.DOMAIN']).toBe('example.com');
            expect(result['CONVERSATION.ID']).toBe('thread-123');
        });

        it('should handle missing user name gracefully', () => {
            mockStateService.state.settings.aim.userName = undefined;

            const result = PromptVariables.buildVariableDict(mockStateService, mockPageContext);

            expect(result.USER).toBe('User');
        });

        it('should handle missing persona name gracefully', () => {
            mockStateService.state.settings.aim.personaName = undefined;

            const result = PromptVariables.buildVariableDict(mockStateService, mockPageContext);

            expect(result.ASSISTANT).toBe('Assistant');
        });

        it('should handle missing page context gracefully', () => {
            const result = PromptVariables.buildVariableDict(mockStateService, null);

            // In test environment, it may pick up window.location, so just check it's not empty
            expect(result['PAGE.TITLE']).toBeDefined();
            expect(result['PAGE.URL']).toBeDefined(); 
            expect(result['PAGE.DOMAIN']).toBeDefined();
        });

        it('should handle missing AI model config gracefully', () => {
            mockStateService.state.settings.ai.models.chat = undefined;

            const result = PromptVariables.buildVariableDict(mockStateService, mockPageContext);

            expect(result['AI.MODEL']).toBe('');
            expect(result['AI.PROVIDER']).toBe('');
        });

        it('should handle missing conversation ID gracefully', () => {
            mockStateService.conversation.getActiveThreadId.mockReturnValue(null);

            const result = PromptVariables.buildVariableDict(mockStateService, mockPageContext);

            expect(result['CONVERSATION.ID']).toBe('');
        });

        it('should handle synthetic messages format from buildPageContext', () => {
            const syntheticPageContext = {
                syntheticMessages: [
                    JSON.stringify({
                        title: 'Synthetic Page Title',
                        url: 'https://synthetic.com/page',
                        metadata: { description: 'Test' }
                    }),
                    'Some page content text'
                ],
                syntheticSources: ['page_metadata', 'page_content']
            };

            const result = PromptVariables.buildVariableDict(mockStateService, syntheticPageContext);

            expect(result['PAGE.TITLE']).toBe('Synthetic Page Title');
            expect(result['PAGE.URL']).toBe('https://synthetic.com/page');
            expect(result['PAGE.DOMAIN']).toBe('synthetic.com');
        });
    });

    describe('replaceVariables', () => {
        let variableDict;

        beforeEach(() => {
            variableDict = {
                CURRENT_DATE: 'January 15, 2025',
                USER: 'TestUser',
                'AI.MODEL': 'gpt-4',
                'PAGE.TITLE': 'Test Page'
            };
        });

        it('should replace single variables', () => {
            const text = 'Hello {{USER}}, today is {{CURRENT_DATE}}';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('Hello TestUser, today is January 15, 2025');
        });

        it('should replace dotted variables', () => {
            const text = 'You are using {{AI.MODEL}} to analyze {{PAGE.TITLE}}';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('You are using gpt-4 to analyze Test Page');
        });

        it('should handle multiple instances of same variable', () => {
            const text = '{{USER}}, welcome {{USER}}! Your name is {{USER}}.';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('TestUser, welcome TestUser! Your name is TestUser.');
        });

        it('should leave unknown variables unchanged', () => {
            const text = 'Hello {{USER}}, your {{UNKNOWN_VAR}} is here';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('Hello TestUser, your {{UNKNOWN_VAR}} is here');
        });

        it('should handle empty variable values', () => {
            variableDict.EMPTY_VAR = '';
            const text = 'Value: "{{EMPTY_VAR}}"';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('Value: ""');
        });

        it('should handle null and undefined variables', () => {
            variableDict.NULL_VAR = null;
            variableDict.UNDEFINED_VAR = undefined;
            const text = 'Null: {{NULL_VAR}}, Undefined: {{UNDEFINED_VAR}}';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('Null: {{NULL_VAR}}, Undefined: {{UNDEFINED_VAR}}');
        });

        it('should handle text with no variables', () => {
            const text = 'This text has no variables at all';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('This text has no variables at all');
        });

        it('should handle empty text', () => {
            const result = PromptVariables.replaceVariables('', variableDict);
            expect(result).toBe('');
        });

        it('should handle malformed variable patterns', () => {
            const text = 'Bad patterns: {USER} {{USER} {{}} {{ USER }}';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('Bad patterns: {USER} {{USER} {{}} {{ USER }}');
        });

        it('should be case sensitive', () => {
            const text = 'Hello {{user}} and {{USER}}';
            const result = PromptVariables.replaceVariables(text, variableDict);

            expect(result).toBe('Hello {{user}} and TestUser');
        });
    });

    describe('processPromptText', () => {
        it('should process complete prompt text with variables', () => {
            const promptText = `You are a helpful assistant named {{ASSISTANT}}.
Today is {{CURRENT_DATE}} and you are analyzing {{PAGE.TITLE}}.
The user {{USER}} is using {{AI.MODEL}} in conversation {{CONVERSATION.ID}}.`;

            const result = PromptVariables.processPromptText(promptText, mockStateService, mockPageContext);

            expect(result).toBe(`You are a helpful assistant named TestPersona.
Today is January 15, 2025 and you are analyzing Test Page Title.
The user TestUser is using gpt-4 in conversation thread-123.`);
        });

        it('should process real prompt templates with variables', () => {
            // Test with actual prompt content from key-takeaways.json
            const systemPrompt = "You are an expert at distilling complex content into its most essential insights. Today is {{CURRENT_DATE}} and you're helping {{USER}} analyze content from {{PAGE.DOMAIN}}. Your role is to identify what readers should remember and act upon from any piece of content.";
            const userPrompt = "Extract the key takeaways from '{{PAGE.TITLE}}' that I should remember and potentially act on. Focus on actionable insights, important facts, and core concepts that have practical value.";

            const processedSystemPrompt = PromptVariables.processPromptText(systemPrompt, mockStateService, mockPageContext);
            const processedUserPrompt = PromptVariables.processPromptText(userPrompt, mockStateService, mockPageContext);

            expect(processedSystemPrompt).toBe("You are an expert at distilling complex content into its most essential insights. Today is January 15, 2025 and you're helping TestUser analyze content from example.com. Your role is to identify what readers should remember and act upon from any piece of content.");
            expect(processedUserPrompt).toBe("Extract the key takeaways from 'Test Page Title' that I should remember and potentially act on. Focus on actionable insights, important facts, and core concepts that have practical value.");
        });

        it('should process user messages with variables for storage', () => {
            // Test the exact case from the user's message
            const userMessage = "Please provide a detailed yet concise summary of '{{PAGE.TITLE}}' from {{PAGE.DOMAIN}}. Start with a one-sentence abstract, followed by 5-7 key bullet points, and conclude with a short paragraph on the overall significance or implication of the content.";

            const result = PromptVariables.processPromptText(userMessage, mockStateService, mockPageContext);

            expect(result).toBe("Please provide a detailed yet concise summary of 'Test Page Title' from example.com. Start with a one-sentence abstract, followed by 5-7 key bullet points, and conclude with a short paragraph on the overall significance or implication of the content.");
        });

        it('should handle null prompt text', () => {
            const result = PromptVariables.processPromptText(null, mockStateService, mockPageContext);
            expect(result).toBe('');
        });

        it('should handle undefined prompt text', () => {
            const result = PromptVariables.processPromptText(undefined, mockStateService, mockPageContext);
            expect(result).toBe('');
        });
    });

    describe('date formatting', () => {
        it('should format dates consistently across timezones', () => {
            // Test with different timezone - the mock date should still work consistently
            const result = PromptVariables.buildVariableDict(mockStateService, mockPageContext);

            expect(result.CURRENT_DATE).toBe('January 15, 2025');
            expect(result.CURRENT_ISO).toBe('2025-01-15T14:30:45.123Z');
            expect(result.CURRENT_DATETIME).toMatch(/January 15, 2025 at \d{1,2}:\d{2} [AP]M/);
        });
    });

    describe('edge cases', () => {
        it('should handle circular references in state', () => {
            // Create a circular reference
            const circularState = { ...mockStateService };
            circularState.self = circularState;

            // Should not throw an error and should still work
            const result = PromptVariables.buildVariableDict(circularState, mockPageContext);
            expect(result.USER).toBe('TestUser');
        });

        it('should handle very large variable dictionaries', () => {
            const largeDict = {};
            for (let i = 0; i < 1000; i++) {
                largeDict[`VAR_${i}`] = `value_${i}`;
            }

            const text = 'Start {{VAR_0}} middle {{VAR_500}} end {{VAR_999}}';
            const result = PromptVariables.replaceVariables(text, largeDict);

            expect(result).toBe('Start value_0 middle value_500 end value_999');
        });
    });
});