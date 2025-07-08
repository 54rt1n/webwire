#!/usr/bin/env node

/**
 * WebWire Extension Build Script
 * 
 * Prepares the extension for distribution by:
 * - Copying necessary files
 * - Updating manifest versions
 * - Creating distribution package
 * - Validating extension structure
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

class ExtensionBuilder {
    constructor() {
        this.sourceDir = './public';
        this.buildDir = './dist/extension';
        this.version = this.getPackageVersion();
        
        console.log('🏗️  WebWire Extension Builder');
        console.log(`📦 Version: ${this.version}`);
    }

    getPackageVersion() {
        try {
            const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
            return packageJson.version || '1.0.0';
        } catch (error) {
            console.warn('⚠️  Could not read package.json, using default version');
            return '1.0.0';
        }
    }

    async build() {
        console.log('\n🚀 Starting build process...');
        
        try {
            // Clean build directory
            await this.cleanBuildDir();
            
            // Copy source files
            await this.copySourceFiles();
            
            // Update manifest version
            await this.updateManifestVersion();
            
            // Validate extension structure
            await this.validateExtension();
            
            // Create icons if missing
            await this.createDefaultIcons();
            
            // Create distribution package
            await this.createDistributionPackage();
            
            console.log('\n✅ Build completed successfully!');
            console.log(`📁 Extension files: ${this.buildDir}`);
            console.log(`📦 Distribution package: ${this.buildDir}.zip`);
            
        } catch (error) {
            console.error('\n❌ Build failed:', error.message);
            process.exit(1);
        }
    }

    async cleanBuildDir() {
        console.log('🧹 Cleaning build directory...');
        
        if (fs.existsSync(this.buildDir)) {
            fs.rmSync(this.buildDir, { recursive: true, force: true });
        }
        
        fs.mkdirSync(this.buildDir, { recursive: true });
    }

    async copySourceFiles() {
        console.log('📁 Copying source files...');
        
        // Files and directories to copy
        const filesToCopy = [
            'manifest.json',
            'background.js',
            'popup.html',
            'content/',
            'js/',
            'options/',
            'main/', // Include for completeness
            'mcp/'   // Include for completeness
        ];
        
        for (const item of filesToCopy) {
            const sourcePath = path.join(this.sourceDir, item);
            const destPath = path.join(this.buildDir, item);
            
            if (fs.existsSync(sourcePath)) {
                const stats = fs.statSync(sourcePath);
                
                if (stats.isDirectory()) {
                    this.copyDirectory(sourcePath, destPath);
                } else {
                    // Ensure destination directory exists
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(sourcePath, destPath);
                }
                
                console.log(`  ✓ ${item}`);
            } else {
                console.warn(`  ⚠️  ${item} not found, skipping`);
            }
        }
    }

    copyDirectory(source, destination) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }
        
        const items = fs.readdirSync(source);
        
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const destPath = path.join(destination, item);
            const stats = fs.statSync(sourcePath);
            
            if (stats.isDirectory()) {
                this.copyDirectory(sourcePath, destPath);
            } else {
                fs.copyFileSync(sourcePath, destPath);
            }
        }
    }

    async updateManifestVersion() {
        console.log('📝 Updating manifest version...');
        
        const manifestPath = path.join(this.buildDir, 'manifest.json');
        
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.version = this.version;
            
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log(`  ✓ Updated to version ${this.version}`);
        } else {
            throw new Error('manifest.json not found in build directory');
        }
    }

    async validateExtension() {
        console.log('🔍 Validating extension structure...');
        
        const requiredFiles = [
            'manifest.json',
            'background.js',
            'content/index.js'
        ];
        
        const requiredDirs = [
            'js/state',
            'js/ai',
            'js/mcp',
            'js/storage'
        ];
        
        // Check required files
        for (const file of requiredFiles) {
            const filePath = path.join(this.buildDir, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`Required file missing: ${file}`);
            }
            console.log(`  ✓ ${file}`);
        }
        
        // Check required directories
        for (const dir of requiredDirs) {
            const dirPath = path.join(this.buildDir, dir);
            if (!fs.existsSync(dirPath)) {
                throw new Error(`Required directory missing: ${dir}`);
            }
            console.log(`  ✓ ${dir}/`);
        }
        
        // Validate manifest
        const manifest = JSON.parse(fs.readFileSync(path.join(this.buildDir, 'manifest.json'), 'utf8'));
        
        if (manifest.manifest_version !== 3) {
            throw new Error('Manifest version must be 3 for Chrome extensions');
        }
        
        if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
            throw new Error('No content scripts defined in manifest');
        }
        
        console.log('  ✓ Extension structure valid');
    }

    async createDefaultIcons() {
        console.log('🎨 Creating default icons...');
        
        const iconsDir = path.join(this.buildDir, 'icons');
        
        if (!fs.existsSync(iconsDir)) {
            fs.mkdirSync(iconsDir, { recursive: true });
            
            // Create simple SVG icon and convert to PNG sizes
            const iconSvg = `
                <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
                    <rect width="128" height="128" rx="24" fill="#3b82f6"/>
                    <text x="64" y="80" font-family="system-ui" font-size="60" text-anchor="middle" fill="white">W</text>
                </svg>
            `;
            
            // Save SVG
            fs.writeFileSync(path.join(iconsDir, 'icon.svg'), iconSvg.trim());
            
            // For now, create placeholder PNG files
            // In a real build process, you'd convert SVG to PNG using a tool like sharp
            const iconSizes = [16, 32, 48, 128];
            
            for (const size of iconSizes) {
                const placeholder = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
                // This would be replaced with actual PNG generation
                fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), '');
            }
            
            console.log('  ✓ Created placeholder icons (replace with actual PNG files)');
        } else {
            console.log('  ✓ Icons directory already exists');
        }
    }

    async createDistributionPackage() {
        console.log('📦 Creating distribution package...');
        
        try {
            // Create zip file using Node.js (alternative to system zip command)
            const archiver = await import('archiver').catch(() => null);
            
            if (archiver) {
                await this.createZipWithArchiver();
            } else {
                await this.createZipWithSystemCommand();
            }
            
            console.log('  ✓ Distribution package created');
        } catch (error) {
            console.warn('  ⚠️  Could not create zip package:', error.message);
            console.log('  ℹ️  Manual packaging: zip the contents of the dist/extension/ directory');
        }
    }

    async createZipWithArchiver() {
        const archiver = (await import('archiver')).default;
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(`${this.buildDir}.zip`);
            
            output.on('close', resolve);
            archive.on('error', reject);
            
            archive.pipe(output);
            archive.directory(this.buildDir, false);
            archive.finalize();
        });
    }

    async createZipWithSystemCommand() {
        const command = process.platform === 'win32' 
            ? `powershell Compress-Archive -Path "${this.buildDir}\\*" -DestinationPath "${this.buildDir}.zip"`
            : `cd "${path.dirname(this.buildDir)}" && zip -r "${path.basename(this.buildDir)}.zip" "${path.basename(this.buildDir)}"`;
        
        execSync(command);
    }

    // Development helpers
    async watch() {
        console.log('👀 Starting watch mode...');
        console.log('   Changes to source files will trigger rebuilds');
        
        const chokidar = await import('chokidar').catch(() => null);
        
        if (!chokidar) {
            console.error('❌ chokidar not installed. Install with: npm install chokidar');
            return;
        }
        
        const watcher = chokidar.watch(this.sourceDir, {
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true
        });
        
        let building = false;
        
        watcher.on('change', async (path) => {
            if (building) return;
            
            building = true;
            console.log(`\n📝 File changed: ${path}`);
            
            try {
                await this.build();
                console.log('✅ Rebuild completed');
            } catch (error) {
                console.error('❌ Rebuild failed:', error.message);
            }
            
            building = false;
        });
        
        console.log('✅ Watch mode started. Press Ctrl+C to stop.');
    }
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0] || 'build';

const builder = new ExtensionBuilder();

switch (command) {
    case 'build':
        builder.build();
        break;
        
    case 'watch':
        builder.watch();
        break;
        
    case 'clean':
        builder.cleanBuildDir()
            .then(() => console.log('✅ Build directory cleaned'))
            .catch(err => console.error('❌ Clean failed:', err.message));
        break;
        
    default:
        console.log(`
Usage: node build.js [command]

Commands:
  build    Build the extension (default)
  watch    Build and watch for changes
  clean    Clean the build directory

Examples:
  node build.js
  node build.js watch
  npm run build:extension
        `);
        break;
}