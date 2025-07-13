import '../shared/global.scss';
import './style.css';
import { TextViewModal } from './components/textview-modal.js';
import { GraphDraw } from './components/graph-draw.js';
import { StashButton } from './components/stash-button.js';
import { EVENTS } from '../js/core/events.js';

/**
 * MCPControlPanel
 * Manages all UI rendering and event handling for the MCP Control Panel.
 * This class does not contain any business logic for fetching data; it only
 * receives data and renders it to the DOM.
 */
export class MCPControlPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.selectedList = null;
        this.selectedFile = null; // Track currently selected file
        this.selectedKbNode = null; // Track currently selected KB node
        this.selectedListItem = null; // Track currently selected list item
        this.graphDraw = null;      // Graph visualization instance
        this.stateService = null;   // State service for stash functionality
        this.textViewModal = new TextViewModal(this.eventBus, this.stateService);
        
        this.elements = this._DOMElements();

    }

    /**
     * Caches all necessary DOM elements for performance.
     * @private
     */
    _DOMElements() {
        // Main sections
        return {
            healthContent: document.getElementById('health-check-content'),
            fsTreeContainer: document.getElementById('fs-tree-container'),
            kbGraphContainer: document.getElementById('kb-graph-container'),
            listsBrowser: document.getElementById('lists-browser'),
            listContentTitle: document.getElementById('list-content-title'),
            listContentView: document.getElementById('list-content-view'),
            connectionLight: document.getElementById('connection-light'),
            serverStatusText: document.getElementById('server-status-text'),
            serverUrlDisplay: document.getElementById('server-url-display'),
            reconnectBtn: document.getElementById('reconnect-btn'),
            toggleChatBtn: document.getElementById('toggle-chat-btn'),
            refreshHealthBtn: document.getElementById('refresh-health-btn'),
            refreshFsBtn: document.getElementById('refresh-fs-btn'),
            openFileBtn: document.getElementById('open-file-btn'),
            refreshKbBtn: document.getElementById('refresh-kb-btn'),
            refreshListsBtn: document.getElementById('refresh-lists-btn'),
            openKbBtn: document.getElementById('open-kb-btn'),
            fileStashButton: null,
            kbStashButton: null,
            listStashButton: null
        };
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
        this._storeHandlers(handlers); // Add this line
        this.elements.reconnectBtn.addEventListener('click', handlers.onReconnect);
        this.elements.toggleChatBtn.addEventListener('click', handlers.onToggleChat);
        this.elements.refreshHealthBtn.addEventListener('click', handlers.onRefreshHealth);
        this.elements.refreshFsBtn.addEventListener('click', handlers.onRefreshFs);
        this.elements.openFileBtn.addEventListener('click', () => {
            if (this.selectedFile) {
                handlers.onOpenFile(this.selectedFile);
            }
        });
        this.elements.refreshKbBtn.addEventListener('click', handlers.onRefreshKb);
        this.elements.refreshListsBtn.addEventListener('click', handlers.onRefreshLists);
        this.elements.openKbBtn.addEventListener('click', () => {
            if (this.selectedKbNode) {
                handlers.onOpenKbDocument(this.selectedKbNode);
            }
        });
        
        this.elements.listsBrowser.addEventListener('click', (e) => {
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
        this.elements.connectionLight.className = `status-light ${status}`;
        this.elements.serverStatusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        this.elements.serverUrlDisplay.textContent = url || 'No server configured';
    }

    /**
     * Renders the health check data.
     * @param {object} healthData - The health data from the server.
     */
    renderHealthCheck(healthData) {
        if (!healthData) {
            this.elements.healthContent.innerHTML = `<div class="placeholder error">Failed to fetch health data.</div>`;
            return;
        }
        this.elements.healthContent.innerHTML = '';
        for (const [key, value] of Object.entries(healthData)) {
            const keyEl = this._createEl('div', { className: 'key', textContent: key });
            const valueEl = this._createEl('div', { className: 'value', textContent: JSON.stringify(value) });
            this.elements.healthContent.append(keyEl, valueEl);
        }
    }

    /**
     * Renders the filesystem tree.
     * @param {object[]} fsData - Array of file/folder entries from the server.
     */
    renderFilesystem(fsData) {
        this.elements.fsTreeContainer.innerHTML = '';
        
        // Reset file selection state
        this.selectedFile = null;
        this.elements.openFileBtn.style.display = 'none';
        
        if (!fsData || fsData.length === 0) {
             this.elements.fsTreeContainer.innerHTML = `<div class="placeholder">Filesystem is empty.</div>`;
             return;
        }

        // Build and render tree
        const treeHtml = this._buildTreeHtml(fsData);
        this.elements.fsTreeContainer.innerHTML = treeHtml;
        
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
            
            // Check if this file is stashed (only for files, not folders)
            const isStashed = node.type === 'file' && this._isFileStashed(node.path);
            const stashedClass = isStashed ? ' fs-item-stashed' : '';
            
            // Create the node HTML
            html += `<div class="fs-tree-line${stashedClass}" data-path="${node.path}" data-type="${node.type}">`;
            
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
        this.elements.fsTreeContainer.addEventListener('click', (e) => {
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
        this.elements.fsTreeContainer.querySelectorAll('.fs-tree-line.selected').forEach(el => {
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
            this.elements.openFileBtn.style.display = 'inline-flex';
            this._updateFileStashButton(filePath);
        } else {
            this.selectedFile = null;
            this.elements.openFileBtn.style.display = 'none';
            this._hideFileStashButton();
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
     * Renders the knowledge base graph.
     * @param {object} kbData - Data for the graph visualization.
     */
    renderKbGraph(kbData) {
        console.log(`[Panel] renderKbGraph called with data:`, kbData);
        if (!kbData) {
            this.elements.kbGraphContainer.innerHTML = `<div class="placeholder error">Failed to fetch knowledge base data.</div>`;
            return;
        }
        
        const results = kbData.results || [];
        if (results.length === 0) {
            this.elements.kbGraphContainer.innerHTML = `<div class="placeholder">No documents found in knowledge base.</div>`;
            return;
        }
        
        // Always destroy and recreate graph to avoid state issues
        this.graphDraw = null;
        this.graphDraw = new GraphDraw(this.elements.kbGraphContainer);
        this.graphDraw.initialize();
        
        // Setup event listeners for graph interactions
        this.elements.kbGraphContainer.addEventListener('kb-node-selected', (e) => {
            this.selectedKbNode = e.detail.node;
            this.elements.openKbBtn.style.display = this.selectedKbNode ? 'inline-flex' : 'none';
            
            if (this.selectedKbNode) {
                this._updateKbStashButton(this.selectedKbNode);
            } else {
                this._hideKbStashButton();
            }
        });
        
        this.elements.kbGraphContainer.addEventListener('kb-node-open', (e) => {
            if (e.detail.node) {
                // Trigger the open handler
                const handlers = this._handlers;
                if (handlers && handlers.onOpenKbDocument) {
                    handlers.onOpenKbDocument(e.detail.node);
                }
            }
        });
        
        // Listen for graph ready event to clear loading state
        this.elements.kbGraphContainer.addEventListener('kb-graph-ready', () => {
            console.log('[Panel] Graph ready, clearing loading state');
            // Loading state should already be cleared since we're not in showLoading anymore
        });
        
        // Mark nodes as stashed before rendering
        const resultsWithStashInfo = results.map(node => ({
            ...node,
            isStashed: this._isKbNodeStashed(node.uri || node.urn)
        }));
        
        // Set data and render
        this.graphDraw.setData(resultsWithStashInfo);
    }

    /**
     * Renders the list of available lists.
     * @param {object[]} lists - Array of list metadata objects.
     */
    renderListsBrowser(lists) {
        this.elements.listsBrowser.innerHTML = '';
        if (!lists || lists.length === 0) {
            this.elements.listsBrowser.innerHTML = `<li class="placeholder">No lists created.</li>`;
            return;
        }
        lists.forEach(list => {
            const li = this._createEl('li', {
                'data-list-name': list.name,
                textContent: list.title || list.name
            });
            this.elements.listsBrowser.appendChild(li);
        });
        this._updateActiveListSelection();
    }
    
    /**
     * Renders the content of a selected list.
     * @param {object} list - The full list object with items.
     */
    renderListContent(list) {
        this.elements.listContentTitle.textContent = list.metadata.title || list.name;
        this.elements.listContentView.innerHTML = '';
        
        // Reset list item selection
        this.selectedListItem = null;
        this._hideListStashButton();
        
        if (!list.items || list.items.length === 0) {
            this.elements.listContentView.innerHTML = `<div class="placeholder">This list is empty.</div>`;
            return;
        }
        
        const ul = this._createEl('ul');
        list.items.forEach((item, index) => {
            // Debug: Log the actual status value
            console.log(`[Lists] Item status: "${item.status}" (type: ${typeof item.status})`);
            
            // Normalize status to uppercase for CSS class matching
            const normalizedStatus = (item.status || 'NONE').toString().toUpperCase();
            
            // Create list item URI for stashing
            const itemUri = `${list.name}:${index}`;
            
            // Check if this item is stashed
            const isStashed = this._isListItemStashed(itemUri);
            
            const li = this._createEl('li', {
                className: `list-item list-item-${normalizedStatus}${isStashed ? ' list-item-stashed' : ''}`,
                'data-list-name': list.name,
                'data-item-index': index,
                'data-item-uri': itemUri
            });
            
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
        
        // Add click handler for list items
        ul.addEventListener('click', (e) => {
            const listItem = e.target.closest('.list-item');
            if (listItem) {
                this._selectListItem(listItem);
            }
        });
        
        this.elements.listContentView.appendChild(ul);
    }

    /**
     * Shows a loading state for a specific widget.
     * @param {('health'|'fs'|'kb'|'lists')} widgetName - The name of the widget to update.
     * @param {string} message - The loading message to display.
     */
    showLoading(widgetName, message = 'Loading...') {
        console.log(`[Panel] showLoading called for: ${widgetName} with message: ${message}`);
        const containers = {
            health: this.elements.healthContent,
            fs: this.elements.fsTreeContainer,
            kb: this.elements.kbGraphContainer,
            lists: this.elements.listsBrowser,
            listContent: this.elements.listContentView
        };
        const container = containers[widgetName];
        if (container) {
            container.innerHTML = `<div class="placeholder">${message}</div>`;
        }
    }

    _updateActiveListSelection() {
        this.elements.listsBrowser.querySelectorAll('li').forEach(li => {
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
        this.textViewModal.open(fileName, content, () => {
            console.log(`[FileViewer] Closed viewer for: ${fileName}`);
        });
    }

    /**
     * Updates the content of the currently open file viewer.
     * @param {string} content - The new content to display
     */
    updateFileViewerContent(content) {
        this.textViewModal.updateContent(content);
    }

    /**
     * Sets the file viewer to loading state.
     */
    setFileViewerLoading() {
        this.textViewModal.setLoading();
    }

    /**
     * Set the state service for stash functionality
     * @param {Object} stateService - The state service instance
     */
    setStateService(stateService) {
        this.stateService = stateService;
        // Also set for the textview modal
        this.textViewModal.setStateService(this.eventBus, stateService);
        
        // Initialize stash buttons for dashboard
        this._initializeStashButtons();
        
        // Listen for stash events from other components (like modals)
        this._setupStashEventListeners();
    }

    /**
     * Initialize stash buttons for dashboard panels
     * @private
     */
    _initializeStashButtons() {
        if (!this.stateService) return;
        
        // Add stash button containers to widget actions if they don't exist
        this._ensureStashContainers();
    }

    /**
     * Setup event listeners for stash events from other components
     * @private
     */
    _setupStashEventListeners() {
        if (!this.stateService || !this.stateService.eventBus) return;
        
        // Listen for stash updates from other components (modals, etc.)
        this.stateService.eventBus.on(EVENTS.STASH.ADD, async (data) => {
            console.log('[Panel] Received stash update:', data);
            
            if (data && data.uri && typeof data.isStashed === 'boolean') {
                // Handle different types of stash updates
                switch (data.type) {
                    case 'kb':
                        this._updateKbNodeStashState(data.uri, data.isStashed);
                        break;
                    case 'fs':
                        this._updateFileStashState(data.uri, data.isStashed);
                        break;
                    case 'list':
                        this._updateListItemStashState(data.uri, data.isStashed);
                        break;
                }
            }
        });
    }

    /**
     * Ensure stash button containers exist in widget actions
     * @private
     */
    _ensureStashContainers() {
        // File system widget
        const fsActions = this.elements.refreshFsBtn.parentElement;
        if (fsActions && !fsActions.querySelector('.fs-stash-container')) {
            const container = document.createElement('div');
            container.className = 'fs-stash-container';
            container.style.display = 'none'; // Initially hidden
            fsActions.insertBefore(container, this.openFileBtn);
        }
        
        // KB widget
        const kbActions = this.elements.refreshKbBtn.parentElement;
        if (kbActions && !kbActions.querySelector('.kb-stash-container')) {
            const container = document.createElement('div');
            container.className = 'kb-stash-container';
            container.style.display = 'none'; // Initially hidden
            kbActions.insertBefore(container, this.openKbBtn);
        }
        
        // List content widget
        const listContentHeader = this.elements.listContentTitle.parentElement;
        const listActions = listContentHeader.querySelector('.widget-actions');
        if (listActions && !listActions.querySelector('.list-stash-container')) {
            const container = document.createElement('div');
            container.className = 'list-stash-container';
            container.style.display = 'none'; // Initially hidden
            listActions.appendChild(container);
        }
    }

    /**
     * Update file stash button
     * @param {string} filePath - The file path to stash
     * @private
     */
    _updateFileStashButton(filePath) {
        if (!this.stateService) return;
        
        const container = document.querySelector('.fs-stash-container');
        if (!container) return;
        
        // Remove existing button
        container.innerHTML = '';
        
        // Create new stash button
        this.elements.fileStashButton = new StashButton(this.eventBus, this.stateService);
        const button = this.elements.fileStashButton.create(filePath, 'fs', {
            size: 'icon',
            onToggle: async (stashedUri, isStashed) => {
                console.log(`[Panel] File ${isStashed ? 'added to' : 'removed from'} stash: ${stashedUri}`);
                // Update the visual state of the file tree
                this._updateFileStashState(filePath, isStashed);
            }
        });
        
        container.appendChild(button);
        container.style.display = 'inline-flex';
    }

    /**
     * Hide file stash button
     * @private
     */
    _hideFileStashButton() {
        const container = document.querySelector('.fs-stash-container');
        if (container) {
            container.style.display = 'none';
        }
    }

    /**
     * Update KB stash button
     * @param {Object} kbNode - The KB node to stash
     * @private
     */
    _updateKbStashButton(kbNode) {
        if (!this.stateService || !kbNode) return;
        
        const container = document.querySelector('.kb-stash-container');
        if (!container) return;
        
        const uri = kbNode.uri || kbNode.urn;
        if (!uri) return;
        
        // Remove existing button
        container.innerHTML = '';
        
        // Create new stash button
        this.elements.kbStashButton = new StashButton(this.eventBus, this.stateService);
        const button = this.elements.kbStashButton.create(uri, 'kb', {
            size: 'icon',
            onToggle: async (stashedUri, isStashed) => {
                console.log(`[Panel] KB document ${isStashed ? 'added to' : 'removed from'} stash: ${stashedUri}`);
                this.eventBus.emit(isStashed ? EVENTS.STASH.ADD : EVENTS.STASH.REMOVE, { uri, isStashed, type: 'kb' });
                // Update the visual state of the KB node in the graph
                this._updateKbNodeStashState(uri, isStashed);
            }
        });
        
        container.appendChild(button);
        container.style.display = 'inline-flex';
    }

    /**
     * Hide KB stash button
     * @private
     */
    _hideKbStashButton() {
        const container = document.querySelector('.kb-stash-container');
        if (container) {
            container.style.display = 'none';
        }
    }

    /**
     * Check if a file is stashed
     * @param {string} filePath - The file path
     * @returns {boolean} True if the file is stashed
     * @private
     */
    _isFileStashed(filePath) {
        if (!this.stateService || !this.stateService.stash) return false;
        
        const fullUri = `fs://${filePath}`;
        const stashItems = this.stateService.stash.getAllKeys('mcp');
        return stashItems.includes(fullUri);
    }

    /**
     * Check if a KB node is stashed
     * @param {string} uri - The KB node URI
     * @returns {boolean} True if the KB node is stashed
     * @private
     */
    _isKbNodeStashed(uri) {
        if (!this.stateService || !this.stateService.stash) return false;
        
        // KB URIs already have kb:// prefix, so use as-is
        const fullUri = uri.startsWith('kb://') ? uri : `kb://${uri}`;
        const stashItems = this.stateService.stash.getAllKeys('mcp');
        return stashItems.includes(fullUri);
    }

    /**
     * Check if a list item is stashed
     * @param {string} itemUri - The list item URI (listName:itemIndex)
     * @returns {boolean} True if the item is stashed
     * @private
     */
    _isListItemStashed(itemUri) {
        if (!this.stateService || !this.stateService.stash) return false;
        
        // Convert listName:itemIndex to list://listName/itemIndex
        const [listName, itemIndex] = itemUri.split(':');
        const fullUri = `list://${listName}/${itemIndex}`;
        const stashItems = this.stateService.stash.getAllKeys('mcp');
        return stashItems.includes(fullUri);
    }

    /**
     * Select a list item
     * @param {HTMLElement} listItem - The list item element
     * @private
     */
    _selectListItem(listItem) {
        // Remove previous selection
        this.elements.listContentView.querySelectorAll('.list-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add selection to clicked item
        listItem.classList.add('selected');
        
        const itemUri = listItem.dataset.itemUri;
        console.log(`[Lists] Selected item: ${itemUri}`);
        
        // Update selected item state and show stash button
        this.selectedListItem = {
            uri: itemUri,
            listName: listItem.dataset.listName,
            itemIndex: parseInt(listItem.dataset.itemIndex),
            element: listItem
        };
        
        this._updateListStashButton(itemUri);
    }

    /**
     * Update list item stash button
     * @param {string} itemUri - The list item URI to stash
     * @private
     */
    _updateListStashButton(itemUri) {
        if (!this.stateService) return;
        
        const container = document.querySelector('.list-stash-container');
        if (!container) return;
        
        // Remove existing button
        container.innerHTML = '';
        
        // Create new stash button
        this.elements.listStashButton = new StashButton(this.eventBus, this.stateService);
        const button = this.elements.listStashButton.create(itemUri, 'list', {
            size: 'icon',
            onToggle: async (stashedUri, isStashed) => {
                console.log(`[Panel] List item ${isStashed ? 'added to' : 'removed from'} stash: ${stashedUri}`);
                // Update the visual state of the list item
                this._updateListItemStashState(itemUri, isStashed);
                this.eventBus.emit(isStashed ? EVENTS.STASH.ADD : EVENTS.STASH.REMOVE, { uri: itemUri, isStashed, type: 'list' });
            }
        });
        
        container.appendChild(button);
        container.style.display = 'inline-flex';
    }

    /**
     * Hide list stash button
     * @private
     */
    _hideListStashButton() {
        const container = document.querySelector('.list-stash-container');
        if (container) {
            container.style.display = 'none';
        }
    }

    /**
     * Update the visual state of a file when its stash state changes
     * @param {string} filePath - The file path
     * @param {boolean} isStashed - Whether the file is now stashed
     * @private
     */
    _updateFileStashState(filePath, isStashed) {
        const fileElement = this.elements.fsTreeContainer.querySelector(`[data-path="${filePath}"]`);
        if (fileElement) {
            if (isStashed) {
                fileElement.classList.add('fs-item-stashed');
            } else {
                fileElement.classList.remove('fs-item-stashed');
            }
        }
    }

    /**
     * Update the visual state of a KB node when its stash state changes
     * @param {string} uri - The KB node URI
     * @param {boolean} isStashed - Whether the node is now stashed
     * @private
     */
    _updateKbNodeStashState(uri, isStashed) {
        if (this.graphDraw) {
            // Update the node's stash state in the graph
            this.graphDraw.updateNodeStashState(uri, isStashed);
        }
    }

    /**
     * Update the visual state of a list item when its stash state changes
     * @param {string} itemUri - The list item URI
     * @param {boolean} isStashed - Whether the item is now stashed
     * @private
     */
    _updateListItemStashState(itemUri, isStashed) {
        const listItem = this.elements.listContentView.querySelector(`[data-item-uri="${itemUri}"]`);
        if (listItem) {
            if (isStashed) {
                listItem.classList.add('list-item-stashed');
            } else {
                listItem.classList.remove('list-item-stashed');
            }
        }
    }

    /**
     * Store handlers reference for later use
     * @private
     */
    _storeHandlers(handlers) {
        this._handlers = handlers;
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