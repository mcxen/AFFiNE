# Changelog

See the [AFFiNE CHANGELOG](https://affine.pro/blog?tag=Release%20Note)

## Recent Updates (Canary)

### AI Features
- **Local BYOK (Bring Your Own Key) Support**: Configure custom AI providers and models in desktop app settings
- **AI SDK Integration**: Desktop app now uses AI SDK for local BYOK chat functionality
- **Model Connectivity Check**: Added real-time connectivity testing for AI models
- **Stabilized Local Chat**: Improved reliability for local AI chat functionality

### MCP (Model Context Protocol)
- **Built-in MCP Server**: Desktop app now includes a local MCP server for AI assistant integration
- **Workspace MCP Tools**: Added tools for AI to interact with workspace documents
- **Expose All Workspaces**: MCP server can access all user workspaces
- **MCP Doc Editing**: AI assistants can edit documents through MCP

### Import/Export Improvements
- **Bear Backup Import**: Support for importing `.bear2bk` files with folder hierarchy, tags, and metadata preservation
- **Markdown Zip Export**: Preserve folder structure when exporting/importing markdown zip files
- **Markdown-only Export**: New option to export documents as single-file markdown

### Editor Enhancements
- **Code Block Collapse/Expand**: Added fold/unfold functionality to code blocks
- **Mermaid Preview**: Removed max-height restriction for better viewing
- **LaTeX Preview**: Fixed content stretching issues
- **Navigation Panel**: Fixed reordering issues while typing

### Desktop App
- **macOS ARM64 Native Build**: Improved performance on Apple Silicon Macs
- **Web Asset Generation**: Fixed electron web asset generation issues
- **Storage Usage Overview**: New workspace storage usage display in settings
- **Removed Paid Feature Gates**: Free access to previously gated features

### Infrastructure
- **Security Updates**: Updated dependencies for security patches (link-preview-js, postcss, uuid)
- **Cross-browser Stability**: Improved test stability across different browsers

---
