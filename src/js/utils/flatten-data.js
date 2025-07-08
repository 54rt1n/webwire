

/**
 * Flattens the character data object into a single level.
 * @param {object} characterData - The character data object to flatten.
 * @returns {object} The flattened character data object, with each child prepended with the parent key..
 */
export function flattenCharacterData(characterData) {
    const flattened = {};

    const recurse = (current, property) => {
        if (typeof current !== 'object' || current === null || Array.isArray(current)) {
            flattened[property] = current;
            return;
        }

        for (const p in current) {
            if (Object.prototype.hasOwnProperty.call(current, p)) {
                const newProperty = property ? `${property}.${p}` : p;
                recurse(current[p], newProperty);
            }
        }
    };

    recurse(characterData, '');
    return flattened;
}

/**
 * Unflattens an object with dot-notation keys into a nested object.
 * @param {Object} data The object to unflatten.
 * @returns {Object} The unflattened object.
 * @private
 */
export function unflattenData(data) {
    const result = {};
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            const keys = key.split('.');
            let current = result;
            while (keys.length > 1) {
                const part = keys.shift();
                current[part] = current[part] || {};
                current = current[part];
            }
            current[keys[0]] = data[key];
        }
    }
    return result;
}