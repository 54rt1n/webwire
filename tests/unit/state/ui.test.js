import { describe, it, expect, beforeEach } from 'vitest';
import { UiStatePlugin } from '../../../src/js/state/plugins/ui-state.js';
import { createInitialState, createInitialUiState, createInitialTabState } from '../../../src/js/state/state-container.js';
import { MockStorageAdapter, MockEventBus, TestStateFactory, setupTest } from './conftest.js';

describe('UiStatePlugin', () => {
    let plugin, stateService, eventBus, storage;

    beforeEach(() => {
        const setup = setupTest();
        stateService = setup.stateService;
        eventBus = setup.eventBus;
        storage = setup.storage;
        
        plugin = new UiStatePlugin(stateService);
    });

    describe('constructor', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toStrictEqual(eventBus);
        });
    });

    describe('getUiState', () => {
        it('should return current UI state', () => {
            const result = plugin.getUiState();
            expect(result).toBe(stateService.state.ui);
        });

        it('should return initial UI state structure', () => {
            const result = plugin.getUiState();
            expect(result).toHaveProperty('tabId');
        });
    });

    describe('auto-inject settings', () => {
        it('should set auto-inject setting', () => {
            plugin.setAutoInject(true);
            expect(stateService.state.settings.ui.autoInject).toBe(true);
        });

        it('should get auto-inject setting', () => {
            stateService.state.settings.ui.autoInject = true;
            expect(plugin.getAutoInject()).toBe(true);
        });

        it('should handle false auto-inject setting', () => {
            plugin.setAutoInject(false);
            expect(plugin.getAutoInject()).toBe(false);
        });
    });

    describe('tab ID management', () => {
        it('should set tab ID', () => {
            const tabId = 'test-tab-123';
            plugin.setTabId(tabId);
            expect(stateService.state.ui.tabId).toBe(tabId);
        });

        it('should get tab ID', () => {
            const tabId = 'test-tab-456';
            stateService.state.ui.tabId = tabId;
            expect(plugin.getTabId()).toBe(tabId);
        });

        it('should handle null tab ID', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getTabId()).toBeNull();
        });
    });

    describe('_currentTab helper', () => {
        it('should return null when no tab ID set', () => {
            stateService.state.ui.tabId = null;
            expect(plugin._currentTab()).toBeNull();
        });

        it('should return null when tab does not exist', () => {
            stateService.state.ui.tabId = 'non-existent-tab';
            expect(plugin._currentTab()).toBeNull();
        });

        it('should return tab state when tab exists', () => {
            const tabId = 'test-tab';
            const tabState = createInitialTabState();
            
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
            
            expect(plugin._currentTab()).toBe(tabState);
        });
    });

    describe('includePageContent setting', () => {
        let tabId, tabState;

        beforeEach(() => {
            tabId = 'test-tab';
            tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
        });

        it('should get includePageContent setting', () => {
            tabState.includePageContent = true;
            expect(plugin.getIncludePageContent()).toBe(true);
        });

        it('should set includePageContent setting', () => {
            plugin.setIncludePageContent(false);
            expect(tabState.includePageContent).toBe(false);
        });

        it('should return false when no current tab', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getIncludePageContent()).toBe(false);
        });

        it('should not set when no current tab', () => {
            stateService.state.ui.tabId = null;
            plugin.setIncludePageContent(true);
            
            // Should not throw or modify anything
            expect(plugin.getIncludePageContent()).toBe(false);
        });
    });

    describe('useMCP setting', () => {
        let tabId, tabState;

        beforeEach(() => {
            tabId = 'test-tab';
            tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
        });

        it('should get useMCP setting', () => {
            tabState.useMCP = true;
            expect(plugin.getUseMCP()).toBe(true);
        });

        it('should set useMCP setting', () => {
            plugin.setUseMCP(false);
            expect(tabState.useMCP).toBe(false);
        });

        it('should return false when no current tab', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getUseMCP()).toBe(false);
        });

        it('should not set when no current tab', () => {
            stateService.state.ui.tabId = null;
            plugin.setUseMCP(true);
            expect(plugin.getUseMCP()).toBe(false);
        });
    });

    describe('useBrowserTools setting', () => {
        let tabId, tabState;

        beforeEach(() => {
            tabId = 'test-tab';
            tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
        });

        it('should get useBrowserTools setting', () => {
            tabState.useBrowserTools = true;
            expect(plugin.getUseBrowserTools()).toBe(true);
        });

        it('should set useBrowserTools setting', () => {
            plugin.setUseBrowserTools(false);
            expect(tabState.useBrowserTools).toBe(false);
        });

        it('should return false when no current tab', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getUseBrowserTools()).toBe(false);
        });

        it('should not set when no current tab', () => {
            stateService.state.ui.tabId = null;
            plugin.setUseBrowserTools(true);
            expect(plugin.getUseBrowserTools()).toBe(false);
        });
    });

    describe('autoExecuteTools setting', () => {
        let tabId, tabState;

        beforeEach(() => {
            tabId = 'test-tab';
            tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
        });

        it('should get autoExecuteTools setting', () => {
            tabState.autoExecuteTools = true;
            expect(plugin.getAutoExecuteTools()).toBe(true);
        });

        it('should set autoExecuteTools setting', () => {
            plugin.setAutoExecuteTools(false);
            expect(tabState.autoExecuteTools).toBe(false);
        });

        it('should return false when no current tab', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getAutoExecuteTools()).toBe(false);
        });

        it('should not set when no current tab', () => {
            stateService.state.ui.tabId = null;
            plugin.setAutoExecuteTools(true);
            expect(plugin.getAutoExecuteTools()).toBe(false);
        });
    });

    describe('selectedModel setting', () => {
        let tabId, tabState;

        beforeEach(() => {
            tabId = 'test-tab';
            tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
        });

        it('should get selectedModel setting', () => {
            tabState.selectedModel = 'gpt-4';
            expect(plugin.getSelectedModel()).toBe('gpt-4');
        });

        it('should set selectedModel setting', () => {
            plugin.setSelectedModel('claude-3');
            expect(tabState.selectedModel).toBe('claude-3');
        });

        it('should return false when no current tab', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getSelectedModel()).toBe(false);
        });

        it('should not set when no current tab', () => {
            stateService.state.ui.tabId = null;
            plugin.setSelectedModel('gpt-4');
            expect(plugin.getSelectedModel()).toBe(false);
        });
    });

    describe('trackedThreadId setting', () => {
        let tabId, tabState;

        beforeEach(() => {
            tabId = 'test-tab';
            tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
        });

        it('should get trackedThreadId setting', () => {
            const threadId = 'thread-123';
            tabState.trackedThreadId = threadId;
            expect(plugin.getTrackedThreadId()).toBe(threadId);
        });

        it('should set trackedThreadId setting', () => {
            const threadId = 'thread-456';
            plugin.setTrackedThreadId(threadId);
            expect(tabState.trackedThreadId).toBe(threadId);
        });

        it('should return null when no current tab', () => {
            stateService.state.ui.tabId = null;
            expect(plugin.getTrackedThreadId()).toBeNull();
        });

        it('should not set when no current tab', () => {
            stateService.state.ui.tabId = null;
            plugin.setTrackedThreadId('thread-123');
            expect(plugin.getTrackedThreadId()).toBeNull();
        });

        it('should handle null threadId', () => {
            plugin.setTrackedThreadId(null);
            expect(plugin.getTrackedThreadId()).toBeNull();
        });
    });

    describe('voice settings', () => {
        it('should get voice settings', () => {
            const voiceSettings = { rate: 1.0, pitch: 1.0, volume: 1.0, lang: 'en-US', voice: 'alloy' };
            stateService.state.settings.ui.voice = voiceSettings;
            
            expect(plugin.getVoiceSettings()).toEqual(voiceSettings);
        });

        it('should set voice settings', () => {
            const voiceSettings = { rate: 1.2, pitch: 1.0, volume: 1.0, lang: 'en-US', voice: 'echo' };
            plugin.setVoiceSettings(voiceSettings);
            
            expect(stateService.state.settings.ui.voice).toEqual(voiceSettings);
        });

        it('should handle undefined voice settings', () => {
            stateService.state.settings.ui.voice = undefined;
            expect(plugin.getVoiceSettings()).toBeUndefined();
        });

        it('should overwrite existing voice settings', () => {
            stateService.state.settings.ui.voice = { rate: 1.0, pitch: 1.0, volume: 1.0, lang: 'en-US', voice: 'alloy' };
            
            const newSettings = { rate: 1.5, pitch: 1.0, volume: 1.0, lang: 'en-US', voice: 'echo' };
            plugin.setVoiceSettings(newSettings);
            
            expect(stateService.state.settings.ui.voice).toEqual(newSettings);
        });
    });

    describe('integration with tab state', () => {
        it('should work with multiple tabs', () => {
            const tab1Id = 'tab-1';
            const tab2Id = 'tab-2';
            const tab1State = createInitialTabState();
            const tab2State = createInitialTabState();
            
            stateService.state.tabs[tab1Id] = tab1State;
            stateService.state.tabs[tab2Id] = tab2State;
            
            // Configure tab 1
            stateService.state.ui.tabId = tab1Id;
            plugin.setUseMCP(true);
            plugin.setSelectedModel('gpt-4');
            
            // Configure tab 2
            stateService.state.ui.tabId = tab2Id;
            plugin.setUseMCP(false);
            plugin.setSelectedModel('claude-3');
            
            // Verify tab 1
            stateService.state.ui.tabId = tab1Id;
            expect(plugin.getUseMCP()).toBe(true);
            expect(plugin.getSelectedModel()).toBe('gpt-4');
            
            // Verify tab 2
            stateService.state.ui.tabId = tab2Id;
            expect(plugin.getUseMCP()).toBe(false);
            expect(plugin.getSelectedModel()).toBe('claude-3');
        });

        it('should handle tab removal gracefully', () => {
            const tabId = 'test-tab';
            const tabState = createInitialTabState();
            
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
            
            // Configure the tab
            plugin.setUseMCP(true);
            expect(plugin.getUseMCP()).toBe(true);
            
            // Remove the tab
            delete stateService.state.tabs[tabId];
            
            // Operations should not throw and return defaults
            expect(plugin.getUseMCP()).toBe(false);
            plugin.setUseMCP(false); // Should not throw
        });

        it('should handle switching between existing and non-existing tabs', () => {
            const existingTabId = 'existing-tab';
            const existingTabState = createInitialTabState();
            stateService.state.tabs[existingTabId] = existingTabState;
            
            // Start with existing tab
            stateService.state.ui.tabId = existingTabId;
            plugin.setUseMCP(true);
            expect(plugin.getUseMCP()).toBe(true);
            
            // Switch to non-existing tab
            stateService.state.ui.tabId = 'non-existing-tab';
            expect(plugin.getUseMCP()).toBe(false);
            
            // Switch back to existing tab
            stateService.state.ui.tabId = existingTabId;
            expect(plugin.getUseMCP()).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle malformed state gracefully', () => {
            stateService.state.ui = null;
            expect(plugin.getUiState()).toBeNull();
        });

        it('should handle missing tabs object', () => {
            stateService.state.tabs = null;
            stateService.state.ui.tabId = 'test-tab';
            
            expect(plugin._currentTab()).toBeNull();
            expect(plugin.getUseMCP()).toBe(false);
        });

        it('should handle undefined settings.ui', () => {
            stateService.state.settings.ui = undefined;
            
            // Should not throw
            plugin.setAutoInject(true);
            expect(plugin.getAutoInject()).toBe(false);
        });

        it('should handle all tab operations with consistent behavior when no tab', () => {
            stateService.state.ui.tabId = null;
            
            // All get operations should return false/null
            expect(plugin.getIncludePageContent()).toBe(false);
            expect(plugin.getUseMCP()).toBe(false);
            expect(plugin.getUseBrowserTools()).toBe(false);
            expect(plugin.getAutoExecuteTools()).toBe(false);
            expect(plugin.getSelectedModel()).toBe(false);
            expect(plugin.getTrackedThreadId()).toBeNull();
            
            // All set operations should not throw
            expect(() => {
                plugin.setIncludePageContent(true);
                plugin.setUseMCP(true);
                plugin.setUseBrowserTools(true);
                plugin.setAutoExecuteTools(true);
                plugin.setSelectedModel('gpt-4');
                plugin.setTrackedThreadId('thread-123');
            }).not.toThrow();
        });
    });

    describe('state persistence patterns', () => {
        it('should maintain settings across UI state changes', () => {
            // Set global auto-inject setting
            plugin.setAutoInject(true);
            
            // Create and configure a tab
            const tabId = 'test-tab';
            const tabState = createInitialTabState();
            stateService.state.ui.tabId = tabId;
            stateService.state.tabs[tabId] = tabState;
            plugin.setUseMCP(false);
            
            // Global setting should persist
            expect(plugin.getAutoInject()).toBe(true);
            
            // Tab setting should persist
            expect(plugin.getUseMCP()).toBe(false);
            
            // Change UI tab ID
            stateService.state.ui.tabId = 'other-tab';
            
            // Global setting should still persist
            expect(plugin.getAutoInject()).toBe(true);
        });
    });
});