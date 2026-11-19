---
name: canvas
description: The project's canvas in Videomaker, the board beside the edit. Read it when the person asks for the canvas or points at a canvas node (`canvas node `ID``), asks for a storyboard, shots, a character, or to lay out ideas, references and shots before they go into the film.
---

# The canvas

The canvas is the board beside the edit where the person lays out notes, files and nodes that make a picture, a clip or
a sound, wired into each other. Nothing on it is in the film until it is put on the timeline. A node the person points
at (`canvas node `ID``) is there. A project can have several canvases; your steps go to the one the person has open.

`videomaker canvas` prints the board; `videomaker canvas apply '<steps>'` adds, changes, wires and removes nodes, all at
once, and the person sees it at once. Its `--help` lists the steps.


## Native MCP workflow (preferred)

When `videomaker-media` MCP is available, first use `canvas_list` for board names, then `canvas_nodes` with `board`, `limit` and `offset` for compact node browsing; request one full node with `node` only when needed. Use `canvas_apply` with the desired `board` ID, the `revision` returned by `canvas_nodes`, and the existing Studio `ops` list to add, update, wire or remove nodes. The MCP targets that exact board and rejects stale revisions, returning the new revision and a compact edit receipt. If there is only one board, `board` may be omitted; for multiple boards, specify it. If Studio is not running, edits fail safely rather than writing Canvas files directly. Keep each request to at most 30 operations and inspect the resulting board when necessary. Fall back to the `videomaker canvas` CLI only when the MCP tool is unavailable. Do not duplicate steps by calling both methods.

## Laying out what the person asks for

- **A storyboard or shots**: one row per shot, left to right: a note (what happens, in the person's words), a picture
  node wired from it, a video node wired from the picture with `opts.mode: "first"`, and every video wired into one
  `cut` in order: the cut's "Put on the timeline" sends the clips in that order. Keep each shot in a group named after
  it (`around`) when there are many.
- **A character who looks the same in every shot**: a note of who they are, a picture node with `preset: "portrait"`
  wired from it, then `fullBody`, `expressions` and `turnaround16` picture nodes each wired from the note and the
  portrait, in a group named after them. Wire the portrait into every shot's picture and video (`opts.mode: "refs"`
  or as a reference) so they stay the same person.
- **A voice-over**: a `tts` node whose prompt is the line to speak, with `opts.voice` a voiceId from
  `videomaker get voice` that suits the speaker (none: the service's first voice in the person's language).
- **Words for a node**: write the prompt in English unless the person writes otherwise; describe what is seen, the
  light and the camera, not the story's meaning.

Lay things out and leave the making to the person (they press Make, or a group's Make all) unless they ask you to make
them: then make each with `videomaker get` and add it as the node's version. Say what you laid out and what to press.
