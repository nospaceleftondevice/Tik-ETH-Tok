import { Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { IonSlides } from '@ionic/angular';
import { DataService } from "../../services/data.service";
import { ToastController, LoadingController } from '@ionic/angular';
import { IonSearchbar } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})

export class HomePage implements OnInit, OnDestroy {
  //@ViewChild(IonSlides, { static: false }) slides: IonSlides;
  @ViewChild('slides', { static: false }) slides: IonSlides;  // Reference the IonSlides component
  //@ViewChild('searchbar', { static: false }) searchbar: ElementRef;
  @ViewChild('slides', { static: true, read: ElementRef }) slidesElementRef: ElementRef; // Reference for DOM access

  @ViewChild('searchbar', { static: false }) searchbar: IonSearchbar; // Use IonSearchbar instead of ElementRef

  private ws: WebSocket | null = null; // WebSocket instance

  // Matrix-behind-the-feed toggle (the grid icon in the feed's action
  // column). The iframe lives here rather than in app-feed so it can sit
  // behind ALL the slides instead of inside whichever one is active.
  showMatrixBg: boolean = false;
  // Computed ONCE when the matrix is switched on, never in a getter: a
  // getter would hand Angular a fresh SafeResourceUrl on every change
  // detection pass, and the iframe would reload itself forever.
  matrixBgUrl: SafeResourceUrl | null = null;

  // Zoom applied to the matrix iframe, driven by the slider that appears
  // bottom-right while it's showing. The grid's cells are 14px, so the
  // useful direction is usually OUT (< 1) to fit more of it on screen.
  matrixZoom: number = 1;

  // Must match $matrix-bg-offset in home.page.scss -- the iframe's height
  // is derived from it, and the zoom recomputes that height.
  private readonly MATRIX_BG_OFFSET_PX = 150;

  // Once the user touches the search toggle, their choice sticks. null
  // means "nobody has said", and the old slide-driven behaviour applies.
  private searchBarManual: boolean | null = null;

  // Rating breakdown for the legend shown at the top while the matrix is
  // up. Pushed over postMessage by the embedded matrix page, which
  // already has the numbers -- see publishCountsToParent there.
  // True once the info button has scrolled the matrix's list away from
  // the top, so the next slide change knows to put it back.
  private matrixScrolledToPlaying: boolean = false;

  matrixCounts: { rating: number; count: number }[] = [];
  matrixUnrated: number = 0;
  matrixRated: number = 0;
  matrixTotal: number = 0;

  showSearchBar: boolean = false; // Initially hidden
  showShield: boolean = true;

  videoList: any = [];
  searchResults: any[] = [];  // Add searchResults property
  count = 0;
  currentPage: number = 1;
  limit: number = 10;

  // Drives the chevron arrow in each <app-feed>. false = list rendered
  // in normal order (chevron-down); true = reversed (chevron-up,
  // "read from the bottom up"). Toggled by toggleVideoListOrder() —
  // we reverse videoList in place and re-anchor the current slide so
  // the user stays on the same video they were watching.
  videoListReversed: boolean = false;

  // Set of video ids the user has explicitly rated (any 1-5 tap)
  // during this page-load. Used by the scroll-past hook in
  // onSlideDidChange so we do not record a 0 for a video the user
  // actually rated. Reset on reload by design (we don't want to
  // re-fire skip records when the user refreshes).
  private ratedThisPageLoad = new Set<number>();

  // Last slide index we observed in onSlideDidChange. Used to detect
  // forward vs backward motion: forward + prev-not-rated = record 0.
  // Initialised to 0 (the intro slide).
  private lastSlideIndex: number = 0;

  // ---- now-playing reporting ----
  //
  // Tells the backend which video this account is watching, so the matrix
  // page can draw a box around the corresponding cell. Reported on every
  // slide change plus a heartbeat, because the backend expires a row that
  // stops being refreshed — that's how a closed tab drops off the matrix
  // without anything having to notice it closed.
  //
  // Deliberately decoupled from the rating/skip path below: this is a
  // decoration on someone else's screen and must never influence what gets
  // rated, skipped, or counted.
  private nowPlayingHeartbeatHandle: any = null;
  private lastReportedPlayingId: number | null = null;
  // Comfortably inside the backend's 90s TTL, so two beats can be missed
  // (flaky wifi) before the box disappears.
  private readonly NOW_PLAYING_HEARTBEAT_MS = 30 * 1000;
  // How long the feed keeps claiming to be playing after the tab goes
  // hidden. Long enough that switching to the matrix tab on the same
  // machine doesn't drop the box; short enough that a tab left open
  // overnight doesn't hold a phantom box on the wall display forever.
  private readonly NOW_PLAYING_HIDDEN_GRACE_MS = 10 * 60 * 1000;
  // Timestamp the tab went hidden, or null while it's visible.
  private hiddenSince: number | null = null;

  // Per-touch counters used to gate the scroll-past hook so it only
  // fires for USER-initiated slide changes. The upstream remote-control
  // bits (WebSocket from dastream.cloud, fetch to /next_slide, programmatic
  // slideNext calls) fire ionSlideDidChange too, and without this gate
  // we'd record a skip per programmatic event — observed live as a single
  // user swipe decrementing "videos left to rate" by 3.
  //
  // onSlideTouchStart bumps touchSequence. maybeRecordScrollPastSkip only
  // records when touchSequence !== lastRecordedSequence (so each touch
  // counts at most once, no matter how many slide-change events follow it),
  // and ignores anything before the first touch (so programmatic startup
  // events don't fire skips).
  touchSequence: number = 0;
  private lastRecordedSequence: number = 0;

  // Text shown in the searchbar's placeholder. Replaced by refreshProgress()
  // with "N videos left to rate" once the backend has answered. Default is
  // a generic hint so the bar doesn't look broken before the first response.
  searchPlaceholder: string = 'Search to load a new session';

  chainName: string;
  showHeaderDiv: boolean;
  showControls: boolean = true; // Controls the visibility of the slider and button
  remoteMode: boolean = false;
  skipMode: boolean = true;
  
  /** Show/hide the matrix behind the feed. The URL is built here, on the
   *  way in, so it picks up whatever session the feed is currently on --
   *  localStorage 'account' doubles as the session filter (see
   *  data.service.getVideoList). */
  toggleSearchBar() {
    this.showSearchBar = !this.showSearchBar;
    this.searchBarManual = this.showSearchBar;
  }

  /** Zoom the iframe by rendering it at 1/zoom the size and scaling it
   *  back up. Scaling alone would just crop; resizing the element first
   *  means a zoom-out genuinely shows MORE of the matrix. */
  get matrixBgStyle(): { [k: string]: string } {
    const z = this.matrixZoom || 1;
    return {
      width: (100 / z) + 'vw',
      height: 'calc((55vh + ' + this.MATRIX_BG_OFFSET_PX + 'px) / ' + z + ')',
      transform: 'scale(' + z + ')',
      'transform-origin': 'top left',
    };
  }

  /** Same colours the matrix uses for its dots, so the legend and the
   *  grid agree. Mirrors cellColor() in matrix.page.ts. */
  ratingColor(rating: number): string {
    switch (rating) {
      case 0: return '#ffffff';
      case 1: return '#1565c0';
      case 2: return '#42a5f5';
      case 3: return '#fb8c00';
      case 4: return '#fdd835';
      case 5: return '#e53935';
      default: return 'transparent';
    }
  }

  /** Relay the feed's info button into the embedded matrix, which owns
   *  the pair list and knows which row is playing. Targeted at our own
   *  origin rather than '*'. */
  locatePlayingInMatrix() {
    if (!this.postToMatrix('matrix:scroll-to-playing')) return;
    // Remember the list has been scrolled away from the top, so the next
    // slide can put it back. Only then -- resetting on every slide would
    // fight the user any time they scrolled the list themselves.
    this.matrixScrolledToPlaying = true;
  }

  /** Send a message into the embedded matrix. False when there's no
   *  iframe to talk to. Targeted at our own origin, never '*'. */
  private postToMatrix(type: string): boolean {
    const frame = document.querySelector('iframe.matrix-bg') as HTMLIFrameElement | null;
    if (!frame || !frame.contentWindow) return false;
    frame.contentWindow.postMessage({ type }, window.location.origin);
    return true;
  }

  private onMatrixMessage = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'matrix:rating-counts') return;
    this.matrixCounts = d.counts || [];
    this.matrixUnrated = d.unrated || 0;
    this.matrixRated = d.rated || 0;
    this.matrixTotal = d.total || 0;
  };

  toggleMatrixBg() {
    this.showMatrixBg = !this.showMatrixBg;
    // The legend takes the top of the screen, which is where the search
    // bar now lives, so they can't both be up.
    if (this.showMatrixBg && this.showSearchBar) {
      this.showSearchBar = false;
      this.searchBarManual = false;
    }
    if (this.showMatrixBg && !this.matrixBgUrl) {
      const session = (window.localStorage.getItem('account') || '').trim();
      const url = '/matrix' + (session ? '?session=' + encodeURIComponent(session) : '');
      this.matrixBgUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
  }

  disableShield() {
    // Logic to disable the shield
    this.showShield = false;
  }

  onSearch(event: any) {
    const searchTerm = (event.target.value || '').trim();
    if (searchTerm !== '') {
      this.performSearch(searchTerm);
    } else {
      // Empty submit → no-op. Was redirecting to /matrix, but in
      // embedded browsers (Spacewalker) that turned into a one-way
      // trip: the search bar can submit empty unexpectedly and the
      // user gets stranded on /matrix with no UI to come back.
      // Stay on home; the intro slide is still rendered and the
      // user can re-type a session.
    }
  }

  onSearchKeyup(event: KeyboardEvent) {
    const searchTerm = ((event.target as HTMLInputElement).value || '').trim();

    // Check if the Enter key was pressed
    if (event.key === 'Enter' || event.key === 'Return') {
      if (searchTerm !== '') {
        this.performSearch(searchTerm);  // Trigger the search only when Enter is pressed
        setTimeout(() => {
          this.searchbar.getInputElement().then((input) => {
            input.blur();
          });
        }, 10);
      } else {
        // No-op on empty Enter; see onSearch for the rationale.
      }
    }
  }

  // Hand-off table for the in-progress S3-load. Cleared in cleanupLoadJob.
  private currentLoadingEl: HTMLIonLoadingElement | null = null;
  private currentJobId: string | null = null;
  private currentPollHandle: any = null;

  // Search bar submit now triggers a server-side S3 load instead of the old
  // client-side searchVideos filter. The typed pattern is sent to
  // POST /sessions/load; the backend lists s3://coin.computer/Videos/,
  // egreps the keys against `pattern`, and DELETE+INSERTs rows tagged with
  // session=pattern. On completion we set localStorage.account = pattern
  // and reload the feed so the user sees the new session immediately.
  performSearch(searchTerm: string) {
    const pattern = (searchTerm || '').trim();
    if (!pattern) {
      return;
    }

    // Cancel any in-flight load so a rapid second submit doesn't strand
    // the previous loading overlay or a runaway poll loop.
    this.cleanupLoadJob();

    this.loadingController
      .create({
        message: `Searching for "${pattern}"…`,
        backdropDismiss: false,
      })
      .then(async (el) => {
        this.currentLoadingEl = el;
        await el.present();

        this.data.loadSession(pattern).subscribe(
          (resp) => {
            this.currentJobId = resp.job_id;
            console.log(`home.page.ts: performSearch job ${resp.job_id} started for session '${resp.session}'`);
            this.currentPollHandle = setInterval(() => this.pollLoadJob(pattern), 2000);
          },
          (err) => {
            console.error('home.page.ts: performSearch loadSession failed:', err);
            const msg = (err && err.error && err.error.error)
              ? err.error.error
              : 'failed to start search';
            this.dismissLoadingWithToast(`Search failed: ${msg}`);
          },
        );
      });
  }

  private pollLoadJob(pattern: string) {
    if (!this.currentJobId) {
      return;
    }
    this.data.getSessionJob(this.currentJobId).subscribe(
      (job) => {
        const el = this.currentLoadingEl;
        if (el) {
          if (job.status === 'listing') {
            el.message = `Listing matches for "${pattern}"…`;
          } else if (job.status === 'loading') {
            const total = job.found || 0;
            const loaded = job.loaded || 0;
            el.message = total
              ? `Loading ${loaded} / ${total} videos for "${pattern}"…`
              : `Loading videos for "${pattern}"…`;
          }
        }
        if (job.status === 'complete') {
          this.cleanupLoadJob();
          if (this.currentLoadingEl) {
            this.currentLoadingEl.dismiss();
            this.currentLoadingEl = null;
          }
          this.onLoadComplete(pattern, job.loaded || 0);
        } else if (job.status === 'failed') {
          const msg = job.error || 'unknown error';
          this.dismissLoadingWithToast(`Search failed: ${msg}`);
        }
      },
      (err) => {
        console.error('home.page.ts: pollLoadJob failed:', err);
        // Don't tear down on a transient poll failure — the next tick will retry.
      },
    );
  }

  // Reload the feed against the newly-loaded session. localStorage.account
  // doubles as the session filter (data.service.getVideoList appends it),
  // so setting it here makes the next loadVideos call hit the right rows.
  private onLoadComplete(pattern: string, loaded: number) {
    window.localStorage.setItem('account', pattern);
    window.sessionStorage.setItem('account', pattern);
    this.videoList = [];
    this.currentPage = 1;
    this.loadVideos();
    // New session = new "left to rate" count; refresh the searchbar placeholder.
    this.refreshProgress();
    this.presentToast(`Loaded ${loaded} videos for "${pattern}"`);
    // Snap to the first slide so the user sees the new content.
    try {
      this.slides.slideTo(0);
    } catch { /* slide may not be ready yet — loadVideos will populate first */ }
  }

  private dismissLoadingWithToast(message: string) {
    this.cleanupLoadJob();
    if (this.currentLoadingEl) {
      this.currentLoadingEl.dismiss();
      this.currentLoadingEl = null;
    }
    this.presentToast(message);
  }

  private cleanupLoadJob() {
    if (this.currentPollHandle) {
      clearInterval(this.currentPollHandle);
      this.currentPollHandle = null;
    }
    this.currentJobId = null;
  }

  updateVideoList(results: any[]) {
    console.log("home.page.ts: updateVideoList called");
    console.dir(results);

    if (results.length > 0) {
      const insertIndex = 1;
      console.log(`home.page.ts: updateVideoList Inserting ${results.length} results at index: ${insertIndex}`);
      this.presentToast("Adding search results to your feed");

      // Remove duplicates within the results array
      const uniqueResultsFromResults = results.filter(
        (newVideo, index, self) =>
          index === self.findIndex((video) => video.userName === newVideo.userName)
      );

      // Remove duplicates that already exist in the videoList
      const uniqueResults = uniqueResultsFromResults.filter(
        (newVideo) => !this.videoList.some((existingVideo) => existingVideo.userName === newVideo.userName)
      );

      // Insert the unique results at the current index in the videoList
      this.videoList.splice(insertIndex, 0, ...uniqueResults);

      // Programmatically navigate the slides
      this.slides.slideTo(0);  // Go to the first slide
      document.querySelector('ion-slides').slideTo(0);
      this.slides.update();  // This refreshes the slides component
      this.presentToast("Search results have neem added to feed.");
      //setTimeout(() => document.querySelector('ion-slides').slideNext(), 1000);
    }
  }


  // Method to show the searchbar
  showSearchbar() {
    this.showSearchBar = true;
  }

  // Method to hide the searchbar
  hideSearchbar() {
    this.showSearchBar = false;
  }

  slideOpts = {
    direction: 'vertical',
    // longSwipes: false forces exactly ONE slide advance per swipe. The
    // Swiper default (longSwipes: true) advances multiple slides on a fast
    // or long drag and emits ionSlideDidChange for each intermediate slide.
    // Our scroll-past hook fires per event, so a multi-slide swipe would
    // record N skip-ratings (decrementing "videos left to rate" by N) for
    // a single user gesture — observed as 419 → 417 from one swipe.
    longSwipes: false,
  };

  // Map of Chain IDs to Chain Names
  chainMap = {
    '1': 'Ethereum Mainnet',
    '3': 'Ropsten Testnet',
    '4': 'Rinkeby Testnet',
    '5': 'Goerli Testnet',
    '42': 'Kovan Testnet',
    '97': 'Binance Smart Chain Testnet',
    '137': 'Polygon Mainnet',
    '80001': 'Polygon Mumbai Testnet',
    '250': 'Fantom Opera',
    '4002': 'Fantom Testnet',
    '43114': 'Avalanche Mainnet',
    '43113': 'Avalanche Fuji Testnet',
    '42161': 'Arbitrum One',
    '421611': 'Arbitrum Rinkeby Testnet',
    '10': 'Optimism Mainnet',
    '69': 'Optimism Kovan Testnet',
    '100': 'xDai Chain (Gnosis)',
    '128': 'Huobi ECO Chain Mainnet',
    '256': 'Huobi ECO Chain Testnet',
    '1666600000': 'Harmony Mainnet',
    '1666700000': 'Harmony Testnet',
    '66': 'OKExChain Mainnet',
    '65': 'OKExChain Testnet',
    '42220': 'Celo Mainnet',
    '44787': 'Celo Alfajores Testnet',
    '11297108109': 'Palm Mainnet',
    '11297108099': 'Palm Testnet',
    '25': 'Cronos Mainnet',
    '338': 'Cronos Testnet',
    '321': 'KCC Mainnet',
    '322': 'KCC Testnet',
    '1284': 'Moonbeam Mainnet',
    '1285': 'Moonriver',
    '1287': 'Moonbase Alpha Testnet',
    '42262': 'Oasis Emerald Mainnet',
    '42261': 'Oasis Emerald Testnet',
    '70': 'Hoo Smart Chain Mainnet',
    '1663': 'Latam Mainnet',
    '4690': 'IoTeX Testnet',
    '50': 'XinFin XDC Network',
    '56': 'Binance Smart Chain Mainnet',
    '40': 'Telos EVM Mainnet',
    '41': 'Telos EVM Testnet',
    '122': 'Fuse Mainnet',
    '1088': 'Metis Andromeda Mainnet',
    '4689': 'IoTeX Mainnet',
    '592': 'Astar Mainnet',
    '8217': 'Klaytn Mainnet',
    '11155111': 'Ethereum Sepolia',
  };

  constructor(
    private data: DataService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private router: Router,
    private sanitizer: DomSanitizer,
  ) { }

  // Method to present a toast
  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,  // Toast will be shown for 2 seconds
      position: 'bottom',  // You can set position as 'top', 'middle', or 'bottom'
    });
    toast.present();
  }

  /**
   * Initializes the WebSocket connection to the server.
   */
  private initializeWebSocket() {
    const websocketUrl = 'wss://dastream.cloud/ws'; // WebSocket endpoint
    this.ws = new WebSocket(websocketUrl);

    this.ws.onopen = () => {
      console.log('home.page.ts: initializeWebSocket WebSocket connection established.');
    };

    this.ws.onmessage = (event) => {
      this.handleWebSocketMessage(event.data);
    };

    this.ws.onclose = () => {
      console.warn('home.page.ts: initializeWebSocket WebSocket connection closed. Attempting to reconnect...');
      setTimeout(() => this.initializeWebSocket(), 5000); // Retry connection after 5 seconds
    };

    this.ws.onerror = (error) => {
      console.error('home.page.ts: initializeWebSocket WebSocket encountered an error:', error);
    };
  }

  /**
   * Handles incoming WebSocket messages.
   * @param message The received message
   */
  private async handleWebSocketMessage(message: string) {
    console.log('home.page.ts Message handleWebSocketMessage received from WebSocket:'+ message + " skipMode: " + this.skipMode );
    console.log('home.page.ts Message handleWebSocketMessage remoteMode:'+ this.remoteMode );
    console.log('home.page.ts Message handleWebSocketMessage skipBack:'+ window.sessionStorage.getItem('skipBack') );

    if (this.remoteMode)
      return


    if (message === 'next_slide') {
      let index = 0;
      if (this.skipMode && !this.remoteMode && window.sessionStorage.getItem('skipBack') == 'yes') {
          console.log("home.page.ts handleWebSocketMessage Sliding back a slide");
          window.sessionStorage.setItem('skipback','no');
          this.slides.slidePrev();
      }
 
      var skiptIt = false;
      if (window.sessionStorage.getItem('markasskipped') == "true")
        skiptIt=true;

      try {
        // Get the active slide index
        index = await this.slides.getActiveIndex();
      } catch (error) {
        console.error('home.page.ts handleWebSocketMessage Error getting active slide index:', error);
        return;
      }
      if (this.skipMode && skiptIt) {
        if (index == 0) {
          this.slideNext();
          return
        }

        if (index > 0) {
          console.log("home.page.ts handleWebSocketMessage Setting acount to 99999, becuase index is > 0")
          window.sessionStorage.setItem('account','99999');
        }
        console.log("home.page.ts handleWebSocketMessage got message: " + message + " skip mode: " + this.skipMode + " account: " + window.sessionStorage.getItem('account'))
        //setTimeout(this.slideNext,5000)
      }
      else {
        this.slideNext();
      }
    }

    window.sessionStorage.setItem('markasskipped','true') 

    if (message === 'like' || (message === 'next_slide' && !this.remoteMode && this.skipMode)) {
      let index = 0;
      if (message === 'like')
        window.sessionStorage.setItem('account','droid');
      try {
        // Get the active slide index
        index = await this.slides.getActiveIndex();
      } catch (error) {
        console.error('home.page.ts handleWebSocketMessage Error getting active slide index:', error);
        return;
      }
  
      console.log('home.page.ts handleWebSocketMessage: Active slide index:', index);
  
      // Get the active ion-slide
      const ionSlides = document.querySelectorAll('ion-slide');
      const activeSlide = ionSlides[index];
  
      if (!activeSlide) {
        console.warn('Active slide not found.');
        return;
      }
  
      // Find the first div with an id attribute within the active slide
      const targetDiv = activeSlide.querySelector('div[id]');
  
      if (!targetDiv) {
        console.warn('home.page.ts handleWebSocketMessage No div with an id attribute found in the active slide.');
        return;
      }
  
      console.log('home.page.ts handleWebSocketMessage Found target div:', targetDiv);
  
      // Simulate a click event on the div
      targetDiv.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      console.log('home.page.ts handleWebSocketMessage Click event dispatched to the target div.');
    }

    //if (this.skipMode) {
    //    this.slideNext();
    //}
  }


  /**
   * Navigates to the next slide.
   */
  private async slideNext() {
    const markasskipped = window.sessionStorage.getItem('markasskipped')
    var marknext = false;
    let index = 0;
    try {
      // Get the current active slide index
      index = await this.slides.getActiveIndex();
    } catch (error) { }

    if (markasskipped === 'true' && index > 1)
      marknext = true;

      if (this.slides && marknext) {
      console.log('home.page.ts slideNext Navigating to the next slide...');
      if (this.skipMode && marknext) {
        try {
          // Hit the URL endpoint
          const response = await fetch('https://dastream.cloud/next_slide', {
            method: 'GET', // or 'POST' depending on what the endpoint expects
          });
      
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
      
          const data = await response.json(); // Assuming the response is JSON
          console.log('Next slide data:', data);
        } catch (error) {
          console.error('Error hitting the next_slide endpoint:', error);
        }
        console.log('home.page.ts slideNext Mark the current video as skipped');
      }
      await this.slides.slideNext();
    }
  }

  ngOnInit() {
    // Disabled: handleWebSocketMessage was treating every incoming WS
    // message as a remote-control signal — calling slideNext/slidePrev,
    // synthesizing clicks on the heart icon (which trips the /likes
    // kludge, clobbers videos.userPic, and hides videos from the feed),
    // and re-mutating localStorage.account to 'droid'. With other tabs
    // potentially connected to wss://dastream.cloud/ws, this caused
    // random-feeling slide jumps and per-swipe count drops > 1. The
    // music app has no use for cross-device remote control today, so
    // skip the connection entirely. Re-enable when remote mode is
    // properly gated (separate UI toggle, dedicated remote host, etc.).
    // this.initializeWebSocket();
    window.sessionStorage.setItem("next","");
    window.sessionStorage.setItem('viewbookmarks',"false");
    window.sessionStorage.removeItem("videoResults");
    window.sessionStorage.setItem('markasskipped','true') 
    //window.localStorage.removeItem("bookmarks");
    console.log('home.page.ts: ngOnInit Get video list');
    //this.videoList = this.data.getVideoList();
    const chainId = window.sessionStorage.getItem('chain');
    this.chainName = this.chainMap[chainId] || 'Unknown Chain';
    this.showHeaderDiv = window.location.host.startsWith('tikethtok.app');
    if (!this.showHeaderDiv) {
      console.log("home.page.ts: ngOnInit Browser User Agent: ", navigator.userAgent);
      if (window.location.host.startsWith('audio.')) {
        window.localStorage.setItem('account','droid')
      }
      else {
        // Was a plain `alert("Account: <name>")` — informational only,
        // no way to opt out of the stored session short of opening
        // devtools. Replace with a confirm offering to clear it,
        // analogous to "clear browser cache". Yes → drop both storage
        // copies and stay on home with no session loaded (intro slide
        // still renders; user can pick a session via the search bar).
        // No → fall through and the existing branch loads videos for
        // the stored session.
        const current = window.localStorage.getItem('account');
        if (current && window.confirm(`Current session: ${current}. Clear it?`)) {
          window.localStorage.removeItem('account');
          window.sessionStorage.removeItem('account');
          return;
        }
      }
      if (window.localStorage.getItem('account')) {
        window.sessionStorage.setItem('account',window.localStorage.getItem('account'))
        if (window.localStorage.getItem(window.localStorage.getItem('account')))
          this.currentPage = Number(window.localStorage.getItem(window.localStorage.getItem('account')))
      }
      else {
        // prompt() returns null when the user cancels and '' for empty
        // input. Either case used to be stored literally, which then
        // propagated to the backend as session=null. Guard so we only
        // store a non-empty trimmed string; if the user cancels or
        // submits empty, stay on home with no session loaded — the
        // intro slide is still rendered and the search bar lets the
        // user pick a session. Previously redirected to /matrix,
        // which was a one-way trip in embedded browsers (Spacewalker)
        // where dialog handling pushes the user there on every reload
        // with no UI to get back.
        const entered = (prompt("Enter show name") || '').trim();
        if (entered) {
          window.sessionStorage.setItem('account', entered);
        } else {
          return;
        }
      }
      const acct = window.sessionStorage.getItem('account');
      if (acct) {
        window.localStorage.setItem('account', acct);
      }
    }
    window.addEventListener('message', this.receiveMessage.bind(this), false);
    this.loadVideos();
    // Populate searchPlaceholder with the per-session "N left to rate" count.
    // Backend-side count; failure is silent.
    this.refreshProgress();
    console.log('home.page.ts ngOnInit Page loaded');
    console.log('home.page.ts ngOnInit Page host: [' + window.location.host + ']');
    console.log('home.page.ts ngOnInit Page starts with tikethtok.app: [' + window.location.host.startsWith('tikethtok.app') + ']');
    console.log('home.page.ts ngOnInit Page search: [' + window.location.search + ']');
    window.addEventListener('keydown', this.handleArrowKeys.bind(this));
    this.updateTitle();
    this.startNowPlayingHeartbeat();
    window.addEventListener('message', this.onMatrixMessage);
  }

  private updateTitle() {
    if (!this.showHeaderDiv) {
      document.title = window.location.host;
    }
  }
  
  loadVideos() {
    console.log("home.page.ts loadVideos !! load mode videos")

    this.data.getVideoList(this.currentPage, this.limit, this.videoListReversed).subscribe((videos) => {
        console.log("home.page.ts loadVideos DEBUG: videos sent from server: ");
        console.dir(videos);
        this.videoList = this.videoList || [];
        this.videoList = [...this.videoList, ...videos];
        console.log(`home.page.ts loadVideos Got ${this.videoList.length} videos`)
    });
  }

  loadMoreVideos() {
    this.currentPage++;
    this.loadVideos();
    window.localStorage.setItem(window.localStorage.getItem('account'),this.currentPage.toString())
  }
  handleWeb3Auth() {
    const audioElement = document.getElementById('background-audio') as HTMLAudioElement;
    const floatingVideo = document.getElementById('float') as HTMLVideoElement;
  
    audioElement.muted = false;
    audioElement.play();
    floatingVideo.muted = false;
  
    // Create and append iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'web3auth';
    const protocol = window.location.protocol; // 'http:' or 'https:'
    const host = window.location.hostname;
    iframe.src = `${protocol}//${host}:5173${window.sessionStorage.getItem('next')}`;
    iframe.style.overflow = 'hidden';
    iframe.style.opacity = '0.99';
    iframe.style.backgroundColor = 'transparent';
    iframe.style.position = 'absolute';
    iframe.style.borderRadius = '10px';
    iframe.style.top = '10px';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.transform = 'scale(.80)';
    iframe.style.zIndex = '9999';
  
    // Create and add the blur overlay
    const overlay = document.createElement('div');
    overlay.id = 'blur-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; /* Semi-transparent overlay */
    overlay.style.zIndex = '9995'; /* Ensure it covers everything but the iframe */
  
    // Set the backdropFilter property using setProperty
    overlay.style.setProperty('backdrop-filter', 'blur(10px) brightness(1.2)');
  
    document.body.appendChild(overlay);
    document.body.appendChild(iframe);
  }
  
  handleCamera() {
    document.querySelector('ion-slides').slideNext();
    this.showControls = false; // Hide the slider and button

    const audioElement = document.getElementById('background-audio') as HTMLAudioElement;
    const floatingVideo = document.getElementById('float') as HTMLVideoElement;
  
    audioElement.muted = false;
    audioElement.play();
    floatingVideo.muted = false;
  
    // Create and append iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'camera';
    const protocol = window.location.protocol; // 'http:' or 'https:'
    const host = window.location.hostname;
    //iframe.src = `${protocol}//${host}:5173${window.sessionStorage.getItem('next')}`;
    iframe.src = `https://your.cmptr.cloud/3d/camera.html`;
    iframe.allow = 'camera *;microphone *'
    iframe.style.overflow = 'hidden';
    iframe.style.opacity = '0.99';
    iframe.style.backgroundColor = 'transparent';
    iframe.style.position = 'absolute';
    iframe.style.borderRadius = '1px';
    iframe.style.top = '204px';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.transform = 'scale(1)';
    iframe.style.zIndex = '9999';
    iframe.setAttribute('allowTransparency', 'true'); // Ensure transparency is allowed
    iframe.style.border = 'none'; // Optional, removes the border around the iframe

  
    document.body.appendChild(iframe);
  }
  receiveMessage(event: MessageEvent) {
    // Optionally, you can check event.origin to ensure the message comes from the expected origin
    //if (event.origin !== 'http://192.168.1.183:5173') {
    //  return;
    //}

    // Access the data sent from the iframe
    const data = event.data;
    console.log('home.page.ts receiveMessage Message received from iframe:', data);

    if (data.view == 'bookmark') {
      this.data.getVideo(data.location).subscribe(
        (response: any) => {
          console.log("home.page.ts receiveMessage DEBUG: Got results from getVideo:");
          console.dir(response);
	  this.searchResults = Array.isArray(response) ? response : [response];

          // Call updateVideoList to insert the search results
          this.updateVideoList(this.searchResults);
          this.slides.slideTo(1);  
        },
        (error) => {
          console.error('Search failed:', error);
        }
      );
    }

    if (data.view === 'login') {
      console.log(`home.page.ts receiveMessage Login box with status [${data.status}]`);
      if (data.status === "ready") {
        console.log("home.page.ts receiveMessage resize login iframe");
        document.getElementById("web3auth").style.transform = 'scale(.70)';
        document.getElementById("web3auth").style.top = '-150px';
        document.getElementById("web3auth").style.height = '170%';
      }
    }

    if (data.view === 'searchResults') {
      //this.data.getVideo("3").subscribe((videos) => { console.log("videos sent from server: "); console.dir(videos) } );
      this.slides.slideTo(data.location + 1);  
    }

    if (data.view == 'logout') {
      window.sessionStorage.setItem("account",null);
      window.sessionStorage.setItem("chain",null);
      var element = document.getElementById('web3auth');
      if (element) {
        element.remove(); // This will remove the element from the DOM
      }
      var element = document.getElementById('blur-overlay');
      if (element) {
        element.remove(); // This will remove the element from the DOM
      }
    }

    // Handle the received data (e.g., update UI, log data, etc.)
    if (data.view === 'loggedInView' || data.view === "abort" ) {
      console.log('home.page.ts receiveMessage Iframe is in loggedInView, account:', data.account);
      window.sessionStorage.setItem("account",data.account);
      window.sessionStorage.setItem("chain",String(data.chain));
      //const chainId = window.sessionStorage.getItem("chain");
      //alert(`${chainId} ${this.chainMap[chainId]}`);
      if (data.view !== "abort")
        window.sessionStorage.setItem("next","?logout");
      var element = document.getElementById('web3auth');
      if (element) {
        element.remove(); // This will remove the element from the DOM
      }
      var element = document.getElementById('blur-overlay');
      if (element) {
        element.remove(); // This will remove the element from the DOM
      }
      document.querySelector('ion-slides').slideNext();
      // Perform any other actions based on the received data
    }
  }
 
  // Method to handle arrow key navigation
  handleArrowKeys(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      this.slides.slideNext(); // Move to the next slide
    } else if (event.key === 'ArrowLeft') {
      this.slides.slidePrev(); // Move to the previous slide
    }
  }

  /**
   * Report the video at `index` as currently playing.
   *
   * Slide 0 is the intro/search card rather than a real mix, so it never
   * reports — a box on the black intro clip would be noise on the matrix.
   *
   * Skips the request when the video hasn't changed AND this is a slide
   * change rather than a heartbeat, so swiping back and forth doesn't
   * hammer the endpoint. The heartbeat passes force=true to refresh
   * updated_at even when the video is the same, which is exactly what
   * keeps a long-watched video from ageing out of the matrix.
   */
  private reportNowPlaying(index: number, force: boolean = false) {
    if (index <= 0) return;
    const video = this.videoList && this.videoList[index];
    const videoId = video && video.id;
    if (!videoId) return;
    if (!force && this.lastReportedPlayingId === videoId) return;
    this.lastReportedPlayingId = videoId;
    this.data.postNowPlaying(videoId).subscribe(
      () => { },
      (err) => {
        // Log only. This decorates the matrix page; it must never surface
        // to the person rating, and it must never throw into the slide
        // handler, which also drives skip recording.
        console.warn('home.page.ts reportNowPlaying failed', err);
      },
    );
  }

  private startNowPlayingHeartbeat() {
    document.addEventListener('visibilitychange', this.onFeedVisibilityChange);
    this.nowPlayingHeartbeatHandle = setInterval(() => {
      // Keep reporting while the tab is hidden.
      //
      // This used to bail out immediately on document.hidden, reasoning
      // that a phone in a pocket isn't playing anything worth boxing.
      // That's right for two devices and WRONG for one: switching from
      // this tab to the matrix tab makes the feed hidden, the heartbeat
      // stopped, and 90s later the backend expired the row and the box
      // silently vanished — the single most obvious way to look at the
      // matrix is the way that broke it.
      //
      // A hidden tab still holds a real position in the deck, so it still
      // represents what's playing. The grace period is what stops a tab
      // forgotten overnight from pinning a phantom box on the wall
      // display: past it we go quiet and the row expires on its own.
      if (this.hiddenSince !== null &&
          Date.now() - this.hiddenSince > this.NOW_PLAYING_HIDDEN_GRACE_MS) {
        return;
      }
      this.reportNowPlaying(this.lastSlideIndex, true);
    }, this.NOW_PLAYING_HEARTBEAT_MS);
  }

  // Arrow property so `this` binds and removeEventListener gets the same
  // reference back in ngOnDestroy.
  private onFeedVisibilityChange = () => {
    if (document.hidden) {
      this.hiddenSince = Date.now();
    } else {
      // Back in front: reset the grace window and report at once rather
      // than waiting out the interval, so the box reappears immediately
      // if it had aged out.
      this.hiddenSince = null;
      this.reportNowPlaying(this.lastSlideIndex, true);
    }
  };

  ngOnDestroy() {
    if (this.nowPlayingHeartbeatHandle !== null) {
      clearInterval(this.nowPlayingHeartbeatHandle);
      this.nowPlayingHeartbeatHandle = null;
    }
    document.removeEventListener('visibilitychange', this.onFeedVisibilityChange);
    window.removeEventListener('message', this.onMatrixMessage);
    if (this.ws) {
      this.ws.close();
    } 
    // Remove the event listener when the component is destroyed
    window.removeEventListener('message', this.receiveMessage.bind(this), false);
    window.removeEventListener('keydown', this.handleArrowKeys.bind(this));
  }

  ionViewDidEnter() {
    const chainId = window.sessionStorage.getItem('chain');
    //alert(this.chainMap[chainId]);
    console.log(`home.page.ts ionViewDidEnter Chain Id: ${chainId}`);
    console.dir(chainId);
    this.chainName = this.chainMap[chainId] || 'Unknown Chain';
    this.showHeaderDiv = window.location.host.startsWith('tikethtok.app');

    // Call this when the page is loaded and visible
    this.checkActiveSlide();
  }

  async checkActiveSlide() {
    var index = 0;
    try {
      index = await this.slides.getActiveIndex();
    }
    catch (error) {
      console.log("home.page.ts checkActiveSlide ------------------ error: " + error)
    }
    console.log('home.page.ts checkActiveSlide: Active slide index:', index);

    const slides = this.slidesElementRef.nativeElement.querySelectorAll('ion-slide');

    if (slides[index]) {
      const activeSlideId = slides[index].id;
      console.log('home.page.ts: checkActiveSlide index=' + index + ' Current Slide ID:', activeSlideId);
    } else {
      console.error('home.page.ts: checkActiveSlide No slide found at the active index.');
    }
      // You can now perform actions based on the active slide index
      // Example: Pause videos on inactive slides
      this.pauseInactiveSlides(index);
      // Covers arriving on the page: ionSlideDidChange doesn't fire for the
      // slide you land on, so without this nothing reports until the first
      // swipe and the matrix shows no box for a video already playing.
      this.reportNowPlaying(index);
  }

  pauseInactiveSlides(activeIndex: number) {
      // Get all ion-slide elements
      const slides = document.querySelectorAll('ion-slide');

	 
      // Slide-driven show/hide, but only until the user expresses a
      // preference with the search toggle. After that their choice wins,
      // otherwise every swipe would undo it.
      if (this.searchBarManual === null) {
        if (activeIndex == 0)
          this.hideSearchbar();
        else
          this.showSearchbar();
      }

      slides.forEach((slide, index) => {
        const videos = slide.querySelectorAll('video');
        //console.log(`Slide index : ${index} of ${slides.length}`);
        //console.log(`# of Videos : ${videos.length}`);
        // Create a new element (e.g., a div with some text or an icon)
        const newElement = document.createElement("div");
        if (index != 0) {
          newElement.id = `project-${index}`; 
          newElement.style.top = '50%';
          newElement.innerHTML = `<h1 id="title-${index}" style="font-color: #000;font-family: \'TikTok Display\'; font-weight: bold; font-style: normal;">TikΞTok</h1><br><p id="description-${index}">Browse and discover ETHGlobal hackathon projects.</p>` 
        }
        else {
         newElement.id = "intro-box";
	 if (window.sessionStorage.getItem('videoResults') || window.localStorage.getItem('bookmarks')) {
           const floating_vid = document.getElementById('float');
	   //floating_vid.style.display = "block"
	   const page = window.sessionStorage.getItem('viewbookmarks') === "true" ? "bookmarks" : "search_results";
           newElement.innerHTML = `<iframe src="assets/fonts/${page}.html?${window.sessionStorage.getItem('account')}" frameBorder="0" style="z-index: 10000; border-radius: 10px; overflow: hidden; opacity: 0.90; background-color: transparent; width: 90%; height: 100%;" allowTransparency="true"></iframe>`;
           newElement.style.height = '90%';
           newElement.style.zIndex = '10000';
           newElement.style.left = '5px';
	 }
	 else {
    if (!this.showHeaderDiv) {
           newElement.innerHTML = `<iframe src="assets/fonts/dastream.html?${window.sessionStorage.getItem('account')}" frameBorder="0" style="border-radius: 10px; overflow: hidden; opacity: 0.70; background-color: transparent; width: 70%; height: 174px;" allowTransparency="true"></iframe>`;
    } else {
           newElement.innerHTML = `<iframe src="assets/fonts/intro.html?${window.sessionStorage.getItem('account')}" frameBorder="0" style="border-radius: 10px; overflow: hidden; opacity: 0.70; background-color: transparent; width: 70%; height: 174px;" allowTransparency="true"></iframe>`;
    }
           newElement.style.height = '50%';
           newElement.style.left = '10px';
	  }
        }
        const userAgent = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;  // Check if user agent is iOS

        newElement.style.position = 'absolute';
        newElement.style.bottom = '10px';
        newElement.style.right = '10px';
        //index != 0 ? newElement.style.backgroundColor = 'rgba(0, 0, 0, 0.0)' : /* transparent box */
        !isIOS && index != 0 ? newElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)' : /* transparent box */
         newElement.style.backgroundColor = 'rgba(0, 0, 0, 0.0)'

        if (!isIOS && index != 0) {
          newElement.style.left = '2px';
          newElement.style.right = '2px';
        }
           
        !isIOS ? newElement.style.color = 'white' : newElement.style.color = 'black';
        newElement.style.padding = '5px';
        newElement.style.borderRadius = '5px';
           
        if (document.getElementById(`project-${index}`) !== null)
          document.getElementById(`project-${index}`).remove();
        if (document.getElementById("intro-box") !== null && index == 0)
          document.getElementById("intro-box").remove();
        // Append the new element to the slide
        slide.appendChild(newElement);

        // Pause videos if the slide is not active
        const floating_vid = document.getElementById('float');
        const project = document.getElementById(`title-${index}`);
        const description = document.getElementById(`description-${index}`);
        const current_video = videos[0];
        //console.log("Current videos: ");
        //console.dir(videos);
        //console.log("Current video: ");
        //console.dir(current_video);
        if (index > 0 && current_video !== null) {
           // The title attribute carries the session name; data-mix-info
           // carries the composed song description (see the binding
           // comment in home.page.html).
           project.innerText = current_video.getAttribute('title') || '';
           description.innerText = current_video.getAttribute('data-mix-info') || '';
           description.style.width = "87%";
           description.style.textAlign = "left";
        }
        if (index !== activeIndex) {
          videos.forEach(video => video.pause());
          //console.log('Paused videos on slide index:', index);
        }
        else {
          videos.forEach(video=> {
           if ((index + 1) == slides.length) 
            this.loadMoreVideos();
           console.log('home.page.ts pauseInactiveSlides Play videos on slide index:', index);
           console.log('home.page.ts pauseInactiveSlides Play video:', video.src );
           if (index == 0) {
             console.log("home.page.ts pauseInactiveSlides Count of index at zero: ", ++this.count)
             //floating_vid.setAttribute('src',"https://your.cmptr.cloud:2017/ad" + this.count + ".mp4"); 
             floating_vid.setAttribute('src',"https://your.cmptr.cloud:2017/lft.mp4"); 
             video.src = floating_vid.getAttribute('src');
             video.play();
           }
           else {
             if (!this.remoteMode) {
              floating_vid.setAttribute('src',video.src); 
              floating_vid.setAttribute('video-id',this.videoList[index].id); 

              console.log('home.page.ts pauseInactiveSlides Play this video:', this.videoList[index].url );
             }
             else { floating_vid.style.visibility = 'hidden' }
           }
          });
          //videos.forEach(video => video.muted = !video.muted);
          //videos.forEach(video => video.play());
        }
        //console.log(`Active index ${activeIndex}`);
    });
  }

// Called by app-feed when the user taps the chevron arrow under
// the bookmark icon. Toggles the reversed flag and reloads the
// unrated set from the backend in the opposite order (?reverse=1
// flips the SQL ORDER BY id to DESC). The previous implementation
// reversed the in-memory videoList and slideTo'd — but that meant
// "forward" swipes after the toggle replayed videos the user had
// already scroll-past'd, since the local array still held them.
// A backend reload only returns rows not yet rated/skipped by this
// account, so reversing now actually lands the user on the LAST
// unrated video and they proceed forward through fresh content.
//
// We clear videoList, reset currentPage, flip the flag, and call
// loadVideos() so the request fires with reverse=true. The intro
// slide (i === 0) is recreated as part of the next render.
// lastSlideIndex is reset to 0 so the scroll-past hook doesn't
// treat the post-reload slide change as a forward-skip and record
// a phantom rating-0 on whatever video lands at index 0.
toggleVideoListOrder() {
  this.videoListReversed = !this.videoListReversed;
  this.videoList = [];
  this.currentPage = 1;
  this.lastSlideIndex = 0;
  this.ratedThisPageLoad = new Set<number>();
  // Slide back to 0 before the *ngFor rebuilds so we don't briefly
  // render an out-of-range slide index against the empty list.
  if (this.slides) {
    this.slides.slideTo(0, 0).catch(() => {});
  }
  this.loadVideos();
  console.log(`home.page.ts toggleVideoListOrder reversed=${this.videoListReversed}, reloading from page 1`);
}

// Called by app-feed when the user taps any star (1-5). We just
// remember the video id so the scroll-past hook (below) does not
// double-record a 0 for the same video.
onFeedRated(videoId: number) {
  if (typeof videoId === 'number') {
    this.ratedThisPageLoad.add(videoId);
    console.log(`home.page.ts onFeedRated marked video ${videoId} as rated`);
  }
  // Each rating decrements the remaining count; refresh the placeholder
  // so the user sees progress immediately.
  this.refreshProgress();
}

// Update the searchbar placeholder with the count of videos in the current
// session that the user hasn't rated yet. Called on page load, after each
// star tap, after each scroll-past skip, and after a /sessions/load completes.
// Failures are intentionally silent — the placeholder just stays at whatever
// it was, no toast or error UI for a cosmetic feature.
refreshProgress() {
  this.data.getSessionProgress().subscribe(
    (resp) => {
      if (resp && typeof resp.remaining === 'number') {
        const n = resp.remaining;
        this.searchPlaceholder = n === 1
          ? '1 video left to rate'
          : `${n} videos left to rate`;
      }
    },
    (err) => {
      console.error('home.page.ts refreshProgress failed:', err);
    },
  );
}

// Compose a human-readable mix description from the backend's per-track
// metadata. Backend (music-k8s /videos) returns x_/y_ artist + title
// extracted from the mp4 atoms with a YouTube oEmbed backfill; either
// pair may be missing for older mp4s. Falls back to the filename so the
// overlay isn't blank when neither half had a hit.
mixInfo(video: any): string {
  if (!video) { return ''; }
  const x = this.formatTrack(video.x_artist, video.x_title);
  const y = this.formatTrack(video.y_artist, video.y_title);
  if (x && y) { return `${x} × ${y}`; }
  if (x || y) { return x || y; }
  return video.userPic || '';
}

private formatTrack(artist: string, title: string): string {
  const a = (artist || '').trim();
  const t = (title || '').trim();
  if (a && t) { return `${a} – ${t}`; }
  return a || t || '';
}

// Bumped by ionSlideTouchStart on the slider. Gates the scroll-past
// hook so programmatic slide changes (WebSocket-driven, dastream.cloud
// /next_slide responses, explicit slideNext() calls in the upstream
// code) don't get counted as user skips.
onSlideTouchStart() {
  this.touchSequence++;
}

// Persistent on-screen "advance" affordance — wired to the bottom
// arrow in home.page.html. Equivalent to a swipe-up gesture on the
// vertical slider; we bump touchSequence so the scroll-past hook
// treats this exactly like a swipe (records rating 0 for the slide
// being left if the user didn't tap a star). Touchless inputs
// (kiosks, accessibility, mouse-only) get the same UX as touch.
goToNextSlide() {
  this.touchSequence++;
  if (this.slides) {
    this.slides.slideNext();
  }
}

// Internal: if the user scrolled FORWARD past a video without tapping
// any star during this page-load, record rating=0 (skipped) for that
// video. Backwards motion never records. Slide 0 is the intro
// (no <app-feed>) so we skip it.
private maybeRecordScrollPastSkip(prevIndex: number, newIndex: number) {
  // Gate to user-initiated changes. touchSequence starts at 0 and only
  // increments on a real ionSlideTouchStart, so the comparison with
  // lastRecordedSequence (also 0) means programmatic startup events and
  // any post-initial-touch programmatic events are ignored. Each user
  // touch counts at most once regardless of how many slide-change events
  // follow it.
  if (this.touchSequence === this.lastRecordedSequence) {
    return;
  }
  if (newIndex <= prevIndex) {
    return;  // backward or no-op
  }
  if (prevIndex < 1) {
    return;  // slide 0 has no feed, nothing to rate
  }
  const prevVideo = this.videoList && this.videoList[prevIndex];
  if (!prevVideo || prevVideo.id === undefined) {
    return;
  }
  if (this.ratedThisPageLoad.has(prevVideo.id)) {
    return;  // user explicitly rated this one
  }
  // Mark BEFORE the request so rapid scrolling can't fire duplicates.
  // Also claim this touch — subsequent slide-change events from the same
  // gesture (or from programmatic auto-advance fired in response) won't
  // double-count.
  this.lastRecordedSequence = this.touchSequence;
  this.ratedThisPageLoad.add(prevVideo.id);
  this.data.postRating(prevVideo.id, 0).subscribe(
    () => {
      console.log(`home.page.ts scroll-past 0 recorded for video ${prevVideo.id}`);
      // Skip counts toward "done", so refresh the placeholder.
      this.refreshProgress();
    },
    err => console.error(`home.page.ts scroll-past 0 failed for video ${prevVideo.id}`, err),
  );
}

// Trigger this function on slide change
async onSlideDidChange() {
  const chainId = window.sessionStorage.getItem('chain');
  const remote = window.sessionStorage.getItem('remote');
  const skipped = window.sessionStorage.getItem('skipped');
  console.log(`home.page.ts onSlideDidChange Chain Id: ${chainId}`);
  console.log(`home.page.ts remote: ${remote}`);
  console.dir(chainId);
  console.log(`home.page.ts onSlideDidChange sessionStorage skipped: ${skipped}`);
  console.log("home.page.ts onSlideDidChange skipBack skipped: " + window.sessionStorage.getItem("skipBack"));
  this.chainName = this.chainMap[chainId] || 'Unknown Chain';
  this.showHeaderDiv = window.location.host.startsWith('tikethtok.app');
  let index = 0;
  try {
    // Get the current active slide index
    index = await this.slides.getActiveIndex();
  } catch { }

  // Scroll-past = rating 0. Compare new index against the last one we
  // recorded; forward motion with the previous slide unrated fires a
  // POST /rating {rating: 0} for the previous video. See the helper
  // for the full guard logic. Has to run BEFORE we mutate this.lastSlideIndex.
  this.maybeRecordScrollPastSkip(this.lastSlideIndex, index);
  this.lastSlideIndex = index;

  // Report what's now on screen. Runs for programmatic slide changes too,
  // unlike the skip hook above which is gated to user-initiated ones —
  // what's playing is what's playing regardless of how it got there.
  this.reportNowPlaying(index);

  // Moving to another song makes a list scrolled to the PREVIOUS one
  // misleading, so put it back to the top -- but only when the info
  // button was what scrolled it, so a manual scroll isn't undone.
  if (this.matrixScrolledToPlaying) {
    this.matrixScrolledToPlaying = false;
    this.postToMatrix('matrix:scroll-top');
  }

  if (remote == 'true')
    this.remoteMode = true;
  if (skipped == 'true' || skipped == null) {
    this.skipMode = true;
    window.sessionStorage.setItem('skipped','true')
  }
  else
    this.skipMode = false;

  if (remote || (!remote && index > 1 && window.sessionStorage.getItem("skipBack") != "yes")) {
    try {
      // Hit the URL endpoint
      window.sessionStorage.setItem("skipBack",'yes')
      const response = await fetch('https://dastream.cloud/next_slide', {
        method: 'GET', // or 'POST' depending on what the endpoint expects
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json(); // Assuming the response is JSON
      console.log('home.page.ts omSlideDidChange Next slide data:', data);
    } catch (error) {
      console.error('home.page.ts omSlideDidChange Error hitting the next_slide endpoint:', error);
    }
  }
  window.sessionStorage.setItem("skipBack",'no')

  const floating_vid = document.getElementById('float');
  floating_vid.style.display = "block";
  floating_vid.setAttribute("muted", "false");
  console.log("home.page.ts omSlideDidChange [[[[[[[[[[[[[[[[[[[[[[[[ Slide did change ]]]]]]]]]]]]]]]]]]]]]]]]]]]");

  index = 0;
  try {
    // Get the current active slide index
    index = await this.slides.getActiveIndex();

    // Show or hide the floating video element based on the slide index
    if (index === 0) {
      floating_vid.style.display = "none";
    } else {
      floating_vid.style.display = "block";
    }

    //if (index === 1) {
    //  this.showShield = true;
    //}
    // Check for the paragraph element with id "description-x"
    const paragraph = document.getElementById(`description-${index}`);
    if (paragraph) {
      const paragraphText = paragraph.textContent || paragraph.innerText || '';
      console.log(`home.page.ts omSlideDidChange Paragraph text for slide ${index}: ${paragraphText}`);

      // If the paragraph text starts with "Heart", advance to the next slide
      if (paragraphText.trim().startsWith('Heart')) {
        console.log(`home.page.ts omSlideDidChange Paragraph starts with "Heart", advancing to the next slide...`);

        // Ensure slide navigation works correctly
        const slideCount = await this.slides.length(); // Total number of slides
        if (index < slideCount - 1) {
          await this.slides.slideNext(); // Advance to the next slide
          console.log("home.page.ts omSlideDidChange Slide advanced successfully.");
        } else {
          console.log("home.page.ts omSlideDidChange Already on the last slide.");
        }
        return; // Exit early to avoid further processing for this slide
      }
    } else {
      console.log(`home.page.ts omSlideDidChange No paragraph element found with id "description-${index}".`);
    }
  } catch (error) {
    console.log("home.page.ts omSlideDidChange Got onSlideDidChange error: " + error);
  }

  // Perform any additional slide checks
  this.checkActiveSlide();
}

}
