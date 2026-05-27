import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ToastController } from '@ionic/angular';

/**
 * MatrixPage — search-driven view over the user's rated mixes.
 *
 * All filters (session, title/artist, future: BPM, genre, ...) are
 * AND-combined and sent to the backend's /mixes endpoint. The matrix
 * + pair list always render from the unified result set, so a query
 * like q=Chronixx spans every session the user has touched.
 *
 * URL params (all optional, persisted across reload + QR):
 *   ?session=<text>  case-insensitive substring on videos.session
 *   ?q=<text>        case-insensitive substring on title/artist
 *   ?strict=1        matrix shows only mixes where BOTH endpoints match q
 *                    (pair list is always "wide")
 *   ?account=<text>  override the user identity (defaults to
 *                    localStorage.account, the home page's session name)
 */

interface MatrixVideo {
  // 'rated' = videos table, has rating + possibly URLs
  // 'library' = song_metadata_lookup seed, no rating, no source URLs
  source: 'rated' | 'library';
  id: number | null;
  session: string | null;
  url: string;
  filename: string;
  x_url: string | null;
  y_url: string | null;
  x_title: string | null;
  y_title: string | null;
  x_artist: string | null;
  y_artist: string | null;
  rating: number | null;
}

interface MixesResponse {
  videos: MatrixVideo[];
  count: number;
  rated_count: number;
  library_count: number;
  filters: { account_number: string; session: string | null; q: string | null };
}

interface PairRow {
  source: 'rated' | 'library';
  videoId: number | null;
  filename: string;
  session: string | null;
  xUrl: string | null;
  yUrl: string | null;
  xShort: string | null;
  yShort: string | null;
  xTitle: string | null;
  yTitle: string | null;
  xArtist: string | null;
  yArtist: string | null;
  rating: number | null;
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
  // Filters bound to inputs at the top of the page. Every change calls
  // refresh() (which talks to /mixes). Same shape will hold when we add
  // BPM/genre/tempo etc. later.
  sessionFilter: string = '';
  q: string = '';
  // Per-filter mode: 'and' = must match (narrows), 'or' = at least one
  // OR filter must match (broadens). Default 'and'. Session has no mode
  // toggle — it's always a narrowing constraint. Same shape extends to
  // future BPM/key/genre inputs (each gets its own *Mode field).
  qMode: 'and' | 'or' = 'and';
  strict: boolean = false;

  // User identity. Defaults to localStorage.account (the home page's
  // current session) but can be overridden via ?account= in the URL.
  accountNumber: string = '';

  loading: boolean = false;
  errorMessage: string = '';
  count: number = 0;
  ratedCount: number = 0;
  libraryCount: number = 0;

  // Raw response from /mixes, kept so the strict toggle can rebuild the
  // matrix locally without re-fetching.
  private rawVideos: MatrixVideo[] = [];

  pairs: PairRow[] = [];

  axisUrls: string[] = [];
  axisShort: string[] = [];
  axisTooltip: string[] = [];
  matrix: MatrixCell[][] = [];

  qrOpen: boolean = false;

  private autoRefreshHandle: any = null;
  private readonly AUTO_REFRESH_MS = 5 * 60 * 1000;

  // Debounce filter input → /mixes calls. Without this, ngModelChange
  // fires on every keystroke and each request scans the videos table +
  // 12K-row song_metadata_lookup with ILIKE — fast enough on its own
  // but they pile up faster than they return and the UI hangs on the
  // newest one. 300ms is the standard "type a word, then query" feel.
  private inputDebounceHandle: any = null;
  private readonly INPUT_DEBOUNCE_MS = 300;

  constructor(
    private http: HttpClient,
    private toastController: ToastController,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    this.sessionFilter = (qp.get('session') || '').trim();
    this.q = (qp.get('q') || '').trim();
    // q_mode comes from URL too. Whitelist to {'and','or'}.
    this.qMode = qp.get('q_mode') === 'or' ? 'or' : 'and';
    this.strict = qp.get('strict') === '1';

    // Account identity. Honor ?account= override first, otherwise fall
    // back to localStorage. If neither, render the "set an account"
    // empty state.
    const fromUrl = (qp.get('account') || '').trim();
    const stored = (window.localStorage.getItem('account') || '').trim();
    this.accountNumber = fromUrl || stored;
    if (fromUrl) {
      window.localStorage.setItem('account', fromUrl);
    }

    // Sync URL so QR + reload reproduce the current view exactly.
    this.syncUrlParams();

    // refresh() works without an account now — it'll return only
    // library results in that case (so the user can browse the seed
    // even before loading a session). Always fire on init.
    this.refresh();

    this.autoRefreshHandle = setInterval(() => {
      if (!this.loading) {
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
    if (this.inputDebounceHandle !== null) {
      clearTimeout(this.inputDebounceHandle);
      this.inputDebounceHandle = null;
    }
  }

  onSessionInput(value: string) {
    this.sessionFilter = (value || '').trim();
    this.syncUrlParams();
    this.scheduleRefresh();
  }

  onQInput(value: string) {
    this.q = (value || '').trim();
    this.syncUrlParams();
    this.scheduleRefresh();
  }

  /** Flip q's AND/OR mode. Triggers a refetch since the WHERE clause
   *  composition depends on it. No-op when q is empty (nothing to mode).
   *  Mode flip is a single click, no debounce needed — fire immediately. */
  onQModeToggle() {
    this.qMode = this.qMode === 'and' ? 'or' : 'and';
    this.syncUrlParams();
    if (this.q) {
      this.refresh();
    }
  }

  /** Debounced wrapper around refresh(). Used by the text inputs so that
   *  typing "robert" fires ONE request after the user pauses, not six.
   *  The last keystroke wins — earlier debounce timers are cleared. */
  private scheduleRefresh() {
    if (this.inputDebounceHandle !== null) {
      clearTimeout(this.inputDebounceHandle);
    }
    this.inputDebounceHandle = setTimeout(() => {
      this.inputDebounceHandle = null;
      this.refresh();
    }, this.INPUT_DEBOUNCE_MS);
  }

  /** Strict is client-side only — affects matrix rendering, not the
   *  backend query (which already returned the filtered set). */
  onStrictToggle(value: boolean) {
    this.strict = !!value;
    this.syncUrlParams();
    this.applyStrict();
  }

  /** Update ?session=&q=&q_mode=&strict= in the address bar without
   *  re-routing. Omits empty values + default modes so the URL stays tidy. */
  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        session: this.sessionFilter || null,
        q: this.q || null,
        // Only encode q_mode when non-default AND q is actually set,
        // so plain searches don't pollute the URL with ?q_mode=and.
        q_mode: (this.q && this.qMode === 'or') ? 'or' : null,
        strict: this.strict ? '1' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ---- QR-code popup ----

  openQr() {
    if (!this.accountNumber) {
      this.toast('Set an account first');
      return;
    }
    this.qrOpen = true;
  }

  closeQr() {
    this.qrOpen = false;
  }

  /** Deep-link URL the QR encodes — current filters preserved exactly. */
  get qrTargetUrl(): string {
    const origin = window.location.origin;
    const params = new URLSearchParams();
    if (this.sessionFilter) params.set('session', this.sessionFilter);
    if (this.q) {
      params.set('q', this.q);
      if (this.qMode === 'or') params.set('q_mode', 'or');
    }
    if (this.strict) params.set('strict', '1');
    // Always include account in the QR — the recipient may not have it
    // in their localStorage.
    if (this.accountNumber) params.set('account', this.accountNumber);
    const qs = params.toString();
    return `${origin}/matrix${qs ? '?' + qs : ''}`;
  }

  get qrImageUrl(): string {
    const data = encodeURIComponent(this.qrTargetUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${data}`;
  }

  refresh() {
    // account_number is optional on the backend now (library-only mode
    // when missing). The page still works — user just sees library
    // results, no rated mixes, until they set an account.
    this.loading = true;
    this.errorMessage = '';
    let params = new HttpParams();
    if (this.accountNumber) params = params.set('account_number', this.accountNumber);
    if (this.sessionFilter) params = params.set('session', this.sessionFilter);
    if (this.q) {
      params = params.set('q', this.q);
      // Only pass q_mode when non-default. Backend defaults to 'and'.
      if (this.qMode === 'or') params = params.set('q_mode', 'or');
    }

    this.http.get<MixesResponse>('/mixes', { params }).subscribe(
      (resp) => {
        this.rawVideos = resp.videos;
        this.count = resp.count;
        this.ratedCount = resp.rated_count ?? resp.count;
        this.libraryCount = resp.library_count ?? 0;
        this.applyStrict();
        this.loading = false;
      },
      (err) => {
        console.error('matrix.page: load failed', err);
        this.errorMessage =
          (err && err.error && err.error.error) || 'failed to load mixes';
        this.rawVideos = [];
        this.count = 0;
        this.ratedCount = 0;
        this.libraryCount = 0;
        this.pairs = [];
        this.axisUrls = [];
        this.axisShort = [];
        this.axisTooltip = [];
        this.matrix = [];
        this.loading = false;
      },
    );
  }

  /** Rebuild pairs + matrix from rawVideos. Strict mode only affects
   *  the matrix — pair list always shows every backend-matched mix. */
  private applyStrict() {
    const actionable = this.rawVideos;
    const rated = actionable.filter((v) => v.source === 'rated');
    const library = actionable.filter((v) => v.source === 'library');

    // Pair list: rated first (sorted by rating desc + id), library after
    // (sorted by file for stability). Rendering distinguishes the two via
    // the source field (no rating dot for library, no session/url links).
    const ratedRows: PairRow[] = rated
      .map((v) => ({
        source: 'rated' as const,
        videoId: v.id,
        filename: v.filename,
        session: v.session,
        xUrl: v.x_url,
        yUrl: v.y_url,
        xShort: v.x_url ? shortenYouTube(v.x_url) : null,
        yShort: v.y_url ? shortenYouTube(v.y_url) : null,
        xTitle: v.x_title,
        yTitle: v.y_title,
        xArtist: v.x_artist,
        yArtist: v.y_artist,
        rating: v.rating,
      }))
      .sort((a, b) => (b.rating! - a.rating!) || (a.videoId! - b.videoId!));
    const libraryRows: PairRow[] = library
      .map((v) => ({
        source: 'library' as const,
        videoId: null,
        filename: v.filename,
        session: null,
        xUrl: null,
        yUrl: null,
        xShort: null,
        yShort: null,
        xTitle: v.x_title,
        yTitle: v.y_title,
        xArtist: v.x_artist,
        yArtist: v.y_artist,
        rating: null,
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
    this.pairs = [...ratedRows, ...libraryRows];

    // Matrix axis is composed of two kinds of keys:
    //   - Rated: keyed by source YT URL (x_url / y_url). Two positions per
    //     rated mix (symmetric). Label = 11-char YT id.
    //   - Library: keyed by mp4 stem (filename minus extension and any
    //     trailing -<number>). One position per library entry. Label =
    //     the stem itself. Per the user's spec — cells stay blank, the
    //     entry just contributes an axis row/column.
    //
    // Axis keys are strings; URL strings and stems won't collide.
    type AxisInfo = { label: string; tooltip: string; rated: boolean };
    const axisInfo = new Map<string, AxisInfo>();

    // Per-URL metadata for rated entries (used for tooltips + strict check).
    const urlMeta = new Map<string, { title: string | null; artist: string | null }>();
    for (const v of rated) {
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

    // Add rated URL axis entries.
    for (const u of urlMeta.keys()) {
      const m = urlMeta.get(u)!;
      const labelParts: string[] = [];
      if (m.artist) labelParts.push(m.artist);
      if (m.title) labelParts.push(m.title);
      axisInfo.set(u, {
        label: shortenYouTube(u),
        tooltip: labelParts.length ? labelParts.join(' — ') : u,
        rated: true,
      });
    }
    // Add library axis entries — one per library row, keyed by mp4 stem.
    for (const v of library) {
      const stem = mp4Stem(v.filename);
      // Avoid stem collisions between library and rated (shouldn't happen
      // in practice — stems aren't URLs — but be defensive).
      const key = 'lib:' + stem;
      if (!axisInfo.has(key)) {
        const labelParts: string[] = [];
        if (v.x_artist) labelParts.push(v.x_artist);
        if (v.x_title) labelParts.push(v.x_title);
        const tooltipL = labelParts.length ? labelParts.join(' — ') : stem;
        const labelParts2: string[] = [];
        if (v.y_artist) labelParts2.push(v.y_artist);
        if (v.y_title) labelParts2.push(v.y_title);
        const tooltipR = labelParts2.length ? labelParts2.join(' — ') : '';
        axisInfo.set(key, {
          label: stem,
          tooltip: tooltipR ? `${tooltipL}  /  ${tooltipR}  (library)` : `${tooltipL}  (library)`,
          rated: false,
        });
      }
    }

    // Sort: rated entries first (by mean rating desc), library entries
    // appended at the end (alphabetical by label).
    const meanByUrl = new Map<string, number>();
    for (const u of urlMeta.keys()) {
      const ratings: number[] = [];
      for (const v of rated) {
        if (v.x_url === u || v.y_url === u) ratings.push(v.rating!);
      }
      meanByUrl.set(
        u,
        ratings.reduce((a, b) => a + b, 0) / Math.max(1, ratings.length),
      );
    }
    const sortedRated = Array.from(urlMeta.keys()).sort(
      (a, b) => meanByUrl.get(b)! - meanByUrl.get(a)!,
    );
    const sortedLibrary = Array.from(axisInfo.keys())
      .filter((k) => k.startsWith('lib:'))
      .sort((a, b) => axisInfo.get(a)!.label.localeCompare(axisInfo.get(b)!.label));
    const sortedAxis = [...sortedRated, ...sortedLibrary];

    this.axisUrls = sortedAxis;
    this.axisShort = sortedAxis.map((k) => axisInfo.get(k)!.label);
    this.axisTooltip = sortedAxis.map((k) => axisInfo.get(k)!.tooltip);

    const n = sortedAxis.length;
    const cells: MatrixCell[][] = [];
    for (let i = 0; i < n; i++) {
      const row: MatrixCell[] = [];
      for (let j = 0; j < n; j++) {
        row.push({ rating: null, videoIds: [] });
      }
      cells.push(row);
    }

    // Strict mode (only meaningful when q is set + applies to rated only):
    // only fill a rated cell if BOTH endpoint URLs' title/artist match q.
    // Library entries never produce cells, so strict doesn't affect them.
    const needle = this.q.toLowerCase();
    const urlMatchesQ = (u: string): boolean => {
      if (!needle) return true;
      const m = urlMeta.get(u);
      if (!m) return false;
      return [m.title, m.artist].some(
        (s) => typeof s === 'string' && s.toLowerCase().includes(needle),
      );
    };

    const idx = new Map<string, number>();
    sortedAxis.forEach((u, i) => idx.set(u, i));

    // Place rated entries on the matrix as today.
    for (const v of rated) {
      if (!v.x_url || !v.y_url) continue;
      const i = idx.get(v.x_url);
      const j = idx.get(v.y_url);
      if (i === undefined || j === undefined) continue;
      if (this.strict && needle) {
        if (!urlMatchesQ(v.x_url) || !urlMatchesQ(v.y_url)) continue;
      }
      for (const [a, b] of [[i, j], [j, i]] as [number, number][]) {
        const cell = cells[a][b];
        cell.videoIds.push(v.id!);
        if (cell.rating === null || v.rating! > cell.rating) {
          cell.rating = v.rating!;
        }
      }
    }

    // Library entries DON'T produce cells (per user spec: "the ones which
    // have not been rated will show blank"). They contribute axis labels
    // only — the user can see they exist, but no rating dot fires until
    // the mp4 is loaded into a session and rated. Once that happens, the
    // mp4 becomes a 'rated' entry on a different axis position (its real
    // YT URL) and gets a real cell, leaving its library stem axis empty.

    this.matrix = cells;
  }

  cellColor(rating: number | null): string {
    if (rating === null) return 'transparent';
    if (rating === 0) return '#ffffff';
    if (rating === 1) return '#1565c0';
    if (rating === 2) return '#42a5f5';
    if (rating === 3) return '#fb8c00';
    if (rating === 4) return '#fdd835';
    if (rating === 5) return '#e53935';
    return 'transparent';
  }

  cellNeedsBorder(rating: number | null): boolean {
    return rating === 0;
  }

  cellHasDot(rating: number | null): boolean {
    return rating !== null;
  }

  ratingColor(rating: number): string {
    return this.cellColor(rating);
  }

  async toast(message: string) {
    const t = await this.toastController.create({
      message,
      duration: 1500,
      position: 'bottom',
    });
    t.present();
  }

  openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}


function shortenYouTube(url: string): string {
  if (!url) return '';
  const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  const longMatch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (longMatch) return longMatch[1];
  return url.slice(-11);
}

/**
 * Library mp4s have no source YT URL — they need a stable axis key
 * derived from the filename. Per the user's spec, use "everything
 * before the <<number>>.mp4". Strip:
 *   - the trailing .mp4 (case-insensitive)
 *   - a trailing -<digits> chunk if present (e.g. Sun-May-24-26-10 → Sun-May-24-26)
 * If neither applies, return the filename with extension dropped.
 *
 * For mp4 filenames where the number isn't at the end (e.g.
 * --1-Left-Mac.attlocal.net.mp4) the trailing-number strip does
 * nothing — the full stem is shown, which is still readable.
 */
function mp4Stem(filename: string): string {
  let s = (filename || '').replace(/\.mp4$/i, '');
  s = s.replace(/-\d+$/, '');
  return s;
}
