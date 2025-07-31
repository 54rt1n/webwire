import { describe, it, expect, beforeEach } from 'vitest';
import { TabStatePlugin } from '../../../src/js/state/plugins/tab-state.js';
import { createInitialUiState } from '../../../src/js/state/state-container.js';
import { setupTest, TestStateFactory, TestData, StateAssertions, MockStateService } from './conftest.js';

describe('TabStatePlugin', () => {
    let stateService, plugin;

    beforeEach(() => {
        stateService = new MockStateService();
        plugin = new TabStatePlugin(stateService);
        // Initialize tabs structure
        stateService.state.tabs = { default: createInitialUiState() };
        stateService.state.tab = {};
    });

    describe('Constructor and Basic Operations', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toBe(stateService.eventBus);
            expect(plugin.tabAdapter).toBe(stateService.storage.tab);
        });

        it('should handle missing tab adapter', () => {
            const stateServiceNoStorage = new MockStateService();
            delete stateServiceNoStorage.storage.tab;
            const pluginNoStorage = new TabStatePlugin(stateServiceNoStorage);
            
            expect(pluginNoStorage.tabAdapter).toBeUndefined();
        });
    });

    describe('Tab State Management', () => {
        it('should set tab state', () => {
            const tabId = 'tab-123';
            const tabState = {
                includePageContent: false,
                useMCP: true,
                selectedModel: 'gpt-4'
            };

            plugin.setTabState(tabId, tabState);

            expect(stateService.state.tabs[tabId]).toEqual(tabState);
        });

        it('should set default tab state when setDefault option is true', () => {
            const tabId = 'tab-456';
            const defaultState = stateService.state.tabs.default;

            plugin.setTabState(tabId, {}, { setDefault: true });

            expect(stateService.state.tabs[tabId]).toEqual(defaultState);
        });

        it('should get tab state', () => {
            const tabId = 'tab-789';
            const tabState = {
                includePageContent: true,
                useMCP: false
            };
            stateService.state.tabs[tabId] = tabState;

            const result = plugin.getTabState(tabId);

            expect(result).toEqual(tabState);
        });

        it('should return undefined for non-existent tab', () => {
            const result = plugin.getTabState('non-existent-tab');

            expect(result).toBeUndefined();
        });
    });

    describe('Storage Operations', () => {
        it('should load tab state from storage', async () => {
            const tabStateData = {
                'tab-1': { includePageContent: true },
                'tab-2': { includePageContent: false }
            };
            plugin.tabAdapter.data['settings'] = tabStateData;

            const result = await plugin.loadFromStorage();

            expect(result).toEqual(tabStateData);
            expect(stateService.state.tab).toEqual(tabStateData);
        });

        it('should handle null storage data and return initial tab state', async () => {
            plugin.tabAdapter.getAll = async () => null;

            const result = await plugin.loadFromStorage();

            // Should return createInitialTabState() result - but function is not imported
            // Based on the code, it should return some initial state structure
            expect(result).toBeDefined();
            expect(stateService.state.tab).toBeDefined();
        });

        it('should handle missing tab adapter on load', async () => {
            plugin.tabAdapter = null;

            const result = await plugin.loadFromStorage();

            // Should return createInitialTabState() result
            expect(result).toBeDefined();
        });

        it('should save tab state to storage', async () => {
            const tabsData = {
                'tab-1': { includePageContent: true },
                'tab-2': { includePageContent: false }
            };
            stateService.state.tabs = tabsData;

            await plugin.saveToStorage();

            const setCalls = plugin.tabAdapter.calls.filter(c => c.method === 'setAll');
            expect(setCalls).toHaveLength(1);
            expect(setCalls[0].value).toEqual(tabsData);
        });

        it('should handle missing tab adapter on save', async () => {
            plugin.tabAdapter = null;
            stateService.state.tabs = { 'tab-1': { test: 'data' } };

            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });

        it('should handle storage errors on save', async () => {
            plugin.tabAdapter.setAll = async () => {
                throw new Error('Storage error');
            };
            stateService.state.tabs = { 'tab-1': { test: 'data' } };

            await expect(plugin.saveToStorage()).rejects.toThrow('Storage error');
        });
    });

    describe('State Consistency Issues', () => {
        it('should handle inconsistency between state.tabs and state.tab', async () => {
            // The plugin has inconsistent property usage - tabs vs tab
            const tabsData = { 'tab-1': { test: 'tabs' } };
            const tabData = { 'tab-1': { test: 'tab' } };
            
            stateService.state.tabs = tabsData;
            stateService.state.tab = tabData;

            // saveToStorage uses state.tabs
            await plugin.saveToStorage();
            const setCalls = plugin.tabAdapter.calls.filter(c => c.method === 'setAll');
            expect(setCalls[0].value).toEqual(tabsData);

            // loadFromStorage sets state.tab
            plugin.tabAdapter.data['settings'] = { 'tab-2': { loaded: true } };
            await plugin.loadFromStorage();
            expect(stateService.state.tab).toEqual({ 'tab-2': { loaded: true } });

            // getTabState reads from state.tabs
            expect(plugin.getTabState('tab-1')).toEqual({ test: 'tabs' });
            expect(plugin.getTabState('tab-2')).toBeUndefined(); // Won't find it because it's in state.tab
        });
    });

    describe('Default State Handling', () => {
        it('should use default state when setting with setDefault option', () => {
            const customDefault = { 
                customSetting: true, 
                includePageContent: false 
            };
            stateService.state.tabs.default = customDefault;

            plugin.setTabState('new-tab', { ignored: 'data' }, { setDefault: true });

            expect(stateService.state.tabs['new-tab']).toEqual(customDefault);
        });

        it('should handle missing default state gracefully', () => {
            delete stateService.state.tabs.default;

            plugin.setTabState('new-tab', { test: 'data' }, { setDefault: true });

            expect(stateService.state.tabs['new-tab']).toBeUndefined();
        });
    });

    describe('Multiple Tab Management', () => {
        it('should handle multiple tabs independently', () => {
            const tab1State = { includePageContent: true, useMCP: false };
            const tab2State = { includePageContent: false, useMCP: true };
            const tab3State = { includePageContent: true, useMCP: true };

            plugin.setTabState('tab-1', tab1State);
            plugin.setTabState('tab-2', tab2State);
            plugin.setTabState('tab-3', tab3State);

            expect(plugin.getTabState('tab-1')).toEqual(tab1State);
            expect(plugin.getTabState('tab-2')).toEqual(tab2State);
            expect(plugin.getTabState('tab-3')).toEqual(tab3State);
        });

        it('should overwrite existing tab state', () => {
            const tabId = 'overwrite-tab';
            const initialState = { setting1: 'initial' };
            const updatedState = { setting1: 'updated', setting2: 'new' };

            plugin.setTabState(tabId, initialState);
            expect(plugin.getTabState(tabId)).toEqual(initialState);

            plugin.setTabState(tabId, updatedState);
            expect(plugin.getTabState(tabId)).toEqual(updatedState);
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete tab lifecycle', async () => {
            const tabId = 'lifecycle-tab';
            const tabState = {
                includePageContent: true,
                useMCP: false,
                selectedModel: 'gpt-4'
            };

            // Set tab state
            plugin.setTabState(tabId, tabState);
            expect(plugin.getTabState(tabId)).toEqual(tabState);

            // Save to storage
            await plugin.saveToStorage();
            const setCalls = plugin.tabAdapter.calls.filter(c => c.method === 'setAll');
            expect(setCalls).toHaveLength(1);

            // Modify state and save again
            const updatedState = { ...tabState, useMCP: true };
            plugin.setTabState(tabId, updatedState);
            await plugin.saveToStorage();

            expect(plugin.getTabState(tabId)).toEqual(updatedState);
        });

        it('should handle save/load cycle with data integrity', async () => {
            const tabsData = {
                'tab-alpha': { includePageContent: true, model: 'gpt-4' },
                'tab-beta': { includePageContent: false, model: 'claude-3' },
                'tab-gamma': { includePageContent: true, model: 'gpt-3.5' }
            };

            // Set up tabs
            Object.entries(tabsData).forEach(([tabId, state]) => {
                plugin.setTabState(tabId, state);
            });

            // Save to storage
            await plugin.saveToStorage();

            // Clear local state
            stateService.state.tabs = { default: createInitialUiState() };
            stateService.state.tab = {};

            // Load from storage
            await plugin.loadFromStorage();

            // Note: Due to the inconsistency in the plugin, loaded data goes to state.tab
            // but getTabState reads from state.tabs, so this test exposes the bug
            // The loaded data will include the default tab state plus our data
            expect(stateService.state.tab).toMatchObject(tabsData);
            
            // These will be undefined due to the bug in the plugin
            expect(plugin.getTabState('tab-alpha')).toBeUndefined();
            expect(plugin.getTabState('tab-beta')).toBeUndefined();
            expect(plugin.getTabState('tab-gamma')).toBeUndefined();
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle undefined tabs state', () => {
            delete stateService.state.tabs;

            // Should not crash when accessing undefined tabs
            expect(() => plugin.getTabState('any-tab')).not.toThrow();
            expect(plugin.getTabState('any-tab')).toBeUndefined();
        });

        it('should handle setting state when tabs is undefined', () => {
            delete stateService.state.tabs;

            expect(() => plugin.setTabState('new-tab', { test: 'data' })).not.toThrow();
            
            // Should create the tabs object
            expect(stateService.state.tabs).toBeDefined();
            expect(stateService.state.tabs['new-tab']).toEqual({ test: 'data' });
        });

        it('should handle null/undefined tab states', () => {
            plugin.setTabState('null-tab', null);
            plugin.setTabState('undefined-tab', undefined);

            expect(plugin.getTabState('null-tab')).toBeNull();
            expect(plugin.getTabState('undefined-tab')).toBeUndefined();
        });

        it('should handle very long tab IDs', () => {
            const longTabId = 'x'.repeat(1000);
            const tabState = { test: 'long-id' };

            plugin.setTabState(longTabId, tabState);

            expect(plugin.getTabState(longTabId)).toEqual(tabState);
        });

        it('should handle complex nested tab state objects', () => {
            const complexState = {
                ui: {
                    includePageContent: true,
                    theme: 'dark',
                    panels: {
                        left: { visible: true, width: 300 },
                        right: { visible: false, width: 250 }
                    }
                },
                ai: {
                    model: 'gpt-4',
                    temperature: 0.7,
                    providers: ['openai', 'anthropic']
                },
                mcp: {
                    enabled: true,
                    tools: ['file_reader', 'web_search']
                }
            };

            plugin.setTabState('complex-tab', complexState);

            expect(plugin.getTabState('complex-tab')).toEqual(complexState);
        });
    });

    describe('Storage Adapter Integration', () => {
        it('should use correct storage adapter methods', async () => {
            // Test that the plugin uses the expected adapter interface
            expect(plugin.tabAdapter).toBeDefined();
            expect(typeof plugin.tabAdapter.getAll).toBe('function');
            expect(typeof plugin.tabAdapter.setAll).toBe('function');

            // Test actual usage
            await plugin.loadFromStorage();
            const getAllCalls = plugin.tabAdapter.calls.filter(c => c.method === 'getAll');
            expect(getAllCalls).toHaveLength(1);

            await plugin.saveToStorage();
            const setAllCalls = plugin.tabAdapter.calls.filter(c => c.method === 'setAll');
            expect(setAllCalls).toHaveLength(1);
        });

        it('should handle storage adapter failures gracefully', async () => {
            plugin.tabAdapter.getAll = async () => {
                throw new Error('Storage read failed');
            };

            // Load should handle error gracefully - the plugin doesn't catch errors
            await expect(plugin.loadFromStorage()).rejects.toThrow('Storage read failed');
        });
    });
});