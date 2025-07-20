import { EVENTS } from '../js/core/events.js';

/**
 * TabIndicator - Manages tab title animations for streaming status
 * Shows animated indicator in the document title when AI is streaming
 */
export class TabIndicator {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.originalTitle = '';
        this.isStreaming = false;
        this.animationInterval = null;
        this.animationFrame = 0;
        
        // Animation frames for the streaming indicator
        this.animationFrames = ['(~__)', '(_~_)', '(__~)'];
        
        this.setupEventListeners();
    }
    
    /**
     * Set up event listeners for streaming events
     */
    setupEventListeners() {
        this.eventBus.on(EVENTS.AI.STREAM_STARTED, () => {
            this.startAnimation();
        });
        
        this.eventBus.on(EVENTS.AI.STREAM_COMPLETED, () => {
            this.stopAnimation();
        });
    }
    
    /**
     * Start the title animation
     */
    startAnimation() {
        if (this.isStreaming) return;
        
        this.isStreaming = true;
        this.originalTitle = document.title;
        this.animationFrame = 0;
        
        // Update title immediately
        this.updateTitle();
        
        // Start animation interval
        this.animationInterval = setInterval(() => {
            this.animationFrame = (this.animationFrame + 1) % this.animationFrames.length;
            this.updateTitle();
        }, 300); // Update every 300ms for smooth animation
    }
    
    /**
     * Stop the title animation
     */
    stopAnimation() {
        if (!this.isStreaming) return;
        
        this.isStreaming = false;
        
        // Clear interval
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
        }
        
        // Restore original title
        document.title = this.originalTitle;
    }
    
    /**
     * Update the document title with current animation frame
     */
    updateTitle() {
        const indicator = this.animationFrames[this.animationFrame];
        document.title = `${indicator} ${this.originalTitle}`;
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.stopAnimation();
    }
}