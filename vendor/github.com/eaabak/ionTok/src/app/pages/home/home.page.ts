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

  constructor(private data: DataService) { }

  ngOnInit() {
    window.sessionStorage.setItem("next","");
    console.log('Get video list');
    //this.videoList = this.data.getVideoList();
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

  receiveMessage(event: MessageEvent) {
    // Optionally, you can check event.origin to ensure the message comes from the expected origin
    //if (event.origin !== 'http://192.168.1.183:5173') {
    //  return;
    //}

    // Access the data sent from the iframe
    const data = event.data;
    console.log('Message received from iframe:', data);

    if (data.view === 'login') {
      console.log(`Login box with status ${data.status}`);
    }

    // Handle the received data (e.g., update UI, log data, etc.)
    if (data.view === 'loggedInView' || data.view === "abort" ) {
      console.log('Iframe is in loggedInView, account:', data.account);
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
         newElement.innerHTML = '<iframe src="assets/fonts/intro.html" frameBorder="0" style="border-radius: 10px; overflow: hidden; opacity: 0.70; background-color: transparent; width: 70%; height: 174px;" allowTransparency="true"></iframe>';
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
           
        !isIOS ? newElement.style.color = 'white' : newElement.style.color = 'black';
        newElement.style.padding = '5px';
        newElement.style.borderRadius = '5px';
           
        if (document.getElementById(`project-${index}`) !== null)
          document.getElementById(`project-${index}`).remove();
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
