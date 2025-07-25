/**
 * Deep merge utility functions for merging objects and arrays
 */

/**
 * Performs a deep merge of two objects, with the second object taking precedence
 * @param {Object} target - The target object to merge into
 * @param {Object} source - The source object to merge from
 * @param {Object} options - Merge options
 * @param {boolean} options.mergeArrays - Whether to merge arrays (default: false)
 * @param {boolean} options.clone - Whether to clone the target object (default: true)
 * @returns {Object} The merged object
 */
export function deepMerge(target, source, options = {}) {
    const { mergeArrays = false, clone = true } = options;
    
    // If source is null or undefined, return target
    if (source == null) {
        return clone ? deepClone(target) : target;
    }
    
    // If target is null or undefined, return source
    if (target == null) {
        return deepClone(source);
    }
    
    // If source is not an object, return source (overwrite)
    if (typeof source !== 'object') {
        return source;
    }
    
    // If target is not an object, return source (overwrite)
    if (typeof target !== 'object') {
        return deepClone(source);
    }
    
    // Handle arrays
    if (Array.isArray(source)) {
        if (Array.isArray(target) && mergeArrays) {
            // Merge arrays by combining them
            return [...deepClone(target), ...deepClone(source)];
        } else {
            // Replace array
            return deepClone(source);
        }
    }
    
    // Handle objects
    const result = clone ? deepClone(target) : target;
    
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = result[key];
            
            if (typeof sourceValue === 'object' && sourceValue !== null && 
                typeof targetValue === 'object' && targetValue !== null &&
                !Array.isArray(sourceValue) && !Array.isArray(targetValue)) {
                // Recursively merge nested objects
                result[key] = deepMerge(targetValue, sourceValue, options);
            } else {
                // Overwrite with source value
                result[key] = deepClone(sourceValue);
            }
        }
    }
    
    return result;
}

/**
 * Performs a deep merge of multiple objects
 * @param {Object[]} objects - Objects to merge
 * @param {Object} options - Merge options
 * @returns {Object} The merged object
 */
export function deepMergeAll(objects, options = {}) {
    if (!Array.isArray(objects) || objects.length === 0) {
        return {};
    }
    
    let result = deepClone(objects[0]);
    
    for (let i = 1; i < objects.length; i++) {
        result = deepMerge(result, objects[i], options);
    }
    
    return result;
}

/**
 * Creates a deep clone of an object
 * @param {*} obj - The object to clone
 * @returns {*} The cloned object
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (obj instanceof RegExp) {
        return new RegExp(obj);
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }
    
    if (typeof obj === 'object') {
        const cloned = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
    
    return obj;
}

/**
 * Merges state objects with special handling for nested structures
 * @param {Object} baseState - The base state object
 * @param {Object} contentState - The content state to merge
 * @returns {Object} The merged state
 */
export function mergeState(baseState, contentState) {
    if (!contentState) {
        return baseState;
    }
    
    return deepMerge(baseState, contentState, {
        mergeArrays: false, // Don't merge arrays for state objects
        clone: true
    });
} 