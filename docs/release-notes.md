# AFFiNE Release Notes

## Latest Changes (Canary Branch)

### AI Features

#### Local BYOK (Bring Your Own Key) Support

- Configure custom AI providers and models directly in the desktop app
- Use your own API keys for AI features without relying on cloud services
- Real-time model connectivity checking
- Improved stability for local AI chat functionality

#### AI SDK Integration

- Desktop app now uses AI SDK for local BYOK chat
- Better compatibility with various AI providers
- Local chat rendering with Markdown support

### MCP (Model Context Protocol)

#### Built-in MCP Server

- Desktop app includes a local MCP server for AI assistant integration
- Enable in workspace settings under "Integrations > MCP Server"

#### Workspace MCP Tools

- AI assistants can now interact with your workspaces through MCP
- Expose all workspaces over MCP protocol
- Edit documents directly through MCP tools

### Import/Export Improvements

#### Bear Backup Import

- Support for importing `.bear2bk` backup files
- Preserves folder hierarchy from Bear's nested tag structure
- Converts Bear tags to AFFiNE tags
- Imports creation/modification dates from metadata
- Supports Bear-specific markdown features (highlights, callouts, inline tags)
- Filters out trashed notes automatically

#### Enhanced Markdown Export

- Export documents as Markdown with folder structure preservation
- New Markdown-only export option for single-file output
- ZIP export maintains directory hierarchy

### Editor Enhancements

#### Code Block Improvements

- Added collapse/expand functionality to code blocks
- Better navigation for long code sections

#### Mermaid & LaTeX

- Removed max-height restriction from Mermaid preview containers
- Fixed LaTeX preview content stretching issues

#### Navigation

- Fixed navigation panel reordering while typing
- Improved focus handling in edgeless mode

### Desktop App Features

#### macOS Support

- Native ARM64 builds for Apple Silicon Macs
- Fixed macOS package startup issues
- Improved web asset generation for releases

#### Storage Management

- New workspace storage usage overview in settings
- Better visibility into disk space usage

#### Feature Accessibility

- Removed paid feature gates - many previously restricted features are now freely available
- Simplified subscription management

### Infrastructure & Development

#### Security Updates

- Updated link-preview-js to v4.0.1
- Updated postcss to v8.5.10
- Updated uuid to v14

#### Testing

- Improved cross-browser test stability
- Better test coverage for edge cases

#### Backend Improvements

- Refactored copilot functionality
- Added calendar enable flag
- Embedding table repair functionality
- Custom R2 jurisdictional endpoint support

## Previous Releases

For detailed release notes of previous versions, please visit:

- [AFFiNE Blog - Release Notes](https://affine.pro/blog?tag=Release%20Note)
- [GitHub Releases](https://github.com/toeverything/AFFiNE/releases)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information on how to contribute to AFFiNE.
