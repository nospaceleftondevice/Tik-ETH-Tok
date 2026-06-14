import { IonSlides } from '@ionic/angular';
import { Component, OnInit, ViewChild, HostListener } from '@angular/core';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class Home implements OnInit {

  @ViewChild(IonSlides, { static: false }) slides: IonSlides;

  constructor() { }

  ngOnInit() {}

  async onSlideChange() {
    const index = await this.slides.getActiveIndex();
    console.log('Current slide index:', index);
    // You can call any JavaScript function here
    this.handleSlideChange(index);
  }

  handleSlideChange(index: number) {
    // Add your logic here, e.g., start/stop video playback, load new data, etc.
    console.log('Handling slide change for slide index:', index);
  }

  @HostListener('window:keydown', ['$event'])
  async handleKeyDown(event: KeyboardEvent) {
    if (!this.slides) return; // Ensure the slides are loaded

    if (event.key === 'ArrowUp') {
      const index = await this.slides.getActiveIndex();
      if (index > 0) {
        await this.slides.slidePrev(); // Move to the previous slide
      }
    } else if (event.key === 'ArrowDown') {
      const index = await this.slides.getActiveIndex();
      const isLastSlide = await this.slides.isEnd();
      if (!isLastSlide) {
        await this.slides.slideNext(); // Move to the next slide
      }
    }
  }
}

