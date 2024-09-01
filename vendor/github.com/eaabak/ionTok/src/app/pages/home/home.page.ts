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

  constructor(private data: DataService) { }

  ngOnInit() {
    console.log('Get video list');
    this.videoList = this.data.getVideoList();
    console.log('Page loaded');
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
        videos.forEach(video => {
          video.addEventListener('loadedmetadata', () => {
            console.log("loadedmetadata");
            video.play().catch(error => {
              console.error('Autoplay prevented:', error);
            });
            // Create a new element (e.g., a div with some text or an icon)
            const newElement = document.createElement('div');
            newElement.innerText = 'Video is ready to play ' + video.getAttribute("src");
            newElement.style.position = 'absolute';
            newElement.style.bottom = '10px';
            newElement.style.left = '10px';
            newElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            newElement.style.color = 'white';
            newElement.style.padding = '5px';
            newElement.style.borderRadius = '5px';
            
            // Append the new element to the slide
            slide.appendChild(newElement);
          });
        })

        // Pause videos if the slide is not active
        if (index !== activeIndex) {
          videos.forEach(video => video.pause());
          console.log('Paused videos on slide index:', index);
        }
        else {
          videos.forEach(video=> {
           const floating_vid = document.getElementById('float');
           floating_vid.setAttribute('src',video.src); 
           console.log('Play videos on slide index:', index);
          });
          //videos.forEach(video => video.muted = !video.muted);
          //videos.forEach(video => video.play());
        }
    });
  }

  // Trigger this function on slide change
  onSlideDidChange() {
    const floating_vid = document.getElementById('float');
    floating_vid.style.display = "block"; 
    floating_vid.setAttribute("muted","false");
    console.log("[[[[[[[[[[[[[[[[[[[[[[[[ Slide did change ]]]]]]]]]]]]]]]]]]]]]]]]]]]")
    this.checkActiveSlide();
  }
}

