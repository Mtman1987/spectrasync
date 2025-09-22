import path from "node:path"
import { mkdir } from "node:fs/promises"
import ffmpeg, { type FfprobeData } from "fluent-ffmpeg"
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg"

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const dynamicRequire = typeof module !== "undefined" && module.require ? module.require.bind(module) : (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return Function("return require")()
  } catch {
    return null
  }
})()

const ffprobeInstaller = dynamicRequire ? dynamicRequire('@ffprobe-installer/ffprobe') as { path: string } | null : null

if (ffprobeInstaller?.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path)
} else {
  console.warn('[convertVideoToGif] FFprobe binary not available. Some metadata features may be limited.')
}

export interface ConvertMp4ToGifOptions {
  /**
   * Target width for the generated GIF. Defaults to 240 pixels.
   */
  width?: number
  /**
   * Target height for the generated GIF. Defaults to 135 pixels.
   */
  height?: number
  /**
   * Frames per second for the GIF animation. Defaults to 15 fps to balance
   * fidelity and file size.
   */
  fps?: number
  /**
   * Loop behaviour for the GIF. `0` means loop infinitely which matches Discord
   * expectations for animated content.
   */
  loop?: number
}

export interface ConvertMp4ToGifResult {
  /** Absolute path to the generated GIF file. */
  outputPath: string
  /** Duration of the source clip in seconds. */
  durationSeconds: number
  /** Raw ffprobe metadata for callers that need more context. */
  metadata: FfprobeData
}

const DEFAULT_WIDTH = 240
const DEFAULT_HEIGHT = 135
const DEFAULT_FPS = 15
const DEFAULT_LOOP = 0

async function ensureDirectoryForFile(filePath: string) {
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true })
}

async function probeVideo(source: string): Promise<FfprobeData> {
  return await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(source, (error: unknown, data: FfprobeData) => {
      if (error) {
        reject(error)
        return
      }

      resolve(data)
    })
  })
}

export async function convertMp4ToGif(
  inputPath: string,
  outputPath: string,
  options: ConvertMp4ToGifOptions = {},
): Promise<ConvertMp4ToGifResult> {
  const { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, fps = DEFAULT_FPS, loop = DEFAULT_LOOP } = options

  const metadata = await probeVideo(inputPath)

  await ensureDirectoryForFile(outputPath)

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .noAudio()
      .outputOptions([
        "-vf",
        `fps=${fps},scale=${width}:${height}:flags=lanczos`,
        "-loop",
        String(loop),
      ])
      .toFormat("gif")
      .on("error", (error: Error) => {
        reject(error)
      })
      .on("end", () => {
        resolve()
      })
      .save(outputPath)
  })

  return {
    outputPath: path.resolve(outputPath),
    durationSeconds: metadata.format?.duration ?? 0,
    metadata,
  }
}
