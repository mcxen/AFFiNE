# AFFiNE Electron App

## Features

### Local MCP Server

The desktop app includes a built-in MCP (Model Context Protocol) server that enables AI assistants to interact with your AFFiNE workspaces and documents. Enable it in workspace settings under "Integrations > MCP Server".

### BYOK AI Support

Bring Your Own Key (BYOK) allows you to configure custom AI providers using your own API keys. Access this feature in workspace settings under the "BYOK" section.

### Local-first Storage

All data is stored locally in SQLite databases on your machine, with optional cloud sync for collaboration.

## Development

To run AFFiNE Desktop Client Application locally, run the following commands:

```sh
# in repo root
yarn install
yarn affine @affine/native build
yarn dev

# in packages/frontend/apps/electron
yarn generate-assets
yarn dev # or yarn prod for production build
```

## Troubleshooting

If you have trouble building electron during `yarn install`, try setting mirror environment variable:

```sh
export ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"
```

## Credits

Most of the boilerplate code is generously borrowed from the following

- [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder)
- [Turborepo basic example](https://github.com/vercel/turborepo/tree/main/examples/basic)
- [yerba](https://github.com/t3dotgg/yerba)
