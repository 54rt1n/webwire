/**
 * Centralized configuration management for the WebWire application.
 * Provides a hierarchical configuration system with dot-notation access,
 * deep merging capabilities, and default values for all app components.
 * 
 * @example
 * const config = new AppConfig();
 * 
 * // Get configuration values
 * const temperature = config.get('ai.temperature'); // 0.8
 * const dbName = config.get('storage.db.state'); // 'WebwireDB'
 * 
 * // Set configuration values
 * config.set('ai.temperature', 0.7);
 * config.set('ai.models.chat', 'gpt-4');
 * 
 * // Merge configurations
 * config.merge({ ai: { temperature: 0.9 } });
 * 
 * // Use singleton instance
 * import { appConfig } from './app-config.js';
 * const maxTokens = appConfig.get('ai.maxTokens');
 */

export class AppConfig {
    constructor() {
        this.config = {
            version: 'v0.1.0',
            // AI Configuration
            ai: {
                models: {
                    chat: undefined,
                    completion: undefined,
                    thought: undefined,
                    workspace: undefined,
                    pipeline: undefined,
                    tool: undefined,
                    default: 'deepseek-ai/DeepSeek-V3-0324',
                },
                temperature: 0.8,
                maxTokens: 1024,
                requestTimeout: 30000,
                streamingEnabled: true
            },

            // Storage Configuration  
            storage: {
                keys: {
                    state: 'webwire_state',
                    settings: 'webwire_settings',
                },
                db: {
                    state: 'WebwireDB',
                },
                compressionEnabled: true,
                maxSaveSize: 5 * 1024 * 1024,
                maxBackups: 5
            },
        };
    }

    get(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.config);
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!obj[key]) obj[key] = {};
            return obj[key];
        }, this.config);
        target[lastKey] = value;
    }

    merge(newConfig) {
        this.config = this.deepMerge(this.config, newConfig);
    }

    deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
}

// Create singleton instance
export const appConfig = new AppConfig(); 