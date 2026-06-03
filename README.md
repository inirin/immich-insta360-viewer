# Immich Insta360 Viewer

Browser-based Insta360 `.insv` viewer for Immich.

This project provides a Docker helper service and a Chrome/Edge extension. The extension adds a context-menu action on Immich asset pages, and the helper downloads `.insv` originals through the Immich API, converts them to HLS with `ffmpeg`, and serves a WebGL 360 viewer.

## Features

- Chrome/Edge context-menu integration for Immich assets.
- Browser-hosted 360 viewer for `.insv` videos.
- Immich API-only original download.
- No Insta360 SDK required.
- No Immich media-library volume mount required.
- Optional viewer token protection for helper API and streams.

## Requirements

- Docker or Docker Compose.
- Immich server reachable from the helper container.
- Immich API key.
- Chrome or Edge for the extension.
- Node.js 22 and pnpm 10.5.2 only if building the extension locally.

## Quick Start

### 1. Clone The Repository

```sh
git clone https://github.com/inirin/immich-insta360-viewer.git
cd immich-insta360-viewer
```

### 2. Build The Helper Image

```sh
docker build -f docker/Dockerfile.helper -t immich-insta360-viewer-helper:dev .
```

### 3. Create Secrets In Your Shell

Use your own values. Do not commit these values to git.

PowerShell:

```powershell
$env:IMMICH_API_KEY = "your-immich-api-key"
$env:VIEWER_TOKEN = "choose-a-random-viewer-token"
```

Bash:

```sh
export IMMICH_API_KEY="your-immich-api-key"
export VIEWER_TOKEN="choose-a-random-viewer-token"
```

### 4. Run The Helper

If Immich is reachable from Docker through `host.docker.internal`:

```sh
docker run -d \
  --name immich-insta360-viewer-helper \
  --restart unless-stopped \
  -p 127.0.0.1:3560:3560 \
  -e IMMICH_URL=http://host.docker.internal:2283 \
  -e IMMICH_API_KEY="$IMMICH_API_KEY" \
  -e VIEWER_TOKEN="$VIEWER_TOKEN" \
  -v insta360-viewer-cache:/cache \
  immich-insta360-viewer-helper:dev
```

If you merge the helper into the same Compose project/network as Immich, `IMMICH_URL` can usually be:

```text
http://immich-server:2283
```

Keep the helper bound to `127.0.0.1` unless you put it behind your own authenticated reverse proxy.

### 5. Verify Helper Health

```sh
curl http://localhost:3560/health
```

Expected:

```json
{"status":"ok","version":"0.1.0"}
```

### 6. Build And Load The Extension

```sh
npx pnpm@10.5.2 --filter @immich-insta360-viewer/extension build
```

Then:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Click "Load unpacked".
4. Select `apps/extension/dist`.
5. Open the extension options.
6. Set Helper URL to `http://localhost:3560`.
7. Set Viewer Token to the same value as `VIEWER_TOKEN`.

## Usage

1. Open Immich in Chrome or Edge.
2. Open an `.insv` video asset page.
3. Right-click the page, image, video, or link.
4. Choose the Insta360 viewer context-menu item.
5. The helper prepares the clip and opens:

```text
http://localhost:3560/view/<immich-asset-id>?token=<viewer-token>
```

The first run downloads and processes the original `.insv`, so it can take a while. Later opens reuse the helper cache.

## Docker Compose Example

You can adapt `compose.example.yml`:

```yaml
services:
  insta360-viewer-helper:
    build:
      context: .
      dockerfile: docker/Dockerfile.helper
    environment:
      IMMICH_URL: http://immich-server:2283
      IMMICH_API_KEY: ${IMMICH_API_KEY}
      VIEWER_TOKEN: ${VIEWER_TOKEN}
      CACHE_DIR: /cache
      CACHE_MAX_GB: 20
      CACHE_TTL_HOURS: 72
      PORT: 3560
    volumes:
      - insta360-viewer-cache:/cache
    ports:
      - "127.0.0.1:3560:3560"

volumes:
  insta360-viewer-cache:
```

Run:

```sh
docker compose -f compose.example.yml up -d --build
```

## Manual Verification

Prepare a known Immich asset ID:

```sh
curl -X POST \
  -H "X-Viewer-Token: $VIEWER_TOKEN" \
  http://localhost:3560/api/assets/<asset-id>/prepare
```

Check status:

```sh
curl -H "X-Viewer-Token: $VIEWER_TOKEN" \
  http://localhost:3560/api/assets/<asset-id>/status
```

Check the HLS playlist:

```sh
curl -H "X-Viewer-Token: $VIEWER_TOKEN" \
  http://localhost:3560/stream/<asset-id>/master.m3u8
```

Open the viewer:

```text
http://localhost:3560/view/<asset-id>?token=<viewer-token>
```

## Security Notes

- The helper holds an Immich API key.
- Do not expose helper port `3560` directly to the internet or LAN.
- Use `VIEWER_TOKEN` for normal use.
- Keep the default port binding as `127.0.0.1:3560:3560`.
- Do not commit real API keys or viewer tokens.

## Limitations

- MVP supports `.insv` videos only.
- MVP uses `ffmpeg`, not the Insta360 SDK.
- Projection quality may differ from Insta360 Studio.
- Cache files are stored under `/cache` and can consume disk space.
- `CACHE_MAX_GB` and `CACHE_TTL_HOURS` are configuration values reserved for future cache policy; the current MVP mainly uses `/cache`.

## GitHub Publishing Checklist

Before publishing:

```sh
npx pnpm@10.5.2 install
npx pnpm@10.5.2 -r lint
npx pnpm@10.5.2 -r test
npx pnpm@10.5.2 -r build
docker build -f docker/Dockerfile.helper -t immich-insta360-viewer-helper:dev .
```

Recommended first release artifacts:

- Source repository.
- Built extension zip from `apps/extension/dist`.
- Optional Docker image pushed to a registry.

Create an extension zip:

PowerShell:

```powershell
Compress-Archive -Path apps/extension/dist/* -DestinationPath immich-insta360-viewer-extension.zip -Force
```

Bash:

```sh
(cd apps/extension/dist && zip -r ../../../immich-insta360-viewer-extension.zip .)
```
