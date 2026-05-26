import { Component, OnInit } from '@angular/core';
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
 * pair URLs. Videos that haven't been rated, or that have no extracted
 * URLs (extraction failed / no `network` tag in the mp4), are silently
 * skipped — the page is for actionable show-curation, not a complete
 * audit of the session.
 *
 * The search bar at top behaves like home.page's: typing a session name
 * and pressing Enter reloads the matrix for that session. localStorage
 * 'account' doubles as the default and as the matrix's account_number
 * (matches the convention used everywhere else in this app).
 */

interface MatrixVideo {
  id: number;
  url: string;
  filename: string;
  x_url: string | null;
  y_url: string | null;
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
export class MatrixPage implements OnInit {
  session: string = '';
  searchTerm: string = '';
  loading: boolean = false;
  errorMessage: string = '';
  stats: MatrixStats | null = null;

  // The actionable view: every (x, y, rating) where both URLs are present
  // and the user rated it, sorted by rating descending.
  pairs: PairRow[] = [];

  // The matrix view. axisUrls is the ordered list of unique source URLs
  // (both axes share the same ordering — the relation is symmetric).
  // axisShort is the truncated label shown on the axis. matrix[i][j] is
  // the cell for (axisUrls[i], axisUrls[j]).
  axisUrls: string[] = [];
  axisShort: string[] = [];
  matrix: MatrixCell[][] = [];

  // QR-code modal state. Opens when the user taps the QR button next to
  // the "Pair matrix" heading; renders a fullscreen-translucent overlay
  // with a QR encoding the current page URL (including ?session=) so
  // anyone scanning lands on the same view.
  qrOpen: boolean = false;

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
    const fromUrl = this.route.snapshot.queryParamMap.get('session');
    const stored = window.localStorage.getItem('account');
    const initial = (fromUrl || stored || '').trim();
    if (initial) {
      this.searchTerm = initial;
      this.session = initial;
      // Make sure the URL query param reflects the loaded session even
      // when we fell back to localStorage, so the QR code below always
      // encodes a self-contained deep link.
      this.syncUrlParam(initial);
      // Also persist back to localStorage so opening a deep link sets
      // the home page's session too.
      if (fromUrl) {
        window.localStorage.setItem('account', initial);
      }
      this.refresh();
    }
  }

  /** Submit handler for the searchbar. Reloads for the typed session. */
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
    this.syncUrlParam(term);
    this.refresh();
  }

  /** Update ?session=<name> in the address bar without re-routing. */
  private syncUrlParam(session: string) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { session },
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

  /** The URL the QR encodes — current page with ?session=<name> regardless
   *  of what's in the address bar right now (defensive against router
   *  not having committed the syncUrlParam navigation yet). */
  get qrTargetUrl(): string {
    const origin = window.location.origin;
    const path = '/matrix';
    return `${origin}${path}?session=${encodeURIComponent(this.session)}`;
  }

  /** Image src for the QR. api.qrserver.com is a long-standing free QR
   *  service; the URL we encode is short (~60 chars) and contains only
   *  the session name as user-supplied data — same data already exposed
   *  in /sessions/<name>/matrix responses, so no new privacy concern. */
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
        this.build(resp.videos);
        this.loading = false;
      },
      (err) => {
        console.error('matrix.page: load failed', err);
        this.errorMessage =
          (err && err.error && err.error.error) || 'failed to load matrix';
        this.pairs = [];
        this.axisUrls = [];
        this.matrix = [];
        this.loading = false;
      },
    );
  }

  /**
   * Build the pair list AND the heat-map matrix from the raw video list.
   * Filters to rated videos with both URLs extracted — the rest aren't
   * actionable for this page.
   */
  private build(videos: MatrixVideo[]) {
    // 1. The actionable subset.
    const actionable = videos.filter(
      (v) =>
        v.rating !== null &&
        typeof v.x_url === 'string' &&
        typeof v.y_url === 'string' &&
        v.x_url &&
        v.y_url,
    );

    // 2. Pair list — sorted by rating desc, then by video id for stability.
    this.pairs = actionable
      .map((v) => ({
        videoId: v.id,
        filename: v.filename,
        xUrl: v.x_url!,
        yUrl: v.y_url!,
        xShort: shortenYouTube(v.x_url!),
        yShort: shortenYouTube(v.y_url!),
        rating: v.rating!,
      }))
      .sort((a, b) => b.rating - a.rating || a.videoId - b.videoId);

    // 3. Unique URLs across both axes (matrix is symmetric — a song
    //    paired with itself isn't a real mix, so the diagonal stays empty).
    const urlSet = new Set<string>();
    for (const v of actionable) {
      urlSet.add(v.x_url!);
      urlSet.add(v.y_url!);
    }
    const allUrls = Array.from(urlSet);

    // 4. Sort axis by per-URL mean rating descending so the hottest songs
    //    cluster at the top-left. (Heat-map-style "highest in the middle"
    //    reordering would mean sort-by-mean then re-permute toward center;
    //    skipping for now — descending sort already groups high ratings
    //    in the top-left quadrant, which scans clearly enough at ~30 URLs.)
    const meanByUrl = new Map<string, number>();
    for (const u of allUrls) {
      const ratings: number[] = [];
      for (const v of actionable) {
        if (v.x_url === u || v.y_url === u) ratings.push(v.rating!);
      }
      meanByUrl.set(
        u,
        ratings.reduce((a, b) => a + b, 0) / Math.max(1, ratings.length),
      );
    }
    allUrls.sort((a, b) => (meanByUrl.get(b)! - meanByUrl.get(a)!));

    this.axisUrls = allUrls;
    this.axisShort = allUrls.map(shortenYouTube);

    // 5. Empty NxN matrix.
    const n = allUrls.length;
    const cells: MatrixCell[][] = [];
    for (let i = 0; i < n; i++) {
      const row: MatrixCell[] = [];
      for (let j = 0; j < n; j++) {
        row.push({ rating: null, videoIds: [] });
      }
      cells.push(row);
    }

    // 6. Place each video. The pair is unordered (a mix of A+B is the
    //    same musical pairing as B+A), so we update BOTH (i,j) and (j,i).
    //    If multiple mixes exist for the same pair, keep the HIGHEST
    //    rating — the user is picking the best, not averaging.
    const idx = new Map<string, number>();
    allUrls.forEach((u, i) => idx.set(u, i));
    for (const v of actionable) {
      const i = idx.get(v.x_url!)!;
      const j = idx.get(v.y_url!)!;
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
