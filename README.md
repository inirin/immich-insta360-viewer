# Immich Insta360 Viewer

Browser-based 360 `.insv` viewer for Immich.

This project provides a Docker helper service and a Chrome/Edge extension. The extension adds a context-menu action on Immich asset pages, and the helper downloads 360 `.insv` originals through the Immich API, caches the original as a seekable file, converts it to HLS with `ffmpeg`, and serves a WebGL 360 viewer.

This is for Insta360 360 video media, not every media file produced by Insta360 cameras.

## Features

- Chrome/Edge context-menu integration for Immich assets.
- Browser-hosted 360 viewer for dual-lens 360 `.insv` videos.
- Byte-based download progress and ffmpeg duration-based conversion progress from 0% to 100%.
- Seekable-file conversion path for `.insv`; no stdin streaming fallback path.
- Immich API-only original download.
- No Insta360 SDK required.
- No Immich media-library volume mount required.
- Optional ffmpeg hardware encoder configuration.
- Optional viewer token protection for helper API and streams.

## Requirements

- Docker or Docker Compose.
- Immich v2.0.0 or newer, reachable from the helper container.
- Immich API key.
- Chrome or Edge for the extension.
- Node.js 22 and pnpm 10.5.2 only if building the extension locally.

## Compatibility

- Supported Immich versions: v2.0.0 or newer.
- Tested with Immich Server v2.7.5.
- Required Immich API features:
  - API key authentication.
  - `GET /api/assets/{id}` for asset metadata.
  - `GET /api/assets/{id}/original` for original file download.
- Older Immich v1.x releases may work if they expose the same API behavior, but they are not part of the supported compatibility target.

## Supported Media

- Supported: Immich `VIDEO` assets with a `.insv` original file and at least two video streams, which is the expected layout for dual-lens Insta360 360 captures.
- Not supported: non-360 Insta360 clips, single-lens action-camera clips, photos, `.insp` files, already-stitched MP4 files, or other camera formats.
- The helper does not use the Insta360 SDK, so projection and stitching quality may differ from Insta360 Studio.

## Quick Start

### 1. Run The Helper

PowerShell:

```powershell
$env:IMMICH_API_KEY = "your-immich-api-key"
$env:VIEWER_TOKEN = "choose-a-random-viewer-token"

docker run -d `
  --name immich-insta360-viewer-helper `
  --restart unless-stopped `
  -p 127.0.0.1:3560:3560 `
  -e IMMICH_URL=http://host.docker.internal:2283 `
  -e IMMICH_API_KEY=$env:IMMICH_API_KEY `
  -e VIEWER_TOKEN=$env:VIEWER_TOKEN `
  -e FFMPEG_ENCODER=libx264 `
  -e FFMPEG_PRESET=superfast `
  -v insta360-viewer-cache:/cache `
  ghcr.io/inirin/immich-insta360-viewer-helper:latest
```

Bash:

```sh
export IMMICH_API_KEY="your-immich-api-key"
export VIEWER_TOKEN="choose-a-random-viewer-token"

docker run -d \
  --name immich-insta360-viewer-helper \
  --restart unless-stopped \
  -p 127.0.0.1:3560:3560 \
  -e IMMICH_URL=http://host.docker.internal:2283 \
  -e IMMICH_API_KEY="$IMMICH_API_KEY" \
  -e VIEWER_TOKEN="$VIEWER_TOKEN" \
  -e FFMPEG_ENCODER=libx264 \
  -e FFMPEG_PRESET=superfast \
  -v insta360-viewer-cache:/cache \
  ghcr.io/inirin/immich-insta360-viewer-helper:latest
```

Keep the helper bound to `127.0.0.1` unless you put it behind your own authenticated reverse proxy.

### 2. Verify Helper Health

```sh
curl http://localhost:3560/health
```

Expected:

```json
{"status":"ok","version":"0.1.6"}
```

### 3. Install The Extension

Download `immich-insta360-viewer-extension.zip` from the latest release:

https://github.com/inirin/immich-insta360-viewer/releases/latest

Unzip it, then:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. Click "Load unpacked".
4. Select the unzipped extension folder.
5. Open the extension options.
6. Set Helper URL to `http://localhost:3560`.
7. Set Viewer Token to the same value as `VIEWER_TOKEN`.

## Docker Compose

Clone the repository:

```sh
git clone https://github.com/inirin/immich-insta360-viewer.git
cd immich-insta360-viewer
```

Create `.env`:

```sh
cp .env.example .env
```

Edit `.env`, then run:

```sh
docker compose up -d
```

If you merge the helper into the same Compose project/network as Immich, `IMMICH_URL` can usually be:

```text
http://immich-server:2283
```

## Usage

1. Open Immich in Chrome or Edge.
2. Open an `.insv` video asset page.
3. Right-click the page, image, video, or link.
4. Choose the Insta360 viewer context-menu item.
5. The helper prepares the clip and opens:

```text
http://localhost:3560/view/<immich-asset-id>?token=<viewer-token>
```

The first run downloads and processes the original `.insv`, so it can take a while. Later opens reuse the helper cache. The viewer includes its own play/pause and seek controls.

## Performance

- First run uses a single no-fallback path: download the original `.insv` through the Immich API, cache it under `/cache`, then convert the seekable cached file to HLS.
- Download progress is based on downloaded bytes when Immich sends `Content-Length`; this maps to 0-30%.
- Conversion progress is based on ffmpeg processed timestamp divided by asset duration; this maps to 30-95%.
- Ready state is reported as 100%.
- `FFMPEG_ENCODER` defaults to `libx264`.
- `FFMPEG_PRESET` defaults to `superfast`; use `veryfast` for smaller cache files or `ultrafast` for faster conversion with much larger cache files.
- GPU acceleration can be enabled by setting a hardware encoder such as `h264_nvenc`, but the container host must expose that encoder to Docker.

NVIDIA example:

```sh
docker run -d \
  --name immich-insta360-viewer-helper \
  --restart unless-stopped \
  --gpus all \
  -p 127.0.0.1:3560:3560 \
  -e IMMICH_URL=http://host.docker.internal:2283 \
  -e IMMICH_API_KEY="$IMMICH_API_KEY" \
  -e VIEWER_TOKEN="$VIEWER_TOKEN" \
  -e FFMPEG_ENCODER=h264_nvenc \
  -e FFMPEG_PRESET=p1 \
  -v insta360-viewer-cache:/cache \
  ghcr.io/inirin/immich-insta360-viewer-helper:latest
```

There is no automatic encoder fallback. If `h264_nvenc` or another configured hardware encoder is unavailable, preparation fails so the configuration problem is visible.

## Build From Source

Build the helper image locally:

```sh
docker build -f docker/Dockerfile.helper -t immich-insta360-viewer-helper:dev .
```

Build the extension locally:

```sh
npx pnpm@10.5.2 install
npx pnpm@10.5.2 --filter @immich-insta360-viewer/extension build
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

- MVP supports dual-lens 360 `.insv` videos only.
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
