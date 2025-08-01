import { describe, it, expect, beforeEach } from 'vitest';
import { AIMStatePlugin } from '../../../src/js/state/plugins/aim-state.js';
import { EVENTS } from '../../../src/js/core/events.js';
import { setupTest, TestStateFactory, TestData, StateAssertions, MockStateService } from './conftest.js';

describe('AIMStatePlugin', () => {
    let stateService, plugin;

    beforeEach(() => {
        stateService = new MockStateService();
        plugin = new AIMStatePlugin(stateService);
    });

    describe('Constructor and Basic State Access', () => {
        it('should initialize with state service', () => {
            expect(plugin.stateService).toBe(stateService);
            expect(plugin.eventBus).toBe(stateService.eventBus);
        });

        it('should get AIM state', () => {
            const aimState = plugin.getAimState();
            expect(aimState).toBe(stateService.state.aim);
            expect(aimState).toHaveProperty('pinnedMessages');
            expect(aimState).toHaveProperty('thoughtContent');
        });
    });

    describe('AIM Metadata', () => {
        it('should get AIM metadata with all fields', () => {
            // Set up test data
            stateService.state.settings.aim.userName = 'TestUser';
            stateService.state.settings.aim.personaName = 'TestPersona';
            stateService.state.aim.pinnedMessages = ['msg1', 'msg2'];
            stateService.state.aim.activeDocument = 'doc1';
            stateService.state.aim.workspaceContent = 'workspace content';
            stateService.state.aim.thoughtContent = 'thinking...';
            stateService.state.aim.systemMessage = 'system prompt';
            stateService.state.aim.location = 'home';
            stateService.state.aim.disableGuidance = true;
            stateService.state.aim.disablePif = false;

            const metadata = plugin.getAimMetadata();

            expect(metadata).toStrictEqual({
                user_id: 'TestUser',
                persona_id: 'TestPersona',
                pinned_messages: ['msg1', 'msg2'],
                active_document: 'doc1',
                workspace_content: 'workspace content',
                thought_content: 'thinking...',
                system_message: 'system prompt',
                location: 'home',
                disable_guidance: true,
                disable_pif: false
            });
        });

        it('should handle undefined metadata fields', () => {
            const metadata = plugin.getAimMetadata();

            expect(metadata).toStrictEqual({
                user_id: undefined,
                persona_id: undefined,
                pinned_messages: [],
                active_document: undefined,
                workspace_content: undefined,
                thought_content: undefined,
                system_message: undefined,
                location: undefined,
                disable_guidance: false,
                disable_pif: false
            });
        });
    });

    describe('AIM Message Options', () => {
        it('should get AIM message options', () => {
            stateService.state.settings.aim.userName = 'TestUser';
            stateService.state.settings.aim.personaName = 'TestPersona';
            stateService.state.aim.mood = 'happy';
            stateService.state.aim.location = 'office';

            const options = plugin.getAimMessageOptions();

            expect(options).toStrictEqual({
                userName: 'TestUser',
                personaName: 'TestPersona',
                mood: 'happy',
                location: 'office'
            });
        });

        it('should handle undefined message options', () => {
            const options = plugin.getAimMessageOptions();

            expect(options).toStrictEqual({
                userName: undefined,
                personaName: undefined,
                mood: undefined,
                location: undefined
            });
        });
    });

    describe('ShowThought Management', () => {
        it('should toggle showThought from false to true', () => {
            stateService.state.aim.showThought = false;

            const result = plugin.toggleShowThought();

            expect(result).toBe(true);
            expect(stateService.state.aim.showThought).toBe(true);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.THOUGHT_TOGGLED,
                data => data.showThought === true);
        });

        it('should toggle showThought from true to false', () => {
            stateService.state.aim.showThought = true;

            const result = plugin.toggleShowThought();

            expect(result).toBe(false);
            expect(stateService.state.aim.showThought).toBe(false);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.THOUGHT_TOGGLED,
                data => data.showThought === false);
        });

        it('should set showThought to specific value', () => {
            stateService.state.aim.showThought = false;

            const result = plugin.setShowThought(true);

            expect(result).toBe(true);
            expect(stateService.state.aim.showThought).toBe(true);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.THOUGHT_TOGGLED);
        });

        it('should not emit event when setting same value', () => {
            stateService.state.aim.showThought = true;
            stateService.eventBus.reset();

            const result = plugin.setShowThought(true);

            expect(result).toBe(true);
            expect(stateService.state.aim.showThought).toBe(true);
            expect(stateService.eventBus.getEmittedEvents(EVENTS.AIM.THOUGHT_TOGGLED)).toHaveLength(0);
        });

        it('should convert value to boolean', () => {
            const result = plugin.setShowThought('truthy');

            expect(result).toBe(true);
            expect(stateService.state.aim.showThought).toBe(true);
        });
    });

    describe('AutoThink Management', () => {
        it('should toggle autoThink from false to true', () => {
            stateService.state.aim.autoThink = false;

            const result = plugin.toggleAutoThink();

            expect(result).toBe(true);
            expect(stateService.state.aim.autoThink).toBe(true);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.AUTO_THINK_TOGGLED,
                data => data.autoThink === true);
        });

        it('should toggle autoThink from true to false', () => {
            stateService.state.aim.autoThink = true;

            const result = plugin.toggleAutoThink();

            expect(result).toBe(false);
            expect(stateService.state.aim.autoThink).toBe(false);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.AUTO_THINK_TOGGLED,
                data => data.autoThink === false);
        });

        it('should set autoThink to specific value', () => {
            stateService.state.aim.autoThink = false;

            const result = plugin.setAutoThink(true);

            expect(result).toBe(true);
            expect(stateService.state.aim.autoThink).toBe(true);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.AUTO_THINK_TOGGLED);
        });

        it('should not emit event when setting same value', () => {
            stateService.state.aim.autoThink = true;
            stateService.eventBus.reset();

            const result = plugin.setAutoThink(true);

            expect(result).toBe(true);
            expect(stateService.state.aim.autoThink).toBe(true);
            expect(stateService.eventBus.getEmittedEvents(EVENTS.AIM.AUTO_THINK_TOGGLED)).toHaveLength(0);
        });

        it('should convert value to boolean', () => {
            const result = plugin.setAutoThink(0);

            expect(result).toBe(false);
            expect(stateService.state.aim.autoThink).toBe(false);
        });
    });

    describe('Thought Content Management', () => {
        it('should set thought content', () => {
            const content = 'I am thinking about the problem...';

            const result = plugin.setThoughtContent(content);

            expect(result).toBe(content);
            expect(stateService.state.aim.thoughtContent).toBe(content);
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.THOUGHT_CONTENT_CHANGED,
                data => data.thoughtContent === content && data.hasContent === true);
        });

        it('should set thought content to undefined', () => {
            stateService.state.aim.thoughtContent = 'existing content';

            const result = plugin.setThoughtContent(undefined);

            expect(result).toBeUndefined();
            expect(stateService.state.aim.thoughtContent).toBeUndefined();
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.THOUGHT_CONTENT_CHANGED,
                data => data.thoughtContent === undefined && data.hasContent === false);
        });

        it('should not emit event when setting same content', () => {
            const content = 'same content';
            stateService.state.aim.thoughtContent = content;
            stateService.eventBus.reset();

            const result = plugin.setThoughtContent(content);

            expect(result).toBe(content);
            expect(stateService.eventBus.getEmittedEvents(EVENTS.AIM.THOUGHT_CONTENT_CHANGED)).toHaveLength(0);
        });

        it('should clear thought content', () => {
            stateService.state.aim.thoughtContent = 'some content';

            const result = plugin.clearThoughtContent();

            expect(result).toBeUndefined();
            expect(stateService.state.aim.thoughtContent).toBeUndefined();
            StateAssertions.assertEventEmitted(stateService.eventBus, EVENTS.AIM.THOUGHT_CLEARED);
        });

        it('should not emit clear event when already empty', () => {
            stateService.state.aim.thoughtContent = undefined;
            stateService.eventBus.reset();

            const result = plugin.clearThoughtContent();

            expect(result).toBeUndefined();
            expect(stateService.eventBus.getEmittedEvents(EVENTS.AIM.THOUGHT_CLEARED)).toHaveLength(0);
        });

        it('should get thought content', () => {
            const content = 'test thought';
            stateService.state.aim.thoughtContent = content;

            const result = plugin.getThoughtContent();

            expect(result).toBe(content);
        });

        it('should check if has thought content', () => {
            stateService.state.aim.thoughtContent = 'content';
            expect(plugin.hasThoughtContent()).toBe(true);

            stateService.state.aim.thoughtContent = '';
            expect(plugin.hasThoughtContent()).toBe(false);

            stateService.state.aim.thoughtContent = undefined;
            expect(plugin.hasThoughtContent()).toBe(false);

            stateService.state.aim.thoughtContent = null;
            expect(plugin.hasThoughtContent()).toBe(false);
        });
    });

    describe('System Message Management', () => {
        beforeEach(() => {
            // Mock the ui plugin method
            stateService.ui = {
                getSelectedModel: () => 'gpt-4'
            };
            // Mock the settings plugin method
            stateService.settings = {
                getModelConfig: (model) => ({ minimalMode: false })
            };
        });

        it('should get regular system message when not in minimal mode', async () => {
            stateService.state.settings.aim.systemMessage = 'regular system message';
            stateService.settings.getModelConfig = () => ({ minimalMode: false });

            const result = await plugin.getSystemMessage();

            expect(result).toBe('regular system message');
        });

        it('should get minimal system message when in minimal mode', async () => {
            stateService.state.settings.aim.systemMessage = 'regular system message';
            stateService.state.settings.aim.minimalSystemMessage = 'minimal system message';
            stateService.settings.getModelConfig = () => ({ minimalMode: true });

            const result = await plugin.getSystemMessage();

            expect(result).toBe('minimal system message');
        });

        it('should handle undefined model config', async () => {
            stateService.state.settings.aim.systemMessage = 'regular system message';
            stateService.settings.getModelConfig = () => undefined;

            const result = await plugin.getSystemMessage();

            expect(result).toBe('regular system message');
        });

        it('should set system message', async () => {
            const message = 'new system message';

            plugin.setSystemMessage(message);

            expect(stateService.state.settings.aim.systemMessage).toBe(message);
        });
    });

    describe('User Header/Footer Management', () => {
        it('should get and set user header', async () => {
            const header = 'User: ';

            plugin.setUserHeader(header);
            expect(stateService.state.settings.aim.userHeader).toBe(header);

            const result = plugin.getUserHeader();
            expect(result).toBe(header);
        });

        it('should get and set user footer', () => {
            const footer = '\n\n---';

            plugin.setUserFooter(footer);
            expect(stateService.state.settings.aim.userFooter).toBe(footer);

            const result = plugin.getUserFooter();
            expect(result).toBe(footer);
        });

        it('should handle undefined header/footer', () => {
            expect(plugin.getUserHeader()).toBeUndefined();
            expect(plugin.getUserFooter()).toBeUndefined();
        });
    });

    describe('AIM Summary', () => {
        it('should get complete AIM summary', () => {
            stateService.state.aim.showThought = true;
            stateService.state.aim.autoThink = false;
            stateService.state.aim.thoughtContent = 'This is a long thought about the problem at hand';

            const summary = plugin.getAimSummary();

            expect(summary).toStrictEqual({
                showThought: true,
                autoThink: false,
                hasThoughtContent: true,
                thoughtContentLength: 'This is a long thought about the problem at hand'.length
            });
        });

        it('should handle empty thought content in summary', () => {
            stateService.state.aim.showThought = false;
            stateService.state.aim.autoThink = true;
            stateService.state.aim.thoughtContent = undefined;

            const summary = plugin.getAimSummary();

            expect(summary).toStrictEqual({
                showThought: false,
                autoThink: true,
                hasThoughtContent: false,
                thoughtContentLength: 0
            });
        });

        it('should handle null thought content in summary', () => {
            stateService.state.aim.showThought = false;
            stateService.state.aim.autoThink = false;
            stateService.state.aim.thoughtContent = null;

            const summary = plugin.getAimSummary();

            expect(summary).toStrictEqual({
                showThought: false,
                autoThink: false,
                hasThoughtContent: false,
                thoughtContentLength: 0
            });
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle missing aim state section', () => {
            delete stateService.state.aim;
            stateService.state.aim = undefined;

            expect(() => plugin.getAimState()).not.toThrow();
            expect(plugin.getAimState()).toBeUndefined();
        });

        it('should handle missing settings.aim section', () => {
            delete stateService.state.settings.aim;
            stateService.state.settings.aim = undefined;

            expect(() => plugin.getAimMetadata()).toThrow();
        });

        it('should handle state modification during toggle operations', () => {
            stateService.state.aim.showThought = false;

            // Simulate external state modification
            let eventEmitted = false;
            stateService.eventBus.on(EVENTS.AIM.THOUGHT_TOGGLED, () => {
                eventEmitted = true;
            });

            const result = plugin.toggleShowThought();

            expect(result).toBe(true);
            expect(eventEmitted).toBe(true);
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete AIM workflow', () => {
            // Set up AIM session
            plugin.setShowThought(true);
            plugin.setAutoThink(true);
            plugin.setThoughtContent('Initial thought');

            // Check state
            expect(plugin.hasThoughtContent()).toBe(true);
            
            // Update thought
            plugin.setThoughtContent('Updated thought');
            
            // Get summary
            const summary = plugin.getAimSummary();
            expect(summary.hasThoughtContent).toBe(true);
            expect(summary.thoughtContentLength).toBe('Updated thought'.length);

            // Clear thought
            plugin.clearThoughtContent();
            expect(plugin.hasThoughtContent()).toBe(false);
        });

        it('should maintain consistency between toggles and sets', () => {
            // Start with false
            stateService.state.aim.showThought = false;

            // Toggle to true
            plugin.toggleShowThought();
            expect(stateService.state.aim.showThought).toBe(true);

            // Set to true (should not change)
            plugin.setShowThought(true);
            expect(stateService.state.aim.showThought).toBe(true);

            // Toggle to false
            plugin.toggleShowThought();
            expect(stateService.state.aim.showThought).toBe(false);

            // Set to false (should not change)
            plugin.setShowThought(false);
            expect(stateService.state.aim.showThought).toBe(false);
        });
    });
});