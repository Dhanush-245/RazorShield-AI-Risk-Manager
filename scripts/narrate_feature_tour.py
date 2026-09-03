"""Add disclosed local synthesized narration to the existing live feature tour.

Preserves all existing outputs. No microphone, voice cloning, cloud API or
application changes. macOS say synthesizes chapter audio; FFmpeg copies video.
"""

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from itertools import pairwise
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def probe(path: Path) -> dict:
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


def chapters(script: str) -> list[dict]:
    pattern = r"## (\d+):(\d+)–(\d+):(\d+) · ([^\n]+)\n\n“(.*?)”"
    result = []
    for match in re.finditer(pattern, script, re.DOTALL):
        start_m, start_s, end_m, end_s, title, text = match.groups()
        result.append(
            {
                "start": int(start_m) * 60 + int(start_s),
                "end": int(end_m) * 60 + int(end_s),
                "title": title,
                "text": " ".join(text.split()),
            }
        )
    if len(result) != 22 or result[0]["start"] != 0 or result[-1]["end"] != 300:
        raise ValueError("Expected 22 timed narration sections covering five minutes")
    for previous, current in pairwise(result):
        if previous["end"] != current["start"]:
            raise ValueError("Narration sections must be contiguous")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--voice",
        default="Rishi",
        help="macOS voice name, or 'default' for the original draft's voice setting",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT
        / "outputs/submission/razorshield-authentication-feature-tour-narrated.mp4",
    )
    args = parser.parse_args()
    for tool in ("say", "ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            parser.error(f"Missing required local tool: {tool}")
    report = args.output.with_suffix(".json")
    if args.output.exists() or report.exists():
        parser.error("Output already exists; choose another filename to preserve it")
    video = ROOT / "outputs/submission/razorshield-authentication-feature-tour.mp4"
    if abs(float(probe(video)["format"]["duration"]) - 300) > 0.1:
        parser.error("Input must be the verified five-minute live recording")
    sections = chapters((ROOT / "docs/submission/LIVE_TOUR_NARRATION.md").read_text())
    sections[0]["text"] = (
        "This is an AI narrated demo of RazorShield AI, for Track Two: AI Risk Manager. "
        "Merchants need more than a red score. They need to know what happened, who paid whom, "
        "and what to check next. Let's start at login, using fictional data and four permission levels."
    )
    sections[-1]["text"] = (
        "What broke? Postgres created the user role enum twice. "
        "We disabled SQLAlchemy's implicit creation, retaining lifecycle checks. "
        "Tests cover fresh and existing databases, preserved users, and downgrades. "
        "Local checks pass; remote CI needs another run. The repository is public. "
    )
    # Short spoken edits leave breathing room in the fixed video slots.
    spoken_edits = [
        "The dashboard highlights activity, dangerous patterns, and cases needing attention. These figures come from the active dataset, not real customers or money saved.",
        "I'm uploading twenty-four fictional transactions, including customer names, both account references, bank details, and behavioral context. The conversion report shows how the input was interpreted. This file tests the workflow. It does not prove model accuracy or retrain a model.",
        "The ledger connects each transaction to its investigation. Uploads, manual entry, and the assessment API feed the same workflow.",
        "Let's assess an ordinary utility payment. The amount is close to normal spending. The recipient is familiar and activity is ordinary. The result is low risk, seven out of a hundred. That's a recommendation, not a guarantee of verified details.",
        "Now the evidence changes: a larger amount, unusual activity, failures, and an unfamiliar recipient. The score reaches a hundred, with manual review recommended. The system does not execute a financial action.",
        "Fraud, anomaly, behavior, velocity, graph, and rules feed risk fusion. Unusual does not mean fraud. These contribution bars are not SHAP.",
        "Here, Diya Patel pays Rapid Digital Exchange. A reviewer can inspect both parties: names, accounts, banks, and contact details. Everything is fictional. A field in the dataset is not independent bank verification.",
        "The investigator organizes evidence and policy, keeping missing information explicit. This is bounded local orchestration, not a production language-model service. No financial action.",
        "Let's switch to the reviewer. A human can approve, reject, escalate, or request evidence. I add a note and escalate for recipient verification. The decision belongs to the human, not the model.",
        "The audit trail preserves assessments and human decisions, keeping each case traceable.",
        "Fraud intelligence highlights patterns for investigation, not verdicts about people.",
        "Shared devices and recipient connections provide context, not proof of collusion.",
        "Customer three sixty connects history and known context for each investigation.",
        "Return risk stays separate. A return does not automatically mean payment fraud.",
        "Chargebacks organize evidence for human review. Missing evidence stays missing. No external submission. This path currently requires T X prefixed identifiers.",
        "Portfolio analytics shows flagged value, not money actually saved.",
        "Held-out synthetic precision is about thirty-six percent, and recall fifty-two percent. These results need improvement. A working interface is not proof of production-quality fraud detection.",
        "The separate IEEE candidate reaches fifty percent precision and fifty-two percent recall. Promotion has not passed. Catching more fraud can exceed review capacity. Thresholds must balance those costs.",
        "Admins configure thresholds and policies. This tour changes neither, and enables no autonomous financial actions.",
        "Viewer access is read-only, without assessment or human-review controls.",
    ]
    for section, text in zip(sections[1:-1], spoken_edits, strict=True):
        section["text"] = text
    work = Path(tempfile.mkdtemp(prefix="razorshield-narration-"))
    parts = []
    for index, section in enumerate(sections):
        speech = section["text"]
        for source, spoken in {
            "SQLAlchemy": "sequel alchemy",
            "PostgreSQL": "Postgres",
            "IEEE": "I triple E",
            "SHAP": "shap",
            "LLM": "L L M",
            "CI": "C I",
            "AI": "A I",
            "TX-prefixed": "T X prefixed",
        }.items():
            speech = speech.replace(source, spoken)
        text_file = work / f"{index:02d}.txt"
        text_file.write_text(speech)
        raw = work / f"{index:02d}.aiff"
        seconds = section["end"] - section["start"]
        available = seconds - 0.8
        rate = 155 if args.voice == "default" else 160
        voice_options = [] if args.voice == "default" else ["-v", args.voice]
        for attempt in range(4):
            # Retries overwrite only this script's generated temporary audio.
            run(
                "say",
                *voice_options,
                "-r",
                str(rate),
                "-o",
                str(raw),
                "-f",
                str(text_file),
            )
            generated = probe(raw)
            if "duration" not in generated.get("format", {}):
                raise RuntimeError(
                    "Speech service produced empty audio; local host speech access is required"
                )
            actual = float(generated["format"]["duration"])
            if actual <= available:
                break
            rate = min(185, int(rate * actual / available) + 3)
        else:
            raise ValueError(
                f"Chapter {index + 1} is too long; shorten narration instead of clipping speech"
            )
        part = work / f"{index:02d}.wav"
        run(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-i",
            str(raw),
            "-af",
            "adelay=350,apad",
            "-t",
            str(seconds),
            "-ar",
            "48000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(part),
        )
        parts.append(part)
        section.update({"speech_seconds": actual, "words_per_minute": rate})
        print(
            f"Narrated {index + 1}/22: {section['title']} ({actual:.1f}s / {seconds}s)",
            flush=True,
        )
    playlist = work / "audio-list.txt"
    playlist.write_text("".join(f"file '{part}'\n" for part in parts))
    audio = work / "narration.wav"
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
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        str(audio),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    run(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-i",
        str(video),
        "-i",
        str(audio),
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
        "300",
        "-movflags",
        "+faststart",
        "-metadata",
        "title=RazorShield AI - live feature tour with synthesized narration",
        "-metadata",
        f"comment=AI-generated narration using macOS {args.voice} voice; fictional-data demonstration",
        str(args.output),
    )
    result = probe(args.output)
    if abs(float(result["format"]["duration"]) - 300) > 0.1:
        raise ValueError("Final duration is not five minutes")
    if not any(stream["codec_type"] == "audio" for stream in result["streams"]):
        raise ValueError("Final file is missing audio")
    report.write_text(
        json.dumps(
            {
                "voice": args.voice,
                "synthetic_narration": True,
                "source_video": str(video),
                "temporary_audio": str(work),
                "chapters": sections,
                "media": result,
            },
            indent=2,
        )
    )
    print(f"Ready: {args.output}", flush=True)


if __name__ == "__main__":
    main()
