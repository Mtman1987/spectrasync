import { AttachmentBuilder, type MessageCreateOptions } from 'discord.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { PassThrough } from 'stream';

import { getTwitchClips } from './twitch-actions';
import { getSettings } from '@/app/settings/actions';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface TwitchClipSummary {
  id?: string;
  url?: string;
  thumbnail_url?: string;
  duration?: number;
  title?: string;
}

interface GifConversionOptions {
  fps?: number;
  width?: number;
  loop?: number;
  durationSeconds?: number;
}

const DEFAULT_CLIP_FETCH_LIMIT = 5;
const GIF_WIDTH = parsePositiveIntegerEnv('CLIP_GIF_WIDTH', 480);
const GIF_FPS = parsePositiveIntegerEnv('CLIP_GIF_FPS', 15);
const GIF_LOOP = parseNonNegativeIntegerEnv('CLIP_GIF_LOOP', 0);
const GIF_MAX_DURATION = parsePositiveNumberEnv('CLIP_GIF_MAX_DURATION_SECONDS');

type ResolvedGifConfig = {
  width: number;
  fps: number;
  loop: number;
  maxDurationSeconds?: number;
};

export async function buildClipGifMessageOptions(
  broadcasterId: string,
  guildId?: string
): Promise<MessageCreateOptions | null> {
  const clips = (await getTwitchClips(broadcasterId, DEFAULT_CLIP_FETCH_LIMIT)) as TwitchClipSummary[];
  if (!Array.isArray(clips) || clips.length === 0) {
    return null;
  }

  const candidates = clips.filter((clip) => typeof clip?.thumbnail_url === 'string' && clip.thumbnail_url.length > 0);
  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  if (!selected.thumbnail_url) {
    return null;
  }

  let downloadUrl: string;
  try {
    downloadUrl = deriveDownloadUrl(selected.thumbnail_url);
  } catch (error) {
    console.error('Failed to derive clip download URL:', error);
    return null;
  }

  const durationFromClip = extractPositiveNumber(selected.duration);
  const gifConfig = await resolveGifConfiguration(guildId);

  let durationSeconds: number | undefined = durationFromClip;
  if (typeof gifConfig.maxDurationSeconds === 'number') {
    durationSeconds = durationFromClip
      ? Math.min(durationFromClip, gifConfig.maxDurationSeconds)
      : gifConfig.maxDurationSeconds;
  }

  let gifBuffer: Buffer;
  try {
    gifBuffer = await convertClipUrlToGifBuffer(downloadUrl, {
      fps: gifConfig.fps,
      width: gifConfig.width,
      loop: gifConfig.loop,
      durationSeconds,
    });
  } catch (error) {
    console.error('Failed to convert Twitch clip to GIF:', error);
    return null;
  }

  const attachment = new AttachmentBuilder(gifBuffer, {
    name: `${selected.id ?? `clip-${Date.now()}`}.gif`,
    description: selected.title,
  });

  const message: MessageCreateOptions = {
    files: [attachment],
  };

  const content = deriveClipShareUrl(selected);
  if (content) {
    message.content = content;
  }

  return message;
}

function deriveClipShareUrl(clip: TwitchClipSummary): string | null {
  if (clip.url && clip.url.trim().length > 0) {
    return clip.url;
  }

  if (clip.id && clip.id.trim().length > 0) {
    return `https://clips.twitch.tv/${clip.id}`;
  }

  return null;
}

function deriveDownloadUrl(thumbnailUrl: string): string {
  const [base] = thumbnailUrl.split('?');
  const candidate = base.replace(/-preview-.*\.(jpg|jpeg|png)$/i, '.mp4');
  if (!candidate.endsWith('.mp4')) {
    throw new Error(`Unable to derive clip download URL from thumbnail: ${thumbnailUrl}`);
  }
  return candidate;
}

async function convertClipUrlToGifBuffer(clipUrl: string, options: GifConversionOptions = {}): Promise<Buffer> {
  const { fps = 15, width = 480, loop = 0, durationSeconds } = options;
  const buffers: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(clipUrl)
      .outputOptions([
        '-vf',
        `fps=${fps},scale=${width}:-1:flags=lanczos`,
        '-loop',
        String(loop),
      ])
      .toFormat('gif')
      .on('error', (error: Error) => reject(error));

    if (durationSeconds && durationSeconds > 0) {
      command.outputOptions(['-t', durationSeconds.toFixed(3)]);
    }

    const stream = command.pipe(new PassThrough());
    stream.on('data', (chunk: Buffer) => buffers.push(Buffer.from(chunk)));
    stream.on('end', () => resolve());
    stream.on('error', (error: Error) => reject(error));
  });

  return Buffer.concat(buffers);
}

async function resolveGifConfiguration(guildId?: string): Promise<ResolvedGifConfig> {
  const defaults: ResolvedGifConfig = {
    width: GIF_WIDTH,
    fps: GIF_FPS,
    loop: GIF_LOOP,
    maxDurationSeconds: GIF_MAX_DURATION,
  };

  if (!guildId) {
    return defaults;
  }

  try {
    const settings = await getSettings(guildId);
    const width = sanitizePositiveInteger(settings.clipGifWidth, defaults.width);
    const fps = sanitizePositiveInteger(settings.clipGifFps, defaults.fps);
    const loop = sanitizeNonNegativeInteger(settings.clipGifLoop, defaults.loop);
    const maxDuration = sanitizeNonNegativeNumber(settings.clipGifMaxDurationSeconds);

    return {
      width,
      fps,
      loop,
      maxDurationSeconds: maxDuration ?? defaults.maxDurationSeconds,
    };
  } catch (error) {
    console.error('Failed to load clip GIF settings for guild', guildId, error);
    return defaults;
  }
}

function parsePositiveIntegerEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected ${key} to be a positive integer, received "${raw}".`);
  }

  return parsed;
}

function parseNonNegativeIntegerEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected ${key} to be a non-negative integer, received "${raw}".`);
  }

  return parsed;
}

function parsePositiveNumberEnv(key: string): number | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected ${key} to be a positive number, received "${raw}".`);
  }

  return parsed;
}

function extractPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function sanitizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return fallback;
}

function sanitizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return fallback;
}

function sanitizeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value > 0 ? value : undefined;
}

