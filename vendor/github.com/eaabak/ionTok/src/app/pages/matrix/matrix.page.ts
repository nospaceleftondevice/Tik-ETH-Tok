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
  id: number;
  session: string;
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
  filters: { account_number: string; session: string | null; q: string | null };
}

interface PairRow {
  videoId: number;
  filename: string;
  session: string;
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
  // Filters bound to inputs at the top of the page. Every change calls
  // refresh() (which talks to /mixes). Same shape will hold when we add
  // BPM/genre/tempo etc. later.
  sessionFilter: string = '';
  q: string = '';
  strict: boolean = false;

  // User identity. Defaults to localStorage.account (the home page's
  // current session) but can be overridden via ?account= in the URL.
  accountNumber: string = '';

  loading: boolean = false;
  errorMessage: string = '';
  count: number = 0;

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

    if (this.accountNumber) {
      this.refresh();
    }

    this.autoRefreshHandle = setInterval(() => {
      if (this.accountNumber && !this.loading) {
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

  onSessionInput(value: string) {
    this.sessionFilter = (value || '').trim();
    this.syncUrlParams();
    this.refresh();
  }

  onQInput(value: string) {
    this.q = (value || '').trim();
    this.syncUrlParams();
    this.refresh();
  }

  /** Strict is client-side only — affects matrix rendering, not the
   *  backend query (which already returned the filtered set). */
  onStrictToggle(value: boolean) {
    this.strict = !!value;
    this.syncUrlParams();
    this.applyStrict();
  }

  /** Update ?session=&q=&strict= in the address bar without re-routing.
   *  Omits empty values so the URL stays tidy. */
  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        session: this.sessionFilter || null,
        q: this.q || null,
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
    if (this.q) params.set('q', this.q);
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
    if (!this.accountNumber) {
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    let params = new HttpParams().set('account_number', this.accountNumber);
    if (this.sessionFilter) params = params.set('session', this.sessionFilter);
    if (this.q) params = params.set('q', this.q);

    this.http.get<MixesResponse>('/mixes', { params }).subscribe(
      (resp) => {
        this.rawVideos = resp.videos;
        this.count = resp.count;
        this.applyStrict();
        this.loading = false;
      },
      (err) => {
        console.error('matrix.page: load failed', err);
        this.errorMessage =
          (err && err.error && err.error.error) || 'failed to load mixes';
        this.rawVideos = [];
        this.count = 0;
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

    this.pairs = actionable
      .map((v) => ({
        videoId: v.id,
        filename: v.filename,
        session: v.session,
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

    const matchedUrls = new Set<string>();
    for (const v of actionable) {
      matchedUrls.add(v.x_url!);
      matchedUrls.add(v.y_url!);
    }

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

    const meanByUrl = new Map<string, number>();
    for (const u of matchedUrls) {
      const ratings: number[] = [];
      for (const v of actionable) {
        if (v.x_url === u || v.y_url === u) ratings.push(v.rating!);
      }
      meanByUrl.set(
        u,
        ratings.reduce((a, b) => a + b, 0) / Math.max(1, ratings.length),
      );
    }
    const sortedAxis = Array.from(matchedUrls).sort(
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

    const n = sortedAxis.length;
    const cells: MatrixCell[][] = [];
    for (let i = 0; i < n; i++) {
      const row: MatrixCell[] = [];
      for (let j = 0; j < n; j++) {
        row.push({ rating: null, videoIds: [] });
      }
      cells.push(row);
    }

    // Strict mode (only meaningful when q is set): only fill a cell if
    // BOTH endpoints' titles or artists themselves match q. Otherwise
    // a Chronixx × Kelis mix shows under q="Kelis" because Kelis
    // appears, even though Chronixx doesn't match. Strict hides that
    // and shows only mixes where both songs match the filter.
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
    for (const v of actionable) {
      const i = idx.get(v.x_url!);
      const j = idx.get(v.y_url!);
      if (i === undefined || j === undefined) continue;
      if (this.strict && needle) {
        if (!urlMatchesQ(v.x_url!) || !urlMatchesQ(v.y_url!)) continue;
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
