import { describe, expect, it } from "vitest";
import { parseSilenceDetectOutput } from "@/lib/reels/silenceDetect";

describe("parseSilenceDetectOutput", () => {
  it("parses a realistic ffmpeg silencedetect stderr transcript", () => {
    const stderr = `
ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers
  built with gcc 12.2.0
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input.mov':
  Duration: 00:00:12.50, start: 0.000000, bitrate: 2048 kb/s
[silencedetect @ 0x7f8e1b004a00] silence_start: 4.012
[silencedetect @ 0x7f8e1b004a00] silence_end: 6.231 | silence_duration: 2.219
[silencedetect @ 0x7f8e1b004a00] silence_start: 9.500
[silencedetect @ 0x7f8e1b004a00] silence_end: 10.100 | silence_duration: 0.600
video:0kB audio:195kB subtitle:0kB other streams:0kB global headers:0kB
`;
    expect(parseSilenceDetectOutput(stderr)).toEqual([
      { startMs: 4012, endMs: 6231 },
      { startMs: 9500, endMs: 10100 },
    ]);
  });

  it("returns an empty list when ffmpeg finds no silence", () => {
    const stderr = `
Input #0, wav, from 'input.wav':
  Duration: 00:00:05.00, bitrate: 1411 kb/s
size=       0kB time=00:00:05.00 bitrate=   0.0kbits/s speed= 200x
`;
    expect(parseSilenceDetectOutput(stderr)).toEqual([]);
  });

  it("drops a dangling silence_start with no matching silence_end (conservative: under-cuts, never over-cuts)", () => {
    const stderr = `
[silencedetect @ 0x1] silence_start: 1.000
[silencedetect @ 0x1] silence_end: 2.000 | silence_duration: 1.000
[silencedetect @ 0x1] silence_start: 8.000
`;
    expect(parseSilenceDetectOutput(stderr)).toEqual([{ startMs: 1000, endMs: 2000 }]);
  });

  it("rounds fractional seconds to the nearest millisecond", () => {
    const stderr = `
[silencedetect @ 0x1] silence_start: 1.23456
[silencedetect @ 0x1] silence_end: 2.6789
`;
    expect(parseSilenceDetectOutput(stderr)).toEqual([{ startMs: 1235, endMs: 2679 }]);
  });
});
