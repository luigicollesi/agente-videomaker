# WAV, MP3, MP4 input and algorithm plan (research-backed)

Status: **technical plan**, not a working decoder or analyzer. Implementation shall be CPU-first and avoid ASR, source separation, named-instrument detection, formal verse/chorus classifiers and neural models.

## Source input contract
Accept only local `.wav`, `.mp3`, `.mp4` for initial release; verify by stream probe, **never trust extension**.
- `ffprobe -v error -show_format -show_streams -of json input` inspect audio/video streams, codecs, sample rates, channel layouts, `start_time`, stream duration and container duration. MP4 may have no audio or more than one audio stream. Reject no-audio; choose the default audio stream, otherwise first, unless `--audio-stream` is explicit. Record absolute stream index and selection rule.
- `ffmpeg -nostdin -v error -i input -map 0:<stream_index> -vn -ac 1 -ar 22050 -f f32le -acodec pcm_f32le pipe:1` decodes a deterministic mono analysis signal at 22,050 Hz (configurable); use the stream's actual index and pass subprocess args as an array without shell expansion. Decode only audio; no video frame processing.
- **Do not** apply loudness normalization or dynamic-range compression before calculating physical/dynamic descriptors; those transforms alter measurements. Downmix stereo for rhythm features, but preserve and report source channels; optionally measure per-channel peak to avoid cancellation.
- Record source `sha256`, `duration_seconds` from decoded sample count, original duration/probe values, codec, format, stream index, original sample rate, analysis sample rate, analysis sample count, input stream start PTS when available, decoding tool/version, and trim/offset correction. Validate synchronization against the original editor timeline, especially MP3 encoder delay/priming and MP4 edit lists/start_time. Use `null` for unknown correction; never silently impose one.
- Support reading PCM in bounded chunks or a temporary analysis PCM file (for long songs), no unbounded stdout buffers or per-format bespoke decoders. Enforce input filesize/time limits and protect against malformed media. Produce clear errors if ffmpeg missing or audio stream undecodable.
- License check for the actual FFmpeg build and codecs used by desktop distribution is mandatory before packaging.

## Research-grounded feature extraction
Primary: `librosa`, `numpy`, `scipy`; optional `ruptures` for segmentation; no GPU, PyTorch or model checkpoints.
- Beat grid: `librosa.onset.onset_strength`, `librosa.beat.beat_track` (onset autocorrelation + beat selection). BPM is a **hypothesis**; store multiple candidates, warn about half/double-time ambiguity, abstain on silence/unreliable tempo. Never interpret every onset as a beat. Downbeats: no initial detector; empty `downbeats` rather than invented strong-beat markers.
- Onsets: `librosa.onset.onset_detect`; retain sub-second timestamp with method/sample-hop metadata. Compute local strength from the onset envelope. Peaks of RMS are not always percussive onsets.
- Dynamics: RMS in dBFS from the unnormalized decoded signal, local slope/trend for crescendo/decrescendo, robust per-track normalized energy profile, rolling statistics. True integrated LUFS needs BS.1770/EBU R128-compatible measurement (e.g. FFmpeg ebur128); don't name RMS as LUFS.
- Timbre: spectral centroid, bandwidth, rolloff, spectral contrast, flatness, zero-crossing rate, spectral flux. Values depend on sampling and frame sizes. A spectral descriptor is not evidence of a named instrument.
- Tonality: chroma from reliable spectral transforms, harmonic stability/novelty, cautious optional major/minor affinity. Do **not** translate key directly into positive/negative emotion.
- Local time scales: onset-level features (about 10–50ms, selected by analysis hop), 3s windows every 0.5s for acoustics, 10–20s context windows every 2s for expressive profiles; preserve exact source-time mapping and document edge padding.
- Segmentation: robust feature standardization; lightweight `ruptures.Pelt(model="l2", min_size=..., jump=...)` or deterministic threshold fallback. Expose penalty and min duration; avoid dense O(N²) recurrence matrices. An isolated transient may be an event but not a whole section.
- Heuristics: transparent activation/arousal **proxy** from normalized energy, onset density, rhythmic movement and spectral flux; tension cues from novelty, roughness proxies and dynamics. Publish coefficients, normalization method and heuristic version. Local genre labels and subjective emotion labels are out of v1; output `acoustic_character` and `style_descriptors`. Valence estimation is disabled by default pending calibration and listener annotations.

## Time and API
1. Time zero is the editor's source audio timeline, not arbitrary raw decoder PTS. Publish `timeline_offset_seconds` and `timestamp_mapping` method; integration tests compare decoded audio onsets against exported/remuxed video at known offsets.
2. Preserve measured event timestamps at the event resolution. Context curves sample every configured hop; smoothing affects only display/expressive curves, never source transient events.
3. `analyze_music(input_path, output_path, audio_stream?, analysis_sample_rate=22050, ...)` -> v1 JSON; `get_music_context(path,start,end)` -> interval summary; `validate_music_analysis` -> strict schema & evidence checks.
4. Cache by input hash + stream index + FFmpeg version + analyzer version + configuration, never solely by filename.

## Test matrix
- WAV: PCM16 44.1kHz stereo, PCMfloat 48kHz mono, silence; test sample time and levels.
- MP3: common CBR/VBR files, encoder-delay/priming, duration difference vs WAV reference; beat offsets within explicit tolerance.
- MP4: AAC audio + video, multiple audio streams, nonzero stream start time, edit lists, video-only, malformed media; assert correct selection and timeline mapping.
- Format equivalence: encode same synthetic click-track/crescendo to all formats, compare decoded onset/beat timestamps with tolerance chosen after measurement.
- Changing BPM, half/double tempo, weak/nonmetric beat and short transients; do not invent downbeats or emotional scores on silence.
- Resource benchmark: original 332s music on CPU, runtime and peak RSS, deterministic repeated JSON, no torch/CUDA loads.

## References
- FFprobe stream inspection: https://ffmpeg.org/ffprobe.html
- FFmpeg main docs and mapping: https://ffmpeg.org/ffmpeg.html
- librosa beat tracking: https://librosa.org/doc/main/api/generated/librosa.beat.beat_track.html
- librosa onset: https://librosa.org/doc/main/generated/librosa.onset.onset_detect.html
- librosa RMS: https://librosa.org/doc/main/generated/librosa.feature.rms.html
- librosa spectral: https://librosa.org/doc/main/feature.html
- ruptures PELT: https://centre-borelli.github.io/ruptures-docs/code-reference/detection/pelt-reference/
- FFmpeg ebur128: https://ffmpeg.org/ffmpeg-filters.html#ebur128-1
