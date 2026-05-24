# server/sessions

One JSON file per session. Each file is the list of videos that make
up that session (show) — same record shape as the legacy
`server/video_data.json` used to be.

The downstream music-k8s deployment loads these on demand via
`python server.py load-session <name> <url>`, fetching the file from
the raw github URL at the pinned ref. No image rebuild needed when a
new session lands.

## Naming convention

`<show>-<m>-<d>-<yyyy>.json` — matches the prefix embedded in the
upstream video file names (e.g. `164-4-23-2025-left-0-...mp4`).

## Adding a new session

1. Generate the JSON via the rave.dj → S3 → JSON pipeline.
2. Commit `server/sessions/<name>.json` to this branch.
3. In the downstream music-k8s repo, trigger the `Seed music_prod`
   workflow with `session_name=<name>`. It fetches this file and
   loads it into the prod database tagged with `<name>`.

## Record shape

```json
[
  {
    "userName": "maxb",
    "userPic": "164-4-23-2025-left-0-LeftMac2.attlocal.net-00000000.mp4",
    "url": "https://coin.computer/Videos/164-4-23-2025-left-0-LeftMac2.attlocal.net-00000000.mp4",
    "showcase_url": "164-4-23-2025-left-0-LeftMac2.attlocal.net-00000000.mp4",
    "likes": "0:0",
    "comments": "0:0"
  },
  ...
]
```

`session`, `id`, and `rating` are NOT in the JSON — they are
assigned/computed by the backend at load time.
