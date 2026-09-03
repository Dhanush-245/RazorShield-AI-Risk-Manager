"""Build a disclosed five-minute screenshot walkthrough using macOS say and FFmpeg.

This is not a continuous browser recording. No microphone or voice cloning is used.
Run after reviewing the synthetic screenshots and narration in docs/submission.
"""

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def duration(path: Path) -> float:
    return float(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "outputs/submission/razorshield-five-minute-draft.mp4",
    )
    args = parser.parse_args()
    for tool in ("say", "ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            parser.error(f"Required local tool unavailable: {tool}")
    if args.output.exists():
        parser.error("Output already exists; choose a new filename to preserve it")
    chapters = json.loads((ROOT / "docs/submission/demo-chapters.json").read_text())
    if sum(chapter["seconds"] for chapter in chapters) != 300:
        raise ValueError("Storyboard must total exactly 300 seconds")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="razorshield-video-"))
    files = []
    captions = []
    elapsed = 0
    for index, chapter in enumerate(chapters):
        audio = work / f"chapter-{index}.aiff"
        narration = work / f"narration-{index}.txt"
        narration.write_text(chapter["narration"])
        run("say", "-r", "155", "-o", str(audio), "-f", str(narration))
        if duration(audio) > chapter["seconds"] - 0.2:
            raise ValueError(f"Narration overruns chapter {index}; shorten the script")
        output = work / f"chapter-{index}.mp4"
        filters = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1"
        run(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-loop",
            "1",
            "-framerate",
            "10",
            "-i",
            str(ROOT / "docs/submission/screenshots" / chapter["image"]),
            "-i",
            str(audio),
            "-vf",
            filters,
            "-af",
            "apad",
            "-t",
            str(chapter["seconds"]),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(output),
        )
        files.append(output)
        end = elapsed + chapter["seconds"]
        captions.append(
            f"{index + 1}\n00:{elapsed // 60:02}:{elapsed % 60:02},000 --> "
            f"00:{end // 60:02}:{end % 60:02},000\n{chapter['title']}\n"
            "SYNTHETIC DEMO - Narrated screenshots, not continuous live capture\n\n"
        )
        elapsed = end
        print(f"Rendered chapter {index + 1}/{len(chapters)}", flush=True)
    playlist = work / "playlist.txt"
    playlist.write_text("".join(f"file '{path}'\n" for path in files))
    caption_file = args.output.with_suffix(".srt")
    caption_file.write_text("".join(captions))
    run(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(playlist),
        "-i",
        str(caption_file),
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-c:s",
        "mov_text",
        "-disposition:s:0",
        "default",
        "-metadata",
        "title=RazorShield - narrated synthetic screenshot walkthrough draft",
        "-movflags",
        "+faststart",
        str(args.output),
    )
    actual_duration = duration(args.output)
    if abs(actual_duration - 300) > 0.5:
        raise ValueError(f"Unexpected video duration: {actual_duration}")
    print(
        f"Draft ready: {args.output} ({actual_duration:.2f} seconds). Temporary render assets: {work}"
    )


if __name__ == "__main__":
    main()
