"""Add the original local synthetic voice to the caption-free operations recording."""

import argparse
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def probe(path):
    return json.loads(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            text=True,
        )
    )


def run(*args):
    subprocess.run(args, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--duration", type=int, default=300)
    parser.add_argument(
        "--fill-chapters",
        action="store_true",
        help="Gently stretch narration to fill each chapter and avoid trailing gaps.",
    )
    parser.add_argument(
        "--script",
        type=Path,
        default=ROOT / "docs/submission/RISK_OPERATIONS_NARRATION.md",
    )
    args = parser.parse_args()
    report = args.output.with_suffix(".json")
    if args.output.exists() or report.exists():
        parser.error("Choose a new output filename; existing artifacts are preserved")
    source = probe(args.video)
    if args.duration <= 0:
        parser.error("Duration must be positive")
    if abs(float(source["format"]["duration"]) - args.duration) > 0.1:
        parser.error(f"Expected a verified {args.duration}-second source")
    script = args.script.read_text()
    sections = []
    for sm, ss, em, es, title, text in re.findall(
        r"## (\d+):(\d+)–(\d+):(\d+) · ([^\n]+)\n\n“(.*?)”", script, re.DOTALL
    ):
        sections.append(
            {
                "start": int(sm) * 60 + int(ss),
                "end": int(em) * 60 + int(es),
                "title": title,
                "text": " ".join(text.split()),
            }
        )
    if not sections or sections[-1]["end"] != args.duration:
        raise ValueError(
            f"Expected contiguous narration sections covering {args.duration} seconds"
        )
    work = Path(tempfile.mkdtemp(prefix="razorshield-operations-audio-"))
    parts = []
    for index, section in enumerate(sections):
        if section["start"] != (sections[index - 1]["end"] if index else 0):
            raise ValueError("Noncontiguous narration")
        speech = section["text"].replace("AI", "A I").replace("Postgres", "Post gres")
        # macOS say's default voice is the original user's preferred synthetic voice.
        text_file, raw, part = (
            work / f"{index:02d}.txt",
            work / f"{index:02d}.aiff",
            work / f"{index:02d}.wav",
        )
        text_file.write_text(speech)
        available = section["end"] - section["start"] - 0.8
        rate = 155
        for _ in range(4):
            run("say", "-r", str(rate), "-f", str(text_file), "-o", str(raw))
            duration = float(probe(raw)["format"]["duration"])
            if duration <= available:
                break
            rate = math.ceil(rate * duration / available) + 2
            if rate > 200:
                raise ValueError(
                    f"Shorten narration in chapter {index + 1}; exceeds natural pace"
                )
        else:
            raise ValueError(f"Narration does not fit chapter {index + 1}")
        audio_filter = "adelay=350,apad"
        rendered_duration = duration
        if args.fill_chapters:
            rendered_duration = available
            tempo = duration / rendered_duration
            if not 0.5 <= tempo <= 2:
                raise ValueError(
                    f"Chapter {index + 1} cannot be stretched at a natural pace"
                )
            audio_filter = f"atempo={tempo:.8f},adelay=350,apad"
        run(
            "ffmpeg",
            "-v",
            "error",
            "-n",
            "-i",
            str(raw),
            "-af",
            audio_filter,
            "-t",
            str(section["end"] - section["start"]),
            "-ar",
            "48000",
            "-ac",
            "1",
            str(part),
        )
        section.update(
            rate=rate,
            spokenSeconds=duration,
            renderedSpeechSeconds=rendered_duration,
        )
        parts.append(part)
        print(
            f"Narration {index + 1}/{len(sections)}: {duration:.1f}s at {rate} wpm",
            flush=True,
        )
    concat = work / "concat.txt"
    concat.write_text("\n".join(f"file '{part}'" for part in parts))
    narration = work / "narration.wav"
    run(
        "ffmpeg",
        "-v",
        "error",
        "-n",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat),
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar",
        "48000",
        "-ac",
        "1",
        str(narration),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    run(
        "ffmpeg",
        "-v",
        "error",
        "-n",
        "-i",
        str(args.video),
        "-i",
        str(narration),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        str(args.duration),
        "-movflags",
        "+faststart",
        str(args.output),
    )
    report.write_text(
        json.dumps(
            {
                "voice": "macOS default (original synthetic voice setting)",
                "aiNarrated": True,
                "bottomCaptions": False,
                "source": str(args.video),
                "sections": sections,
                "output": probe(args.output),
            },
            indent=2,
        )
    )
    print(args.output)


if __name__ == "__main__":
    main()
