
/**
 * Encryption utilities using Web Crypto API
 * 
 * Usage example:
 * const config = appConfig.get('security');
 * const encrypted = await encryptWithSalt(apiKey, config.salt);
 * const decrypted = await decryptWithSalt(encrypted, config.salt);
 */

export const ENCRYPTION_METHODS = {
    AES_GCM: 'AES-GCM',
    NONE: 'NONE',
};

export async function generateEncryptionKey(salt, password = '', { method = ENCRYPTION_METHODS.AES_GCM } = {}) {
    const encoder = new TextEncoder();
    const saltBytes = encoder.encode(salt);
    const passwordBytes = encoder.encode(password || salt);
    
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: method, length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
    
    return key;
}

export async function encrypt(plaintext, key, { method = ENCRYPTION_METHODS.AES_GCM } = {}) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedData = await crypto.subtle.encrypt(
        {
            name: method,
            iv: iv
        },
        key,
        data
    );
    
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    return btoa(String.fromCharCode.apply(null, combined));
}

export async function decrypt(encryptedBase64, key, { method = ENCRYPTION_METHODS.AES_GCM } = {}) {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);
    
    const decryptedData = await crypto.subtle.decrypt(
        {
            name: method,
            iv: iv
        },
        key,
        encryptedData
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
}

export async function encryptWithSalt(plaintext, salt, password = '', { method = ENCRYPTION_METHODS.AES_GCM } = {}) {
    const key = await generateEncryptionKey(salt, password, { method });
    return await encrypt(plaintext, key, { method });
}

export async function decryptWithSalt(encryptedBase64, salt, password = '', { method = ENCRYPTION_METHODS.AES_GCM } = {}) {
    const key = await generateEncryptionKey(salt, password, { method });
    return await decrypt(encryptedBase64, key, { method });
}

/**
 * Encrypts data with metadata about the encryption method used
 * @param {string} plaintext - Text to encrypt
 * @param {string} salt - Salt for key derivation
 * @param {string} password - Optional password
 * @param {Object} options - Encryption options
 * @returns {Object} Object with encrypted data and metadata
 */
export async function encryptWithMetadata(plaintext, salt, password = '', { method = ENCRYPTION_METHODS.AES_GCM } = {}) {
    if (!plaintext || plaintext === '') {
        return {
            method: ENCRYPTION_METHODS.NONE,
            data: plaintext
        };
    }
    
    const encrypted = await encryptWithSalt(plaintext, salt, password, { method });
    return {
        method,
        data: encrypted
    };
}

/**
 * Decrypts data using metadata about the encryption method
 * @param {Object} encryptedObject - Object with method and data
 * @param {string} salt - Salt for key derivation
 * @param {string} password - Optional password
 * @returns {string} Decrypted text
 */
export async function decryptWithMetadata(encryptedObject, salt, password = '') {
    if (!encryptedObject || typeof encryptedObject === 'string') {
        // Legacy support - assume AES-GCM if just a string
        return await decryptWithSalt(encryptedObject, salt, password);
    }
    
    const { method, data } = encryptedObject;
    
    if (method === ENCRYPTION_METHODS.NONE || !method) {
        return data;
    }
    
    return await decryptWithSalt(data, salt, password, { method });
}