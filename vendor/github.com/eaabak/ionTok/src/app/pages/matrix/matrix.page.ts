import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ToastController } from '@ionic/angular';

/**
 * MatrixPage — visualises the user's ratings for a session as:
 *
 *   1. A ranked list of pairs (best mixes at the top), and
 *   2. An NxN heat-map matrix indexed by the source YouTube URLs.
 *
 * Backend feed: `GET /sessions/<name>/matrix?account_number=<x>`. Returns
 * each video in the session with its rating + extracted (x_url, y_url)
 * pair URLs and (x_title, y_title, x_artist, y_artist) song metadata.
 * Videos that haven't been rated, or that have no extracted URLs
 * (extraction failed / no `network` tag in the mp4), are silently
 * skipped — the page is for actionable show-curation, not a complete
 * audit of the session.
 *
 * URL params:
 *   ?session=<name>  loads/persists which session is being viewed
 *   ?filter=<text>   case-insensitive substring filter on titles/artists
 *   ?strict=1        matrix shows only mixes where BOTH endpoints match
 *                    the filter (rather than the wider "anything paired
 *                    with a matched URL" default)
 *
 * The pair-list filter is always "wide" — a row is shown if filter
 * matches any of the four metadata fields. The strict toggle only
 * affects the matrix.
 */

interface MatrixVideo {
  id: number;
  url: string;
  filename: string;
  x_url: string | null;
  y_url: string | null;
  x_title: string | null;
  y_title: string | null;
  x_artist: string | null;
  y_artist: string | null;
  metadata_extracted_at: string | null;
  rating: number | null;
}

interface MatrixStats {
  total: number;
  rated: number;
  rated_with_urls: number;
  rated_missing_urls: number;
  extraction_pending: number;
}

interface MatrixResponse {
  session: string;
  account_number: string;
  videos: MatrixVideo[];
  stats: MatrixStats;
}

interface PairRow {
  videoId: number;
  filename: string;
  xUrl: string;
  yUrl: string;
  xShort: string;
  yShort: string;
  xTitle: string | null;
  yTitle: string | null;
  xArtist: string | null;
  yArtist: string | null;
  rating: number;
}

interface MatrixCell {
  rating: number | null;  // null = no mix at this pair
  videoIds: number[];     // 0+ videos at this pair
}

@Component({
  selector: 'app-matrix',
  templateUrl: './matrix.page.html',
  styleUrls: ['./matrix.page.scss'],
})
export class MatrixPage implements OnInit, OnDestroy {
  session: string = '';
  searchTerm: string = '';
  loading: boolean = false;
  errorMessage: string = '';
  stats: MatrixStats | null = null;

  // Title/artist filter state. Both persisted to URL params so a QR /
  // shared link reproduces the exact view. filter is case-insensitive
  // substring; strict toggles matrix display between "matched cells
  // only" and "matched cells + their 1-hop neighborhood".
  filter: string = '';
  strict: boolean = false;

  // Raw response from /sessions/<name>/matrix. Kept so that filter
  // changes can rebuild pairs+matrix locally without re-fetching.
  private rawVideos: MatrixVideo[] = [];

  // The actionable view: every (x, y, rating) where both URLs are present
  // and the user rated it, sorted by rating descending. Already filtered.
  pairs: PairRow[] = [];

  // The matrix view. axisUrls is the ordered list of unique source URLs
  // (both axes share the same ordering — the relation is symmetric).
  // axisShort is the truncated label shown on the axis. axisTooltip is
  // the artist+title shown on hover. matrix[i][j] is the cell for
  // (axisUrls[i], axisUrls[j]). All three respect the current filter.
  axisUrls: string[] = [];
  axisShort: string[] = [];
  axisTooltip: string[] = [];
  matrix: MatrixCell[][] = [];

  // QR-code modal state. Opens when the user taps the QR button next to
  // the "Pair matrix" heading; renders a fullscreen-translucent overlay
  // with a QR encoding the current page URL (including ?session=) so
  // anyone scanning lands on the same view.
  qrOpen: boolean = false;

  // setInterval handle for the 5-minute auto-refresh. Cleared in
  // ngOnDestroy so navigating away doesn't leak the timer.
  private autoRefreshHandle: any = null;

  // 5 minutes between automatic refreshes. Long enough that we're not
  // hammering the backend; short enough that ratings done on a phone
  // show up on a wall-mounted matrix view without manual reload.
  private readonly AUTO_REFRESH_MS = 5 * 60 * 1000;

  constructor(
    private http: HttpClient,
    private toastController: ToastController,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    // Session-selection priority:
    //   1. ?session=<name> in the URL (QR-deep-link / shareable URLs)
    //   2. localStorage.account (last-used session from the home page)
    //   3. nothing — render the "enter a session name" empty state.
    const qp = this.route.snapshot.queryParamMap;
    const fromUrl = qp.get('session');
    const stored = window.localStorage.getItem('account');
    const initial = (fromUrl || stored || '').trim();

    // Filter + strict come straight from URL — no localStorage. People
    // expect filters to reset on a fresh visit, but persist within a
    // URL they shared/scanned.
    this.filter = (qp.get('filter') || '').trim();
    this.strict = qp.get('strict') === '1';

    if (initial) {
      this.searchTerm = initial;
      this.session = initial;
      // Sync ALL the params we care about so the QR + reload reproduce
      // exactly. Includes session, filter, strict.
      this.syncUrlParams();
      // Also persist back to localStorage so opening a deep link sets
      // the home page's session too.
      if (fromUrl) {
        window.localStorage.setItem('account', initial);
      }
      this.refresh();
    }

    // Auto-refresh fires regardless of whether we had an initial session
    // — once the user types one in the search bar, the tick that comes
    // ~5 minutes later will pick it up via this.session being non-empty.
    this.autoRefreshHandle = setInterval(() => {
      if (this.session && !this.loading) {
        console.log('matrix.page: auto-refresh tick');
        this.refresh();
      }
    }, this.AUTO_REFRESH_MS);
  }

  ngOnDestroy() {
    if (this.autoRefreshHandle !== null) {
      clearInterval(this.autoRefreshHandle);
      this.autoRefreshHandle = null;
    }
  }

  /** Submit handler for the session searchbar. Reloads for the typed session. */
  onSearchKeyup(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== 'Return') {
      return;
    }
    const term = ((event.target as HTMLInputElement).value || '').trim();
    if (!term) {
      return;
    }
    this.session = term;
    // Persist so reload + the home page agree on which session is active.
    window.localStorage.setItem('account', term);
    // Keep the URL in sync so a refresh / share / QR scan reproduces this view.
    this.syncUrlParams();
    this.refresh();
  }

  /** Called on every keystroke in the title/artist filter input. Cheap —
   *  rebuilds pairs + matrix locally from rawVideos, no server round-trip. */
  onFilterInput(value: string) {
    this.filter = (value || '').trim();
    this.syncUrlParams();
    this.applyFilter();
  }

  /** Toggle handler for the Direct/Wide matrix mode switch. */
  onStrictToggle(value: boolean) {
    this.strict = !!value;
    this.syncUrlParams();
    this.applyFilter();
  }

  /** Update ?session=<name>&filter=<f>&strict=1 in the address bar
   *  without re-routing. Omits empty values so the URL stays tidy. */
  private syncUrlParams() {
    const queryParams: any = { session: this.session || null };
    queryParams.filter = this.filter ? this.filter : null;
    queryParams.strict = this.strict ? '1' : null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ---- QR-code popup ----

  /** Open the QR modal. The QR encodes the current full URL so a phone
   *  scanning it lands on this exact view (with the right session). */
  openQr() {
    if (!this.session) {
      this.toast('Enter a session first');
      return;
    }
    this.qrOpen = true;
  }

  /** Close the QR modal. Bound to the backdrop click and close button. */
  closeQr() {
    this.qrOpen = false;
  }

  /** The URL the QR encodes — current page with session + filter + strict
   *  baked in so the scanner lands on the same view. */
  get qrTargetUrl(): string {
    const origin = window.location.origin;
    const path = '/matrix';
    const params = new URLSearchParams();
    params.set('session', this.session);
    if (this.filter) params.set('filter', this.filter);
    if (this.strict) params.set('strict', '1');
    return `${origin}${path}?${params.toString()}`;
  }

  /** Image src for the QR. api.qrserver.com is a long-standing free QR
   *  service; the URL we encode is short (~80 chars) and contains only
   *  the session name + user-typed filter — no PII. */
  get qrImageUrl(): string {
    const data = encodeURIComponent(this.qrTargetUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${data}`;
  }

  refresh() {
    if (!this.session) {
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    const url =
      `/sessions/${encodeURIComponent(this.session)}/matrix` +
      `?account_number=${encodeURIComponent(this.session)}`;
    this.http.get<MatrixResponse>(url).subscribe(
      (resp) => {
        this.stats = resp.stats;
        this.rawVideos = resp.videos;
        this.applyFilter();
        this.loading = false;
      },
      (err) => {
        console.error('matrix.page: load failed', err);
        this.errorMessage =
          (err && err.error && err.error.error) || 'failed to load matrix';
        this.rawVideos = [];
        this.pairs = [];
        this.axisUrls = [];
        this.axisShort = [];
        this.axisTooltip = [];
        this.matrix = [];
        this.loading = false;
      },
    );
  }

  /**
   * Rebuild pairs + matrix from rawVideos, applying the current
   * filter + strict state. Called after fetch and on every filter/
   * toggle keystroke.
   */
  private applyFilter() {
    // 1. Actionable subset (rated + URLs present). Same as before.
    const actionable = this.rawVideos.filter(
      (v) =>
        v.rating !== null &&
        typeof v.x_url === 'string' &&
        typeof v.y_url === 'string' &&
        v.x_url &&
        v.y_url,
    );

    // 2. "Matching" predicate. Empty filter matches everything.
    //    Otherwise: case-insensitive substring against any of the four
    //    metadata fields.
    const needle = this.filter.toLowerCase();
    const matches = (v: MatrixVideo): boolean => {
      if (!needle) return true;
      return [v.x_title, v.y_title, v.x_artist, v.y_artist].some(
        (s) => typeof s === 'string' && s.toLowerCase().includes(needle),
      );
    };

    // 3. Pair list — always "wide": include any video where filter
    //    matches any side. Sorted by rating desc.
    this.pairs = actionable
      .filter(matches)
      .map((v) => ({
        videoId: v.id,
        filename: v.filename,
        xUrl: v.x_url!,
        yUrl: v.y_url!,
        xShort: shortenYouTube(v.x_url!),
        yShort: shortenYouTube(v.y_url!),
        xTitle: v.x_title,
        yTitle: v.y_title,
        xArtist: v.x_artist,
        yArtist: v.y_artist,
        rating: v.rating!,
      }))
      .sort((a, b) => b.rating - a.rating || a.videoId - b.videoId);

    // 4. Matched-URL set: URLs participating in any matching video.
    //    Used by both strict and wide modes.
    const matchedUrls = new Set<string>();
    for (const v of actionable.filter(matches)) {
      matchedUrls.add(v.x_url!);
      matchedUrls.add(v.y_url!);
    }

    // 5. Axis URLs depend on the strict/wide mode:
    //      strict: only matched URLs; cells fire only when both endpoints
    //              are matched.
    //      wide:   matched URLs + any URL ever paired with a matched URL
    //              (1-hop neighborhood). Lets you see what your filtered
    //              songs mix WITH, not just the cells where they match
    //              each other.
    let candidateUrls: Set<string>;
    if (this.strict) {
      candidateUrls = matchedUrls;
    } else {
      candidateUrls = new Set(matchedUrls);
      for (const v of actionable) {
        if (matchedUrls.has(v.x_url!) || matchedUrls.has(v.y_url!)) {
          candidateUrls.add(v.x_url!);
          candidateUrls.add(v.y_url!);
        }
      }
    }

    // 6. Per-URL artist/title for axis labels + tooltips. A URL appears
    //    in many videos; we just take the first non-null we see.
    const urlMeta = new Map<string, { title: string | null; artist: string | null }>();
    for (const v of actionable) {
      for (const [u, t, a] of [
        [v.x_url!, v.x_title, v.x_artist],
        [v.y_url!, v.y_title, v.y_artist],
      ] as [string, string | null, string | null][]) {
        if (!urlMeta.has(u)) {
          urlMeta.set(u, { title: t, artist: a });
        } else {
          const cur = urlMeta.get(u)!;
          if (!cur.title && t) cur.title = t;
          if (!cur.artist && a) cur.artist = a;
        }
      }
    }

    // 7. Sort axis by per-URL mean rating descending so the hottest songs
    //    cluster at the top-left.
    const meanByUrl = new Map<string, number>();
    for (const u of candidateUrls) {
      const ratings: number[] = [];
      for (const v of actionable) {
        if (v.x_url === u || v.y_url === u) ratings.push(v.rating!);
      }
      meanByUrl.set(
        u,
        ratings.reduce((a, b) => a + b, 0) / Math.max(1, ratings.length),
      );
    }
    const sortedAxis = Array.from(candidateUrls).sort(
      (a, b) => meanByUrl.get(b)! - meanByUrl.get(a)!,
    );

    this.axisUrls = sortedAxis;
    this.axisShort = sortedAxis.map(shortenYouTube);
    this.axisTooltip = sortedAxis.map((u) => {
      const m = urlMeta.get(u);
      if (!m) return u;
      const parts: string[] = [];
      if (m.artist) parts.push(m.artist);
      if (m.title) parts.push(m.title);
      return parts.length ? parts.join(' — ') : u;
    });

    // 8. Empty NxN matrix.
    const n = sortedAxis.length;
    const cells: MatrixCell[][] = [];
    for (let i = 0; i < n; i++) {
      const row: MatrixCell[] = [];
      for (let j = 0; j < n; j++) {
        row.push({ rating: null, videoIds: [] });
      }
      cells.push(row);
    }

    // 9. Place each video. Symmetric (a mix of A+B is the same as B+A).
    //    Cells are kept only if both endpoints are in candidateUrls;
    //    strict additionally requires both endpoints in matchedUrls so
    //    we don't fill cells where only one side matches the filter.
    const idx = new Map<string, number>();
    sortedAxis.forEach((u, i) => idx.set(u, i));
    for (const v of actionable) {
      const i = idx.get(v.x_url!);
      const j = idx.get(v.y_url!);
      if (i === undefined || j === undefined) continue;
      if (this.strict) {
        // Both endpoints must match the filter — keeps strict view honest.
        if (!matchedUrls.has(v.x_url!) || !matchedUrls.has(v.y_url!)) continue;
      }
      for (const [a, b] of [[i, j], [j, i]] as [number, number][]) {
        const cell = cells[a][b];
        cell.videoIds.push(v.id);
        if (cell.rating === null || v.rating! > cell.rating) {
          cell.rating = v.rating!;
        }
      }
    }
    this.matrix = cells;
  }

  /** Color spec from the user's design: 0..5 + null. */
  cellColor(rating: number | null): string {
    if (rating === null) return 'transparent';  // no mix at this cell
    if (rating === 0) return '#ffffff';          // skipped — white circle, thin border
    if (rating === 1) return '#1565c0';          // blue
    if (rating === 2) return '#42a5f5';          // light blue
    if (rating === 3) return '#fb8c00';          // orange
    if (rating === 4) return '#fdd835';          // yellow
    if (rating === 5) return '#e53935';          // red
    return 'transparent';
  }

  /** Empty cells (no mix) render as nothing; rated=0 still gets a white
   *  circle with a thin border. Anything else is a solid colored disc. */
  cellNeedsBorder(rating: number | null): boolean {
    return rating === 0;
  }

  cellHasDot(rating: number | null): boolean {
    return rating !== null;
  }

  /** Used by the pair-list rating badge — same colors as cellColor but
   *  with white default so the badge always renders something. */
  ratingColor(rating: number): string {
    return this.cellColor(rating);
  }

  /** Toast helper for action feedback (copy-url, etc.) */
  async toast(message: string) {
    const t = await this.toastController.create({
      message,
      duration: 1500,
      position: 'bottom',
    });
    t.present();
  }

  /** Trivially "open the URL in a new tab" for pair-list clicks. */
  openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}


/**
 * Best-effort URL shortener for YouTube links. Returns the 11-char video
 * id when we can extract one (the part after `v=` or after `youtu.be/`),
 * else the last 11 chars of the URL. Keeps axis labels narrow.
 */
function shortenYouTube(url: string): string {
  if (!url) return '';
  // youtu.be/<id>?optional-query
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  // youtube.com/watch?v=<id>
  const longMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (longMatch) return longMatch[1];
  // Fallback: last 11 chars (matches the YouTube id length).
  return url.slice(-11);
}
