/**
 * Speech synthesis utility for text-to-speech functionality
 */
export class SpeechUtil {
    constructor(defaultConfig = {}) {
        this.currentUtterance = null;
        this.isSpeaking = false;
        this.activeButtons = new Set();
        
        // Default configuration
        this.defaultConfig = {
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            voice: null,
            lang: 'en-US',
            ...defaultConfig
        };
    }

    /**
     * Speak the provided text using the Web Speech API
     * @param {string} text - The text to speak
     * @param {Object} options - Speech options
     * @returns {Promise<void>}
     */
    async speak(text, options = {}) {
        // Cancel any ongoing speech
        this.stop();

        if (!text || typeof text !== 'string') {
            console.warn('[SpeechUtil] Invalid text provided for speech');
            return;
        }

        // Strip any HTML tags from the text
        const cleanText = text.replace(/<[^>]*>/g, '');

        return new Promise((resolve, reject) => {
            try {
                const utterance = new SpeechSynthesisUtterance(cleanText);
                
                // Merge options with defaults
                const config = { ...this.defaultConfig, ...options };
                
                // Set speech parameters
                utterance.rate = config.rate;
                utterance.pitch = config.pitch;
                utterance.volume = config.volume;
                utterance.lang = config.lang;
                
                // Set voice if specified
                if (config.voice) {
                    utterance.voice = config.voice;
                }

                // Event handlers
                utterance.onstart = () => {
                    this.isSpeaking = true;
                };

                utterance.onend = () => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    this.cleanupButtons();
                    resolve();
                };

                utterance.onerror = (event) => {
                    this.isSpeaking = false;
                    this.currentUtterance = null;
                    this.cleanupButtons();
                    console.error('[SpeechUtil] Speech synthesis error:', event.error);
                    reject(event.error);
                };

                // Store reference and start speaking
                this.currentUtterance = utterance;
                window.speechSynthesis.speak(utterance);

            } catch (error) {
                console.error('[SpeechUtil] Failed to speak:', error);
                this.cleanupButtons();
                reject(error);
            }
        });
    }

    /**
     * Stop any ongoing speech
     */
    stop() {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.cleanupButtons();
    }

    /**
     * Pause ongoing speech
     */
    pause() {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
        }
    }

    /**
     * Resume paused speech
     */
    resume() {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    }

    /**
     * Check if currently speaking
     * @returns {boolean}
     */
    isCurrentlySpeaking() {
        return window.speechSynthesis.speaking;
    }

    /**
     * Get available voices
     * @returns {SpeechSynthesisVoice[]}
     */
    getVoices() {
        return window.speechSynthesis.getVoices();
    }
    
    /**
     * Get available voices with detailed info
     * @returns {Array<{name: string, lang: string, localService: boolean, default: boolean}>}
     */
    getAvailableVoices() {
        const voices = this.getVoices();
        return voices.map(voice => ({
            name: voice.name,
            lang: voice.lang,
            localService: voice.localService,
            default: voice.default,
            voiceURI: voice.voiceURI
        }));
    }
    
    /**
     * Get voice by name or language
     * @param {string} nameOrLang - Voice name or language code
     * @returns {SpeechSynthesisVoice|null}
     */
    getVoiceByNameOrLang(nameOrLang) {
        const voices = this.getVoices();
        
        // First try exact name match
        let voice = voices.find(v => v.name === nameOrLang);
        if (voice) return voice;
        
        // Then try language match
        voice = voices.find(v => v.lang === nameOrLang);
        if (voice) return voice;
        
        // Try partial language match (e.g., 'en' matches 'en-US')
        voice = voices.find(v => v.lang.startsWith(nameOrLang));
        if (voice) return voice;
        
        return null;
    }
    
    /**
     * Update default configuration
     * @param {Object} config - New configuration options
     */
    updateConfig(config) {
        this.defaultConfig = { ...this.defaultConfig, ...config };
    }

    /**
     * Speak with visual feedback on a button element
     * @param {string} text - The text to speak
     * @param {HTMLElement} buttonElement - The button element for feedback
     * @param {Object} options - Speech options
     */
    async speakWithFeedback(text, buttonElement = null, options = {}) {
        if (buttonElement) {
            // Check if already speaking this message
            if (this.isSpeaking && buttonElement.classList.contains('speaking')) {
                this.stop();
                return;
            }

            // Add speaking class and track button
            buttonElement.classList.add('speaking');
            buttonElement.setAttribute('title', 'Stop speaking');
            this.activeButtons.add(buttonElement);
        }

        try {
            await this.speak(text, options);
        } catch (error) {
            // Error already logged in speak method
        }
    }

    /**
     * Clean up button states
     */
    cleanupButtons() {
        for (const button of this.activeButtons) {
            button.classList.remove('speaking', 'paused');
            button.setAttribute('title', 'Play message');
        }
        this.activeButtons.clear();
    }

    /**
     * Destroy the instance and clean up
     */
    destroy() {
        this.stop();
        this.activeButtons.clear();
    }
}