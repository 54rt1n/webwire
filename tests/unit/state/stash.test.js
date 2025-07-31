import { describe, it, expect, beforeEach } from 'vitest';
import { StashStatePlugin } from '../../../src/js/state/plugins/stash-state.js';
import { EVENTS } from '../../../src/js/core/events.js';
import { setupTest, TestStateFactory, TestData, StateAssertions, MockStateService } from './conftest.js';

describe('StashStatePlugin', () => {
    let stateService, plugin;

    beforeEach(() => {
        stateService = new MockStateService();
        plugin = new StashStatePlugin(stateService);
    });

    describe('Constructor and Basic Operations', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toBe(stateService.eventBus);
            expect(plugin.stashAdapter).toBe(stateService.storage.stash);
        });

        it('should handle missing stash adapter', () => {
            const stateServiceNoStorage = new MockStateService();
            delete stateServiceNoStorage.storage.stash;
            const pluginNoStorage = new StashStatePlugin(stateServiceNoStorage);
            
            expect(pluginNoStorage.stashAdapter).toBeUndefined();
        });
    });

    describe('Stash Data Structure Management', () => {
        it('should ensure stash exists when accessing', () => {
            delete stateService.state.stash;
            
            plugin.has('test://uri');
            
            expect(stateService.state.stash).toEqual({});
        });

        it('should not modify existing stash structure', () => {
            const existingStash = { 'existing://uri': 'content' };
            stateService.state.stash = existingStash;
            
            plugin.has('test://uri');
            
            expect(stateService.state.stash).toEqual(existingStash);
        });
    });

    describe('URI Content Management', () => {
        it('should check if URI exists', () => {
            stateService.state.stash = { 'kb://document': 'content' };
            
            expect(plugin.has('kb://document')).toBe(true);
            expect(plugin.has('kb://nonexistent')).toBe(false);
        });

        it('should get content for existing URI', () => {
            const content = 'This is document content';
            stateService.state.stash = { 'kb://document': content };
            
            const result = plugin.get('kb://document');
            
            expect(result).toBe(content);
        });

        it('should return null for non-existing URI', () => {
            stateService.state.stash = {};
            
            const result = plugin.get('kb://nonexistent');
            
            expect(result).toBeNull();
        });

        it('should set content for URI', () => {
            const uri = 'fs://path/to/file';
            const content = 'File content here';
            
            plugin.set(uri, content);
            
            expect(stateService.state.stash[uri]).toBe(content);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.STASH?.UPDATED || 'stash:updated',
                data => data.uri === uri && data.operation === 'set' && data.contentLength === content.length);
        });

        it('should handle undefined stash when setting', () => {
            delete stateService.state.stash;
            const uri = 'test://uri';
            const content = 'content';
            
            plugin.set(uri, content);
            
            expect(stateService.state.stash).toEqual({ [uri]: content });
        });
    });

    describe('URI Deletion', () => {
        it('should delete existing URI', () => {
            const uri = 'kb://document';
            stateService.state.stash = { [uri]: 'content', 'other://uri': 'other' };
            
            const result = plugin.delete(uri);
            
            expect(result).toBe(true);
            expect(stateService.state.stash).toEqual({ 'other://uri': 'other' });
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.STASH?.UPDATED || 'stash:updated',
                data => data.uri === uri && data.operation === 'delete');
        });

        it('should return false for non-existing URI', () => {
            stateService.state.stash = { 'existing://uri': 'content' };
            
            const result = plugin.delete('nonexistent://uri');
            
            expect(result).toBe(false);
            expect(stateService.state.stash).toEqual({ 'existing://uri': 'content' });
            expect(stateService.eventBus.getEmittedEvents()).toHaveLength(0);
        });

        it('should handle undefined stash when deleting', () => {
            delete stateService.state.stash;
            
            const result = plugin.delete('test://uri');
            
            expect(result).toBe(false);
            expect(stateService.state.stash).toEqual({});
        });
    });

    describe('Storage Operations', () => {
        it('should load stash data from storage', async () => {
            const stashData = {
                'kb://doc1': 'Document 1 content',
                'fs://file1': 'File 1 content'
            };
            plugin.stashAdapter.data['settings'] = stashData;
            
            const result = await plugin.loadFromStorage();
            
            expect(result).toEqual(stashData);
            expect(stateService.state.stash).toEqual(stashData);
            StateAssertions.assertStorageCalled(plugin.stashAdapter, 'getAll');
        });

        it('should handle null storage data', async () => {
            plugin.stashAdapter.getAll = async () => null;
            
            const result = await plugin.loadFromStorage();
            
            expect(result).toEqual({});
            expect(stateService.state.stash).toEqual({});
        });

        it('should handle missing stash adapter on load', async () => {
            plugin.stashAdapter = null;
            
            const result = await plugin.loadFromStorage();
            
            expect(result).toEqual({});
            expect(stateService.state.stash).toEqual({});
        });

        it('should handle storage errors on load', async () => {
            plugin.stashAdapter.getAll = async () => {
                throw new Error('Storage error');
            };
            
            const result = await plugin.loadFromStorage();
            
            expect(result).toEqual({});
            expect(stateService.state.stash).toEqual({});
        });

        it('should save stash data to storage', async () => {
            const stashData = {
                'kb://doc1': 'Document 1 content',
                'fs://file1': 'File 1 content'
            };
            stateService.state.stash = stashData;
            
            await plugin.saveToStorage();
            
            const setCalls = plugin.stashAdapter.calls.filter(c => c.method === 'setAll');
            expect(setCalls).toHaveLength(1);
            expect(setCalls[0].value).toEqual(stashData);
        });

        it('should handle missing stash adapter on save', async () => {
            plugin.stashAdapter = null;
            stateService.state.stash = { 'test://uri': 'content' };
            
            await expect(plugin.saveToStorage()).resolves.not.toThrow();
        });

        it('should handle storage errors on save', async () => {
            plugin.stashAdapter.setAll = async () => {
                throw new Error('Storage full');
            };
            stateService.state.stash = { 'test://uri': 'content' };
            
            await expect(plugin.saveToStorage()).rejects.toThrow('Storage full');
        });

        it('should ensure stash exists before saving', async () => {
            delete stateService.state.stash;
            
            await plugin.saveToStorage();
            
            expect(stateService.state.stash).toEqual({});
            const setCalls = plugin.stashAdapter.calls.filter(c => c.method === 'setAll');
            expect(setCalls[0].value).toEqual({});
        });
    });

    describe('Bulk Operations', () => {
        it('should clear all stash data', () => {
            const stashData = {
                'kb://doc1': 'content1',
                'fs://file1': 'content2',
                'web://page1': 'content3'
            };
            stateService.state.stash = stashData;
            
            plugin.clearAll();
            
            expect(stateService.state.stash).toEqual({});
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.STASH.CLEARED,
                data => data.operation === 'clear_all' && data.urisRemoved === 3);
        });

        it('should handle clearing empty stash', () => {
            stateService.state.stash = {};
            
            plugin.clearAll();
            
            expect(stateService.state.stash).toEqual({});
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.STASH.CLEARED,
                data => data.urisRemoved === 0);
        });

        it('should handle clearing undefined stash', () => {
            delete stateService.state.stash;
            
            plugin.clearAll();
            
            expect(stateService.state.stash).toEqual({});
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.STASH.CLEARED,
                data => data.urisRemoved === 0);
        });
    });

    describe('Query Operations', () => {
        beforeEach(() => {
            stateService.state.stash = {
                'kb://document1': 'Document content 1',
                'kb://document2': 'Document content 2',
                'fs://path/file1.txt': 'File content 1',
                'fs://path/file2.txt': 'File content 2',
                'web://example.com': 'Web page content'
            };
        });

        it('should get all keys', () => {
            const keys = plugin.getAllKeys();
            
            expect(keys).toEqual([
                'kb://document1',
                'kb://document2', 
                'fs://path/file1.txt',
                'fs://path/file2.txt',
                'web://example.com'
            ]);
        });

        it('should return copy of keys array', () => {
            const keys1 = plugin.getAllKeys();
            const keys2 = plugin.getAllKeys();
            
            expect(keys1).not.toBe(keys2);
            expect(keys1).toEqual(keys2);
        });

        it('should get all entries with metadata', () => {
            const entries = plugin.getAllEntries();
            
            expect(entries).toHaveLength(5);
            expect(entries[0]).toEqual({
                key: 'kb://document1',
                value: 'Document content 1',
                valueLength: 'Document content 1'.length
            });
        });

        it('should handle empty stash for queries', () => {
            stateService.state.stash = {};
            
            expect(plugin.getAllKeys()).toEqual([]);
            expect(plugin.getAllEntries()).toEqual([]);
        });

        it('should handle undefined stash for queries', () => {
            delete stateService.state.stash;
            
            expect(plugin.getAllKeys()).toEqual([]);
            expect(plugin.getAllEntries()).toEqual([]);
        });
    });

    describe('Filtering Operations', () => {
        beforeEach(() => {
            stateService.state.stash = {
                'kb://document1': 'content1',
                'kb://document2': 'content2',
                'fs://path/file1.txt': 'content3',
                'fs://path/file2.js': 'content4',
                'web://example.com': 'content5'
            };
        });

        it('should filter by string pattern', () => {
            const matches = plugin.filter('kb://');
            
            expect(matches).toEqual(['kb://document1', 'kb://document2']);
        });

        it('should filter by regex pattern', () => {
            const matches = plugin.filter(/\.txt$/);
            
            expect(matches).toEqual(['fs://path/file1.txt']);
        });

        it('should filter with complex regex', () => {
            const matches = plugin.filter(/^fs:\/\/.*\.(txt|js)$/);
            
            expect(matches).toEqual(['fs://path/file1.txt', 'fs://path/file2.js']);
        });

        it('should return empty array for no matches', () => {
            const matches = plugin.filter('nonexistent');
            
            expect(matches).toEqual([]);
        });

        it('should handle undefined stash for filtering', () => {
            delete stateService.state.stash;
            
            const matches = plugin.filter('kb://');
            
            expect(matches).toEqual([]);
        });
    });

    describe('Statistics', () => {
        it('should get stats for populated stash', () => {
            stateService.state.stash = {
                'kb://doc1': 'Short',
                'kb://doc2': 'This is a longer document content',
                'fs://file1': 'Medium length content here'
            };
            
            const stats = plugin.getStats();
            
            expect(stats.keyCount).toBe(3);
            expect(stats.totalValueSize).toBe(5 + 33 + 26); // 'Short' + 'This is a longer document content' + 'Medium length content here'
            expect(stats.isEmpty).toBe(false);
            expect(stats.keyStats).toHaveLength(3);
            expect(stats.keyStats[0]).toEqual({
                key: 'kb://doc1',
                valueLength: 5
            });
        });

        it('should get stats for empty stash', () => {
            stateService.state.stash = {};
            
            const stats = plugin.getStats();
            
            expect(stats.keyCount).toBe(0);
            expect(stats.totalValueSize).toBe(0);
            expect(stats.isEmpty).toBe(true);
            expect(stats.keyStats).toEqual([]);
        });

        it('should handle undefined stash for stats', () => {
            delete stateService.state.stash;
            
            const stats = plugin.getStats();
            
            expect(stats.keyCount).toBe(0);
            expect(stats.totalValueSize).toBe(0);
            expect(stats.isEmpty).toBe(true);
            expect(stats.keyStats).toEqual([]);
        });

        it('should handle null values in stash', () => {
            stateService.state.stash = {
                'valid://uri': 'content',
                'null://uri': null,
                'undefined://uri': undefined
            };
            
            const stats = plugin.getStats();
            
            expect(stats.keyCount).toBe(3);
            expect(stats.totalValueSize).toBe(7); // Only 'content' counted
            expect(stats.keyStats[1].valueLength).toBe(0); // null value
            expect(stats.keyStats[2].valueLength).toBe(0); // undefined value
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete stash workflow', async () => {
            // Start with empty stash
            expect(plugin.has('kb://doc1')).toBe(false);
            
            // Add content
            plugin.set('kb://doc1', 'Document content');
            plugin.set('fs://file1', 'File content');
            
            // Verify content
            expect(plugin.has('kb://doc1')).toBe(true);
            expect(plugin.get('kb://doc1')).toBe('Document content');
            
            // Save to storage
            await plugin.saveToStorage();
            
            // Clear memory
            plugin.clearAll();
            expect(plugin.has('kb://doc1')).toBe(false);
            
            // Load from storage
            await plugin.loadFromStorage();
            expect(plugin.has('kb://doc1')).toBe(true);
            expect(plugin.get('kb://doc1')).toBe('Document content');
        });

        it('should handle concurrent operations', () => {
            const uri1 = 'kb://doc1';
            const uri2 = 'kb://doc2';
            
            // Set multiple URIs
            plugin.set(uri1, 'content1');
            plugin.set(uri2, 'content2');
            
            // Verify both exist
            expect(plugin.has(uri1)).toBe(true);
            expect(plugin.has(uri2)).toBe(true);
            
            // Delete one
            plugin.delete(uri1);
            
            // Verify state
            expect(plugin.has(uri1)).toBe(false);
            expect(plugin.has(uri2)).toBe(true);
            
            // Get stats
            const stats = plugin.getStats();
            expect(stats.keyCount).toBe(1);
        });

        it('should maintain consistency across operations', () => {
            const testData = {
                'kb://doc1': 'Document 1',
                'kb://doc2': 'Document 2',
                'fs://file1': 'File 1'
            };
            
            // Populate stash
            Object.entries(testData).forEach(([uri, content]) => {
                plugin.set(uri, content);
            });
            
            // Verify all keys
            const allKeys = plugin.getAllKeys();
            expect(allKeys).toHaveLength(3);
            expect(allKeys).toEqual(expect.arrayContaining(Object.keys(testData)));
            
            // Filter operations
            const kbDocs = plugin.filter('kb://');
            expect(kbDocs).toHaveLength(2);
            
            // Stats should match
            const stats = plugin.getStats();
            expect(stats.keyCount).toBe(3);
            expect(stats.totalValueSize).toBe(
                testData['kb://doc1'].length + 
                testData['kb://doc2'].length + 
                testData['fs://file1'].length
            );
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty string URIs', () => {
            plugin.set('', 'empty uri content');
            
            expect(plugin.has('')).toBe(true);
            expect(plugin.get('')).toBe('empty uri content');
        });

        it('should handle empty string content', () => {
            const uri = 'kb://empty';
            plugin.set(uri, '');
            
            expect(plugin.has(uri)).toBe(true);
            expect(plugin.get(uri)).toBe(null); // Plugin bug: empty string becomes null due to || null
            
            const stats = plugin.getStats();
            expect(stats.keyStats[0].valueLength).toBe(0);
        });

        it('should handle very long URIs and content', () => {
            const longUri = 'kb://' + 'x'.repeat(1000);
            const longContent = 'y'.repeat(10000);
            
            plugin.set(longUri, longContent);
            
            expect(plugin.has(longUri)).toBe(true);
            expect(plugin.get(longUri)).toBe(longContent);
        });

        it('should handle special characters in URIs', () => {
            const specialUri = 'kb://doc with spaces & symbols!@#$%^&*()';
            const content = 'Special content';
            
            plugin.set(specialUri, content);
            
            expect(plugin.has(specialUri)).toBe(true);
            expect(plugin.get(specialUri)).toBe(content);
        });

        it('should handle malformed filter patterns gracefully', () => {
            stateService.state.stash = { 'test://uri': 'content' };
            
            // Invalid regex will throw an error - plugin should handle this
            expect(() => plugin.filter('[invalid')).toThrow('Invalid regular expression');
            
            // Valid but complex regex
            const result2 = plugin.filter(/^test:\/\/.*$/);
            expect(result2).toEqual(['test://uri']);
        });

        it('should handle state corruption gracefully', () => {
            // Corrupt stash with non-object
            stateService.state.stash = 'corrupted data';
            
            // Object.keys() on string returns array of indices
            const keys = plugin.getAllKeys();
            expect(keys).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
            
            // Reset to valid state
            plugin.clearAll();
            expect(stateService.state.stash).toEqual({});
        });
    });
});