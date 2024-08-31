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
    //this.checkActiveSlide();
  }

  async checkActiveSlide() {
    const index = await this.slides.getActiveIndex();
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
          video.addEventListener('canplay', () => {
            video.play().catch(error => {
              console.error('Autoplay prevented:', error);
            });
          });
        })

        // Pause videos if the slide is not active
        if (index !== activeIndex) {
          videos.forEach(video => video.pause());
          console.log('Paused videos on slide index:', index);
        }
        else {
          videos.forEach(video => video.play());
          console.log('Play videos on slide index:', index);
          //videos.forEach(video => video.muted = !video.muted);
        }
    });
  }

  // Trigger this function on slide change
  onSlideDidChange() {
    this.checkActiveSlide();
  }
}

