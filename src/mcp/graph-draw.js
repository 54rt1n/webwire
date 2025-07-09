/**
 * GraphDraw - Knowledge Base Graph Visualization
 * Renders an interactive node graph for knowledge base entries using canvas
 */
export class GraphDraw {
    constructor(container) {
        this.container = container;
        this.canvas = null;
        this.ctx = null;
        this.nodes = [];
        this.edges = [];
        this.selectedNode = null;
        this.hoveredNode = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.panOffset = { x: 0, y: 0 };
        this.zoom = 1;
        this.lastMousePos = { x: 0, y: 0 };
        
        // Visual configuration
        this.config = {
            nodeRadius: 30,
            nodeColor: '#3bc692',
            nodeHoverColor: '#2563eb',
            nodeSelectedColor: '#1d4ed8',
            nodeStashedColor: '#60a5fa',       // Light blue for stashed nodes
            nodeStashedHoverColor: '#3b82f6',  // Darker blue on hover
            nodeStashedSelectedColor: '#1d4ed8', // Selected stashed color
            edgeColor: '#94a3b8',
            textColor: '#1e293b',
            backgroundColor: '#f8fafc',
            gridColor: '#e2e8f0',
            font: '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        };
    }

    /**
     * Initialize the graph canvas
     */
    initialize() {
        // Clear container and create canvas
        this.container.innerHTML = '';
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'kb-graph-canvas';
        this.container.appendChild(this.canvas);
        
        // Set canvas size
        this.resizeCanvas();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial render
        this.render();
    }

    /**
     * Set graph data and render
     * @param {Array} kbData - Knowledge base entries with relations
     */
    setData(kbData) {
        this.nodes = [];
        this.edges = [];
        
        if (!kbData || kbData.length === 0) return;
        
        // Create nodes from KB entries
        const nodeMap = new Map();
        
        kbData.forEach((entry, index) => {
            const node = {
                id: entry.uri || entry.urn,
                label: this._extractLabel(entry.uri || entry.urn),
                data: entry,
                isStashed: entry.isStashed || false,  // Include stash state
                x: Math.cos(index * 2 * Math.PI / kbData.length) * 200 + this.canvas.width / 2,
                y: Math.sin(index * 2 * Math.PI / kbData.length) * 200 + this.canvas.height / 2,
                vx: 0,
                vy: 0
            };
            
            this.nodes.push(node);
            nodeMap.set(node.id, node);
        });
        
        // Create edges from relations - check multiple possible locations
        kbData.forEach(entry => {
            // Check for relations in multiple possible locations
            let relations = entry.relations || 
                           (entry.index && entry.index.relations) || 
                           (entry.metadata && entry.metadata.relations) ||
                           [];
            
            // Also check for references triples in index
            if (entry.index && entry.index.references) {
                if (Array.isArray(entry.index.references)) {
                    relations = relations.concat(entry.index.references.map(ref => ({
                        target: ref,
                        predicate: 'references'
                    })));
                }
            }
            
            if (relations && relations.length > 0) {
                relations.forEach(relation => {
                    const sourceNode = nodeMap.get(entry.uri || entry.urn);
                    let targetId = relation.target || relation.object || relation;
                    
                    // Handle case where relation might just be a string
                    if (typeof relation === 'string') {
                        targetId = relation;
                    }
                    
                    // Handle case where target is an array [predicate, uri]
                    if (Array.isArray(targetId)) {
                        targetId = targetId[1] || targetId[0]; // Try second element first, fallback to first
                    }
                    
                    const targetNode = nodeMap.get(targetId);
                    
                    if (sourceNode && targetNode) {
                        this.edges.push({
                            source: sourceNode,
                            target: targetNode,
                            type: relation.predicate || 'references'
                        });
                    }
                });
            }
        });
        
        console.log(`[GraphDraw] Created ${this.nodes.length} nodes and ${this.edges.length} edges`);
        
        console.log(`[GraphDraw] Starting force simulation...`);
        // Run force simulation to position nodes
        this.runForceSimulation();
        
        console.log(`[GraphDraw] Force simulation complete, starting render...`);
        // Render
        this.render();
        console.log(`[GraphDraw] Render complete`);
        
        // Notify that graph is ready
        const event = new CustomEvent('kb-graph-ready');
        this.container.dispatchEvent(event);
    }

    /**
     * Extract a readable label from URI
     * @param {string} uri - The URI like kb://docs/api-guide
     * @returns {string} Readable label
     */
    _extractLabel(uri) {
        if (!uri) return 'Unknown';
        
        // Remove kb:// prefix and get last part
        const parts = uri.replace('kb://', '').split('/');
        const label = parts[parts.length - 1];
        
        // Convert hyphens/underscores to spaces and capitalize
        return label
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Simple force-directed layout simulation
     */
    runForceSimulation() {
        const iterations = 50;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        for (let i = 0; i < iterations; i++) {
            // Apply forces
            this.nodes.forEach(node => {
                // Reset forces
                node.fx = 0;
                node.fy = 0;
                
                // Repulsion between nodes
                this.nodes.forEach(other => {
                    if (node === other) return;
                    
                    const dx = node.x - other.x;
                    const dy = node.y - other.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 150) {
                        const force = (150 - distance) / distance;
                        node.fx += dx * force * 0.5;
                        node.fy += dy * force * 0.5;
                    }
                });
                
                // Attraction along edges
                this.edges.forEach(edge => {
                    if (edge.source === node || edge.target === node) {
                        const other = edge.source === node ? edge.target : edge.source;
                        const dx = other.x - node.x;
                        const dy = other.y - node.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance > 100) {
                            const force = (distance - 100) / distance;
                            node.fx += dx * force * 0.1;
                            node.fy += dy * force * 0.1;
                        }
                    }
                });
                
                // Gravity towards center
                const dx = centerX - node.x;
                const dy = centerY - node.y;
                node.fx += dx * 0.01;
                node.fy += dy * 0.01;
            });
            
            // Apply velocities
            this.nodes.forEach(node => {
                node.vx = (node.vx + node.fx) * 0.8;
                node.vy = (node.vy + node.fy) * 0.8;
                node.x += node.vx;
                node.y += node.vy;
            });
        }
    }

    /**
     * Setup canvas event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Wheel for zoom
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        // Window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.render();
        });
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panOffset.x) / this.zoom;
        const y = (e.clientY - rect.top - this.panOffset.y) / this.zoom;
        
        // Check if clicking on a node
        const clickedNode = this.getNodeAt(x, y);
        
        if (clickedNode) {
            this.selectNode(clickedNode);
            this.isDragging = true;
            this.dragOffset = {
                x: x - clickedNode.x,
                y: y - clickedNode.y
            };
        } else {
            // Clear selection when clicking on empty space
            this.clearSelection();
            // Start panning
            this.isDragging = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
        }
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panOffset.x) / this.zoom;
        const y = (e.clientY - rect.top - this.panOffset.y) / this.zoom;
        
        if (this.isDragging) {
            if (this.selectedNode) {
                // Drag selected node
                this.selectedNode.x = x - this.dragOffset.x;
                this.selectedNode.y = y - this.dragOffset.y;
                this.render();
            } else {
                // Pan view
                this.panOffset.x += e.clientX - this.lastMousePos.x;
                this.panOffset.y += e.clientY - this.lastMousePos.y;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                this.render();
            }
        } else {
            // Check hover
            const hoveredNode = this.getNodeAt(x, y);
            if (hoveredNode !== this.hoveredNode) {
                this.hoveredNode = hoveredNode;
                this.canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
                this.render();
            }
        }
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
    }

    /**
     * Handle double click event
     */
    handleDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panOffset.x) / this.zoom;
        const y = (e.clientY - rect.top - this.panOffset.y) / this.zoom;
        
        const node = this.getNodeAt(x, y);
        if (node) {
            // Emit event for opening document
            const event = new CustomEvent('kb-node-open', { 
                detail: { node: node.data } 
            });
            this.container.dispatchEvent(event);
        }
    }

    /**
     * Handle wheel event for zoom
     */
    handleWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(3, this.zoom * delta));
        
        // Zoom towards mouse position
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        this.panOffset.x = mouseX - (mouseX - this.panOffset.x) * (newZoom / this.zoom);
        this.panOffset.y = mouseY - (mouseY - this.panOffset.y) * (newZoom / this.zoom);
        
        this.zoom = newZoom;
        this.render();
    }

    /**
     * Get node at position
     */
    getNodeAt(x, y) {
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= this.config.nodeRadius) {
                return node;
            }
        }
        return null;
    }

    /**
     * Select a node
     */
    selectNode(node) {
        if (this.selectedNode !== node) {
            this.selectedNode = node;
            this.render();
            
            // Emit selection event
            const event = new CustomEvent('kb-node-selected', { 
                detail: { node: node ? node.data : null } 
            });
            this.container.dispatchEvent(event);
        }
    }

    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // Get context with settings
        this.ctx = this.canvas.getContext('2d');
        this.ctx.font = this.config.font;
    }

    /**
     * Render the graph
     */
    render() {
        if (!this.ctx) return;
        
        // Clear canvas
        this.ctx.fillStyle = this.config.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save context state
        this.ctx.save();
        
        // Apply pan and zoom
        this.ctx.translate(this.panOffset.x, this.panOffset.y);
        this.ctx.scale(this.zoom, this.zoom);
        
        // Draw grid
        this.drawGrid();
        
        // Draw edges
        this.edges.forEach(edge => this.drawEdge(edge));
        
        // Draw nodes
        this.nodes.forEach(node => this.drawNode(node));
        
        // Restore context state
        this.ctx.restore();
        
        // Draw UI overlay
        this.drawOverlay();
    }

    /**
     * Draw background grid
     */
    drawGrid() {
        const gridSize = 50;
        const offsetX = -this.panOffset.x / this.zoom;
        const offsetY = -this.panOffset.y / this.zoom;
        const width = this.canvas.width / this.zoom;
        const height = this.canvas.height / this.zoom;
        
        this.ctx.strokeStyle = this.config.gridColor;
        this.ctx.lineWidth = 0.5;
        
        // Vertical lines
        for (let x = -offsetX % gridSize; x < width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + offsetX, offsetY);
            this.ctx.lineTo(x + offsetX, offsetY + height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = -offsetY % gridSize; y < height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX, y + offsetY);
            this.ctx.lineTo(offsetX + width, y + offsetY);
            this.ctx.stroke();
        }
    }

    /**
     * Draw an edge
     */
    drawEdge(edge) {
        this.ctx.strokeStyle = this.config.edgeColor;
        this.ctx.lineWidth = 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(edge.source.x, edge.source.y);
        this.ctx.lineTo(edge.target.x, edge.target.y);
        this.ctx.stroke();
        
        // Draw arrow
        const angle = Math.atan2(
            edge.target.y - edge.source.y,
            edge.target.x - edge.source.x
        );
        const arrowLength = 10;
        const arrowAngle = Math.PI / 6;
        
        const endX = edge.target.x - Math.cos(angle) * this.config.nodeRadius;
        const endY = edge.target.y - Math.sin(angle) * this.config.nodeRadius;
        
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(
            endX - arrowLength * Math.cos(angle - arrowAngle),
            endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(
            endX - arrowLength * Math.cos(angle + arrowAngle),
            endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        this.ctx.stroke();
    }

    /**
     * Draw a node
     */
    drawNode(node) {
        // Determine node color based on state
        let color = this.config.nodeColor;
        
        if (node.isStashed) {
            // Stashed node colors
            if (node === this.selectedNode) {
                color = this.config.nodeStashedSelectedColor;
            } else if (node === this.hoveredNode) {
                color = this.config.nodeStashedHoverColor;
            } else {
                color = this.config.nodeStashedColor;
            }
        } else {
            // Regular node colors
            if (node === this.selectedNode) {
                color = this.config.nodeSelectedColor;
            } else if (node === this.hoveredNode) {
                color = this.config.nodeHoverColor;
            }
        }
        
        // Draw node circle
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, this.config.nodeRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Add a subtle border for stashed nodes
        if (node.isStashed) {
            this.ctx.strokeStyle = '#1e40af'; // Darker blue border
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        
        // Draw node label with white text and black border
        this.ctx.font = `bold ${12 / this.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Use full label without truncation
        const label = node.label;
        
        // Draw black border/stroke first
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(label, node.x, node.y);
        
        // Draw white text on top
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(label, node.x, node.y);
    }

    /**
     * Draw UI overlay (zoom indicator, etc.)
     */
    drawOverlay() {
        // Zoom indicator
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'bottom';
        this.ctx.fillText(
            `Zoom: ${Math.round(this.zoom * 100)}%`,
            this.canvas.width - 10,
            this.canvas.height - 10
        );
        
        // Instructions
        this.ctx.textAlign = 'left';
        this.ctx.fillText(
            'Click to select • Double-click to open • Drag to move • Scroll to zoom',
            10,
            this.canvas.height - 10
        );
    }

    /**
     * Get selected node data
     */
    getSelectedNode() {
        return this.selectedNode ? this.selectedNode.data : null;
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedNode = null;
        this.render();
        
        // Emit event
        const event = new CustomEvent('kb-node-selected', { 
            detail: { node: null } 
        });
        this.container.dispatchEvent(event);
    }

    /**
     * Focus on a specific node
     */
    focusNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
            // Center the node
            this.panOffset.x = this.canvas.width / 2 - node.x * this.zoom;
            this.panOffset.y = this.canvas.height / 2 - node.y * this.zoom;
            
            // Select it
            this.selectNode(node);
            
            // Render
            this.render();
        }
    }

    /**
     * Reset view
     */
    resetView() {
        this.zoom = 1;
        this.panOffset = { x: 0, y: 0 };
        this.render();
    }

    /**
     * Update the stash state of a specific node and re-render
     * @param {string} nodeId - The ID of the node to update
     * @param {boolean} isStashed - Whether the node is now stashed
     */
    updateNodeStashState(nodeId, isStashed) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
            node.isStashed = isStashed;
            // Also update the data object
            if (node.data) {
                node.data.isStashed = isStashed;
            }
            this.render();
        }
    }
}