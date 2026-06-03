import Hls from 'hls.js';
import * as THREE from 'three';

type PrepareStatus = {
  state?: string;
  status?: string;
  message?: string;
  error?: string;
  progress?: number | null;
};

const POLL_INTERVAL_MS = 1_000;

export function getAssetIdFromPath(pathname: string): string | null {
  const assetId = pathname.split('/').filter(Boolean).at(-1);

  if (!assetId || assetId === 'view') {
    return null;
  }

  return assetId ?? null;
}

export function formatPrepareStatus(status: PrepareStatus): string {
  const message = status.message ?? 'Preparing viewer...';

  if (typeof status.progress === 'number') {
    return `${message} (${Math.round(status.progress * 100)}%)`;
  }

  return message;
}

function getViewerToken(): string | undefined {
  return new URLSearchParams(window.location.search).get('token')?.trim() || undefined;
}

function viewerTokenHeaders(viewerToken: string | undefined): HeadersInit | undefined {
  return viewerToken ? { 'X-Viewer-Token': viewerToken } : undefined;
}

function getRequiredElement<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const element = document.getElementById(id);

  if (!(element instanceof type)) {
    throw new Error(`Missing #${id} element`);
  }

  return element;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchJson<T>(url: string, viewerToken: string | undefined): Promise<T> {
  const response = await fetch(url, { headers: viewerTokenHeaders(viewerToken) });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function prepare(
  assetId: string,
  statusElement: HTMLElement,
  viewerToken: string | undefined,
): Promise<void> {
  const prepareResponse = await fetch(`/api/assets/${encodeURIComponent(assetId)}/prepare`, {
    method: 'POST',
    headers: viewerTokenHeaders(viewerToken),
  });

  if (!prepareResponse.ok) {
    throw new Error(`Prepare failed: ${prepareResponse.status} ${prepareResponse.statusText}`);
  }

  for (;;) {
    const status = await fetchJson<PrepareStatus>(
      `/api/assets/${encodeURIComponent(assetId)}/status`,
      viewerToken,
    );
    const state = status.state ?? status.status;

    statusElement.textContent = formatPrepareStatus(status);

    if (state === 'ready') {
      return;
    }

    if (state === 'failed') {
      throw new Error(status.error ?? 'Asset preparation failed');
    }

    await delay(POLL_INTERVAL_MS);
  }
}

function attachHls(assetId: string, video: HTMLVideoElement, viewerToken: string | undefined): void {
  const streamUrl = `/stream/${encodeURIComponent(assetId)}/master.m3u8`;

  video.muted = true;
  video.autoplay = true;

  if (Hls.isSupported()) {
    const hls = new Hls({
      xhrSetup(xhr) {
        if (viewerToken) {
          xhr.setRequestHeader('X-Viewer-Token', viewerToken);
        }
      },
    });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
  } else {
    const tokenQuery = viewerToken ? `?token=${encodeURIComponent(viewerToken)}` : '';
    video.src = `${streamUrl}${tokenQuery}`;
  }

  video.addEventListener(
    'loadedmetadata',
    () => {
      void video.play();
    },
    { once: true },
  );
}

function renderSphere(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1_100);
  const texture = new THREE.VideoTexture(video);
  const geometry = new THREE.SphereGeometry(500, 60, 40);

  geometry.scale(-1, 1, 1);

  const material = new THREE.MeshBasicMaterial({ map: texture });
  const sphere = new THREE.Mesh(geometry, material);

  scene.add(sphere);

  let lon = 0;
  let lat = 0;
  let isPointerDown = false;
  let pointerX = 0;
  let pointerY = 0;
  let pointerLon = 0;
  let pointerLat = 0;

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener('pointerdown', (event) => {
    isPointerDown = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerLon = lon;
    pointerLat = lat;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!isPointerDown) {
      return;
    }

    lon = (pointerX - event.clientX) * 0.1 + pointerLon;
    lat = (event.clientY - pointerY) * 0.1 + pointerLat;
  });

  canvas.addEventListener('pointerup', (event) => {
    isPointerDown = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  window.addEventListener('resize', resize);
  resize();

  function animate(): void {
    lat = Math.max(-85, Math.min(85, lat));

    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    const target = new THREE.Vector3(
      500 * Math.sin(phi) * Math.cos(theta),
      500 * Math.cos(phi),
      500 * Math.sin(phi) * Math.sin(theta),
    );

    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(animate);
}

async function startViewer(): Promise<void> {
  const statusElement = getRequiredElement('status', HTMLDivElement);
  const video = getRequiredElement('video', HTMLVideoElement);
  const canvas = getRequiredElement('scene', HTMLCanvasElement);
  const assetId = getAssetIdFromPath(window.location.pathname);
  const viewerToken = getViewerToken();

  if (!assetId) {
    statusElement.textContent = 'No asset ID provided.';
    throw new Error('No asset ID provided');
  }

  try {
    await prepare(assetId, statusElement, viewerToken);
    statusElement.style.display = 'none';
    video.style.display = 'block';
    attachHls(assetId, video, viewerToken);
    renderSphere(video, canvas);
  } catch (error) {
    statusElement.style.display = 'block';
    statusElement.textContent = error instanceof Error ? error.message : 'Viewer failed to start.';
  }
}

if (typeof document !== 'undefined') {
  void startViewer();
}
