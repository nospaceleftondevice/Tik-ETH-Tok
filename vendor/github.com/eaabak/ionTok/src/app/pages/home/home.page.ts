import { Component, OnInit, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { DataService } from "../../services/data.service";

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit {
  @ViewChild(IonSlides, { static: false }) slides: IonSlides;

  slideOpts = {
    direction: 'vertical'
  };
  videoList: any = [];
  count = 0;
  currentPage: number = 1;
  limit: number = 10;

  chainName: string;

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

  constructor(private data: DataService) { }

  ngOnInit() {
    window.sessionStorage.setItem("next","");
    console.log('Get video list');
    //this.videoList = this.data.getVideoList();
    const chainId = window.sessionStorage.getItem('chain');
    this.chainName = this.chainMap[chainId] || 'Unknown Chain';
    window.addEventListener('message', this.receiveMessage.bind(this), false);
    this.loadVideos();
    console.log('Page loaded');
  }

  loadVideos() {
    console.log("!! load mode videos")
    this.data.getVideoList(this.currentPage, this.limit).subscribe((videos) => {
        console.log("videos sent from server: ");
        //console.dir(videos);
        this.videoList = this.videoList || [];
        this.videoList = [...this.videoList, ...videos];
        console.log(`Got ${this.videoList.length} videos`)
    });
  }

  loadMoreVideos() {
    this.currentPage++;
    this.loadVideos();
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
  
  receiveMessage(event: MessageEvent) {
    // Optionally, you can check event.origin to ensure the message comes from the expected origin
    //if (event.origin !== 'http://192.168.1.183:5173') {
    //  return;
    //}

    // Access the data sent from the iframe
    const data = event.data;
    console.log('Message received from iframe:', data);

    if (data.view === 'login') {
      console.log(`Login box with status [${data.status}]`);
      if (data.status === "ready") {
        console.log("resize login iframe");
        document.getElementById("web3auth").style.transform = 'scale(.70)';
        document.getElementById("web3auth").style.top = '-150px';
        document.getElementById("web3auth").style.height = '170%';
      }
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
 
  ngOnDestroy() {
    // Remove the event listener when the component is destroyed
    window.removeEventListener('message', this.receiveMessage.bind(this), false);
  }

  ionViewDidEnter() {
    const chainId = window.sessionStorage.getItem('chain');
    //alert(this.chainMap[chainId]);
    console.log(`Chain Id: ${chainId}`);
    console.dir(chainId);
    this.chainName = this.chainMap[chainId] || 'Unknown Chain';
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

      slides.forEach((slide, index) => {
        const videos = slide.querySelectorAll('video');
        console.log(`Slide index : ${index} of ${slides.length}`);
        console.log(`# of Videos : ${videos.length}`);
        // Create a new element (e.g., a div with some text or an icon)
        const newElement = document.createElement("div");
        if (index != 0) {
          newElement.id = `project-${index}`; 
          newElement.innerHTML = `<h1 id="title-${index}" style="font-color: #000;font-family: \'TikTok Display\'; font-weight: bold; font-style: normal;">TikΞTok</h1><br><p id="description-${index}">Browse and discover ETHGlobal hackathon projects.</p>` 
        }
        else {
         newElement.id = "intro-box";
         newElement.innerHTML = `<iframe src="assets/fonts/intro.html?${window.sessionStorage.getItem('account')}" frameBorder="0" style="border-radius: 10px; overflow: hidden; opacity: 0.70; background-color: transparent; width: 70%; height: 174px;" allowTransparency="true"></iframe>`;
        }
        const userAgent = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;  // Check if user agent is iOS

        newElement.style.position = 'absolute';
        newElement.style.bottom = '10px';
        newElement.style.left = '10px';
        newElement.style.right = '10px';
        newElement.style.height = '50%';
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
        console.log("Current videos: ");
        //console.dir(videos);
        console.log("Current video: ");
        //console.dir(current_video);
        if (index > 0 && current_video !== null) {
           project.innerText = current_video.getAttribute('title') === null ? "" : current_video.getAttribute('title');
           description.innerText = current_video.getAttribute('class') === null ? "" : current_video.getAttribute('class');
           description.style.width = "87%";
        }
        if (index !== activeIndex) {
          videos.forEach(video => video.pause());
          console.log('Paused videos on slide index:', index);
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
             floating_vid.setAttribute('src',video.src); 
             console.log('Play this video:', this.videoList[index].url );
           }
          });
          //videos.forEach(video => video.muted = !video.muted);
          //videos.forEach(video => video.play());
        }
        console.log(`Active index ${activeIndex}`);
    });
  }

  // Trigger this function on slide change
  async onSlideDidChange() { 
    const chainId = window.sessionStorage.getItem('chain');
    //alert(this.chainMap[chainId]);
    console.log(`Chain Id: ${chainId}`);
    console.dir(chainId);
    this.chainName = this.chainMap[chainId] || 'Unknown Chain';
    const floating_vid = document.getElementById('float');
    floating_vid.style.display = "block"; 
    floating_vid.setAttribute("muted","false");
    console.log("[[[[[[[[[[[[[[[[[[[[[[[[ Slide did change ]]]]]]]]]]]]]]]]]]]]]]]]]]]")
    var index = 0;
    try {
      index = await this.slides.getActiveIndex();
    }
    catch (error) {
      console.log("Got onSlideDidChange error: " + error)
    }
    this.checkActiveSlide();
  }
}
