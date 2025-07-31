import { describe, it, expect, beforeEach } from 'vitest';
import { PromptStatePlugin } from '../../../src/js/state/plugins/prompt-state.js';
import { EVENTS } from '../../../src/js/core/events.js';
import { setupTest, TestStateFactory, TestData, StateAssertions, MockStateService } from './conftest.js';

describe('PromptStatePlugin', () => {
    let stateService, plugin;

    beforeEach(() => {
        stateService = new MockStateService();
        plugin = new PromptStatePlugin(stateService);
    });

    describe('Constructor and Basic Operations', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toBe(stateService.eventBus);
            expect(plugin.storage).toBe(stateService.storage.prompts);
        });

        it('should handle missing storage adapter', () => {
            const stateServiceNoStorage = new MockStateService();
            delete stateServiceNoStorage.storage.prompts;
            const pluginNoStorage = new PromptStatePlugin(stateServiceNoStorage);
            
            expect(pluginNoStorage.storage).toBeUndefined();
        });
    });

    describe('Storage Operations', () => {
        it('should load prompts from storage', async () => {
            const promptsData = {
                prompts: {
                    'test-prompt': {
                        buttonText: 'Test Prompt',
                        buttonIcon: 'test-icon',
                        userPrompt: 'Test user prompt',
                        systemPrompt: 'Test system prompt',
                        status: 'active'
                    }
                }
            };
            plugin.storage.data['savedState'] = promptsData;
            
            await plugin.loadFromStorage();
            
            expect(stateService.state.prompts).toEqual(promptsData.prompts);
        });

        it('should handle null storage data on load', async () => {
            plugin.storage.load = async () => null;
            
            await plugin.loadFromStorage();
            
            // State should remain unchanged
            expect(stateService.state.prompts).toBeDefined();
        });

        it('should handle missing prompts in storage data', async () => {
            plugin.storage.load = async () => ({ other: 'data' });
            
            await plugin.loadFromStorage();
            
            // State should remain unchanged when no prompts field
            expect(stateService.state.prompts).toBeDefined();
        });

        it('should handle missing storage adapter on load', async () => {
            plugin.storage = null;
            
            await expect(plugin.loadFromStorage()).resolves.not.toThrow();
        });

        it('should save prompts to storage', async () => {
            const promptsData = {
                'test-prompt': {
                    buttonText: 'Test Prompt',
                    status: 'active'
                }
            };
            stateService.state.prompts = promptsData;
            
            await plugin.saveToStorage();
            
            const saveCalls = plugin.storage.calls.filter(c => c.method === 'save');
            expect(saveCalls).toHaveLength(1);
            expect(saveCalls[0].key).toEqual({ prompts: promptsData });
        });

        it('should handle missing storage adapter on save', async () => {
            plugin.storage = null;
            stateService.state.prompts = { 'test': 'data' };
            
            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });
    });

    describe('Prompt Management', () => {
        it('should set all prompts', () => {
            const prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt2': { buttonText: 'Prompt 2', status: 'inactive' }
            };

            plugin.setPrompts(prompts);

            expect(stateService.state.prompts).toEqual(prompts);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.UPDATED,
                data => data.prompts === prompts);
        });

        it('should set single prompt', () => {
            const promptId = 'test-prompt';
            const promptData = {
                buttonText: 'Test Button',
                buttonIcon: 'test-icon',
                userPrompt: 'Test user prompt',
                systemPrompt: 'Test system prompt',
                status: 'active'
            };

            plugin.setPrompt(promptId, promptData);

            expect(stateService.state.prompts[promptId]).toEqual(promptData);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.CREATED,
                data => data.promptId === promptId && data.prompt === promptData);
        });

        it('should initialize prompts object if undefined', () => {
            delete stateService.state.prompts;
            
            plugin.setPrompt('test', { buttonText: 'Test' });
            
            expect(stateService.state.prompts).toEqual({
                'test': { buttonText: 'Test' }
            });
        });

        it('should get specific prompt by ID', () => {
            const promptData = { buttonText: 'Test', status: 'active' };
            stateService.state.prompts = { 'test-prompt': promptData };
            
            const result = plugin.getPrompt('test-prompt');
            
            expect(result).toEqual(promptData);
        });

        it('should return undefined for non-existent prompt', () => {
            stateService.state.prompts = {};
            
            const result = plugin.getPrompt('non-existent');
            
            expect(result).toBeUndefined();
        });

        it('should get all prompts', () => {
            const prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt2': { buttonText: 'Prompt 2', status: 'inactive' }
            };
            stateService.state.prompts = prompts;
            
            const result = plugin.getAllPrompts();
            
            expect(result).toEqual(prompts);
        });

        it('should return empty object when no prompts', () => {
            delete stateService.state.prompts;
            
            const result = plugin.getAllPrompts();
            
            expect(result).toEqual({});
        });
    });

    describe('Prompt Filtering', () => {
        beforeEach(() => {
            stateService.state.prompts = {
                'active1': { buttonText: 'Active 1', status: 'active' },
                'active2': { buttonText: 'Active 2', status: 'active' },
                'inactive1': { buttonText: 'Inactive 1', status: 'inactive' },
                'inactive2': { buttonText: 'Inactive 2', status: 'inactive' }
            };
        });

        it('should get only active prompts', () => {
            const result = plugin.getActivePrompts();
            
            expect(Object.keys(result)).toEqual(['active1', 'active2']);
            expect(result.active1.status).toBe('active');
            expect(result.active2.status).toBe('active');
        });

        it('should get only inactive prompts', () => {
            const result = plugin.getInactivePrompts();
            
            expect(Object.keys(result)).toEqual(['inactive1', 'inactive2']);
            expect(result.inactive1.status).toBe('inactive');
            expect(result.inactive2.status).toBe('inactive');
        });

        it('should handle empty prompt list for filtering', () => {
            stateService.state.prompts = {};
            
            expect(plugin.getActivePrompts()).toEqual({});
            expect(plugin.getInactivePrompts()).toEqual({});
        });

        it('should handle undefined prompts for filtering', () => {
            delete stateService.state.prompts;
            
            expect(plugin.getActivePrompts()).toEqual({});
            expect(plugin.getInactivePrompts()).toEqual({});
        });
    });

    describe('Status Management', () => {
        beforeEach(() => {
            stateService.state.prompts = {
                'test-prompt': {
                    buttonText: 'Test',
                    status: 'active'
                }
            };
        });

        it('should toggle prompt status from active to inactive', () => {
            const result = plugin.togglePromptStatus('test-prompt');
            
            expect(result).toBe(true);
            expect(stateService.state.prompts['test-prompt'].status).toBe('inactive');
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.STATUS_CHANGED,
                data => data.promptId === 'test-prompt' && 
                       data.oldStatus === 'active' && 
                       data.newStatus === 'inactive');
        });

        it('should toggle prompt status from inactive to active', () => {
            stateService.state.prompts['test-prompt'].status = 'inactive';
            
            const result = plugin.togglePromptStatus('test-prompt');
            
            expect(result).toBe(true);
            expect(stateService.state.prompts['test-prompt'].status).toBe('active');
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.STATUS_CHANGED,
                data => data.promptId === 'test-prompt' && 
                       data.oldStatus === 'inactive' && 
                       data.newStatus === 'active');
        });

        it('should return false for non-existent prompt toggle', () => {
            const result = plugin.togglePromptStatus('non-existent');
            
            expect(result).toBe(false);
            expect(stateService.eventBus.getEmittedEvents()).toHaveLength(0);
        });

        it('should set prompt status to specific value', () => {
            const result = plugin.setPromptStatus('test-prompt', 'inactive');
            
            expect(result).toBe(true);
            expect(stateService.state.prompts['test-prompt'].status).toBe('inactive');
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.STATUS_CHANGED,
                data => data.promptId === 'test-prompt' && 
                       data.oldStatus === 'active' && 
                       data.newStatus === 'inactive');
        });

        it('should return false for non-existent prompt status set', () => {
            const result = plugin.setPromptStatus('non-existent', 'active');
            
            expect(result).toBe(false);
            expect(stateService.eventBus.getEmittedEvents()).toHaveLength(0);
        });
    });

    describe('Prompt Deletion', () => {
        beforeEach(() => {
            stateService.state.prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt2': { buttonText: 'Prompt 2', status: 'inactive' }
            };
        });

        it('should delete existing prompt', () => {
            const promptData = stateService.state.prompts['prompt1'];
            
            const result = plugin.deletePrompt('prompt1');
            
            expect(result).toBe(true);
            expect(stateService.state.prompts['prompt1']).toBeUndefined();
            expect(stateService.state.prompts['prompt2']).toBeDefined();
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.DELETED,
                data => data.promptId === 'prompt1' && data.prompt === promptData);
        });

        it('should return false for non-existent prompt deletion', () => {
            const result = plugin.deletePrompt('non-existent');
            
            expect(result).toBe(false);
            expect(stateService.eventBus.getEmittedEvents()).toHaveLength(0);
        });
    });

    describe('Prompt Updates', () => {
        beforeEach(() => {
            stateService.state.prompts = {
                'test-prompt': {
                    buttonText: 'Original Text',
                    buttonIcon: 'original-icon',
                    userPrompt: 'Original user prompt',
                    status: 'active'
                }
            };
        });

        it('should update prompt data', () => {
            const updates = {
                buttonText: 'Updated Text',
                userPrompt: 'Updated user prompt'
            };
            
            const result = plugin.updatePrompt('test-prompt', updates);
            
            expect(result).toBe(true);
            expect(stateService.state.prompts['test-prompt']).toMatchObject({
                buttonText: 'Updated Text',
                buttonIcon: 'original-icon',
                userPrompt: 'Updated user prompt',
                status: 'active'
            });
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.UPDATED,
                data => data.promptId === 'test-prompt' && data.prompt === stateService.state.prompts['test-prompt']);
        });

        it('should return false for non-existent prompt update', () => {
            const result = plugin.updatePrompt('non-existent', { buttonText: 'New' });
            
            expect(result).toBe(false);
            expect(stateService.eventBus.getEmittedEvents()).toHaveLength(0);
        });
    });

    describe('Import/Export Operations', () => {
        it('should import prompts without overwrite', () => {
            stateService.state.prompts = {
                'existing': { buttonText: 'Existing', status: 'active' }
            };
            
            const importedPrompts = {
                'new1': { buttonText: 'New 1', status: 'active' },
                'new2': { buttonText: 'New 2', status: 'inactive' },
                'existing': { buttonText: 'Should be skipped', status: 'inactive' }
            };
            
            plugin.importPrompts(importedPrompts, false);
            
            expect(stateService.state.prompts['existing'].buttonText).toBe('Existing');
            expect(stateService.state.prompts['new1']).toEqual(importedPrompts['new1']);
            expect(stateService.state.prompts['new2']).toEqual(importedPrompts['new2']);
            
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.IMPORTED,
                data => data.importedCount === 2 && data.skippedCount === 1);
        });

        it('should import prompts with overwrite', () => {
            stateService.state.prompts = {
                'existing': { buttonText: 'Existing', status: 'active' }
            };
            
            const importedPrompts = {
                'new1': { buttonText: 'New 1', status: 'active' },
                'existing': { buttonText: 'Overwritten', status: 'inactive' }
            };
            
            plugin.importPrompts(importedPrompts, true);
            
            expect(stateService.state.prompts['existing'].buttonText).toBe('Overwritten');
            expect(stateService.state.prompts['new1']).toEqual(importedPrompts['new1']);
            
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.IMPORTED,
                data => data.importedCount === 2 && data.skippedCount === 0);
        });

        it('should export all prompts when no IDs specified', () => {
            const prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt2': { buttonText: 'Prompt 2', status: 'inactive' }
            };
            stateService.state.prompts = prompts;
            
            const result = plugin.exportPrompts();
            
            expect(result).toEqual(prompts);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.EXPORTED,
                data => data.promptIds.length === 2 && 
                       data.prompts === result);
        });

        it('should export specific prompts by ID', () => {
            stateService.state.prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt2': { buttonText: 'Prompt 2', status: 'inactive' },
                'prompt3': { buttonText: 'Prompt 3', status: 'active' }
            };
            
            const result = plugin.exportPrompts(['prompt1', 'prompt3']);
            
            expect(result).toEqual({
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt3': { buttonText: 'Prompt 3', status: 'active' }
            });
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.PROMPT.EXPORTED,
                data => data.promptIds.length === 2);
        });

        it('should handle non-existent prompt IDs in export', () => {
            stateService.state.prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' }
            };
            
            const result = plugin.exportPrompts(['prompt1', 'non-existent']);
            
            expect(result).toEqual({
                'prompt1': { buttonText: 'Prompt 1', status: 'active' }
            });
        });
    });

    describe('Statistics', () => {
        it('should get comprehensive prompt statistics', () => {
            stateService.state.prompts = {
                'active1': { 
                    buttonText: 'Active 1', 
                    status: 'active',
                    features: { mcp: true, pageContent: true }
                },
                'active2': { 
                    buttonText: 'Active 2', 
                    status: 'active',
                    features: { autoThink: true }
                },
                'inactive1': { 
                    buttonText: 'Inactive 1', 
                    status: 'inactive',
                    features: { mcp: true, autoThink: true }
                },
                'inactive2': { 
                    buttonText: 'Inactive 2', 
                    status: 'inactive'
                }
            };
            
            const stats = plugin.getStats();
            
            expect(stats).toEqual({
                total: 4,
                active: 2,
                inactive: 2,
                withMCP: 2,
                withPageContent: 1,
                withAutoThink: 2
            });
        });

        it('should handle empty prompts for stats', () => {
            stateService.state.prompts = {};
            
            const stats = plugin.getStats();
            
            expect(stats).toEqual({
                total: 0,
                active: 0,
                inactive: 0,
                withMCP: 0,
                withPageContent: 0,
                withAutoThink: 0
            });
        });

        it('should handle undefined prompts for stats', () => {
            delete stateService.state.prompts;
            
            const stats = plugin.getStats();
            
            expect(stats).toEqual({
                total: 0,
                active: 0,
                inactive: 0,
                withMCP: 0,
                withPageContent: 0,
                withAutoThink: 0
            });
        });

        it('should handle missing features in stats', () => {
            stateService.state.prompts = {
                'prompt1': { buttonText: 'Prompt 1', status: 'active' },
                'prompt2': { buttonText: 'Prompt 2', status: 'inactive', features: {} }
            };
            
            const stats = plugin.getStats();
            
            expect(stats.withMCP).toBe(0);
            expect(stats.withPageContent).toBe(0);
            expect(stats.withAutoThink).toBe(0);
        });
    });

    describe('Search Operations', () => {
        beforeEach(() => {
            stateService.state.prompts = {
                'code-review': {
                    buttonText: 'Code Review',
                    userPrompt: 'Please review this code for bugs',
                    systemPrompt: 'You are a code reviewer',
                    status: 'active'
                },
                'summarize': {
                    buttonText: 'Summarize',
                    userPrompt: 'Summarize the page content',
                    systemPrompt: 'You are a summarization expert',
                    status: 'active'
                },
                'debug-help': {
                    buttonText: 'Debug Help',
                    userPrompt: 'Help me debug this issue',
                    systemPrompt: 'You are a debugging assistant',
                    status: 'inactive'
                }
            };
        });

        it('should search prompts by button text', () => {
            const result = plugin.searchPrompts('Code');
            
            expect(Object.keys(result)).toEqual(['code-review']);
        });

        it('should search prompts by user prompt content', () => {
            const result = plugin.searchPrompts('summarize');
            
            expect(Object.keys(result)).toEqual(['summarize']);
        });

        it('should search prompts by system prompt content', () => {
            const result = plugin.searchPrompts('debugging');
            
            expect(Object.keys(result)).toEqual(['debug-help']);
        });

        it('should search prompts by prompt ID', () => {
            const result = plugin.searchPrompts('debug-help');
            
            expect(Object.keys(result)).toEqual(['debug-help']);
        });

        it('should perform case-insensitive search', () => {
            const result = plugin.searchPrompts('CODE');
            
            expect(Object.keys(result)).toEqual(['code-review']);
        });

        it('should return all prompts for empty query', () => {
            const result = plugin.searchPrompts('');
            
            expect(Object.keys(result)).toEqual(['code-review', 'summarize', 'debug-help']);
        });

        it('should return all prompts for null query', () => {
            const result = plugin.searchPrompts(null);
            
            expect(Object.keys(result)).toEqual(['code-review', 'summarize', 'debug-help']);
        });

        it('should return all prompts for undefined query', () => {
            const result = plugin.searchPrompts(undefined);
            
            expect(Object.keys(result)).toEqual(['code-review', 'summarize', 'debug-help']);
        });

        it('should return empty object for no matches', () => {
            const result = plugin.searchPrompts('nonexistent');
            
            expect(result).toEqual({});
        });

        it('should handle undefined prompts for search', () => {
            delete stateService.state.prompts;
            
            const result = plugin.searchPrompts('test');
            
            expect(result).toEqual({});
        });
    });

    describe('Validation', () => {
        it('should validate correct prompt data', () => {
            const promptData = {
                buttonText: 'Test Button',
                buttonIcon: 'test-icon',
                userPrompt: 'Test user prompt',
                systemPrompt: 'Test system prompt',
                status: 'active',
                features: {
                    pageContent: true,
                    mcp: false,
                    autoThink: true
                }
            };
            
            const result = plugin.validatePrompt(promptData);
            
            expect(result.isValid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should detect missing required fields', () => {
            const promptData = {
                buttonText: 'Test',
                // Missing other required fields
            };
            
            const result = plugin.validatePrompt(promptData);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Missing required field: buttonIcon');
            expect(result.errors).toContain('Missing required field: userPrompt');
            expect(result.errors).toContain('Missing required field: systemPrompt');
            expect(result.errors).toContain('Missing required field: status');
        });

        it('should validate status values', () => {
            const promptData = {
                buttonText: 'Test',
                buttonIcon: 'icon',
                userPrompt: 'prompt',
                systemPrompt: 'system',
                status: 'invalid-status'
            };
            
            const result = plugin.validatePrompt(promptData);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Status must be "active" or "inactive"');
        });

        it('should validate feature names and types', () => {
            const promptData = {
                buttonText: 'Test',
                buttonIcon: 'icon',
                userPrompt: 'prompt',
                systemPrompt: 'system',
                status: 'active',
                features: {
                    pageContent: true,
                    invalidFeature: 'not-boolean',
                    unknownFeature: true
                }
            };
            
            const result = plugin.validatePrompt(promptData);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Feature invalidFeature must be boolean');
            expect(result.errors).toContain('Unknown feature: unknownFeature');
        });

        it('should handle null prompt data', () => {
            const result = plugin.validatePrompt(null);
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Prompt data must be an object');
        });

        it('should handle non-object prompt data', () => {
            const result = plugin.validatePrompt('not an object');
            
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Prompt data must be an object');
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete prompt lifecycle', async () => {
            const promptId = 'lifecycle-test';
            const promptData = {
                buttonText: 'Lifecycle Test',
                buttonIcon: 'test-icon',
                userPrompt: 'Test user prompt',
                systemPrompt: 'Test system prompt',
                status: 'active'
            };
            
            // Create prompt
            plugin.setPrompt(promptId, promptData);
            expect(plugin.getPrompt(promptId)).toEqual(promptData);
            
            // Update prompt
            plugin.updatePrompt(promptId, { buttonText: 'Updated Test' });
            expect(plugin.getPrompt(promptId).buttonText).toBe('Updated Test');
            
            // Toggle status
            plugin.togglePromptStatus(promptId);
            expect(plugin.getPrompt(promptId).status).toBe('inactive');
            
            // Search for prompt
            const searchResults = plugin.searchPrompts('Updated');
            expect(Object.keys(searchResults)).toContain(promptId);
            
            // Export prompt
            const exported = plugin.exportPrompts([promptId]);
            expect(exported[promptId]).toBeDefined();
            
            // Delete prompt
            plugin.deletePrompt(promptId);
            expect(plugin.getPrompt(promptId)).toBeUndefined();
        });

        it('should handle batch operations', () => {
            const prompts = {
                'batch1': { buttonText: 'Batch 1', status: 'active' },
                'batch2': { buttonText: 'Batch 2', status: 'inactive' },
                'batch3': { buttonText: 'Batch 3', status: 'active' }
            };
            
            // Set all prompts
            plugin.setPrompts(prompts);
            
            // Get filtered prompts
            const active = plugin.getActivePrompts();
            const inactive = plugin.getInactivePrompts();
            
            expect(Object.keys(active)).toEqual(['batch1', 'batch3']);
            expect(Object.keys(inactive)).toEqual(['batch2']);
            
            // Get statistics
            const stats = plugin.getStats();
            expect(stats.total).toBe(3);
            expect(stats.active).toBe(2);
            expect(stats.inactive).toBe(1);
        });

        it('should maintain consistency across operations', () => {
            // Start with prompts
            plugin.setPrompts({
                'consistent1': { buttonText: 'Test 1', status: 'active' },
                'consistent2': { buttonText: 'Test 2', status: 'inactive' }
            });
            
            // Verify counts match
            const all = plugin.getAllPrompts();
            const active = plugin.getActivePrompts();
            const inactive = plugin.getInactivePrompts();
            const stats = plugin.getStats();
            
            expect(Object.keys(all)).toHaveLength(2);
            expect(Object.keys(active)).toHaveLength(1);
            expect(Object.keys(inactive)).toHaveLength(1);
            expect(stats.total).toBe(2);
            expect(stats.active).toBe(1);
            expect(stats.inactive).toBe(1);
            
            // Toggle status and verify consistency
            plugin.togglePromptStatus('consistent2');
            
            const newActive = plugin.getActivePrompts();
            const newInactive = plugin.getInactivePrompts();
            const newStats = plugin.getStats();
            
            expect(Object.keys(newActive)).toHaveLength(2);
            expect(Object.keys(newInactive)).toHaveLength(0);
            expect(newStats.active).toBe(2);
            expect(newStats.inactive).toBe(0);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle undefined prompts state gracefully', () => {
            delete stateService.state.prompts;
            
            expect(plugin.getAllPrompts()).toEqual({});
            expect(plugin.getActivePrompts()).toEqual({});
            expect(plugin.getInactivePrompts()).toEqual({});
            expect(plugin.getStats().total).toBe(0);
            expect(plugin.searchPrompts('test')).toEqual({});
        });

        it('should handle corrupt prompts state', () => {
            stateService.state.prompts = 'not an object';
            
            // Operations should not crash
            expect(() => plugin.getAllPrompts()).not.toThrow();
            expect(() => plugin.getStats()).not.toThrow();
        });

        it('should handle prompt with missing status gracefully', () => {
            stateService.state.prompts = {
                'no-status': { buttonText: 'No Status' }
            };
            
            const active = plugin.getActivePrompts();
            const inactive = plugin.getInactivePrompts();
            
            // Prompt with undefined status should not appear in either filter
            expect(Object.keys(active)).toHaveLength(0);
            expect(Object.keys(inactive)).toHaveLength(0);
        });

        it('should handle very large prompt collections', () => {
            const largePromptSet = {};
            for (let i = 0; i < 1000; i++) {
                largePromptSet[`prompt-${i}`] = {
                    buttonText: `Prompt ${i}`,
                    status: i % 2 === 0 ? 'active' : 'inactive'
                };
            }
            
            plugin.setPrompts(largePromptSet);
            
            const stats = plugin.getStats();
            expect(stats.total).toBe(1000);
            expect(stats.active).toBe(500);
            expect(stats.inactive).toBe(500);
            
            // Search should still work
            const searchResults = plugin.searchPrompts('Prompt 1');
            expect(Object.keys(searchResults).length).toBeGreaterThan(0);
        });
    });
});