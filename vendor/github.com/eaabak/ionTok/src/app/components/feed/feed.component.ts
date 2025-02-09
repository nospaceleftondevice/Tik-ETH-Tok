import { Component, Input, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular'; // Import IonSlides
import { AnimationOptions } from 'ngx-lottie';
import { DataService } from "../../services/data.service";
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-feed',
  templateUrl: './feed.component.html',
  styleUrls: ['./feed.component.scss'],
})
export class FeedComponent implements OnInit, OnDestroy {
  @Input() video: any;
  @ViewChild('slides', { static: false }) slides: IonSlides; // Reference to the IonSlides

  option: AnimationOptions = {
    path: './assets/animations/music.json'
  };

  showSearchBar: boolean = false;
  heartStyle: string = '';
  bookmarkStyle: string = '';
  private ws: WebSocket | null = null;

  constructor(private data: DataService, private http: HttpClient) {}

  ngOnInit() {
    this.initializeWebSocket();
  }

  ngOnDestroy() {
    this.closeWebSocket();
  }

  private initializeWebSocket(): void {
    const websocketUrl = 'wss://dastream.cloud/ws'; // WebSocket endpoint
    this.ws = new WebSocket(websocketUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connection established.');
    };

    this.ws.onmessage = async (event) => {
      const message = event.data;
      console.log('WebSocket message received:', message);

      if (message === 'like') {
        const activeIndex = await this.getActiveSlideIndex();
        alert("activeIndex: " + activeIndex + "video.id: " + this.video.id)
        if (activeIndex === this.video.id) {
          // Invoke the buttonClicked function for the current slide
          this.buttonClicked('likes', this.video.id);
        }
      }
    };

    this.ws.onclose = () => {
      console.warn('WebSocket connection closed.');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private closeWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async getActiveSlideIndex(): Promise<number> {
    try {
      return await this.slides.getActiveIndex();
    } catch (error) {
      console.error('Error getting active slide index:', error);
      return -1; // Default to an invalid index if something goes wrong
    }
  }

  buttonClicked(button: string, video_id: number) {
    console.log("Button clicked: " + button);
    console.log("Video id: " + video_id);

    if (button === "bookmarks") {
      window.sessionStorage.removeItem('videoResults');
      window.sessionStorage.setItem('viewbookmarks', "true");
      if (window.localStorage.getItem('bookmarks') !== null) {
        document.querySelector('ion-slides').slideTo(0);
      }
      return;
    }

    if (button === 'likes') {
      this.heartStyle = this.heartStyle === 'color: red;' ? '' : 'color: red;';
    } else if (button === 'comments') {
      this.bookmarkStyle = this.bookmarkStyle === 'color: black;' ? '' : 'color: black;';
      console.log(`[[[[[[[[[[ get id: ${video_id} ]]]]]]]]]]`);
      this.data.getVideo(`${video_id}`).subscribe((videos) => {
        console.log("videos sent from server: ");
        console.dir(videos);
      });
    }

    const accountNumber = window.sessionStorage.getItem("account") || "000000";
    console.log("Account number: " + accountNumber);

    const apiUrl = `${window.location.protocol}//${window.location.hostname}/videos/${video_id}/${button}`;
    const payload = { account_number: accountNumber };

    this.http.post(apiUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe(
      response => {
        console.log('Request successful:', response);
      },
      error => {
        console.error('Request failed:', error);
      }
    );
  }

  getFirstLike(likes: string): number {
    return parseInt(likes.split(':')[0], 10) || 0;
  }

  getSecondLike(likes: string): number {
    return parseInt(likes.split(':')[1], 10) || 0;
  }

  formatNumber(value: number): string {
    if (value < 1000) {
      return value.toString();
    } else if (value >= 1000 && value < 10000) {
      return (value / 1000).toFixed(1) + 'k';
    } else if (value >= 10000 && value < 1000000) {
      return Math.floor(value / 1000) + 'k';
    } else {
      return (value / 1000000).toFixed(1) + 'm';
    }
  }

  calculateRightOffset(value: number): string {
    const length = value.toString().length;

    if (length === 1) {
      return '-13px';
    } else if (length === 2) {
      return '-18px';
    } else if (length >= 3) {
      return '-22px';
    }

    return '-22px';
  }

  onSearch(event: any) {
    const searchTerm = event.target.value;
    console.log('Searching for:', searchTerm);
    // Implement your search logic here
  }
}
