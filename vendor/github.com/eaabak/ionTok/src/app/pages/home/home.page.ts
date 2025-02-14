import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { DataService } from "../../services/data.service";
import { ToastController } from '@ionic/angular';
import { IonSearchbar } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})

export class HomePage implements OnInit {
  //@ViewChild(IonSlides, { static: false }) slides: IonSlides;
  @ViewChild('slides', { static: false }) slides: IonSlides;  // Reference the IonSlides component
  //@ViewChild('searchbar', { static: false }) searchbar: ElementRef;
  @ViewChild('searchbar', { static: false }) searchbar: IonSearchbar; // Use IonSearchbar instead of ElementRef

  private ws: WebSocket | null = null; // WebSocket instance

  showSearchBar: boolean = false; // Initially hidden
  showShield: boolean = true;

  videoList: any = [];
  searchResults: any[] = [];  // Add searchResults property
  count = 0;
  currentPage: number = 1;
  limit: number = 10;

  chainName: string;
  showHeaderDiv: boolean;
  showControls: boolean = true; // Controls the visibility of the slider and button
  remoteMode: boolean = false;
  skipMode: boolean = true;
  
  disableShield() {
    // Logic to disable the shield
    this.showShield = false;
  }

  onSearch(event: any) {
    const searchTerm = event.target.value;
    if (searchTerm.trim() !== '') {
      this.performSearch(searchTerm);
    }
  }

  onSearchKeyup(event: KeyboardEvent) {
    const searchTerm = (event.target as HTMLInputElement).value;
  
    // Check if the Enter key was pressed
    if (event.key === 'Enter' || event.key === 'Return') {
      if (searchTerm.trim() !== '') {
        this.performSearch(searchTerm);  // Trigger the search only when Enter is pressed
        setTimeout(() => {
          this.searchbar.getInputElement().then((input) => {
            input.blur();
          });
        }, 10);
      }
    }
  }

  performSearch(searchTerm: string) {
    // Reset the current page to 1 for search
    const payload = { search: searchTerm, page: 1, limit: this.limit };

    this.data.searchVideos(payload).subscribe(
      (response: any) => {
        console.log("Got results from searchVideos:");
        console.dir(response);
        this.searchResults = response || [];

        // Call updateVideoList to insert the search results
        this.updateVideoList(this.searchResults);
      },
      (error) => {
        console.error('Search failed:', error);
      }
    );
  }

  updateVideoList(results: any[]) {
    console.log("updateVideoList called");
    console.dir(results);

    if (results.length > 0) {
      const insertIndex = 1;
      console.log(`Inserting ${results.length} results at index: ${insertIndex}`);
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
    direction: 'vertical'
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

  constructor(private data: DataService, private toastController: ToastController) { }

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
      console.log('WebSocket connection established.');
    };

    this.ws.onmessage = (event) => {
      this.handleWebSocketMessage(event.data);
    };

    this.ws.onclose = () => {
      console.warn('WebSocket connection closed. Attempting to reconnect...');
      setTimeout(() => this.initializeWebSocket(), 5000); // Retry connection after 5 seconds
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket encountered an error:', error);
    };
  }

  /**
   * Handles incoming WebSocket messages.
   * @param message The received message
   */
  private async handleWebSocketMessage(message: string) {
    console.log('Message received from WebSocket:', message);
    if (this.remoteMode)
      return

    if (message === 'next_slide') {
      let index = 0;
  
      try {
        // Get the active slide index
        index = await this.slides.getActiveIndex();
      } catch (error) {
        console.error('Error getting active slide index:', error);
        return;
      }
      if (this.skipMode) {
        if (index == 0) {
          this.slideNext();
          return
        }
        window.sessionStorage.setItem('account','99999');
        console.log("got message: " + message + " skip mode: " + this.skipMode + " account: " + window.sessionStorage.getItem('account'))
        //setTimeout(this.slideNext,5000)
      }
      else {
        this.slideNext();
      }
    }
  
    if (message === 'like' || (message === 'next_slide' && !this.remoteMode && this.skipMode)) {
      let index = 0;
      if (message === 'like')
        window.sessionStorage.setItem('account','droid');
      try {
        // Get the active slide index
        index = await this.slides.getActiveIndex();
      } catch (error) {
        console.error('Error getting active slide index:', error);
        return;
      }
  
      console.log('Active slide index:', index);
  
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
        console.warn('No div with an id attribute found in the active slide.');
        return;
      }
  
      console.log('Found target div:', targetDiv);
  
      // Simulate a click event on the div
      targetDiv.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      console.log('Click event dispatched to the target div.');
    }

    if (this.skipMode) {
        this.slideNext();
    }
  }


  /**
   * Navigates to the next slide.
   */
  private async slideNext() {
    const markasskipped = window.sessionStorage.getItem('markasskipped')
    var marknext = false;
    if (markasskipped === 'true')
      marknext = true;

      if (this.slides && marknext) {
      console.log('Navigating to the next slide...');
      if (this.skipMode && ) {
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
        console.log('Mark the current video as skipped');
      }
      await this.slides.slideNext();
    }
  }

  ngOnInit() {
    this.initializeWebSocket();
    window.sessionStorage.setItem("next","");
    window.sessionStorage.setItem('viewbookmarks',"false");
    window.sessionStorage.removeItem("videoResults");
    //window.localStorage.removeItem("bookmarks");
    console.log('Get video list');
    //this.videoList = this.data.getVideoList();
    const chainId = window.sessionStorage.getItem('chain');
    this.chainName = this.chainMap[chainId] || 'Unknown Chain';
    this.showHeaderDiv = window.location.host.startsWith('tikethtok.app');
    if (!this.showHeaderDiv) {
      console.log("Browser User Agent: ", navigator.userAgent);
      if (window.location.host.startsWith('audio.')) {
        window.localStorage.setItem('account','droid')
      }
      else {
        alert("Account: " + window.localStorage.getItem('account'));
      }
      if (window.localStorage.getItem('account')) {
        window.sessionStorage.setItem('account',window.localStorage.getItem('account'))
        if (window.localStorage.getItem(window.localStorage.getItem('account')))
          this.currentPage = Number(window.localStorage.getItem(window.localStorage.getItem('account')))
      }
      else
        window.sessionStorage.setItem('account',prompt("Enter show name"));
      window.localStorage.setItem('account', window.sessionStorage.getItem('account'));
    }
    window.addEventListener('message', this.receiveMessage.bind(this), false);
    this.loadVideos();
    console.log('Page loaded');
    console.log('Page host: [' + window.location.host + ']');
    console.log('Page starts with tikethtok.app: [' + window.location.host.startsWith('tikethtok.app') + ']');
    console.log('Page search: [' + window.location.search + ']');
    window.addEventListener('keydown', this.handleArrowKeys.bind(this));
    this.updateTitle();
  }

  private updateTitle() {
    if (!this.showHeaderDiv) {
      document.title = window.location.host;
    }
  }
  
  loadVideos() {
    console.log("!! load mode videos")

    this.data.getVideoList(this.currentPage, this.limit).subscribe((videos) => {
        console.log("DEBUG: videos sent from server: ");
        console.dir(videos);
        this.videoList = this.videoList || [];
        this.videoList = [...this.videoList, ...videos];
        console.log(`Got ${this.videoList.length} videos`)
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
    console.log('Message received from iframe:', data);

    if (data.view == 'bookmark') {
      this.data.getVideo(data.location).subscribe(
        (response: any) => {
          console.log("DEBUG: Got results from getVideo:");
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
      console.log(`Login box with status [${data.status}]`);
      if (data.status === "ready") {
        console.log("resize login iframe");
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
      console.log('Iframe is in loggedInView, account:', data.account);
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

  ngOnDestroy() {
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
    console.log(`Chain Id: ${chainId}`);
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
      console.log("------------------ error: " + error)
    }
    console.log('Active slide index:', index);

    // You can now perform actions based on the active slide index
    // Example: Pause videos on inactive slides
    this.pauseInactiveSlides(index);
  }

  pauseInactiveSlides(activeIndex: number) {
      // Get all ion-slide elements
      const slides = document.querySelectorAll('ion-slide');

	 
      if (activeIndex == 0 )
	this.hideSearchbar();
      else
	this.showSearchbar();

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
           project.innerText = current_video.getAttribute('title') === null ? "" : current_video.getAttribute('title');
           description.innerText = current_video.getAttribute('class') === null ? "" : current_video.getAttribute('class');
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
           console.log('Play videos on slide index:', index);
           console.log('Play video:', video.src );
           if (index == 0) {
             console.log("Count of index at zero: ", ++this.count)
             //floating_vid.setAttribute('src',"https://your.cmptr.cloud:2017/ad" + this.count + ".mp4"); 
             floating_vid.setAttribute('src',"https://your.cmptr.cloud:2017/lft.mp4"); 
             video.src = floating_vid.getAttribute('src');
             video.play();
           }
           else {
             if (!this.remoteMode) {
              floating_vid.setAttribute('src',video.src); 
              console.log('Play this video:', this.videoList[index].url );
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

// Trigger this function on slide change
async onSlideDidChange() {
  const chainId = window.sessionStorage.getItem('chain');
  const remote = window.sessionStorage.getItem('remote');
  const skipped = window.sessionStorage.getItem('skipped');
  console.log(`Chain Id: ${chainId}`);
  console.dir(chainId);
  console.log(`sessionStorage skipped: ${skipped}`);
  this.chainName = this.chainMap[chainId] || 'Unknown Chain';
  this.showHeaderDiv = window.location.host.startsWith('tikethtok.app');
  if (remote == 'true')
    this.remoteMode = true;
  if (skipped == 'true' || skipped == null) {
    this.skipMode = true;
    window.sessionStorage.setItem('skipped','true')
  }
  else
    this.skipMode = false;
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

  const floating_vid = document.getElementById('float');
  floating_vid.style.display = "block";
  floating_vid.setAttribute("muted", "false");
  console.log("[[[[[[[[[[[[[[[[[[[[[[[[ Slide did change ]]]]]]]]]]]]]]]]]]]]]]]]]]]");

  let index = 0;
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
      console.log(`Paragraph text for slide ${index}: ${paragraphText}`);

      // If the paragraph text starts with "Heart", advance to the next slide
      if (paragraphText.trim().startsWith('Heart')) {
        console.log(`Paragraph starts with "Heart", advancing to the next slide...`);

        // Ensure slide navigation works correctly
        const slideCount = await this.slides.length(); // Total number of slides
        if (index < slideCount - 1) {
          await this.slides.slideNext(); // Advance to the next slide
          console.log("Slide advanced successfully.");
        } else {
          console.log("Already on the last slide.");
        }
        return; // Exit early to avoid further processing for this slide
      }
    } else {
      console.log(`No paragraph element found with id "description-${index}".`);
    }
  } catch (error) {
    console.log("Got onSlideDidChange error: " + error);
  }

  // Perform any additional slide checks
  this.checkActiveSlide();
}

}
