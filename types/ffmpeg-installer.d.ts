declare module '@ffmpeg-installer/ffmpeg' {
  const ffmpeg: {
    readonly path: string;
    readonly version: string;
  };
  export = ffmpeg;
}

declare module '@ffprobe-installer/ffprobe' {
  const ffprobe: {
    readonly path: string;
    readonly version: string;
  };
  export = ffprobe;
}

