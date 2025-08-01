import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { logger } from '../../../src/js/core/logging.js';
import { AppConfig } from '../../../src/js/core/app-config.js';

describe('Logger', () => {
    let mockConsole;
    let testAppConfig;

    beforeEach(() => {
        // Mock console methods to capture calls
        mockConsole = {
            log: vi.fn(),
            info: vi.fn(), 
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            group: vi.fn(),
            groupEnd: vi.fn(),
            groupCollapsed: vi.fn(),
            dir: vi.fn(),
            table: vi.fn(),
            time: vi.fn(),
            timeEnd: vi.fn(),
            timeLog: vi.fn(),
            count: vi.fn(),
            countReset: vi.fn(),
            assert: vi.fn(),
            trace: vi.fn()
        };

        // Replace global console
        Object.keys(mockConsole).forEach(method => {
            vi.spyOn(console, method).mockImplementation(mockConsole[method]);
        });

        // Create test AppConfig
        testAppConfig = AppConfig.backgroundFactory('full');
        
        // Reset logger state
        logger.initialize(testAppConfig);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with app config', () => {
            const config = logger.getLoggingConfig();
            expect(config.hasAppConfig).toBe(true);
            expect(config.globalLogLevel).toBe('error');
            expect(config.globalDebugEnabled).toBe(false);
        });

        it('should handle missing app config gracefully', () => {
            const newLogger = new (logger.constructor)();
            const config = newLogger.getLoggingConfig();
            expect(config.hasAppConfig).toBe(false);
            expect(config.globalLogLevel).toBe('error');
        });
    });

    describe('context detection', () => {
        class TestService {
            static testStaticMethod() {
                logger.log('TestService', 'Static method message');
                return 'TestService';
            }

            testInstanceMethod() {
                logger.log(this, 'Instance method message');
                return this.constructor.name;
            }
        }

        class AnotherTestClient {
            testMethod() {
                logger.info(this, 'Test method message');
                return this.constructor.name;
            }
        }

        it('should use class name from instance context', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            const service = new TestService();
            const className = service.testInstanceMethod();
            
            expect(className).toBe('TestService');
            expect(mockConsole.log).toHaveBeenCalledWith('[TestService] Instance method message');
        });

        it('should use explicit string class name for static methods', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            const className = TestService.testStaticMethod();
            
            expect(className).toBe('TestService');
            expect(mockConsole.log).toHaveBeenCalledWith('[TestService] Static method message');
        });

        it('should handle different class names', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            const client = new AnotherTestClient();
            const className = client.testMethod();
            
            expect(className).toBe('AnotherTestClient');
            expect(mockConsole.info).toHaveBeenCalledWith('[AnotherTestClient] Test method message');
        });

        it('should handle missing context as Unknown', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            logger.error(null, 'Null context');
            logger.warn(undefined, 'Undefined context');
            logger.log('', 'Empty string context');
            
            expect(mockConsole.error).toHaveBeenCalledWith('[Unknown] Null context');
            expect(mockConsole.warn).toHaveBeenCalledWith('[Unknown] Undefined context');
            expect(mockConsole.log).toHaveBeenCalledWith('[Unknown] Empty string context');
        });
    });

    describe('log level filtering', () => {
        describe('with global settings', () => {
            beforeEach(() => {
                // Set global debug settings
                testAppConfig.set('debug.enabled', false);
                testAppConfig.set('debug.logLevel', 'warn');
                testAppConfig.set('debug.classWhitelist', []);
                logger.updateConfig(testAppConfig);
            });

            class LogTestService {
                testAllLevels() {
                    logger.debug(this, 'Debug message');
                    logger.log(this, 'Log message');
                    logger.info(this, 'Info message');
                    logger.warn(this, 'Warn message');
                    logger.error(this, 'Error message');
                }
            }

            it('should respect global log level (warn)', () => {
                const service = new LogTestService();
                service.testAllLevels();

                // Only warn and error should show (logLevel: 'warn')
                expect(mockConsole.debug).not.toHaveBeenCalled();
                expect(mockConsole.log).not.toHaveBeenCalled();
                expect(mockConsole.info).not.toHaveBeenCalled();
                expect(mockConsole.warn).toHaveBeenCalledWith('[LogTestService] Warn message');
                expect(mockConsole.error).toHaveBeenCalledWith('[LogTestService] Error message');
            });

            it('should block debug when debug.enabled is false', () => {
                const service = new LogTestService();
                service.testAllLevels();

                expect(mockConsole.debug).not.toHaveBeenCalled();
            });
        });

        describe('with class whitelist', () => {
            beforeEach(() => {
                testAppConfig.set('debug.enabled', false);
                testAppConfig.set('debug.logLevel', 'error');
                testAppConfig.set('debug.classWhitelist', [
                    { className: 'WhitelistedService', logLevel: 'debug' },
                    { className: 'PartialService', logLevel: 'info' }
                ]);
                logger.updateConfig(testAppConfig);
            });

            class WhitelistedService {
                testLogs() {
                    logger.debug(this, 'Debug from whitelisted');
                    logger.log(this, 'Log from whitelisted');
                    logger.info(this, 'Info from whitelisted');
                    logger.warn(this, 'Warn from whitelisted');
                    logger.error(this, 'Error from whitelisted');
                }
            }

            class PartialService {
                testLogs() {
                    logger.debug(this, 'Debug from partial');
                    logger.log(this, 'Log from partial');
                    logger.info(this, 'Info from partial');
                    logger.warn(this, 'Warn from partial');
                    logger.error(this, 'Error from partial');
                }
            }

            class NotWhitelistedService {
                testLogs() {
                    logger.debug(this, 'Debug from not whitelisted');
                    logger.log(this, 'Log from not whitelisted');
                    logger.info(this, 'Info from not whitelisted');
                    logger.warn(this, 'Warn from not whitelisted');
                    logger.error(this, 'Error from not whitelisted');
                }
            }

            it('should allow all levels for fully whitelisted class', () => {
                const service = new WhitelistedService();
                service.testLogs();

                expect(mockConsole.debug).toHaveBeenCalledWith('[WhitelistedService] Debug from whitelisted');
                expect(mockConsole.log).toHaveBeenCalledWith('[WhitelistedService] Log from whitelisted');
                expect(mockConsole.info).toHaveBeenCalledWith('[WhitelistedService] Info from whitelisted');
                expect(mockConsole.warn).toHaveBeenCalledWith('[WhitelistedService] Warn from whitelisted');
                expect(mockConsole.error).toHaveBeenCalledWith('[WhitelistedService] Error from whitelisted');
            });

            it('should respect whitelist log level for partially whitelisted class', () => {
                const service = new PartialService();
                service.testLogs();

                // PartialService has logLevel: 'info', so debug/log should be blocked
                expect(mockConsole.debug).not.toHaveBeenCalled();
                expect(mockConsole.log).not.toHaveBeenCalled();
                expect(mockConsole.info).toHaveBeenCalledWith('[PartialService] Info from partial');
                expect(mockConsole.warn).toHaveBeenCalledWith('[PartialService] Warn from partial');
                expect(mockConsole.error).toHaveBeenCalledWith('[PartialService] Error from partial');
            });

            it('should fall back to global settings for non-whitelisted class', () => {
                const service = new NotWhitelistedService();
                service.testLogs();

                // Global settings: logLevel: 'error', debug.enabled: false
                expect(mockConsole.debug).not.toHaveBeenCalled();
                expect(mockConsole.log).not.toHaveBeenCalled();
                expect(mockConsole.info).not.toHaveBeenCalled();
                expect(mockConsole.warn).not.toHaveBeenCalled();
                expect(mockConsole.error).toHaveBeenCalledWith('[NotWhitelistedService] Error from not whitelisted');
            });
        });
    });

    describe('message formatting', () => {
        beforeEach(() => {
            // Enable all logging for formatting tests
            testAppConfig.set('debug.enabled', true);
            testAppConfig.set('debug.logLevel', 'debug');
            testAppConfig.set('debug.classWhitelist', []);
            logger.updateConfig(testAppConfig);
        });

        class FormattingTestService {
            testStringMessage() {
                logger.log(this, 'Simple string message');
            }

            testObjectMessage() {
                logger.log(this, { key: 'value', nested: { data: 123 } });
            }

            testMultipleArgs() {
                logger.warn(this, 'Message with', { data: 'object' }, 'and more text', 42);
            }

            testEmptyCall() {
                logger.error(this);
            }
        }

        it('should format string messages with class prefix', () => {
            const service = new FormattingTestService();
            service.testStringMessage();

            expect(mockConsole.log).toHaveBeenCalledWith('[FormattingTestService] Simple string message');
        });

        it('should format object messages with class prefix first', () => {
            const service = new FormattingTestService();
            service.testObjectMessage();

            expect(mockConsole.log).toHaveBeenCalledWith('[FormattingTestService]', { key: 'value', nested: { data: 123 } });
        });

        it('should format multiple arguments correctly', () => {
            const service = new FormattingTestService();
            service.testMultipleArgs();

            expect(mockConsole.warn).toHaveBeenCalledWith('[FormattingTestService] Message with', { data: 'object' }, 'and more text', 42);
        });

        it('should handle empty calls with just class prefix', () => {
            const service = new FormattingTestService();
            service.testEmptyCall();

            expect(mockConsole.error).toHaveBeenCalledWith('[FormattingTestService]');
        });
    });

    describe('console method coverage', () => {
        beforeEach(() => {
            testAppConfig.set('debug.enabled', true);
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);
        });

        class ConsoleTestService {
            testAllMethods() {
                logger.log(this, 'log message');
                logger.info(this, 'info message');
                logger.warn(this, 'warn message');
                logger.error(this, 'error message');
                logger.debug(this, 'debug message');
                
                logger.group(this, 'group label');
                logger.groupEnd();
                logger.groupCollapsed(this, 'collapsed group');
                
                logger.dir(this, { test: 'object' });
                logger.table(this, [{ col1: 'data' }]);
                
                logger.time(this, 'timer1');
                logger.timeEnd(this, 'timer1');
                logger.timeLog(this, 'timer2', 'extra data');
                
                logger.count(this, 'counter1');
                logger.countReset(this, 'counter1');
                
                logger.assert(this, true, 'assertion message');
                logger.trace(this, 'trace message');
            }
        }

        it('should call all console methods with proper formatting', () => {
            const service = new ConsoleTestService();
            service.testAllMethods();

            // Test basic log methods
            expect(mockConsole.log).toHaveBeenCalledWith('[ConsoleTestService] log message');
            expect(mockConsole.info).toHaveBeenCalledWith('[ConsoleTestService] info message');
            expect(mockConsole.warn).toHaveBeenCalledWith('[ConsoleTestService] warn message');
            expect(mockConsole.error).toHaveBeenCalledWith('[ConsoleTestService] error message');
            expect(mockConsole.debug).toHaveBeenCalledWith('[ConsoleTestService] debug message');

            // Test grouping
            expect(mockConsole.group).toHaveBeenCalledWith('[ConsoleTestService] group label');
            expect(mockConsole.groupEnd).toHaveBeenCalled();
            expect(mockConsole.groupCollapsed).toHaveBeenCalledWith('[ConsoleTestService] collapsed group');

            // Test object inspection
            expect(mockConsole.log).toHaveBeenCalledWith('[ConsoleTestService]');
            expect(mockConsole.dir).toHaveBeenCalledWith({ test: 'object' }, undefined);
            expect(mockConsole.table).toHaveBeenCalledWith([{ col1: 'data' }], undefined);

            // Test timing
            expect(mockConsole.time).toHaveBeenCalledWith('[ConsoleTestService] timer1');
            expect(mockConsole.timeEnd).toHaveBeenCalledWith('[ConsoleTestService] timer1');
            expect(mockConsole.timeLog).toHaveBeenCalledWith('[ConsoleTestService] timer2', 'extra data');

            // Test counting
            expect(mockConsole.count).toHaveBeenCalledWith('[ConsoleTestService] counter1');
            expect(mockConsole.countReset).toHaveBeenCalledWith('[ConsoleTestService] counter1');

            // Test assertions and tracing
            expect(mockConsole.assert).toHaveBeenCalledWith(true, '[ConsoleTestService] assertion message');
            expect(mockConsole.trace).toHaveBeenCalledWith('[ConsoleTestService] trace message');
        });
    });

    describe('configuration updates', () => {
        it('should update configuration when config changes', () => {
            const newConfig = AppConfig.backgroundFactory('lite');
            newConfig.set('debug.logLevel', 'info');
            newConfig.set('debug.classWhitelist', [
                { className: 'UpdateTestService', logLevel: 'debug' }
            ]);

            logger.updateConfig(newConfig);

            const config = logger.getLoggingConfig();
            expect(config.globalLogLevel).toBe('info');
            expect(config.whitelistMap).toEqual({
                'UpdateTestService': 'debug'
            });
        });
    });

    describe('edge cases', () => {
        class EdgeCaseService {
            testNullUndefined() {
                logger.log(this, null, undefined, 'message');
            }

            testEmptyStrings() {
                logger.warn(this, '', 'non-empty');
            }

            testLargeObjects() {
                const largeObj = { data: new Array(1000).fill('test') };
                logger.info(this, 'Large object:', largeObj);
            }
        }

        it('should handle null and undefined arguments', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            const service = new EdgeCaseService();
            service.testNullUndefined();

            expect(mockConsole.log).toHaveBeenCalledWith('[EdgeCaseService]', null, undefined, 'message');
        });

        it('should handle empty strings', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            const service = new EdgeCaseService();
            service.testEmptyStrings();

            expect(mockConsole.warn).toHaveBeenCalledWith('[EdgeCaseService] ', 'non-empty');
        });

        it('should handle large objects without issues', () => {
            testAppConfig.set('debug.logLevel', 'debug');
            logger.updateConfig(testAppConfig);

            const service = new EdgeCaseService();
            
            // Should not throw
            expect(() => service.testLargeObjects()).not.toThrow();
        });
    });
});