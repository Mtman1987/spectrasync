import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

export interface ConvertMp4ToGifOptions {
  /** Target width for the generated GIF. Defaults to 240 pixels. */
  width?: number
  /** Target height for the generated GIF. Defaults to 135 pixels. */
  height?: number
  /** Frames per second for the GIF animation. Defaults to 15 fps. */
  fps?: number
  /** Loop behaviour for the GIF. `0` = infinite loop. */
  loop?: number
}

export interface ConvertMp4ToGifResult {
  /** Absolute path to the generated GIF file. */
  outputPath: string
  /** Duration of the source clip in seconds, if provided by the API. */
  durationSeconds: number
  /** Additional metadata returned by the conversion API, if any. */
  metadata: Record<string, unknown> | null
}

const DEFAULT_WIDTH = 240
const DEFAULT_HEIGHT = 135
const DEFAULT_FPS = 15
const DEFAULT_LOOP = 0

async function ensureDirectoryForFile(filePath: string) {
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true })
}

function resolveShotstackConfig() {
  const baseUrl =
    process.env.SHOTSTACK_API_BASE_URL ??
    process.env.SHOTSTOCK_API_BASE_URL ??
    process.env.SHOTSTACK_API_URL ??
    null
  const apiKey =
    process.env.SHOTSTACK_API_KEY ??
    process.env.SHOTSTOCK_API_KEY ??
    process.env.SHOTSTACK_KEY ??
    null

  if (!baseUrl || !apiKey) {
    throw new Error('Shotstack API credentials are not configured. Set SHOTSTACK_API_BASE_URL and SHOTSTACK_API_KEY.')
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

async function requestShotstackConversion(payload: Record<string, unknown>) {
  const { baseUrl, apiKey } = resolveShotstackConfig()

  const response = await fetch(`${baseUrl}/convert/mp4-to-gif`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Shotstack API error ${response.status}: ${body}`)
  }

  return (await response.json()) as {
    gifBase64?: string
    durationSeconds?: number
    metadata?: Record<string, unknown>
  }
}

export async function convertMp4ToGif(
  inputPath: string,
  outputPath: string,
  options: ConvertMp4ToGifOptions = {},
): Promise<ConvertMp4ToGifResult> {
  const { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, fps = DEFAULT_FPS, loop = DEFAULT_LOOP } = options

  const inputBuffer = await readFile(inputPath)

  const response = await requestShotstackConversion({
    input: inputBuffer.toString('base64'),
    inputFileName: path.basename(inputPath),
    outputFileName: path.basename(outputPath),
    options: { width, height, fps, loop },
  })

  if (!response.gifBase64) {
    throw new Error('Shotstack API response did not include a GIF payload.')
  }

  const gifBuffer = Buffer.from(response.gifBase64, 'base64')

  await ensureDirectoryForFile(outputPath)
  await writeFile(outputPath, gifBuffer)

  return {
    outputPath: path.resolve(outputPath),
    durationSeconds: response.durationSeconds ?? 0,
    metadata: response.metadata ?? null,
  }
}
