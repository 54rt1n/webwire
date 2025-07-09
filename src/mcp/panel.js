import '../shared/global.scss';
import './style.css';
import { textViewModal } from './textview-modal.js';

/**
 * MCPControlPanel
 * Manages all UI rendering and event handling for the MCP Control Panel.
 * This class does not contain any business logic for fetching data; it only
 * receives data and renders it to the DOM.
 */
export class MCPControlPanel {
    constructor() {
        this._cacheDOMElements();
        this.selectedList = null;
        this.selectedFile = null; // Track currently selected file
    }

    /**
     * Caches all necessary DOM elements for performance.
     * @private
     */
    _cacheDOMElements() {
        // Main sections
        this.healthContent = document.getElementById('health-check-content');
        this.fsTreeContainer = document.getElementById('fs-tree-container');
        this.kbGraphContainer = document.getElementById('kb-graph-container');
        this.listsBrowser = document.getElementById('lists-browser');
        this.listContentTitle = document.getElementById('list-content-title');
        this.listContentView = document.getElementById('list-content-view');

        // Connection status
        this.connectionLight = document.getElementById('connection-light');
        this.serverStatusText = document.getElementById('server-status-text');
        this.serverUrlDisplay = document.getElementById('server-url-display');

        // Buttons
        this.reconnectBtn = document.getElementById('reconnect-btn');
        this.refreshHealthBtn = document.getElementById('refresh-health-btn');
        this.refreshFsBtn = document.getElementById('refresh-fs-btn');
        this.openFileBtn = document.getElementById('open-file-btn');
        this.refreshKbBtn = document.getElementById('refresh-kb-btn');
        this.refreshListsBtn = document.getElementById('refresh-lists-btn');
    }

    /**
     * Initializes the panel by setting up event listeners that call back
     * to the provided handlers (which will be in index.js).
     * @param {object} handlers - Object with callback functions for UI events.
     * @param {Function} handlers.onReconnect - Callback for reconnect button.
     * @param {Function} handlers.onRefreshHealth - Callback for health refresh.
     * @param {Function} handlers.onRefreshFs - Callback for filesystem refresh.
     * @param {Function} handlers.onOpenFile - Callback for opening a file.
     * @param {Function} handlers.onRefreshKb - Callback for KB refresh.
     * @param {Function} handlers.onRefreshLists - Callback for lists refresh.
     * @param {Function} handlers.onSelectList - Callback when a list is selected.
     */
    initialize(handlers) {
        this.reconnectBtn.addEventListener('click', handlers.onReconnect);
        this.refreshHealthBtn.addEventListener('click', handlers.onRefreshHealth);
        this.refreshFsBtn.addEventListener('click', handlers.onRefreshFs);
        this.openFileBtn.addEventListener('click', () => {
            if (this.selectedFile) {
                handlers.onOpenFile(this.selectedFile);
            }
        });
        this.refreshKbBtn.addEventListener('click', handlers.onRefreshKb);
        this.refreshListsBtn.addEventListener('click', handlers.onRefreshLists);
        
        this.listsBrowser.addEventListener('click', (e) => {
            const listItem = e.target.closest('li[data-list-name]');
            if (listItem) {
                const listName = listItem.dataset.listName;
                this.selectedList = listName;
                this._updateActiveListSelection();
                handlers.onSelectList(listName);
            }
        });
    }

    /**
     * Renders the connection status widget.
     * @param {('connected'|'disconnected'|'connecting')} status - The connection status.
     * @param {string} url - The server URL to display.
     */
    renderConnectionStatus(status, url) {
        this.connectionLight.className = `status-light ${status}`;
        this.serverStatusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        this.serverUrlDisplay.textContent = url || 'No server configured';
    }

    /**
     * Renders the health check data.
     * @param {object} healthData - The health data from the server.
     */
    renderHealthCheck(healthData) {
        if (!healthData) {
            this.healthContent.innerHTML = `<div class="placeholder error">Failed to fetch health data.</div>`;
            return;
        }
        this.healthContent.innerHTML = '';
        for (const [key, value] of Object.entries(healthData)) {
            const keyEl = this._createEl('div', { className: 'key', textContent: key });
            const valueEl = this._createEl('div', { className: 'value', textContent: JSON.stringify(value) });
            this.healthContent.append(keyEl, valueEl);
        }
    }

    /**
     * Renders the filesystem tree.
     * @param {object[]} fsData - Array of file/folder entries from the server.
     */
    renderFilesystem(fsData) {
        this.fsTreeContainer.innerHTML = '';
        
        // Reset file selection state
        this.selectedFile = null;
        this.openFileBtn.style.display = 'none';
        
        if (!fsData || fsData.length === 0) {
             this.fsTreeContainer.innerHTML = `<div class="placeholder">Filesystem is empty.</div>`;
             return;
        }

        // Build and render tree
        const treeHtml = this._buildTreeHtml(fsData);
        this.fsTreeContainer.innerHTML = treeHtml;
        
        // Setup event handlers after DOM is created
        this._setupFileTreeHandlers();
    }

    /**
     * Builds the complete tree HTML structure
     * @param {object[]} fsData - Flat array of file/folder entries
     * @returns {string} Complete HTML for the tree
     * @private
     */
    _buildTreeHtml(fsData) {
        // Group entries by directory and build tree structure
        const tree = this._buildFileTree(fsData);
        
        // Generate HTML
        let html = '<div class="fs-tree-container">';
        html += this._renderTreeLevel(tree, [], 0);
        html += '</div>';
        
        return html;
    }

    /**
     * Builds hierarchical tree structure from flat file data
     * @param {object[]} fsData - Flat array of file/folder entries  
     * @returns {object} Tree structure
     * @private
     */
    _buildFileTree(fsData) {
        const tree = {};
        

        
        // Sort entries: folders first, then files, alphabetically
        const sortedData = [...fsData].sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        sortedData.forEach(entry => {
            const pathParts = entry.path.split('/').filter(part => part);
            let currentLevel = tree;

            pathParts.forEach((part, index) => {
                if (!currentLevel[part]) {
                    const isLastPart = index === pathParts.length - 1;
                    const currentPath = pathParts.slice(0, index + 1).join('/');
                    
                    // Determine type from various possible field names
                    let entryType = 'file'; // default
                    if (entry.type) {
                        entryType = entry.type;
                    } else if (entry.is_directory) {
                        entryType = 'folder';
                    } else if (entry.is_file) {
                        entryType = 'file';
                    } else if (entry.kind) {
                        entryType = entry.kind === 'directory' ? 'folder' : 'file';
                    }
                    
                    currentLevel[part] = {
                        name: part,
                        path: currentPath,
                        type: isLastPart ? entryType : 'folder',
                        size: isLastPart ? entry.size : undefined,
                        children: {}
                    };
                    

                }
                currentLevel = currentLevel[part].children;
            });
        });

        return tree;
    }

    /**
     * Renders a level of the tree with proper ASCII tree lines
     * @param {object} nodes - Nodes at this level
     * @param {string[]} prefixes - Array of line prefixes from parent levels
     * @param {number} depth - Current depth level
     * @returns {string} HTML for this tree level
     * @private
     */
    _renderTreeLevel(nodes, prefixes, depth) {
        let html = '';
        const nodeList = Object.values(nodes);
        
        nodeList.forEach((node, index) => {
            const isLast = index === nodeList.length - 1;
            const hasChildren = Object.keys(node.children).length > 0;
            
            // Build line prefix for this node
            let linePrefix = '';
            
            // Add parent prefixes
            prefixes.forEach(prefix => {
                linePrefix += prefix;
            });
            
            // Add current level connector
            if (depth > 0) {
                linePrefix += isLast ? '└── ' : '├── ';
            }
            
            // Create the node HTML
            html += `<div class="fs-tree-line" data-path="${node.path}" data-type="${node.type}">`;
            
            // Line prefix with monospace characters
            html += `<span class="fs-line-prefix">${this._escapeHtml(linePrefix)}</span>`;
            
            // File/folder icon
            const iconClass = node.type === 'folder' ? 'fs-icon-folder' : 'fs-icon-file';
            html += `<span class="fs-icon ${iconClass}"></span>`;
            
            // File/folder name
            html += `<span class="fs-name">${this._escapeHtml(node.name)}</span>`;
            
            // File size for files
            if (node.type === 'file' && node.size !== undefined) {
                html += `<span class="fs-metadata">${this._formatFileSize(node.size)}</span>`;
            }
            
            html += '</div>';
            
            // Always render children for folders
            if (hasChildren) {
                const childPrefixes = [...prefixes];
                if (depth >= 0) {
                    childPrefixes.push(isLast ? '    ' : '│   ');
                }
                html += this._renderTreeLevel(node.children, childPrefixes, depth + 1);
            }
        });
        
        return html;
    }

    /**
     * Sets up event handlers for file tree interactions
     * @private
     */
    _setupFileTreeHandlers() {
        this.fsTreeContainer.addEventListener('click', (e) => {
            // Handle line selection
            const treeLine = e.target.closest('.fs-tree-line');
            if (treeLine) {
                this._selectTreeLine(treeLine);
            }
        });
    }

    /**
     * Selects a tree line
     * @param {HTMLElement} treeLine - The tree line element
     * @private
     */
    _selectTreeLine(treeLine) {
        // Remove previous selection
        this.fsTreeContainer.querySelectorAll('.fs-tree-line.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection to clicked line
        treeLine.classList.add('selected');
        
        const filePath = treeLine.dataset.path;
        const fileType = treeLine.dataset.type;
        
        console.log(`[FileTree] Selected: ${filePath} (${fileType})`);
        
        // Update selected file state and button visibility
        if (fileType === 'file') {
            this.selectedFile = filePath;
            this.openFileBtn.style.display = 'inline-flex';
        } else {
            this.selectedFile = null;
            this.openFileBtn.style.display = 'none';
        }
    }



    /**
     * Escapes HTML special characters
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Formats file size in human-readable format
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size string
     * @private
     */
    _formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Renders the knowledge base graph (placeholder).
     * @param {object} kbData - Data for the graph visualization.
     */
    renderKbGraph(kbData) {
        if (!kbData) {
            this.kbGraphContainer.innerHTML = `<div class="placeholder error">Failed to fetch knowledge base data.</div>`;
            return;
        }
        
        // In a real implementation, this would involve a library like D3 or Vis.js
        const nodeCount = kbData.results ? kbData.results.length : (kbData.nodes ? kbData.nodes.length : 0);
        this.kbGraphContainer.innerHTML = `<div class="placeholder">Graph rendering is not yet implemented. ${nodeCount} nodes found.</div>`;
    }

    /**
     * Renders the list of available lists.
     * @param {object[]} lists - Array of list metadata objects.
     */
    renderListsBrowser(lists) {
        this.listsBrowser.innerHTML = '';
        if (!lists || lists.length === 0) {
            this.listsBrowser.innerHTML = `<li class="placeholder">No lists created.</li>`;
            return;
        }
        lists.forEach(list => {
            const li = this._createEl('li', {
                'data-list-name': list.name,
                textContent: list.title || list.name
            });
            this.listsBrowser.appendChild(li);
        });
        this._updateActiveListSelection();
    }
    
    /**
     * Renders the content of a selected list.
     * @param {object} list - The full list object with items.
     */
    renderListContent(list) {
        this.listContentTitle.textContent = list.metadata.title || list.name;
        this.listContentView.innerHTML = '';
        if (!list.items || list.items.length === 0) {
            this.listContentView.innerHTML = `<div class="placeholder">This list is empty.</div>`;
            return;
        }
        const ul = this._createEl('ul');
        list.items.forEach(item => {
            // Debug: Log the actual status value
            console.log(`[Lists] Item status: "${item.status}" (type: ${typeof item.status})`);
            
            // Normalize status to uppercase for CSS class matching
            const normalizedStatus = (item.status || 'NONE').toString().toUpperCase();
            
            const li = this._createEl('li', {
                className: `list-item list-item-${normalizedStatus}`
            });
            
            // Debug: Log the generated class names and check DOM
            console.log(`[Lists] Generated classes: "${li.className}"`);
            console.log(`[Lists] Element:`, li);
            
            const status = this._createEl('span', { 
                className: `item-status item-status-${normalizedStatus}`,
                textContent: item.status || '—'
            });
            const text = this._createEl('span', {
                className: 'item-text',
                textContent: item.text
            });
            li.appendChild(status);
            li.appendChild(text);
            ul.appendChild(li);
        });
        this.listContentView.appendChild(ul);
    }

    /**
     * Shows a loading state for a specific widget.
     * @param {('health'|'fs'|'kb'|'lists')} widgetName - The name of the widget to update.
     * @param {string} message - The loading message to display.
     */
    showLoading(widgetName, message = 'Loading...') {
        const containers = {
            health: this.healthContent,
            fs: this.fsTreeContainer,
            kb: this.kbGraphContainer,
            lists: this.listsBrowser,
            listContent: this.listContentView
        };
        const container = containers[widgetName];
        if (container) {
            container.innerHTML = `<div class="placeholder">${message}</div>`;
        }
    }

    _updateActiveListSelection() {
        this.listsBrowser.querySelectorAll('li').forEach(li => {
            if (li.dataset.listName === this.selectedList) {
                li.classList.add('active');
            } else {
                li.classList.remove('active');
            }
        });
    }

    /**
     * Opens the file viewer modal with the specified file content.
     * @param {string} fileName - The name/path of the file
     * @param {string} content - The file content to display
     */
    openFileViewer(fileName, content) {
        textViewModal.open(fileName, content, () => {
            console.log(`[FileViewer] Closed viewer for: ${fileName}`);
        });
    }

    /**
     * Updates the content of the currently open file viewer.
     * @param {string} content - The new content to display
     */
    updateFileViewerContent(content) {
        textViewModal.updateContent(content);
    }

    /**
     * Sets the file viewer to loading state.
     */
    setFileViewerLoading() {
        textViewModal.setLoading();
    }

    /**
     * Helper to create DOM elements.
     * @param {string} tag - The HTML tag to create.
     * @param {object} attributes - Object of attributes to set on the element.
     * @returns {HTMLElement}
     * @private
     */
    _createEl(tag, attributes = {}) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'textContent') {
                el.textContent = value;
            } else if (key === 'className') {
                el.className = value;
            } else {
                el.setAttribute(key, value);
            }
        }
        return el;
    }
}