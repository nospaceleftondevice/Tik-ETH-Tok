import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  Renderer2,
  RendererStyleFlags2,
  ViewChild,
} from '@angular/core';
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
  // 'rated' = videos table, may or may not have a rating
  // 'library' = song_metadata_lookup seed, never has a rating
  source: 'rated' | 'library';
  id: number | null;
  session: string | null;       // representative; see `sessions` for full list
  sessions: string[];           // sessions this canonical mix appears in (dedup)
  dup_count: number;            // how many video rows collapsed into this entry
  // EVERY videos.id collapsed into this entry, not just `id` above.
  // Optional because a frontend can be deployed ahead of the backend that
  // supplies it; locateCell() falls back to axis keys when it's absent.
  video_ids?: number[];
  url: string;
  filename: string;
  x_url: string | null;
  y_url: string | null;
  x_title: string | null;
  y_title: string | null;
  x_artist: string | null;
  y_artist: string | null;
  // Backend-reported mp4 byte size. rave.dj is deterministic so same input
  // pair → byte-identical output; used here as a last-resort axis key when
  // both the source URL pair (tvnn atom) and artist pair are missing.
  file_size: number | null;
  rating: number | null;  // = ratings[0] for backward compat / convenience
  // ALL ratings (any account, any duplicate video) sorted desc.
  // Frontend stacks ratings[1] behind ratings[0] for stacked dots.
  ratings: number[];
}

interface MixesResponse {
  videos: MatrixVideo[];
  count: number;
  rated_count: number;
  library_count: number;
  filters: { account_number: string; session: string | null; q: string | null };
}

/**
 * One rating as reported by GET /mixes/events. Carries the same
 * axis-resolution fields /mixes returns (including the same
 * URL-from-title fallback) so the page can place the rated mix on the
 * matrix without a second request.
 */
interface RatingEvent {
  seq: number;
  video_id: number;
  account_number: string;
  rating: number;
  rated_at: string | null;
  session: string | null;
  url: string;
  filename: string;
  x_url: string | null;
  y_url: string | null;
  x_title: string | null;
  y_title: string | null;
  x_artist: string | null;
  y_artist: string | null;
  file_size: number | null;
}

/**
 * One account's current feed position, as reported by the backend's
 * now_playing table. Same axis-resolution fields as RatingEvent so both
 * resolve to a cell through axisKeysFor().
 */
interface PlayingEntry {
  account_number: string;
  video_id: number;
  updated_at: string | null;
  session: string | null;
  url: string;
  filename: string;
  x_url: string | null;
  y_url: string | null;
  x_title: string | null;
  y_title: string | null;
  x_artist: string | null;
  y_artist: string | null;
  file_size: number | null;
}

interface EventsResponse {
  cursor: number;
  events: RatingEvent[];
  // Current state, not an increment — returned in full on every poll,
  // bootstrap included. Absent on a backend that predates the feature,
  // hence optional.
  playing?: PlayingEntry[];
}

/** One inward-travelling wave. All waves in a burst share a centre and
 *  scale (written to the layer as CSS custom properties); only the
 *  animation-delay differs, which is what makes them read as a train of
 *  ripples rather than one ring. */
interface Ripple {
  id: number;
  delayMs: number;
}

interface PairRow {
  source: 'rated' | 'library';
  videoId: number | null;
  filename: string;
  // Direct link to the served mp4 (https://coin.computer/Videos/<filename>).
  // Surfaces in the pair list's File column so the user can open the
  // actual rated video — used to be implicit ("filename is shown as
  // text") but rated rows without YT URLs had no other way to play
  // back the file.
  mp4Url: string | null;
  // sessions: aggregated across all videos with the same canonical
  // URL pair. Length 1 = unique to one session; length > 1 = same
  // musical mix exists in multiple sessions (e.g. forward + -rev
  // loads). UI shows them comma-separated.
  sessions: string[];
  dupCount: number;     // number of video rows collapsed
  xUrl: string | null;
  yUrl: string | null;
  xShort: string | null;
  yShort: string | null;
  xTitle: string | null;
  yTitle: string | null;
  xArtist: string | null;
  yArtist: string | null;
  // Mirrors the rated row's file_size — needed by the click-to-locate
  // handler (onRatingClick) so it can fall back to the size axis tier
  // when xUrl/yUrl/artists are missing. Null for library rows.
  fileSize: number | null;
  rating: number | null;
  ratings: number[];
}

interface MatrixCell {
  rating: number | null;  // = ratings[0] when present; null when no mix or unrated
  ratings: number[];      // top ratings across all videos placed in this cell, sorted desc
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

  // How many mixes sit in each rating bucket, 5 down to 0, plus the
  // unrated remainder. Rendered between the matrix and the pair list:
  // the matrix shows WHERE the ratings are and the list shows WHICH,
  // but neither answers "how much of this session have we actually
  // got through", which is the question when the goal is to rate
  // everything.
  //
  // Counted on the headline rating (ratings[0], the MAX across accounts)
  // so a mix lands in exactly one bucket and the totals add up to the
  // row count in the list below.
  ratingCounts: { rating: number; count: number }[] = [];
  unratedCount: number = 0;

  // How many rated mixes actually know what two songs they contain
  // (URL pair or artist pair). Drives the "why is there no matrix"
  // message: 0 here with a non-empty pair list means the session has no
  // source-pair data at all, which is the common case — only 3 of 75
  // sessions have both pair data and ratings.
  placeableCount: number = 0;

  axisUrls: string[] = [];
  axisShort: string[] = [];
  axisTooltip: string[] = [];
  matrix: MatrixCell[][] = [];

  // axis key → index into axisUrls. Populated by buildMatrix; the
  // pair-list rating-click handler uses it to look up which cell to
  // highlight when the user wants to locate a rated entry on the grid.
  private cellIndexByKey: Map<string, number> = new Map();
  // videos.id → [row, col]. The authoritative way to locate a mix that we
  // know by id — a rating or now-playing event.
  //
  // Axis keys can't do this job on their own. /mixes collapses duplicate
  // video rows and picks a representative by (rating desc, id), and the
  // axis key comes from THAT row's url/artist/file_size. Rating a video
  // promotes it to representative and changes its group's key, so a key
  // rebuilt from a freshly-rated video's own fields describes a cell that
  // didn't exist when the grid was built. Indexing by member id sidesteps
  // representative churn entirely.
  private cellIndexByVideoId: Map<number, [number, number]> = new Map();
  // i,j of the currently-highlighted cell (set by clicking a pair-list
  // rating). null = nothing highlighted. Cleared when filters change.
  highlightedRow: number | null = null;
  highlightedCol: number | null = null;

  qrOpen: boolean = false;

  private autoRefreshHandle: any = null;
  private readonly AUTO_REFRESH_MS = 5 * 60 * 1000;

  // ---- Live rating events ----
  //
  // Cursor into the backend's rating-event log (user_interactions.rated_seq).
  // null until the bootstrap poll returns; see startEventPolling.
  private eventCursor: number | null = null;
  private eventPollHandle: any = null;
  private eventPollInFlight: boolean = false;
  private readonly EVENT_POLL_MS = 2000;

  // Identity of the mix whose rating arrived most recently. Stored as
  // id + KEYS rather than as i/j: applyStrict() re-sorts the axis by mean
  // rating on every rebuild, so indices move under us but identity doesn't.
  private pulseVideoId: number | null = null;
  private pulseKeys: [string, string] | null = null;
  // Resolved position of pulseKeys on the current grid. null when the
  // mix isn't on the matrix being viewed (or dropped off it after a
  // filter change). Read by the template to paint the pulsing ring.
  pulseRow: number | null = null;
  pulseCol: number | null = null;

  // ---- now playing ----
  //
  // Whatever is currently playing in the feed, one entry per reporting
  // account. Kept as IDENTITY (video_id + axis keys) rather than as cell
  // coordinates: the axis re-sorts on every rebuild, so indices go stale
  // but identity doesn't. Resolved through locateCell, so a video whose
  // axis key changed when it was rated still lands on the right cell.
  private playingIds: { videoId: number; keys: [string, string] | null }[] = [];
  // Resolved "i-j" cell coordinates, both orientations of each pair. A Set
  // because the template asks per cell and the grid can be hundreds wide —
  // a linear scan per cell would be O(n^3) across a render.
  private playingCells: Set<string> = new Set();

  // Waves currently in flight. Emptied once the burst finishes so the
  // layer goes back to holding no DOM.
  ripples: Ripple[] = [];
  private rippleIdSeq: number = 0;
  private rippleClearHandle: any = null;
  private readonly RIPPLE_WAVES = 3;
  private readonly RIPPLE_DURATION_MS = 2600;
  private readonly RIPPLE_STAGGER_MS = 450;
  // Resting diameter of a ring in px. MUST match the width/height on
  // .ripple-ring in matrix.page.scss — the scale factor that puts the
  // first frame off the edge of the page is computed from it.
  private readonly RIPPLE_BASE_PX = 40;

  // Always rendered (never behind an *ngIf) so the ViewChild is stable
  // and static: true can resolve it in ngOnInit.
  @ViewChild('rippleLayer', { static: true }) rippleLayer: ElementRef<HTMLElement>;

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
    private renderer: Renderer2,
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

    this.startEventPolling();
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
    if (this.rippleClearHandle !== null) {
      clearTimeout(this.rippleClearHandle);
      this.rippleClearHandle = null;
    }
    this.stopEventPolling();
  }

  /** Session input is Enter-only — the [(ngModel)] in the template
   *  updates sessionFilter on every keystroke (so the UI input value
   *  stays bound), but we don't issue a /mixes request until the
   *  user presses Enter. Title/artist below still uses debounced
   *  per-keystroke search since incremental filtering reads better
   *  for typing in song/artist names. */
  onSessionEnter() {
    this.sessionFilter = (this.sessionFilter || '').trim();
    this.syncUrlParams();
    this.refresh();
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

  /**
   * Reload /mixes.
   *
   * @param quiet  suppress the "Loading…" line and, on failure, leave the
   *               currently-rendered matrix alone. Used by the live
   *               rating-event path: a wall display shouldn't flicker its
   *               status line every time someone taps a star, and a
   *               transient blip mid-poll must not blank a grid that is
   *               still perfectly valid on screen.
   * @param done   invoked after the rebuild, on success only.
   */
  refresh(quiet: boolean = false, done?: () => void) {
    // account_number is optional on the backend now (library-only mode
    // when missing). The page still works — user just sees library
    // results, no rated mixes, until they set an account.
    if (!quiet) {
      this.loading = true;
      this.errorMessage = '';
    }
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
        // Only the reload that turned the indicator on may turn it off.
        // A quiet poll landing mid-way through a user-initiated reload
        // would otherwise clear "Loading…" while that one is still
        // running.
        if (!quiet) {
          this.loading = false;
        }
        if (done) done();
      },
      (err) => {
        console.error('matrix.page: load failed', err);
        // Quiet reloads keep whatever is already on screen. Wiping a
        // valid grid because one background poll failed is strictly
        // worse than showing a rating that's a few seconds stale.
        if (quiet) {
          return;
        }
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
        mp4Url: v.url || null,
        // Backend dedup gives us a list of sessions per row. Older
        // responses (pre-PR #61) only have `session`; fall back to
        // wrapping it so the UI keeps working during a deploy.
        sessions: v.sessions && v.sessions.length
          ? v.sessions
          : (v.session ? [v.session] : []),
        dupCount: v.dup_count ?? 1,
        xUrl: v.x_url,
        yUrl: v.y_url,
        xShort: v.x_url ? shortenYouTube(v.x_url) : null,
        yShort: v.y_url ? shortenYouTube(v.y_url) : null,
        xTitle: v.x_title,
        yTitle: v.y_title,
        xArtist: v.x_artist,
        yArtist: v.y_artist,
        fileSize: v.file_size ?? null,
        rating: v.rating,
        ratings: v.ratings || [],
      }))
      // Rated (non-null rating) first by rating desc; unrated rated-source
      // rows (search mode) come after by id. nullish rating coerces to -1
      // for the sort key.
      .sort((a, b) => ((b.rating ?? -1) - (a.rating ?? -1)) || ((a.videoId ?? 0) - (b.videoId ?? 0)));
    const libraryRows: PairRow[] = library
      .map((v) => ({
        source: 'library' as const,
        videoId: null,
        filename: v.filename,
        mp4Url: v.url || null,
        sessions: [],
        dupCount: 1,
        xUrl: null,
        yUrl: null,
        xShort: null,
        yShort: null,
        xTitle: v.x_title,
        yTitle: v.y_title,
        xArtist: v.x_artist,
        yArtist: v.y_artist,
        fileSize: null,
        rating: null,
        ratings: [],
      }))
      .sort((a, b) => a.filename.localeCompare(b.filename));
    this.pairs = [...ratedRows, ...libraryRows];

    const buckets = new Map<number, number>();
    let unrated = 0;
    for (const p of this.pairs) {
      if (p.ratings && p.ratings.length) {
        const headline = p.ratings[0];
        buckets.set(headline, (buckets.get(headline) || 0) + 1);
      } else {
        unrated++;
      }
    }
    this.ratingCounts = [5, 4, 3, 2, 1, 0].map(
      (r) => ({ rating: r, count: buckets.get(r) || 0 }),
    );
    this.unratedCount = unrated;

    // Matrix axis is composed of four kinds of keys, in tier order:
    //   - Rated URL: keyed by source YT URL (x_url / y_url). Two positions
    //     per rated mix (symmetric). Label = 11-char YT id. Gold standard
    //     — present whenever rave.dj's `tvnn` atom got extracted.
    //   - Rated artist (FALLBACK): keyed by `art:<artist>`. Used when the
    //     mp4 lacks a tvnn atom (ffmpeg-generated files etc.) but x/y
    //     artists are populated. Two positions per mix (symmetric). Label
    //     = artist name. Mirrors the backend dedup's "artists" tier.
    //   (A byte-size tier used to sit here. It gave every mix its own row
    //   and column for a single dot on the diagonal — see axisKeysFor()
    //   at the bottom of this file for why it was removed.)
    //   - Library: keyed by `lib:<mp4 stem>`. One position per library
    //     entry. Per user spec — cells stay blank, the entry just
    //     contributes an axis row/column.
    //
    // Axis keys are strings; prefixes guarantee URL/art/size/lib don't
    // collide.
    type AxisInfo = { label: string; tooltip: string; rated: boolean };
    const axisInfo = new Map<string, AxisInfo>();

    // Per-URL metadata for rated entries (used for tooltips + strict check).
    // After backend music-k8s #57 dropped the x_url IS NOT NULL filter,
    // rated rows can have null URLs (extraction failed / file has no
    // standard `tvnn` atom). Skip those for the URL axis — the artist
    // and file-size tiers below pick them up.
    const urlMeta = new Map<string, { title: string | null; artist: string | null }>();
    for (const v of rated) {
      for (const [u, t, a] of [
        [v.x_url, v.x_title, v.x_artist],
        [v.y_url, v.y_title, v.y_artist],
      ] as [string | null, string | null, string | null][]) {
        if (!u) continue;
        if (!urlMeta.has(u)) {
          urlMeta.set(u, { title: t, artist: a });
        } else {
          const cur = urlMeta.get(u)!;
          if (!cur.title && t) cur.title = t;
          if (!cur.artist && a) cur.artist = a;
        }
      }
    }

    // Per-artist metadata for fallback axis entries. Only consider rated
    // rows where BOTH URLs are missing — if URLs are present, that row
    // is already on the URL axis and shouldn't double up.
    const artistMeta = new Map<string, { title: string | null }>();
    for (const v of rated) {
      if (v.x_url && v.y_url) continue;
      for (const [a, t] of [
        [v.x_artist, v.x_title],
        [v.y_artist, v.y_title],
      ] as [string | null, string | null][]) {
        if (!a) continue;
        const key = 'art:' + a;
        if (!artistMeta.has(key)) {
          artistMeta.set(key, { title: t });
        } else {
          const cur = artistMeta.get(key)!;
          if (!cur.title && t) cur.title = t;
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
    // Add artist-fallback axis entries.
    for (const k of artistMeta.keys()) {
      const m = artistMeta.get(k)!;
      const artist = k.substring(4);
      axisInfo.set(k, {
        label: artist,
        tooltip: m.title ? `${artist} — ${m.title}  (no URL extracted)` : `${artist}  (no URL extracted)`,
        rated: true,
      });
    }
    // Add library axis entries — one per library row, keyed by mp4 stem.
    // Suppressed when a session filter is active: library rows in that
    // mode represent songs.txt-seed entries for files that aren't loaded
    // into the videos table for this session. The user can't rate them
    // from the feed, so giving them blank axis rows/columns only bloats
    // the grid (e.g. on /matrix?session=84-102-jun-11-24 they added 58
    // fully-blank rows + 58 fully-blank columns). Library rows still
    // appear in the pair list below the matrix.
    if (!this.sessionFilter) {
      for (const v of library) {
        const stem = mp4Stem(v.filename);
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
    }

    // Sort: rated URL → rated artist → library.
    // Within each tier, sort by mean rating desc; library alphabetical.
    const meanRatingFor = (member_filter: (v: MatrixVideo) => boolean): number => {
      const rs: number[] = [];
      for (const v of rated) {
        if (member_filter(v) && v.rating !== null) rs.push(v.rating);
      }
      return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    };
    const meanByKey = new Map<string, number>();
    for (const u of urlMeta.keys()) {
      meanByKey.set(u, meanRatingFor((v) => v.x_url === u || v.y_url === u));
    }
    for (const k of artistMeta.keys()) {
      const artist = k.substring(4);
      meanByKey.set(k, meanRatingFor((v) =>
        !v.x_url && !v.y_url && (v.x_artist === artist || v.y_artist === artist)
      ));
    }
    const sortedUrls = Array.from(urlMeta.keys()).sort(
      (a, b) => meanByKey.get(b)! - meanByKey.get(a)!,
    );
    const sortedArtists = Array.from(artistMeta.keys()).sort(
      (a, b) => meanByKey.get(b)! - meanByKey.get(a)!,
    );
    const sortedLibrary = Array.from(axisInfo.keys())
      .filter((k) => k.startsWith('lib:'))
      .sort((a, b) => axisInfo.get(a)!.label.localeCompare(axisInfo.get(b)!.label));
    const sortedAxis = [...sortedUrls, ...sortedArtists, ...sortedLibrary];

    this.placeableCount = rated.filter(
      (v) => axisKeysFor(v.x_url, v.y_url, v.x_artist, v.y_artist) !== null,
    ).length;

    this.axisUrls = sortedAxis;
    this.axisShort = sortedAxis.map((k) => axisInfo.get(k)!.label);
    this.axisTooltip = sortedAxis.map((k) => axisInfo.get(k)!.tooltip);

    const n = sortedAxis.length;
    const cells: MatrixCell[][] = [];
    for (let i = 0; i < n; i++) {
      const row: MatrixCell[] = [];
      for (let j = 0; j < n; j++) {
        row.push({ rating: null, ratings: [], videoIds: [] });
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
    // Expose the index for the pair-list rating-click handler. Cleared
    // on every rebuild because axis ordering changes when filters do.
    this.cellIndexByKey = idx;
    // Rebuilt below as cells are placed. Same lifetime as cellIndexByKey.
    const byVideoId = new Map<number, [number, number]>();
    this.highlightedRow = null;
    this.highlightedCol = null;

    // Per-row axis-key resolution — see axisKeysFor() at the bottom of
    // this file for the tier order.
    const resolveAxisPair = (v: MatrixVideo): [string, string] | null =>
      axisKeysFor(v.x_url, v.y_url, v.x_artist, v.y_artist);

    // Place rated entries on the matrix. Each video contributes its full
    // ratings[] into the cell; we keep all ratings sorted desc so the
    // cell can render stacked dots (ratings[0] in front, ratings[1] behind
    // when there are multiple raters across the video(s) at this pair).
    for (const v of rated) {
      const pair = resolveAxisPair(v);
      if (!pair) continue;
      const [xKey, yKey] = pair;
      const i = idx.get(xKey);
      const j = idx.get(yKey);
      if (i === undefined || j === undefined) continue;
      if (this.strict && needle) {
        if (xKey.startsWith('art:')) {
          // Strict q-match was a URL-tier-only feature (it uses urlMeta).
          // For the artist tier, fall back to matching on the row's own
          // title/artist fields.
          const hay = [v.x_title, v.y_title, v.x_artist, v.y_artist]
            .filter(Boolean)
            .map((s) => s!.toLowerCase())
            .join(' ');
          if (!hay.includes(needle)) continue;
        } else if (!urlMatchesQ(xKey) || !urlMatchesQ(yKey)) {
          continue;
        }
      }
      // Pull contributing ratings out once. Empty for unrated videos —
      // they still get a cell entry (videoId) but no dots; the cell
      // will render blank.
      const contributing = v.ratings && v.ratings.length ? v.ratings : [];
      // Symmetric fill: (i,j) and (j,i). When i === j (size-tier diagonal
      // self-mix), the dedup naturally produces one fill rather than two.
      // Index EVERY video collapsed into this entry, not just the
      // representative, so an event naming any member resolves here.
      // video_ids is absent on a backend older than music-k8s#95; fall
      // back to the representative id alone.
      const memberIds: number[] =
        v.video_ids && v.video_ids.length
          ? v.video_ids
          : (v.id !== null ? [v.id] : []);
      for (const mid of memberIds) {
        byVideoId.set(mid, [i, j]);
      }

      const placements: [number, number][] = i === j ? [[i, j]] : [[i, j], [j, i]];
      for (const [a, b] of placements) {
        const cell = cells[a][b];
        for (const mid of memberIds) cell.videoIds.push(mid);
        if (contributing.length) {
          cell.ratings.push(...contributing);
          // Keep sorted desc so cell.ratings[0] is the headline.
          cell.ratings.sort((a, b) => b - a);
          cell.rating = cell.ratings[0];
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
    this.cellIndexByVideoId = byVideoId;

    // The axis was just re-sorted, so any pulse currently on the grid is
    // pointing at stale indices. Re-resolve from the stored keys. Done
    // here rather than at the call sites so every rebuild path — filter
    // change, strict toggle, auto-refresh, live rating event — keeps the
    // pulse attached to the right mix.
    this.resolvePulseCell();
    this.resolvePlayingCells();
  }

  /** Mixes carrying any rating at all — the complement of unratedCount.
   *  Kept as a getter so it can't drift from the buckets it sums. */
  get ratedTotal(): number {
    return this.ratingCounts.reduce((a, b) => a + b.count, 0);
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

  // Resolve a PairRow to the same axis-key pair the matrix used when it
  // placed the dot. Library rows never contribute a cell; everything else
  // defers to the shared resolver.
  private pairAxisKeys(p: PairRow): [string, string] | null {
    if (p.source === 'library') return null;
    return axisKeysFor(p.xUrl, p.yUrl, p.xArtist, p.yArtist);
  }

  // Click a pair-list rating → highlight the matching matrix cell and
  // scroll it into view. Resolves the row's axis-keys, looks up
  // indices in cellIndexByKey, sets highlightedRow/Col so the template
  // can paint the cell, then scrolls the matrix grid horizontally and
  // the page vertically so the cell is visible. Tapping the same
  // rating again clears the highlight.
  onRatingClick(p: PairRow): void {
    if (!p.ratings || !p.ratings.length) return;
    const keys = this.pairAxisKeys(p);
    if (!keys) return;
    const i = this.cellIndexByKey.get(keys[0]);
    const j = this.cellIndexByKey.get(keys[1]);
    if (i === undefined || j === undefined) return;

    // Tap-twice-to-clear: same cell already highlighted → toggle off.
    if (this.highlightedRow === i && this.highlightedCol === j) {
      this.highlightedRow = null;
      this.highlightedCol = null;
      return;
    }
    this.highlightedRow = i;
    this.highlightedCol = j;

    // Defer the scroll to next frame so Angular applies the highlight
    // class first; then scrollIntoView nudges both the horizontal
    // matrix-scroll container and the page itself.
    setTimeout(() => {
      const sel = `.matrix-table .cell[data-cell-key="${i}-${j}"]`;
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }, 0);
  }

  // ---------------------------------------------------------------------
  // Live rating events
  //
  // The page polls GET /mixes/events every EVENT_POLL_MS. When a rating
  // lands on a mix that is present on the matrix currently being viewed,
  // a burst of rings converges on that mix's cell from beyond the edges
  // of the page and leaves a pulsing ring behind, which stays until the
  // next rating arrives.
  //
  // Polling rather than a stream is a deliberate deployment constraint,
  // not an oversight: the backend runs gunicorn sync workers (2 workers x
  // 2 replicas), so a held-open SSE/WebSocket connection would occupy one
  // of four request slots for the lifetime of the browser tab. See the
  // /mixes/events docstring in music-k8s backend/server.py.
  // ---------------------------------------------------------------------

  private startEventPolling() {
    // The first call is the bootstrap: it takes the current cursor
    // WITHOUT returning history, so opening the page doesn't replay every
    // rating ever recorded as a burst of ripples.
    this.pollEvents(true);
    this.eventPollHandle = setInterval(
      () => this.pollEvents(false),
      this.EVENT_POLL_MS,
    );
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopEventPolling() {
    if (this.eventPollHandle !== null) {
      clearInterval(this.eventPollHandle);
      this.eventPollHandle = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  // Arrow property, not a method: `this` has to bind, and
  // removeEventListener needs the identical reference back in ngOnDestroy.
  private onVisibilityChange = () => {
    // Catch up immediately on becoming visible instead of waiting out the
    // interval — a phone coming out of a pocket should be current at once.
    if (!document.hidden) {
      this.pollEvents(false);
    }
  };

  private pollEvents(bootstrap: boolean) {
    // Don't stack requests if one is slow; the next tick covers us.
    if (this.eventPollInFlight) return;
    // Skip work while backgrounded. onVisibilityChange fires a catch-up
    // poll the moment the tab comes back, so nothing is missed — the
    // cursor just advances in one jump instead of many.
    if (!bootstrap && document.hidden) return;

    this.eventPollInFlight = true;
    let params = new HttpParams();
    // Omitting `since` IS the bootstrap signal to the backend.
    if (!bootstrap && this.eventCursor !== null) {
      params = params.set('since', String(this.eventCursor));
    }

    this.http.get<EventsResponse>('/mixes/events', { params }).subscribe(
      (resp) => {
        this.eventPollInFlight = false;
        if (resp && typeof resp.cursor === 'number') {
          this.eventCursor = resp.cursor;
        }
        // Playing is current state, so it applies on EVERY poll including
        // the bootstrap — unlike events, where the bootstrap deliberately
        // returns nothing so history isn't replayed as ripples.
        this.applyPlaying((resp && resp.playing) || []);
        if (bootstrap || !resp || !resp.events || !resp.events.length) return;
        this.onRatingEvents(resp.events);
      },
      (err) => {
        this.eventPollInFlight = false;
        // Transient by nature — a pod rolling, a wifi blip, a 404 while
        // the backend rolls out ahead of the frontend. The next tick
        // retries; deliberately no user-visible error, since the matrix
        // itself is still valid and this is an enhancement on top of it.
        console.warn('matrix.page: rating-event poll failed', err);
      },
    );
  }

  /**
   * Handle a batch of rating events.
   *
   * ORDER MATTERS HERE, and getting it wrong is what broke the ripple in
   * production. This used to decide whether an event was placeable by
   * testing it against the grid already on screen, and only refetch after
   * that test passed. But the grid is stale by construction at exactly
   * the moment that matters:
   *
   *   /mixes collapses duplicate video rows into one entry and picks a
   *   representative by (rating desc, id). The axis key comes from THAT
   *   row. So rating a video promotes it to representative and CHANGES
   *   its group's axis key. A first-time rating therefore described a
   *   cell that did not exist on the grid built moments earlier, failed
   *   the test, and was discarded in silence.
   *
   * So: refetch first, then resolve against the rebuilt grid.
   *
   * Only the newest placeable event gets a ripple. A batch of more than
   * one means we fell behind (backgrounded tab, slow network), and
   * replaying a queue of ripples would be noise — the pulse marks the
   * latest rating, singular. Every rating in the batch still lands on the
   * grid via the refetch; only the animation is deduplicated.
   */
  private onRatingEvents(events: RatingEvent[]) {
    // Cheap pre-gate so a rating in some other session doesn't cost every
    // open matrix page a /mixes refetch. Deliberately permissive: it only
    // has to skip obviously-irrelevant work, and the real placement test
    // happens after the refetch.
    const relevant = events.filter((e) => this.eventMatchesView(e));
    if (!relevant.length) return;

    this.refresh(true, () => {
      // Newest first — the pulse marks the latest rating.
      for (let k = relevant.length - 1; k >= 0; k--) {
        const e = relevant[k];
        const keys = this.eventAxisKeys(e);
        const cell = this.locateCell(e.video_id, keys);
        if (!cell) continue;
        this.pulseVideoId = e.video_id;
        this.pulseKeys = keys;
        this.pulseRow = cell[0];
        this.pulseCol = cell[1];
        // The extra tick lets Angular flush the rebuilt grid to the DOM
        // before fireRipple() goes looking for the cell to measure.
        setTimeout(() => this.fireRipple(), 0);
        return;
      }
      // Nothing in the batch is on this matrix even after refetching —
      // filtered to a different session, or the mp4 still has no axis
      // information. Stay silent; the existing pulse stands.
    });
  }

  /**
   * Would this event plausibly appear on the matrix being viewed?
   *
   * Mirrors the backend's `v.session ILIKE %session%`. Only a pre-filter
   * to avoid pointless refetches — a false positive costs one /mixes call
   * and then resolves to nothing, which is harmless. A false NEGATIVE
   * would silently drop a legitimate ripple, so this stays generous.
   */
  private eventMatchesView(e: RatingEvent): boolean {
    if (!this.sessionFilter) return true;
    return (e.session || '').toLowerCase().includes(this.sessionFilter.toLowerCase());
  }

  /**
   * Locate a mix on the current grid.
   *
   * video_id is authoritative: buildMatrix indexes every member of a
   * dedup group, so this survives the representative changing under us —
   * which is precisely what rating a video does.
   *
   * Axis keys are the fallback, for the window where this frontend is
   * deployed ahead of the backend that supplies video_ids (music-k8s#95).
   */
  private locateCell(
    videoId: number | null,
    keys: [string, string] | null,
  ): [number, number] | null {
    if (videoId !== null && videoId !== undefined) {
      const hit = this.cellIndexByVideoId.get(videoId);
      if (hit) return hit;
    }
    if (keys) {
      const i = this.cellIndexByKey.get(keys[0]);
      const j = this.cellIndexByKey.get(keys[1]);
      if (i !== undefined && j !== undefined) return [i, j];
    }
    return null;
  }

  /**
   * Adopt the current set of playing videos.
   *
   * Replaces wholesale rather than merging: `playing` is the complete
   * current state on every poll, so an account that stopped reporting is
   * represented by its absence. Merging would leave its box on the grid
   * forever.
   *
   * Unlike a rating, this fires no animation of its own — the box is a
   * standing CSS marker on the cell. Nothing scrolls, either: a wall
   * display shouldn't jump every time someone swipes their phone.
   *
   * Identity is kept as (video_id, axis keys) and resolved through
   * locateCell for the same reason ratings are: a mix's axis key changes
   * when it gets rated, and someone watching a video they are about to
   * rate is the single most likely way to hit that.
   */
  private applyPlaying(entries: PlayingEntry[]) {
    this.playingIds = entries.map((e) => ({
      videoId: e.video_id,
      keys: axisKeysFor(e.x_url, e.y_url, e.x_artist, e.y_artist),
    }));
    this.resolvePlayingCells();
  }

  /** Map the playing set onto current cell coordinates. Entries that
   *  aren't on the grid (filtered away, or no axis information) simply
   *  don't appear — same rule the pulse follows. */
  private resolvePlayingCells() {
    const cells = new Set<string>();
    for (const p of this.playingIds) {
      const cell = this.locateCell(p.videoId, p.keys);
      if (!cell) continue;
      // Both orientations. The matrix is symmetric and a mix occupies two
      // cells, so boxing only one would look like a rendering bug. (The
      // rating pulse marks a single cell on purpose — it's the terminus of
      // a ripple, which has to converge somewhere specific.)
      cells.add(cell[0] + '-' + cell[1]);
      cells.add(cell[1] + '-' + cell[0]);
    }
    this.playingCells = cells;
  }

  /** True when we have mixes to show but none of them knows its two
   *  source songs — so there is no matrix to draw, only a list. Kept
   *  distinct from "no results", which the empty states already cover. */
  get noPairData(): boolean {
    return !this.loading && !this.errorMessage && this.pairs.length > 0 && this.placeableCount === 0;
  }

  /** True when SOME mixes are on the grid but most aren't. Without a note
   *  saying so, a session where 1 of 95 mixes has source data renders a
   *  2x2 grid next to a 95-row list and just looks broken — the matrix
   *  isn't wrong, it's showing everything it legitimately can. */
  get partialPairData(): boolean {
    return this.placeableCount > 0 && this.placeableCount < this.ratedCount;
  }

  /** Template predicate for the playing box. Set lookup, so it stays cheap
   *  called once per cell per render. */
  isPlayingCell(i: number, j: number): boolean {
    return this.playingCells.has(i + '-' + j);
  }

  /** Axis keys for a rating event. Same tiers, same order, same helper as
   *  the matrix build and the pair-list click-to-locate. */
  private eventAxisKeys(e: RatingEvent): [string, string] | null {
    return axisKeysFor(e.x_url, e.y_url, e.x_artist, e.y_artist);
  }

  /** Re-point pulseRow/pulseCol at wherever the pulsing mix now lives.
   *  Clears the pulse when it isn't on the grid any more (the user
   *  filtered it away) rather than leaving a ring on an unrelated cell
   *  that happens to now occupy those indices. */
  private resolvePulseCell() {
    const cell = this.locateCell(this.pulseVideoId, this.pulseKeys);
    if (!cell) {
      this.pulseRow = null;
      this.pulseCol = null;
      return;
    }
    this.pulseRow = cell[0];
    this.pulseCol = cell[1];
  }

  /** Template predicate for the persistent ring. Cheap index compare, so
   *  it's fine to call once per cell per render. */
  isPulsingCell(i: number, j: number): boolean {
    return this.pulseRow === i && this.pulseCol === j;
  }

  /** *ngFor identity for the wave list. New ids on every burst force
   *  fresh DOM nodes, which is what restarts the CSS animation when two
   *  ratings arrive close together. */
  trackRipple(_index: number, r: Ripple): number {
    return r.id;
  }

  private fireRipple() {
    if (this.pulseRow === null || this.pulseCol === null) return;
    const sel = `.matrix-table .cell[data-cell-key="${this.pulseRow}-${this.pulseCol}"]`;
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return;

    // Bring the cell on screen first. The grid scrolls in both axes and
    // routinely runs wider than the viewport; rings converging on a point
    // outside the window just read as noise. Same scroll the pair-list
    // click-to-locate performs.
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    // Measure after the smooth scroll settles, or the rings centre on
    // where the cell used to be. Browsers don't expose a "scroll finished"
    // event for smooth scrolling, hence the fixed delay.
    setTimeout(() => this.spawnRings(el), 450);
  }

  private spawnRings(el: HTMLElement) {
    const layer = this.rippleLayer && this.rippleLayer.nativeElement;
    if (!layer) return;

    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Distance to the farthest viewport corner. The first frame has to
    // sit beyond it so the wave genuinely enters from off the page rather
    // than popping into existence inside it.
    const maxDist = Math.max(
      Math.sqrt(cx * cx + cy * cy),
      Math.sqrt((w - cx) * (w - cx) + cy * cy),
      Math.sqrt(cx * cx + (h - cy) * (h - cy)),
      Math.sqrt((w - cx) * (w - cx) + (h - cy) * (h - cy)),
    );
    const scale = (maxDist * 2) / this.RIPPLE_BASE_PX;

    // Custom properties on the layer, read by .ripple-ring's keyframes.
    // Renderer2 + DashCase is the reliable way to set a CSS custom
    // property from Angular 12; a plain [style.--foo] template binding
    // is not dependable on this version.
    this.renderer.setStyle(layer, '--ripple-x', `${cx}px`, RendererStyleFlags2.DashCase);
    this.renderer.setStyle(layer, '--ripple-y', `${cy}px`, RendererStyleFlags2.DashCase);
    this.renderer.setStyle(layer, '--ripple-scale', `${scale}`, RendererStyleFlags2.DashCase);

    const waves: Ripple[] = [];
    for (let k = 0; k < this.RIPPLE_WAVES; k++) {
      waves.push({ id: ++this.rippleIdSeq, delayMs: k * this.RIPPLE_STAGGER_MS });
    }
    this.ripples = waves;

    // Tear the rings back out once the burst is over so the layer holds
    // no DOM while idle. The pulsing ring on the cell is a separate,
    // CSS-only affair and stays until the next rating replaces it.
    if (this.rippleClearHandle !== null) {
      clearTimeout(this.rippleClearHandle);
    }
    const total =
      this.RIPPLE_DURATION_MS +
      this.RIPPLE_STAGGER_MS * (this.RIPPLE_WAVES - 1) +
      200;
    this.rippleClearHandle = setTimeout(() => {
      this.rippleClearHandle = null;
      this.ripples = [];
    }, total);
  }

  // Template predicate — kept as a method so *ngFor doesn't need to
  // call a heavier resolver every render. row+col compare cheap.
  isHighlightedCell(i: number, j: number): boolean {
    return this.highlightedRow === i && this.highlightedCol === j;
  }
}


/**
 * Canonical matrix axis-key pair for a mix, in tier order:
 *
 *   1. source YouTube URL pair        → [x_url, y_url]     (symmetric)
 *   2. artist pair, when URLs missing → ['art:X', 'art:Y'] (symmetric)
 *
 * Returns null when neither applies — the mix has no idea what two songs
 * it is made of, so there is no intersection to place it at.
 *
 * There used to be a third tier keyed on the mp4's byte size. It existed
 * to say "this is rated, source endpoints unknown", and it was a mistake:
 * a size key can only ever pair with ITSELF, so every such mix got its own
 * row AND its own column and one dot where they crossed. N mixes produced
 * an N x N grid to display N dots on the diagonal — 94x94 = 8,836 cells
 * for 94 dots on session 153-feb-2-2025-left, with 94 identical truncated
 * filenames for axis labels.
 *
 * Backend survey of all 75 sessions: only 2,591 of 28,264 videos (9.2%)
 * have both URLs, and only three sessions have pair data AND ratings. So
 * the size tier wasn't a rare fallback, it was the common case, and it
 * was turning most sessions' "pair matrix" into a diagonal line that
 * conveyed strictly less than the ranked list underneath it.
 *
 * Those mixes still appear in the pair list. They just no longer claim an
 * axis position they can't justify.
 *
 * Single source of truth on purpose. buildMatrix() places dots with it,
 * the pair-list click-to-locate finds cells with it, and the live rating
 * and now-playing handlers resolve markers with it. These MUST agree:
 * when they drift, a marker lands on the wrong cell or resolves to
 * nothing and silently does nothing at all.
 */
function axisKeysFor(
  xUrl: string | null,
  yUrl: string | null,
  xArtist: string | null,
  yArtist: string | null,
): [string, string] | null {
  if (xUrl && yUrl) return [xUrl, yUrl];
  if (xArtist && yArtist) return ['art:' + xArtist, 'art:' + yArtist];
  return null;
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
