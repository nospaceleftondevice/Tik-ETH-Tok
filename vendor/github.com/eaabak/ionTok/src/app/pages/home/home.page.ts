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
  constructor(private data: DataService) { }

  ngOnInit() {
    console.log('Get video list');
    this.videoList = this.data.getVideoList();
    window.addEventListener('message', this.receiveMessage.bind(this), false);
    console.log('Page loaded');
  }

  receiveMessage(event: MessageEvent) {
    // Optionally, you can check event.origin to ensure the message comes from the expected origin
    //if (event.origin !== 'http://192.168.1.183:5173') {
    //  return;
    //}

    // Access the data sent from the iframe
    const data = event.data;
    console.log('Message received from iframe:', data);

    // Handle the received data (e.g., update UI, log data, etc.)
    if (data.view === 'loggedInView' || data.view === "abort" ) {
      console.log('Iframe is in loggedInView, account:', data.account);
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
        console.log("loadedmetadata");
        // Create a new element (e.g., a div with some text or an icon)
        const newElement = document.createElement('div');
        index != 0 ?  newElement.innerHTML = '<h1 style="font-family: \'TikTok Display\'; font-weight: bold; font-style: normal;">TikΞTok</h1><br><p>Browse and discover ETHGlobal hackathon projects.</p>' :
         newElement.innerHTML = '<iframe src="assets/fonts/intro.html" frameBorder="0" style="opacity: 0.70; background-color: transparent; width: 70%; height: 174px;" allowTransparency="true"></iframe>';
        newElement.style.position = 'absolute';
        newElement.style.bottom = '10px';
        newElement.style.left = '10px';
        newElement.style.right = '10px';
        newElement.style.height = '50%';
        index != 0 ? newElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)' :
         newElement.style.backgroundColor = 'rgba(0, 0, 0, 0.0)'
           
        newElement.style.color = 'white';
        newElement.style.padding = '5px';
        newElement.style.borderRadius = '5px';
            
        // Append the new element to the slide
        slide.appendChild(newElement);

        // Pause videos if the slide is not active
        if (index !== activeIndex) {
          videos.forEach(video => video.pause());
          console.log('Paused videos on slide index:', index);
        }
        else {
          videos.forEach(video=> {
           const floating_vid = document.getElementById('float');
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

