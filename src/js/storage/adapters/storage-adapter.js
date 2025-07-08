/**
 * Storage Adapter - Clean, focused storage operations
 * Handles localStorage and IndexedDB without business logic
 */

export class StorageAdapter {
    constructor() {
        this.isLocalStorageAvailable = this._checkLocalStorage();
        this.isIndexedDBAvailable = this._checkIndexedDB();
    }

    /**
     * Get data from localStorage
     * @param {string} key 
     * @returns {any|null}
     */
    get(key) {
        if (!this.isLocalStorageAvailable) return null;
        
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`[StorageAdapter] Failed to get ${key}:`, error);
            return null;
        }
    }

    /**
     * Set data in localStorage
     * @param {string} key 
     * @param {any} value 
     * @returns {boolean}
     */
    set(key, value) {
        if (!this.isLocalStorageAvailable) return false;
        
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`[StorageAdapter] Failed to set ${key}:`, error);
            return false;
        }
    }

    /**
     * Remove data from localStorage
     * @param {string} key 
     * @returns {boolean}
     */
    remove(key) {
        if (!this.isLocalStorageAvailable) return false;
        
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`[StorageAdapter] Failed to remove ${key}:`, error);
            return false;
        }
    }

    /**
     * Remove multiple keys from localStorage
     * @param {Array<string>} keys 
     * @returns {boolean}
     */
    removeMultiple(keys) {
        if (!this.isLocalStorageAvailable) return false;
        
        try {
            keys.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (error) {
            console.error(`[StorageAdapter] Failed to remove multiple keys:`, error);
            return false;
        }
    }

    /**
     * Save to IndexedDB
     * @param {string} dbName 
     * @param {string} storeName 
     * @param {string} key 
     * @param {any} data 
     * @returns {Promise<boolean>}
     */
    async setIndexedDB(dbName, storeName, key, data) {
        if (!this.isIndexedDBAvailable) return false;

        return new Promise((resolve) => {
            const request = indexedDB.open(dbName, 1);
            
            request.onerror = () => resolve(false);
            
            request.onsuccess = () => {
                try {
                    const db = request.result;
                    const transaction = db.transaction([storeName], 'readwrite');
                    const store = transaction.objectStore(storeName);
                    
                    const putRequest = store.put(data, key);
                    putRequest.onsuccess = () => resolve(true);
                    putRequest.onerror = () => resolve(false);
                } catch (error) {
                    resolve(false);
                }
            };
            
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
        });
    }

    /**
     * Get from IndexedDB
     * @param {string} dbName 
     * @param {string} storeName 
     * @param {string} key 
     * @returns {Promise<any|null>}
     */
    async getIndexedDB(dbName, storeName, key) {
        if (!this.isIndexedDBAvailable) return null;

        return new Promise((resolve) => {
            const request = indexedDB.open(dbName, 1);
            
            request.onerror = () => resolve(null);
            
            request.onsuccess = () => {
                try {
                    const db = request.result;
                    const transaction = db.transaction([storeName], 'readonly');
                    const store = transaction.objectStore(storeName);
                    
                    const getRequest = store.get(key);
                    getRequest.onsuccess = () => resolve(getRequest.result || null);
                    getRequest.onerror = () => resolve(null);
                } catch (error) {
                    resolve(null);
                }
            };
            
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
        });
    }

    /**
     * Delete IndexedDB database
     * @param {string} dbName 
     * @returns {Promise<boolean>}
     */
    async deleteIndexedDB(dbName) {
        if (!this.isIndexedDBAvailable) return false;

        return new Promise((resolve) => {
            const deleteRequest = indexedDB.deleteDatabase(dbName);
            deleteRequest.onsuccess = () => resolve(true);
            deleteRequest.onerror = () => resolve(false);
        });
    }

    /**
     * Check localStorage availability
     * @returns {boolean}
     * @private
     */
    _checkLocalStorage() {
        try {
            const test = '__test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check IndexedDB availability
     * @returns {boolean}
     * @private
     */
    _checkIndexedDB() {
        // Detect context and check appropriately
        if (typeof window !== 'undefined') {
            // Browser context (content script, popup, options page)
            return 'indexedDB' in window;
        } else if (typeof self !== 'undefined') {
            // Service worker context (background script)
            return 'indexedDB' in self;
        } else if (typeof globalThis !== 'undefined') {
            // Universal fallback
            return 'indexedDB' in globalThis;
        }
        
        return false;
    }
} 